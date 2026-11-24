# Capturing the official SHV app's HTTPS traffic

To see which upstream calls the official SHV FSVL app (`ch.shv_fsvl`) makes, run it on an Android emulator ([shv-app-emulator.md](shv-app-emulator.md)) behind mitmproxy. This guide sets that up from WSL against the Windows emulator; the calls it found are in [the research note of 2026-11-24](../research/2026-11-24-shv-app-network-calls.md).

Checked on 2026-11-24 with app 1.1.0 (version code 1010001) on the `x86_64` Google APIs images API 34 (Android 14) and API 36 (Android 16), mitmproxy 12.3.

## The approach, and why

- **mitmproxy in WSL, nothing on Windows.** `uv tool install mitmproxy` puts it in your home directory. WSL's default NAT networking forwards a port that listens in WSL to Windows' `localhost`, and the emulator reaches Windows' `localhost` as `10.0.2.2`, so the emulator needs no WSL address, which changes with every WSL restart.
- **The proxy as a setting, not an emulator flag.** `adb shell settings put global http_proxy 10.0.2.2:8080` takes effect at once, needs no emulator restart and is undone the same way. `-http-proxy` would mean restarting the AVD from Windows.
- **The CA in the system store, no Frida.** The app trusts system CAs only (`res/xml/network_security_config.xml`: `base-config`, `trust-anchors`, `certificates src="system"`), so a CA in the user store is ignored. It pins nothing: the config has no `pin-set`, and the DEX holds OkHttp but not its `Certificate pinning failure!` message, so R8 removed the unused `CertificatePinner`. The map engine (`libmapscore.so`) has no network stack of its own; every tile goes through the app's OkHttp, which follows the proxy setting. A CA in the system store is therefore enough. [android-ca.sh](../../scripts/shv-app-capture/android-ca.sh) puts it there in memory only (a tmpfs, bind-mounted into the Conscrypt APEX that API 34 and later read), so a reboot undoes it. Frida would need `frida-server` on the device and a hook script, for nothing the CA doesn't already give.

## Set up

1. **Install mitmproxy and create its CA.** The first start writes the CA to `~/.mitmproxy/`.

   ```bash
   uv tool install mitmproxy
   timeout 5 mitmdump >/dev/null
   HASH=$(openssl x509 -in ~/.mitmproxy/mitmproxy-ca-cert.pem -noout -subject_hash_old)
   cp ~/.mitmproxy/mitmproxy-ca-cert.pem "/tmp/$HASH.0"
   ```

2. **Add the CA to the emulator's system store.** Needs a Google APIs image (not Google Play), where `adb root` works. Repeat after every emulator boot.

   ```bash
   E=emulator-5554
   adb -s $E root
   adb -s $E wait-for-device   # adb root restarts adbd
   adb -s $E push "/tmp/$HASH.0" scripts/shv-app-capture/android-ca.sh /data/local/tmp/
   adb -s $E shell sh /data/local/tmp/android-ca.sh "/data/local/tmp/$HASH.0"
   adb -s $E shell am force-stop ch.shv_fsvl   # the next start picks up the CA
   ```

3. **Start the proxy, then point the emulator at it.** Logged out, a plain flow file is fine. `mitmdump` stays in the foreground:

   ```bash
   mkdir -p ~/shv-capture
   mitmdump --listen-host 0.0.0.0 --listen-port 8080 -w ~/shv-capture/session.flows
   ```

   Then, in a second terminal:

   ```bash
   adb -s $E shell settings put global http_proxy 10.0.2.2:8080
   ```

   Keep captures outside the repo; they are never committed.

