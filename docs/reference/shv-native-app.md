# SHV FSVL native app: reverse-engineered reference

How the official SHV FSVL Android app (`ch.shv_fsvl`) and its backends work, as found by decompiling the APK (`jadx`), extracting its assets and checking the network calls. This web app is built against these upstream services; for how our code uses them, see [../architecture.md](../architecture.md). The decompiled APK and its unpacked assets (`apk_analysis/`) are gitignored and not part of this repo.

---

## 1. System Overview & Ecosystem

The SHV FSVL app is the central digital tool for Swiss paragliding and hang gliding pilots. The system brings together several official government and meteorological data providers:

```text
+---------------------------------------------------------------------------------------+
|                                    SHV FSVL Client                                     |
|                     (Native Android Kotlin Compose / Web App Vite)                    |
+-------------------+--------------------+--------------------+-------------------------+
         |                   |                    |                        |
         v                   v                    v                        v
+-----------------+ +------------------+ +------------------+ +-------------------------+
| Keycloak SSO    | | Member WS        | | Ubique Fluid     | | Swiss Federal Geo     |
| Identity Server | | (shv-app-ws-prod)| | Meteo Services   | | & Airspace Providers  |
+-----------------+ +------------------+ +------------------+ +-------------------------+
| login.shv-fsvl  | | /v1/wms/person   | | weather-ws-prod  | | Swisstopo WMTS        |
| - OAuth2 / OIDC | | /v1/wms/company  | | webcam-prod      | | BAZL / Skyguide DABS  |
| - PKCE Auth     | | - Pilot profile  | | shv-app-static   | | BAFU Wildschutz       |
| - JWT Tokens    | | - Brevets        | | - GeoJSON layers | | MeteoSchweiz / SLF    |
|                 | | - Insurances     | | - Flying sites   |                         |
+-----------------+ +------------------+ +------------------+ +-------------------------+
```

### Key Ecosystem Entities

1. **Verband (SHV FSVL)**: Operates the membership registry, pilot licensing (Brevets), collective liability insurance, and the official Keycloak authentication realm.
2. **Ubique Innovation AG** (Zurich): Developer of the official mobile applications and operator of the backend cloud infrastructure (Fluid Meteo SDK).
3. **Swisstopo (Federal Office of Topography)**: High-resolution national topographic maps (Pixelkarte) and aerial orthophotos (Swissimage) served via GeoAdmin WMTS.
4. **BAZL / FOCA & Skyguide**: Swiss airspace structure, obstacle databases, and Daily Airspace Bulletins (DABS).
5. **BAFU (Federal Office for the Environment)**: Swiss wildlife sanctuaries (*Wildruhezonen* and *Jagdbanngebiete*) with mandatory minimum flight altitude restrictions.
6. **MeteoSchweiz & SLF**: Automated weather stations network delivering real-time ground and alpine observations.

---

## 2. Reverse-Engineered Android Architecture

Analysis of `apk_analysis/shv.apk` decompiled using `jadx` reveals the native implementation structure:

### Class Hierarchy & Packages

- `ch.shv_fsvl.feature.account.*`: User account management, login controller, profile screen, and license card renderers.
- `ch.shv_fsvl.feature.account.models.*`: Kotlin `@Serializable` data classes:
  - `g.c` (`UserProfile`): Detailed pilot data.
  - `g.b` (`CompanyProfile`): School/club/enterprise entity profile.
  - `b` (`ShvBrevet`): Pilot license ratings and card levels.
  - `d` (`ShvInsurance`): Third-party liability insurance policy.
  - `e` (`ShvMembership`): Club affiliations and membership categories.
  - `a` (`ShvAddress`): Postal address and canton.
- `ch.ubique.heidi.oidc.*`: Ubique's proprietary OpenID Connect library:
  - `AuthorizationActivity`: Headless activity managing Chrome Custom Tabs browser launch.
  - `RedirectUriReceiverActivity`: Intent filter destination handling HTTPS App Link redirects.
  - `CodeChallengeMethod.S256`: PKCE challenge computation.
- `ch.ubique.fluidsdk.*`: Meteo time series, raster/vector map engines, weather station products, and telemetry.

### Core Frameworks

- **UI Toolkit**: Jetpack Compose with Material 3 Adaptive layout primitives.
- **Dependency Injection**: Koin (`org.koin.core`).
- **HTTP Engine**: Ktor Client (`io.ktor.client`) with JSON serialization plugins.
- **Serialization**: `kotlinx.serialization` with custom polymorphic class serializers.
- **Error Reporting**: Sentry Android SDK (`sentry.ubique.ch`).

