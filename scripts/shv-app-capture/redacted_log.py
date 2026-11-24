"""mitmproxy addon: one JSON line per request, redacted before it reaches disk.

For capturing the official SHV app on an AVD that is logged in
(docs/reference/shv-app-traffic-capture.md). It keeps the method, URL, status,
content type, Cache-Control, body sizes and a few request headers. It never
keeps a body, an Authorization or Cookie value, or the value of a query key
that names a secret anywhere in it (`token`, `id_token_hint`, `session_state`,
`client_secret`, ...). Run it without `-w`, so mitmproxy writes no unredacted
flow file:

    mitmdump -q -s redacted_log.py --set redacted_log=~/shv-capture/member.jsonl

Run the file itself (`python3 -I redacted_log.py`) to check the redaction on
the OIDC and Keycloak URL shapes; that needs no mitmproxy.
"""

from __future__ import annotations

import json
import os
import re
import time
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from mitmproxy import http

# a query key with a secret word anywhere in it, so `id_token_hint` and
# `session_state` match as well as a bare `token`
SECRET_QUERY = re.compile(
    r"(?i)([?&;][^=&#]*(?:token|code|state|session|password|secret|key|auth|nonce|verifier|hint|assertion|ticket)[^=&#]*)=[^&#]*"
)
KEEP_HEADERS = {
    "user-agent",
    "accept",
    "accept-language",
    "if-modified-since",
    "if-none-match",
    "content-type",
}
REDACT_HEADERS = {"authorization", "cookie", "proxy-authorization"}
DEFAULT_LOG = "~/shv-capture/capture.jsonl"


def redact_url(url: str) -> str:
    return SECRET_QUERY.sub(lambda m: m.group(1) + "=<redacted>", url)


class RedactedLog:
    def load(self, loader):
        loader.add_option("redacted_log", str, DEFAULT_LOG, "output file")

    def response(self, flow: http.HTTPFlow):
        self.write(flow)

    def error(self, flow: http.HTTPFlow):
        self.write(flow)

    def write(self, flow: http.HTTPFlow):
        from mitmproxy import ctx

        req, resp = flow.request, flow.response
        headers = {}
        for name, value in req.headers.items():
            key = name.lower()
            if key in REDACT_HEADERS or "token" in key:
                headers[key] = "<redacted>"
            elif key in KEEP_HEADERS:
                headers[key] = value
        line = {
            "t": time.strftime("%H:%M:%S", time.gmtime(req.timestamp_start)),
            "method": req.method,
            "url": redact_url(req.pretty_url),
            "status": resp.status_code if resp else None,
            "type": (resp.headers.get("content-type", "") if resp else "").split(";")[0],
            "cache": resp.headers.get("cache-control", "") if resp else "",
            "bytes": len(resp.raw_content or b"") if resp else 0,
            "req_bytes": len(req.raw_content or b""),
            "headers": headers,
            "error": str(flow.error) if flow.error else None,
        }
        path = os.path.expanduser(ctx.options.redacted_log)
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        with open(path, "a") as out:
            out.write(json.dumps(line) + "\n")


addons = [RedactedLog()]


if __name__ == "__main__":
    secrets = [
        "https://login.shv-fsvl.ch/logout?id_token_hint=SECRET&post_logout_redirect_uri=x",
        "https://prod.shv-app.ch/oidc/callback?state=SECRET&session_state=SECRET&code=SECRET",
        "https://login.shv-fsvl.ch/login-actions/authenticate?session_code=SECRET&execution=x&tab_id=x",
        "https://x.test/a?access_token=SECRET&refresh_token=SECRET&client_secret=SECRET",
        "https://x.test/a?api_key=SECRET;apikey=SECRET&code_verifier=SECRET#frag",
    ]
    for url in secrets:
        redacted = redact_url(url)
        assert "SECRET" not in redacted, redacted
    kept = "https://weather-ws-prod.ubmeteo.io/v1/measurements/current?appId=shv&country=ch"
    assert redact_url(kept) == kept, redact_url(kept)
    print("redaction ok")
