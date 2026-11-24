# Checking that a visitor is an SHV member

Date: 2026-11-24. Question: how can this site tell whether a visitor has a real, current SHV FSVL member account, so it can show some things to members only? Only "member: yes or no" is needed, no profile data. All probes were anonymous, a few requests each, with no login and no credentials or tokens. Session codes, state and cookies are redacted below.

## Recommendation

Ask the SHV to register a **confidential OIDC client for this site** in the `SHV` realm (the request is at the end). It is the only way that passes our hard constraints: the visitor logs in on `login.shv-fsvl.ch` and nowhere else, the code is exchanged in a Pages Function, and the browser gets back only a sealed `HttpOnly` cookie that says "member until a set time". No token is kept, not even the refresh token, since we need no profile.

airspace.shv-fsvl.ch is set up the same way: its own client `airspace`, a server-side callback and PKCE (below), so the SHV has done this before.

Membership would be read from the access token's `realm_access.roles`, where the official app looks for `m`, `c`, `s` or `a` (decompiled, [shv-native-app.md](../reference/shv-native-app.md) section 3). Two things only the SHV can settle: that these roles really mark a *current* member, and how soon a lapsed member loses them. The request asks both.

## What was probed

### airspace.shv-fsvl.ch

An ASP.NET site behind nginx (`ASP.NET_SessionId` cookie, `HttpOnly; SameSite=Lax`). The anonymous status of each page:

```text
$ curl -sD - -o /dev/null https://airspace.shv-fsvl.ch<path>
/                  200, header shows a "Login" link to /auth/login?RedirectUrl=/
/map, /dabs-archive, /doc, /downloads   200
/notam-map         302 Location: /auth/login?RedirectUrl=/notam-map
/notam             302 Location: /auth/login?RedirectUrl=/notam
```

Following the login link, without logging in:

```text
/auth/login?RedirectUrl=/
  302 https://airspace.shv-fsvl.ch/_thirdpartylogin/shv?s_redir=/&e_redir=/auth/login-failed
  302 https://login.shv-fsvl.ch/realms/SHV/protocol/openid-connect/auth
        ?response_type=code&client_id=airspace
        &redirect_uri=https://airspace.shv-fsvl.ch/oauth/callback
        &scope=openid profile email&state=<uuid>
        &code_challenge=<S256>&code_challenge_method=S256
```

So the site uses its own client `airspace`, sends the code back to its own server (`/oauth/callback`) and keeps a server session. It asks for `profile email`, so it reads the member's name and email. It needs a login only for the NOTAM map and the NOTAM status history. The public pages don't show whether it also checks a role. A related project of ours logs in there with a scripted browser and notes that the account "needs access to the NOTAM map", which hints at a role check but doesn't say which role. That project types a stored password into the SHV form, so nothing in it can be reused here.

The redirect check for `client_id=airspace` (same request, only `redirect_uri` changed):

| `redirect_uri` | Answer |
| :--- | :--- |
| `https://airspace.shv-fsvl.ch/oauth/callback` | 200, the login form |
| `https://shv-meteo.pages.dev/api/auth/callback` | 400 |

Together with the earlier checks of `typo3` and `app-android` (F10 in the follow-up plan), none of the three SHV clients we know of can send a visitor back to us.

### The Keycloak realm

`GET https://login.shv-fsvl.ch/realms/SHV/.well-known/openid-configuration`, relevant fields:

```text
userinfo_endpoint       .../protocol/openid-connect/userinfo
introspection_endpoint  .../protocol/openid-connect/token/introspect
check_session_iframe    .../protocol/openid-connect/login-status-iframe.html
end_session_endpoint    .../protocol/openid-connect/logout
claims_supported        iss sub aud exp iat auth_time name given_name family_name
                        preferred_username email acr azp nonce
scopes_supported        openid phone service_account address offline_access roles
                        web-origins email acr microprofile-jwt organization profile basic
token_endpoint_auth_methods_supported  private_key_jwt client_secret_basic
                        client_secret_post tls_client_auth client_secret_jwt
code_challenge_methods_supported       plain S256
```

`GET .../protocol/openid-connect/certs`: one `RS256` signing key (and one `RSA-OAEP` encryption key).

The login page (`kcContext` in its HTML, a Keycloakify theme `shv-custom-theme`) shows `"registrationAllowed": false` and `"resetPasswordAllowed": true`. Nobody can create an account themselves, so every account was made by the SHV. That doesn't mean every account belongs to a *current* member: clubs, schools, staff and lapsed members may have accounts too.

