# SHV FSVL native app: member login and member data

How the official SHV FSVL Android app (`ch.shv_fsvl`) logs a member in against the SHV Keycloak realm and reads their profile from the member web service, as found by decompiling the APK (`jadx`). This web app has no member login (it was dropped in the Astro migration, PR13), so everything here describes the official app only. Read it, and the member check research ([../research/2026-11-24-member-check.md](../research/2026-11-24-member-check.md)), before bringing back login or member data; the hard constraints in [AGENTS.md](../../AGENTS.md) still apply. The rest of the app (its hosts, code layout and the Previtemps sounding) is in [shv-native-app.md](shv-native-app.md).

## Account classes in the APK

- `ch.shv_fsvl.feature.account.*`: account management, the login controller, the profile screen and the license card renderers.
- `ch.shv_fsvl.feature.account.models.*`: Kotlin `@Serializable` data classes (obfuscated names in brackets):
  - `g.c` (`UserProfile`): the pilot's data.
  - `g.b` (`CompanyProfile`): a school, club or company.
  - `b` (`ShvBrevet`): license ratings and card levels.
  - `d` (`ShvInsurance`): third-party liability insurance.
  - `e` (`ShvMembership`): club affiliations and membership categories.
  - `a` (`ShvAddress`): postal address and canton.
- `ch.ubique.heidi.oidc.*`: Ubique's OpenID Connect library:
  - `AuthorizationActivity`: launches the Chrome Custom Tab.
  - `RedirectUriReceiverActivity`: receives the HTTPS App Link redirect.
  - `CodeChallengeMethod.S256`: the PKCE challenge.

## Login (Keycloak OIDC with PKCE)

The app uses OAuth 2.0 / OpenID Connect with PKCE (Proof Key for Code Exchange).

### Endpoints

| Service | Target URL |
| :--- | :--- |
| **OIDC Discovery** | `https://login.shv-fsvl.ch/realms/SHV/.well-known/openid-configuration` |
| **Auth Endpoint** | `https://login.shv-fsvl.ch/realms/SHV/protocol/openid-connect/auth` |
| **Token Endpoint** | `https://login.shv-fsvl.ch/realms/SHV/protocol/openid-connect/token` |
| **Client ID** | `app-android` (Android public client, no secret) / `app-ios` (iOS) |
| **Redirect URI** | `https://prod.shv-app.ch/oidc/callback` |
| **Scopes** | `openid offline_access` |
| **Challenge Method**| `S256` (SHA-256 base64url) |

### Sequence

1. **PKCE setup**: the app creates a random `code_verifier` (32 bytes of entropy) and derives `code_challenge = BASE64URL(SHA256(verifier))`.

2. **Browser launch**: it sends the pilot to the Keycloak auth endpoint:

   ```text
   https://login.shv-fsvl.ch/realms/SHV/protocol/openid-connect/auth
     ?client_id=app-android
     &redirect_uri=https%3A%2F%2Fprod.shv-app.ch%2Foidc%2Fcallback
     &response_type=code
     &scope=openid offline_access
     &code_challenge=<challenge>
     &code_challenge_method=S256
     &state=<state>
     &prompt=login
   ```

3. **Keycloak login**: the pilot enters their credentials on the Keycloak login form. Direct Access Grants (Resource Owner Password Credentials) are **disabled** on this realm (`unauthorized_client`).

4. **App Link interception**: Keycloak redirects to `https://prod.shv-app.ch/oidc/callback?code=...&state=...`.
   - On Android, the OS catches it through the `intent-filter` for `host="prod.shv-app.ch"` and launches `RedirectUriReceiverActivity`.
   - In a desktop browser, the static callback page (`"Anmeldung erfolgreich - SHV"`) renders, with the code and state still in the address bar.

5. **Token exchange**: a POST to the token endpoint:

   ```http
   POST /realms/SHV/protocol/openid-connect/token HTTP/1.1
   Host: login.shv-fsvl.ch
   Content-Type: application/x-www-form-urlencoded

   grant_type=authorization_code
   &client_id=app-android
   &code=<code>
   &redirect_uri=https%3A%2F%2Fprod.shv-app.ch%2Foidc%2Fcallback
   &code_verifier=<verifier>
   ```

   It returns `{ access_token, refresh_token, id_token, expires_in }`.

6. **Role check (`TokenRoleValidator`, `qj7.java`)**: the app reads `realm_access.roles` from the JWT payload and treats the pilot as an active member if it holds at least one of:
   - `'m'`: active member (*Mitglied*)
   - `'c'`: club administrator (*Club*)
   - `'s'`: flight school or instructor (*Schule*)
   - `'a'`: federation administrator (*Admin*)

## Member web service (`shv-app-ws-prod`)

Once logged in, the app reads the member's profile:

- **Pilot profile**: `GET https://shv-app-ws-prod.shv-app.ch/v1/wms/person`, with `Authorization: Bearer <access_token>` and `Accept: application/json`. The 2026-11-24 capture saw it at app start when logged in.
- **Company fallback**: `GET https://shv-app-ws-prod.shv-app.ch/v1/wms/company`, called by `uu7.java` when `v1/wms/person` answers 403.

The same host also serves the text forecast and the isobar chart, anonymously; see [shv-native-app.md](shv-native-app.md#hosts).

### `UserProfile` fields (unverified)

Nobody here has seen a real `v1/wms/person` answer: the capture kept no bodies. The fields below come from two readings that disagree, so check a live answer before relying on either.

From the example payload an earlier version of this note carried; where its field names came from was not recorded:

| Field | Holds |
| :--- | :--- |
| `extId`, `shvNumber` | member numbers |
| `firstName`, `lastName` | names |
| `genderId`, `salutationId`, `birthDate`, `nationalityId`, `languageId` | personal details, ids as codes |
| `email`, `phone`, `mobile` | contact details |
| `address` | `ShvAddress`: `adresszusatz`, `strasse`, `postfach`, `plz`, `ort`, `kanton`, `land` |
| `memberships[]` | `ShvMembership`: `organisationName`, `eintrittsdatum`, `austrittsdatum`, `mitgliedkategorie` (`id`, `name`) |
| `insurance` | `ShvInsurance`: `name`, `beschreibung`, `startDatum`, `endDatum`, `zielgruppeTyp` (`id`, `name`) |
| `brevets[]` | `ShvBrevet`: `category`, `cardLevels[]` (`cardLevel`, `title`) |

From the Profile tab this site had before the Astro migration (nothing in the code reads these now):

- **Names**: `vorname` holds the first name and `name` the last name.
- **`LocalizedString`** (`q64` in the decompile): multilingual values such as `mitgliedkategorie.name`, `insurance.name`, `insurance.beschreibung` and the brevet categories arrive as `{ "de": ..., "fr": ..., "it": ..., "en": ... }`; the Kotlin serialised properties map to `{ a: de, b: fr, c: it, d: en }`.
- **Card levels**: a brevet (`ShvBrevet`, `b`) holds its ratings in `cardLevels` (`ShvCardLevel`, `c`: `level`, `date`, `remarks`).
