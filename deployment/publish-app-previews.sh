#!/usr/bin/env bash
set -euo pipefail
cd /opt/allinonetoday
test -f incoming-app-previews.tar.gz
test -f incoming-nginx-app-previews.conf
site=/etc/nginx/sites-available/allinonetoday
test "$(readlink -f /etc/nginx/sites-enabled/allinonetoday)" = "$site"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
release="/opt/allinonetoday/app-preview-releases/$stamp"
mkdir -p "$release" /opt/allinonetoday/backups/app-previews
# Only the generated preview payload is accepted; no paths can escape staging.
while IFS= read -r member; do
    case "$member" in
        ./|./public/|./business/|./public/*|./business/*|./index.html|./release.json) ;;
        *) echo 'Unexpected preview archive member'; exit 1 ;;
    esac
    case "$member" in *../*|/*) echo 'Unsafe archive member'; exit 1 ;; esac
done < <(tar -tzf incoming-app-previews.tar.gz)
tar -xzf incoming-app-previews.tar.gz --no-same-owner -C "$release"
test -f "$release/public/main.dart.js"
test -f "$release/business/main.dart.js"
test -f "$release/index.html"
test ! -L "$release/public"
test ! -L "$release/business"
# Optional small page-only refresh, consumed so it cannot override a future
# release. These files contain no application code or credentials.
if [ -f incoming-preview-public.html ] && [ -f incoming-preview-business.html ] && [ -f incoming-preview-release.json ]; then
    mv -T incoming-preview-public.html "$release/public/index.html"
    mv -T incoming-preview-business.html "$release/business/index.html"
    mv -T incoming-preview-release.json "$release/release.json"
fi
chmod -R a+rX "$release"
cp "$site" "backups/app-previews/nginx-$stamp.conf"
snippet=/etc/nginx/snippets/allinonetoday-app-previews.conf
if [ -f "$snippet" ]; then cp "$snippet" "backups/app-previews/snippet-$stamp.conf"; fi
install -m 644 incoming-nginx-app-previews.conf "$snippet"
if ! sed -n '/include \/etc\/nginx\/snippets\/allinonetoday-app-previews.conf;/p' "$site" | read -r _; then
    sed -i '/include \/etc\/nginx\/snippets\/allinonetoday-payment-test.conf;/a\    include /etc/nginx/snippets/allinonetoday-app-previews.conf;' "$site"
fi
if ! nginx -t; then
    cp "backups/app-previews/nginx-$stamp.conf" "$site"
    if [ -f "backups/app-previews/snippet-$stamp.conf" ]; then
        cp "backups/app-previews/snippet-$stamp.conf" "$snippet"
    fi
    echo 'Nginx validation failed; existing site config restored.'
    exit 1
fi
if [ -e /opt/allinonetoday/web/app-previews ] || [ -L /opt/allinonetoday/web/app-previews ]; then
    mv /opt/allinonetoday/web/app-previews "/opt/allinonetoday/backups/app-previews/previous-$stamp"
fi
ln -s "$release" /opt/allinonetoday/web/app-previews
systemctl reload nginx
curl -fsS https://allinonetoday.galletrix.com/app-previews/release.json
echo
echo 'Sample-only app previews published. Live website, APIs and APKs unchanged.'