No claim about membership is advertised. A membership role would come through the `roles` scope as `realm_access.roles`, which Keycloak by default puts in the access token and the introspection answer, but not in the ID token or userinfo.

### The member web service

```text
$ curl -sD - -o /dev/null https://shv-app-ws-prod.shv-app.ch/v1/wms/person
HTTP/1.1 401
```

It wants a Bearer token. The one known caller is the official app with its own client's token.

## Every way to check, and whether it is allowed

| Way | Possible? | Acceptable? |
| :--- | :--- | :--- |
| **Our own confidential client**, code flow with PKCE, membership from `realm_access.roles` (or a claim the SHV adds) | Yes, once the SHV registers it | **Yes.** The visitor logs in only on the SHV's page, the secret and tokens stay in the Function, the browser gets a sealed flag |
| Reusing `airspace`, `typo3` or `app-android` | No: their redirect check answers 400 for our callback | No: it would pass us off as the SHV's own site or app |
| `prompt=none` silent check | Only with our own client: it is the same redirect, answered with a code or `error=login_required` | Yes, as the **re-check** when the flag expires: a top-level redirect, so it works without third-party cookies |
| `check_session_iframe` (login status iframe) | Needs our own client and our origin in its web origins | No: it reads the SHV's cookie inside an iframe on our page, which Safari and Firefox block as a third-party cookie, and it tells only "has a session", not "is a member" |
| Userinfo or token introspection | Only with a token from our own client; introspection also needs a confidential client | Possible but adds nothing: the roles are already in the access token we get directly from the token endpoint |
| Member web service `/v1/wms/person` | It wants a token; it may accept only tokens issued to the app's clients, which we can't know anonymously | No by default: it is the app maker's backend, and it returns the full profile (address, birth date, insurance), much more than yes or no. Use it only if the SHV says roles don't track membership and the operator agrees |
| Password grant (we post username and password) | Listed in the realm, reported disabled for the app client | No: a password typed into our pages |
| Token exchange or jwt-bearer grant | Listed | No: it starts from another client's token |
| Cookies or sessions of airspace.shv-fsvl.ch or `www.shv-fsvl.ch` | No: other origins, `HttpOnly`, no cross-origin API | No |
| SHV number (and birth date) typed into a form, checked against the SHV | Needs an SHV API that doesn't exist publicly | No: it proves someone knows a number, not who the visitor is |
| Cloudflare Access with the SHV Keycloak as its OIDC provider | Needs a client registered at the SHV too, for Access's callback | No: the free Zero Trust plan covers 50 users, far fewer than the SHV has members |

## Design once the client exists

This replaces the refresh-token design of `target.md` ("Auth") for the yes/no case:

