#!/usr/bin/env bash
set -euo pipefail
cd /opt/allinonetoday
printf '%s  %s\n' '8d563267a4dbd722cf1a79fd5d05db78e60063190b13a3ed951b065914a4dd11' 'incoming-public.apk' '0c4309fc05ff69ab989a3b0eabb37b38b5e051ae89abcdd50847be3dc36b59c3' 'incoming-business.apk' | sha256sum --check --strict
test -d /opt/allinonetoday/web/downloads
mkdir -p backups/apk-1.0.0
chmod 700 backups/apk-1.0.0
for name in public business; do
  test -f "web/downloads/allinonetoday-${name}.apk"
  cp -n "web/downloads/allinonetoday-${name}.apk" "backups/apk-1.0.0/allinonetoday-${name}.apk"
done
chmod 644 incoming-public.apk incoming-business.apk
mv -T incoming-public.apk web/downloads/allinonetoday-public.apk
mv -T incoming-business.apk web/downloads/allinonetoday-business.apk
sha256sum web/downloads/allinonetoday-public.apk web/downloads/allinonetoday-business.apk
echo 'Verified 1.1.0 Android releases published. Previous APKs retained in private backups.'