4. **Use the app.** Open screens through their deep links ([shv-app-emulator.md, "Open a screen directly"](shv-app-emulator.md#open-a-screen-directly)) and wait about ten seconds on each. Read the flows back with `mitmdump -nr ~/shv-capture/session.flows`, or open them in `mitmweb -r`.

5. **Undo the proxy when you are done.** Without mitmproxy running, the emulator has no network until the setting is cleared. The CA goes with the next reboot.

   ```bash
   adb -s $E shell settings put global http_proxy :0
   ```

## Logged in: capture redacted

An AVD with a member login sends a Bearer token to the member service (`/v1/wms/person`), refreshes it at `login.shv-fsvl.ch`, and gets member data back. Capture there only through [redacted_log.py](../../scripts/shv-app-capture/redacted_log.py), and without `-w`, so nothing unredacted reaches the disk: it writes one JSON line per request with the method, URL, status, type, Cache-Control and sizes, and drops every body, every `Authorization` and `Cookie` value, and the value of every query key with a secret word anywhere in its name (`token`, `id_token_hint`, `session_state`, `client_secret`). `python3 -I scripts/shv-app-capture/redacted_log.py` checks that on the OIDC and Keycloak URL shapes.

Add the CA to that AVD first (step 2 above, with `E=emulator-5556`). Then start the proxy, which stays in the foreground:

```bash
mitmdump --listen-host 0.0.0.0 --listen-port 8081 -q \
  -s scripts/shv-app-capture/redacted_log.py --set redacted_log=$HOME/shv-capture/member.jsonl
```

And in a second terminal:

```bash
adb -s emulator-5556 shell settings put global http_proxy 10.0.2.2:8081
```

A second port keeps two AVDs' traffic apart, since both arrive from `127.0.0.1`. Never log in on a scripted emulator to get there; use an AVD where you logged in by hand.

## See every call, not the cached ones

The app keeps OkHttp disk caches (`cache/map/`, `cache/reports-map/`, `cache/ubiquache/`), and a cached tile or layer never reaches the proxy. Two ways round it:

- **Logged out:** `adb -s $E shell pm clear ch.shv_fsvl` resets the app; tap through the onboarding again and skip the login ("Überspringen").
- **Logged in:** clear only the HTTP caches, which keeps the login in `shared_prefs/`: `adb -s $E shell am force-stop ch.shv_fsvl; adb -s $E shell 'rm -rf /data/data/ch.shv_fsvl/cache/*'` (as root).

The cache files are also a record of past calls: the first line of each OkHttp `*.0` file is the URL it holds.

## Gotchas

- **The map is blank but still loads.** The map engine can't draw on the emulator (no OpenGL ES 3.2, see [shv-app-emulator.md](shv-app-emulator.md#gotchas)), but creating a map still requests its tiles and layers for the visible area, and a tap where a station or take-off would be opens its sheet, with that sheet's calls. Layer switches in the live map's bottom sheet loaded their tiles on the API 36 AVD; on the API 34 AVD (`-gpu host -feature GLESDynamicVersion`) the sheet ignored every tap and no layer loaded. Why is not known.
- **The global forecast ("Europa") kills the app on the second visit:** `FATAL EXCEPTION: GLThread`, `RuntimeException: vector` from `MapInterface.prepare`. Restart the app; the first visit's calls are captured before it dies.
- **All six forecast screens are members-only.** Logged out, `textForecast`, `globalForecast`, `localForecast`, `northSouthDifferences`, `previtemps` and `aggregatedForecast` show "Nur für Mitglieder" and make no calls; the home screen and the live map work without a login.
- **Links leave the app.** The DABS button opens Chrome, whose own traffic then shows up in the capture, along with Android's (`connectivitycheck.gstatic.com`, `android.googleapis.com`, Play services). Filter by User-Agent: the app's start with `Android/<sdk> ch.shv_fsvl/`, `ch.shv_fsvl;1.1.0;Android;` (map tiles), `Android/shv-1.1.0`, `Heidi/OIDC` or `shv-app;android;`.
- **Chrome calls a MITM'd page dangerous** even with the CA in the system store; the app doesn't. Ignore it.
- **`adb root` restarts adbd**, so wait a second before the next `adb` call.