1. `GET /api/auth/start?return=<path>`: makes `state`, a PKCE verifier and a `nonce`, and takes `return` only if it is a same-origin path (starts with `/` but not `//` or `/\`, else `/`). It seals the four with AES-GCM (`SESSION_SECRET`) into a short `HttpOnly; Secure; SameSite=Lax; Path=/api/auth` cookie, and redirects to the auth endpoint with `scope=openid` and the client's own scopes. `?silent=1` adds `prompt=none`.
2. `GET /api/auth/callback`: checks `state`, redeems the code with the client secret, checks the ID token's `iss`, `aud`, `azp`, `exp` and `nonce` (the token comes straight from the token endpoint over TLS, so OIDC Core 3.1.3.7 lets us skip the signature check; checking against `certs` with WebCrypto is cheap anyway), reads the roles, and drops every token. It sets one sealed cookie, `{member: true, exp}`, and nothing else: no `sub`, name or email. Then it redirects to the `return` path sealed in the `state` cookie, never to one from the query string, which would make it an open redirect. An `error=login_required` from a silent check lands here too and redirects the same way, without the member cookie.
3. Member-only content is served by Functions that check that cookie. Anything in `dist/` is public, and hiding it in the page script is not a gate. Gated answers are `Cache-Control: private, no-store` and must not go through `respond.ts`'s edge-cache fallback, which would serve them to anyone.
4. When the flag expires (a day, say), a gated Function answers `401`, not a redirect: the page calls it through `ShvApi`'s `fetch`, and a `fetch` that follows a 302 to `login.shv-fsvl.ch` fails on CORS. On that `401` the page navigates top-level to `/api/auth/start?silent=1&return=<its own path>`, once per page load so a refused check can't loop. A live SHV session renews the flag without a form; otherwise the visitor comes back to the same page and sees the login button again.
5. `GET /api/auth/logout` clears the cookie and redirects to `end_session_endpoint` with `client_id` and `post_logout_redirect_uri`.

The site would need a short privacy note: what is checked, that only the yes/no flag and its expiry are kept, in a cookie.

## Is a spike needed?

**Not before asking the SHV.** Which role marks a current member, and when it is removed, is the SHV's to say, and only the SHV can register the client. A logged-in run is needed afterwards, but it can't happen sooner: the only other client a run could use is the official app's, which is the borrowing ruled out above.

**The acceptance spike, once the client exists** (about an hour):

1. The owner stores the client secret as a Pages secret and in `.dev.vars` (never in the repo or the chat), and adds `SESSION_SECRET` the same way.
2. A throwaway branch adds `start` and `callback` as above, plus a debug line that logs only: the access token's claim names, `aud`, `azp`, `realm_access.roles` and `resource_access` keys, and the claim names of userinfo. Never `sub`, names, email, the tokens or the code.
3. The owner runs `npm run dev`, opens `http://localhost:8788/api/auth/start` and logs in **themselves** on `login.shv-fsvl.ch`. Nobody else handles the password.
4. In the same browser, `/api/auth/start?silent=1` must come back with a code and no form. In a private window it must come back with `error=login_required`.
5. If the SHV provides a test account that is not a current member, step 3 with it must give `member: false`.
6. DevTools: the browser holds only the sealed cookies, and no token appears in any answer or in storage.

It proves where the membership role sits and that it is present for a current member, that the silent re-check works, and that nothing sensitive reaches the browser. Whether a lapsed member loses the role, and how fast, rests on the SHV's answer and step 5.

## The request to the SHV

> Subject: OIDC client for shv-meteo.pages.dev (member check only)
>
> We run <https://shv-meteo.pages.dev>, a free, non-commercial web app for Swiss pilots built on the public data behind the SHV FSVL app (source: <https://github.com/simonsteiner/shv-meteo-web>). We would like to show some content to SHV members only, and need to know only whether a visitor is a current member: no name, email, SHV number or other profile data. Could you register a client for it in the SHV realm, like the one airspace.shv-fsvl.ch uses?
>
> - Client ID: `shv-meteo` (or your choice); OpenID Connect, **confidential** (client authentication on, a secret or `private_key_jwt`).
> - Standard flow only, with PKCE S256 required. Implicit flow, direct access grants, service account and device flow off.
> - Valid redirect URI, exact and without wildcards: `https://shv-meteo.pages.dev/api/auth/callback`. Post-logout redirect URI: `https://shv-meteo.pages.dev/`. Web origins: none (all calls are server-side).
> - Scopes: `openid` only, no `profile`, `email`, `address`, `phone` or `offline_access`. "Full scope allowed" off, with only the role or roles that mark a current member in scope.
> - If possible, a second client `shv-meteo-dev` with only `http://localhost:8788/api/auth/callback`, so the production secret never sits on a laptop.
>
> Questions:
>
> 1. Which role or claim marks a **current** member? The SHV app reads the realm roles `m`, `c`, `s` and `a`; which of them should count as "member" for us?
> 2. When a membership ends or isn't renewed, when is that role removed, and does the account stay?
> 3. Could you give us a test account that is not a current member, to check that it is refused?
> 4. Are there terms for using the SHV login (naming, privacy notice, logo)?
>
> We keep only a signed "member until a set time" cookie in the visitor's browser and no tokens; the visitor's password is only ever typed on login.shv-fsvl.ch.

## Sources

- The probes above, run on 2026-11-24 with `curl`.
- [shv-native-app.md](../reference/shv-native-app.md): the official app's PKCE flow, its role check and the member web service.
- [2026-11-24-shv-app-network-calls.md](2026-11-24-shv-app-network-calls.md): the app's calls, logged in.
- [target.md](../plan/2026-11-23-astro-cloudflare/target.md) ("Auth"): the cookie design this builds on.
- OpenID Connect Core 1.0, section 3.1.3.7 (ID token validation) and 3.1.2.1 (`prompt=none`): <https://openid.net/specs/openid-connect-core-1_0.html>.
