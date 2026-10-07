#!/usr/bin/env bash
set -euo pipefail
cd /opt/allinonetoday
test -f incoming-payment-test.apk
test "$(sha256sum incoming-payment-test.apk | cut -d' ' -f1)" = df0d40537ec5396f7e4bcadde544c720475dfa81a2e40d0a418da93640da77b3
if [ -f web/downloads/allinonetoday-business-payment-test.apk ]; then
    umask 077
    mkdir -p backups/payment-test-apks
    cp web/downloads/allinonetoday-business-payment-test.apk "backups/payment-test-apks/$(date -u +%Y%m%dT%H%M%SZ).apk"
fi
chmod 644 incoming-payment-test.apk
mv -T incoming-payment-test.apk web/downloads/allinonetoday-business-payment-test.apk
echo 'Signed Android Test APK published; public and production business APKs were preserved.'
