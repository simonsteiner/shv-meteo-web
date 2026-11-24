"""mitmproxy addon: one JSON line per request, redacted before it reaches disk.

For capturing the official SHV app on an AVD that is logged in
(docs/reference/shv-app-traffic-capture.md). It keeps the method, URL, status,
content type, Cache-Control, body sizes and a few request headers. It never
keeps a body, an Authorization or Cookie value, or a token-like query value.
Run it without `-w`, so mitmproxy writes no unredacted flow file:

    mitmdump -q -s redacted_log.py --set redacted_log=capture.jsonl
"""

import json
import re
import time

from mitmproxy import ctx, http

SECRET_QUERY = re.compile(
    r"(?i)\b(token|code|state|session|password|secret|key|auth|nonce|code_verifier)=[^&]*"
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


class RedactedLog:
    def load(self, loader):
        loader.add_option("redacted_log", str, "capture.jsonl", "output file")

    def response(self, flow: http.HTTPFlow):
        self.write(flow)

    def error(self, flow: http.HTTPFlow):
        self.write(flow)

    def write(self, flow: http.HTTPFlow):
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
            "url": SECRET_QUERY.sub(lambda m: m.group(1) + "=<redacted>", req.pretty_url),
            "status": resp.status_code if resp else None,
            "type": (resp.headers.get("content-type", "") if resp else "").split(";")[0],
            "cache": resp.headers.get("cache-control", "") if resp else "",
            "bytes": len(resp.raw_content or b"") if resp else 0,
            "req_bytes": len(req.raw_content or b""),
            "headers": headers,
            "error": str(flow.error) if flow.error else None,
        }
        with open(ctx.options.redacted_log, "a") as out:
            out.write(json.dumps(line) + "\n")


addons = [RedactedLog()]