---

## 3. Authentication & Identity Architecture (Keycloak OIDC)

The official app uses standard **OAuth 2.0 / OpenID Connect with PKCE (Proof Key for Code Exchange)**.

### Endpoint Registry

| Service | Target URL |
| :--- | :--- |
| **OIDC Discovery** | `https://login.shv-fsvl.ch/realms/SHV/.well-known/openid-configuration` |
| **Auth Endpoint** | `https://login.shv-fsvl.ch/realms/SHV/protocol/openid-connect/auth` |
| **Token Endpoint** | `https://login.shv-fsvl.ch/realms/SHV/protocol/openid-connect/token` |
| **Client ID** | `app-android` (Android public client, no secret) / `app-ios` (iOS) |
| **Redirect URI** | `https://prod.shv-app.ch/oidc/callback` |
| **Scopes** | `openid offline_access` |
| **Challenge Method**| `S256` (SHA-256 base64url) |

### Native Authentication Sequence

1. **PKCE Setup**: Client creates random `code_verifier` (32 bytes entropy) and derives `code_challenge = BASE64URL(SHA256(verifier))`.

2. **Browser Launch**: Directs pilot to Keycloak auth endpoint:

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

3. **Keycloak Authentication**: Pilot submits credentials on the official Keycloak login form. Direct Access Grants (Resource Owner Password Credentials) are strictly **disabled** on this realm (`unauthorized_client`).

4. **App Links Interception**: Keycloak redirects to `https://prod.shv-app.ch/oidc/callback?code=...&state=...`.
   - On Android: Android OS captures this via `intent-filter` matching `host="prod.shv-app.ch"` and launches `RedirectUriReceiverActivity`.
   - On Desktop: Browser renders the static callback page (`"Anmeldung erfolgreich - SHV"`) retaining the code and state parameters in the address bar.

5. **Token Exchange**: POST to `https://login.shv-fsvl.ch/realms/SHV/protocol/openid-connect/token`:

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

   Returns `{ access_token, refresh_token, id_token, expires_in }`.

6. **Token Role Validation (`TokenRoleValidator` / `qj7.java`)**:
   - Parses the JWT payload `realm_access.roles`.
   - Pilot is validated as an active member if `roles` contains at least one of:
     - `'m'`: Active member (*Mitglied*)
     - `'c'`: Club administrator (*Club*)
     - `'s'`: Flight school / instructor (*Schule*)
     - `'a'`: Federation administrator (*Admin*)

---

## 4. Backend Member Web Services (`shv-app-ws-prod`)

Once authenticated, the app queries the member web service:

### Endpoints

- **Individual Pilot Profile**: `GET https://shv-app-ws-prod.shv-app.ch/v1/wms/person`
  - Header: `Authorization: Bearer <access_token>`
  - Header: `Accept: application/json`
- **Entity / Club Fallback**: `GET https://shv-app-ws-prod.shv-app.ch/v1/wms/company`
  - Invoked automatically by `uu7.java` if `v1/wms/person` returns HTTP 403 Forbidden.

### `UserProfile` Payload Structure

```json
{
  "extId": 58412,
  "shvNumber": 58412,
  "firstName": "Hans",
  "lastName": "Muster",
  "genderId": "M",
  "salutationId": "HERR",
  "birthDate": "1985-06-15",
  "nationalityId": "CH",
  "languageId": "DE",
  "email": "pilot@domain.ch",
  "phone": "+41 44 000 00 00",
  "mobile": "+41 79 000 00 00",
  "address": {
    "adresszusatz": null,
    "strasse": "Flugplatzstrasse 12",
    "postfach": null,
    "plz": "3800",
    "ort": "Interlaken",
    "kanton": "BE",
    "land": "CH"
  },
  "memberships": [
    {
      "organisationName": "SHV FSVL Verband",
      "eintrittsdatum": "2010-04-01",
      "austrittsdatum": null,
      "mitgliedkategorie": {
        "id": 1,
        "name": "Aktivmitglied Pilot"
      }
    }
  ],
  "insurance": {
    "name": "SHV Kollektiv-Haftpflicht",
    "beschreibung": "CHF 10'000'000.-",
    "startDatum": "2026-01-01",
    "endDatum": "2026-12-31",
    "zielgruppeTyp": { "id": 1, "name": "Pilot" }
  },
  "brevets": [
    {
      "category": "Gleitschirm",
      "cardLevels": [
        { "cardLevel": "PILOT", "title": "Brevet Gleitschirm" }
      ]
    }
  ]
}
```
