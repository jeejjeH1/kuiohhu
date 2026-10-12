#!/usr/bin/env bash
# Builds dist/tarhsaz.apk from ../canva-app without Gradle or the full Android SDK.
# Needs: JDK 8+, aapt, dalvik-exchange (dx), zipalign, apksigner
#   (Ubuntu/Debian: apt-get install aapt dalvik-exchange zipalign apksigner)
set -euo pipefail
cd "$(dirname "$0")"
B=build
ANDROID_JAR=${ANDROID_JAR:-$B/android-34.jar}
KS=${KEYSTORE:-keystore/tarhsaz.jks}
KS_PASS=${KEYSTORE_PASS:-tarhsaz-release}
DX=$(command -v dalvik-exchange || command -v dx)

rm -rf "$B/gen" "$B/classes" "$B/assets" "$B"/*.apk "$B/classes.dex"
mkdir -p "$B/gen" "$B/classes" "$B/assets" dist

if [ ! -f "$ANDROID_JAR" ]; then
  echo "== downloading android.jar (API 34)"
  curl -fsSL -o "$ANDROID_JAR" https://raw.githubusercontent.com/Sable/android-platforms/master/android-34/android.jar
fi

echo "== bundling web app + fonts (offline)"
cp -r ../canva-app "$B/assets/www"
rm -f "$B/assets/www/README.md"
python3 bundle_fonts.py "$B/assets/www"

echo "== aapt: R.java"
aapt package -f -m -J "$B/gen" -M AndroidManifest.xml -S res -I "$ANDROID_JAR"

echo "== javac"
javac -nowarn -Xlint:-options -source 8 -target 8 -encoding UTF-8 \
  -bootclasspath "$ANDROID_JAR" -d "$B/classes" \
  $(find src "$B/gen" -name '*.java')

echo "== dex"
"$DX" --dex --min-sdk-version=24 --output="$B/classes.dex" "$B/classes"

echo "== package"
aapt package -f -0 arsc -0 woff2 -M AndroidManifest.xml -S res -A "$B/assets" -I "$ANDROID_JAR" -F "$B/app.unsigned.apk"
(cd "$B" && aapt add -f app.unsigned.apk classes.dex >/dev/null)
zipalign -f -p 4 "$B/app.unsigned.apk" "$B/app.aligned.apk"

if [ ! -f "$KS" ]; then
  echo "== creating signing key $KS (keep it safe: updates must be signed with the same key)"
  mkdir -p "$(dirname "$KS")"
  keytool -genkeypair -keystore "$KS" -storepass "$KS_PASS" -keypass "$KS_PASS" -alias tarhsaz \
    -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Tarhsaz, O=Tarhsaz, C=IR" >/dev/null 2>&1
fi

echo "== sign"
apksigner sign --ks "$KS" --ks-pass "pass:$KS_PASS" --ks-key-alias tarhsaz \
  --min-sdk-version 24 --out dist/tarhsaz.apk "$B/app.aligned.apk"
apksigner verify --verbose dist/tarhsaz.apk | head -5
ls -lh dist/tarhsaz.apk
