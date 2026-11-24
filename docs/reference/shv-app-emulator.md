# Running the official SHV app on an Android emulator

To compare this web app with the official SHV FSVL app (`ch.shv_fsvl`), run the official app on an Android emulator and drive it from the shell with `adb`. This works from WSL against the emulator that Android Studio runs on Windows. How the app works inside is in [shv-native-app.md](shv-native-app.md).

Checked on 2026-11-23 with app 1.1.0 (version code 1010001) on `x86_64` Google APIs images, API 36 (Android 16) and API 34 (Android 14).

## What you need

- **Android Studio on Windows** with at least one AVD. A Google APIs image is enough; the AVD needs no Play Store, because the app comes from your phone.

- **A Linux adb in WSL that reaches the Windows adb server.** Install Google's Linux platform-tools (the same version as on Windows; client and server must match), then point the client at the Windows host:

  ```bash
  export ADB_SERVER_SOCKET="tcp:$(ip route show default | awk '{print $3}'):5037"
  ```

  The Windows server must listen beyond localhost, so start it with `adb.exe -a -P 5037 nodaemon server` (kill Android Studio's own server first). On macOS or Linux with a local emulator, skip this; plain `adb` works.

- **An Android phone with the SHV app installed** and USB debugging on. On Windows it shows up in `adb devices` through the same server, so WSL sees it too.

## Start an emulator

Start the AVD from Android Studio's Device Manager, or from WSL:

```bash
SDK='C:\Users\<you>\AppData\Local\Android\Sdk'
"$(wslpath "$SDK")/emulator/emulator.exe" -list-avds
powershell.exe -NoProfile -Command "Start-Process '$SDK\emulator\emulator.exe' '-avd A54_like_API_36'"
adb wait-for-device
until [ "$(adb shell getprop sys.boot_completed | tr -d '\r')" = 1 ]; do sleep 3; done
```

`Start-Process` detaches the Windows process; a plain `emulator.exe &` keeps the WSL shell attached.

## Install the app from your phone

The app is a split APK from the Play Store. Copy every part off the phone and install them together. Keep them in `apk_analysis/` (gitignored), next to the decompiled copy:

```bash
PHONE=<serial>   # the phone's serial from `adb devices -l`
mkdir -p apk_analysis/shv && cd apk_analysis/shv
adb -s $PHONE shell dumpsys package ch.shv_fsvl | grep -m2 version
for f in $(adb -s $PHONE shell pm path ch.shv_fsvl | sed 's/package://' | tr -d '\r'); do adb -s $PHONE pull "$f"; done
adb -s emulator-5554 install-multiple *.apk
```

The phone delivers `split_config.arm64_v8a.apk`, and the emulator is `x86_64`. It installs and runs anyway: recent `x86_64` images translate ARM code (`adb shell getprop ro.product.cpu.abilist` lists `x86_64,arm64-v8a`).

## Use it

With the phone and the emulator both attached, every command needs `-s`:

```bash
E=emulator-5554
adb -s $E shell monkey -p ch.shv_fsvl -c android.intent.category.LAUNCHER 1   # launch
adb -s $E exec-out screencap -p > /tmp/shv.png                              # screenshot (1080x2340 on the A54 AVD)
adb -s $E shell input tap 945 2170                                          # tap, in device pixels
adb -s $E shell input swipe 540 1600 540 600                                # scroll
adb -s $E shell input keyevent KEYCODE_BACK
adb -s $E exec-out uiautomator dump /dev/stdout                             # view tree with bounds, to find tap targets
adb -s $E logcat --pid="$(adb -s $E shell pidof ch.shv_fsvl)"               # the app's log
adb -s $E shell reboot -p                                                   # shut the emulator down
```

Switch AVDs by shutting one down and starting the other. Two can run at once, as `emulator-5554` and `emulator-5556`.

## Open a screen directly

The main activity takes verified app links on `https://prod.shv-app.ch/`, so a screen opens without tapping through the home screen:

```bash
adb -s $E shell am start -a android.intent.action.VIEW -d https://prod.shv-app.ch/previtemps ch.shv_fsvl
```

The paths are `liveMap`, `textForecast`, `globalForecast`, `localForecast`, `northSouthDifferences`, `previtemps` and `aggregatedForecast` (from the manifest's intent filter; the app also handles `/oidc/callback` for the login). Members-only screens such as Previtemps show "Nur für Mitglieder" when the AVD isn't logged in. Which query parameters a path accepts isn't known.

## Gotchas

- **`adb emu kill` does nothing from WSL**, because the emulator console port is on Windows; use `adb shell reboot -p` or close the window.
- **Android Studio takes over the adb server** when it starts, and its server listens on localhost only. Set it to use an existing, manually managed server on port 5037 (Settings, Debugger), or restart the listening server after Studio.
- **A new app version needs a new pull.** `install-multiple` with the newer parts upgrades in place and keeps the app data.
- **The onboarding ends at the member login** ("Mitglieds-Login"). Tap "Überspringen" to use the app without an account. "Jetzt anmelden" opens `login.shv-fsvl.ch` in Chrome; don't type an SHV password into a shared or scripted emulator, back out with `KEYCODE_BACK`.
- **The map stays blank on the emulator, and no setting fixes it.** The app's map engine (`libmapscore.so`, Open Mobile Maps) uses tessellation shaders (`#version 320 es`, `layout(vertices = 3)`, `gl_TessLevelOuter`), an OpenGL ES 3.2 feature, and the manifest declares 3.2 as required (`glEsVersion 0x30002`). The emulator offers at most 3.1, so the shaders don't compile: the app log fills with `GL error 0x502` from `glGetUniformLocation`, and the emulator window on Windows prints `glTexImage2D: got err pre :( 0x502` for every texture upload after that. Checked on the API 36 AVD with the default GPU mode and `-gpu swiftshader_indirect` (GLES 3.0), and on the API 34 AVD with `-gpu host` (3.0) and `-gpu host -feature GLESDynamicVersion` (3.1, the emulator's ceiling: SurfaceFlinger lists `ANDROID_EMU_gles_max_version_3_1`). An x86_64 build of the app has the same shaders, and patching the version line doesn't help because the shaders really use 3.2. The screens around the map render. For the map, use the phone itself; `adb -s $PHONE exec-out screencap -p` takes its screenshots the same way.
- **No debug menu.** The app is a release build (`ch.ubique.alpaka.flavor` is `prod`) and isn't debuggable; the debug-sounding strings in its DEX come from libraries.
