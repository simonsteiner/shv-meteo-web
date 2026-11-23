# Zero fake data policy

The application strictly adheres to the **Zero Fake Data Policy**:

- **No Mock Profiles**: Never generate dummy names, placeholder pilot ratings, or fabricated insurance amounts.
- **Member Areas**: Only the profile (digital licence) needs a login; `ProfileView` still shows its member login card, but the login routes are gone (PR9) and PR13 removes the tab. Forecasts and soundings are not gated.
- **Genuine Telemetry Only**: Historical charts and measurements reflect only real recorded station observations; mathematical mock sine waves or simulated weather values are prohibited.
- **Credential Protection**: Passwords are never accepted or stored by the web application; all authentication occurs directly on official Keycloak infrastructure.
