#!/system/bin/sh
# Adds one CA certificate to an emulator's system store until it reboots.
# Runs on the device as root (`adb root` on a Google APIs image), for the
# official SHV app's traffic capture: docs/reference/shv-app-traffic-capture.md.
#
#   adb push <hash>.0 android-ca.sh /data/local/tmp/
#   adb shell sh /data/local/tmp/android-ca.sh /data/local/tmp/<hash>.0
#
# <hash>.0 is the CA in PEM, named after `openssl x509 -subject_hash_old`.
# A tmpfs over /system/etc/security/cacerts holds the stock CAs plus this one.
# From API 34 the apps read their CAs from the Conscrypt APEX instead, so the
# tmpfs is also bind-mounted there, inside zygote's mount namespace (apps
# started later inherit it) and inside every app already running. Nothing is
# written to the system image; a reboot undoes it all.
set -e
CERT="$1"
STORE=/system/etc/security/cacerts
APEX=/apex/com.android.conscrypt/cacerts
COPY=/data/local/tmp/cacerts-copy

[ -f "$CERT" ] || { echo "usage: android-ca.sh /data/local/tmp/<hash>.0" >&2; exit 1; }

SRC="$STORE"
[ -d "$APEX" ] && SRC="$APEX"
rm -rf "$COPY"
mkdir -p -m 700 "$COPY"
cp "$SRC"/* "$COPY"/

mount -t tmpfs tmpfs "$STORE"
cp "$COPY"/* "$STORE"/
cp "$CERT" "$STORE"/
chown root:root "$STORE"/*
chmod 644 "$STORE"/*
chcon u:object_r:system_file:s0 "$STORE"/*
rm -rf "$COPY"

if [ -d "$APEX" ]; then
  for Z in $(pidof zygote zygote64); do
    nsenter --mount=/proc/$Z/ns/mnt -- mount --bind "$STORE" "$APEX"
    for P in $(ps -o pid= -P "$Z"); do
      nsenter --mount=/proc/$P/ns/mnt -- mount --bind "$STORE" "$APEX" 2>/dev/null || true
    done
  done
  Z=$(pidof zygote64 || pidof zygote)
  echo "zygote now sees $(nsenter --mount=/proc/${Z%% *}/ns/mnt -- ls "$APEX" | wc -l) CAs"
else
  echo "the store now has $(ls "$STORE" | wc -l) CAs"
fi
