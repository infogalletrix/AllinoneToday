# All in One Today marketplace

All in One Today has a public website, a public mobile app and a separate shop-owner app. The website is hosted at https://allinonetoday.galletrix.com. Accounts, listings, photos, inquiries and shop registrations are stored by the production API in PostgreSQL.

Shop payments remain disabled until Galletrix approves the ₹499 starting fee, billing period, category prices and additional-branch prices, and configures marketplace-specific Razorpay credentials and webhooks. Unpaid shops are not published and cannot publish business listings. No demo payment response grants access.

## Applications and services

| Component | Location | Purpose |
| --- | --- | --- |
| Public website | `apps/web_app` | Search, individual selling, accounts and messages |
| Public mobile app | `apps/mobile_app` | Native browsing, listings, favorites, inquiries and account management |
| Shop-owner mobile app | `apps/merchant_app` | Shop registration, subscription, business listings and inquiries |
| Production API | `apps/platform_api` | Authentication, ownership checks, persistent data and payment verification |
| VPS configuration | `deployment` | Isolated database and API containers, Nginx and HTTPS |

The original Dart Frog prototype, Flutter demo screens and shared models are retained. `lib/demo_main.dart`, `prototype-tests` and `UPSTREAM_README.md` describe the original demo, not the deployed flow. Product purchases are arranged directly with sellers; this launch is a classifieds and shop-directory marketplace, not an order-fulfillment or escrow service.

## Build and test

Use Node 22 or newer, Flutter 3.47.6, Android Studio and an Android SDK. On Windows, install Flutter at a path without spaces to avoid native-assets hook failures.

```sh
cd apps/web_app
npm ci
npm run build
cd ../platform_api
npm ci
npm test
cd ../mobile_app
flutter pub get
flutter analyze lib/production
flutter test
flutter build apk --release
cd ../merchant_app
flutter pub get
flutter test
flutter build apk --release
```

Android release builds require ignored `android/key.properties` files and a signing keystore. `tools/create-signing.mjs` generates new-project signing material on the current Windows machine without printing passwords. Back up `.local/signing` securely: the same key is required for future APK updates. Never commit or publish keys or credentials.

The initial downloadable APKs are version 1.0.0, signed release builds for ARM64 phones running Android 7.0 or newer. Build them with `flutter build apk --release --target-platform android-arm64`. The public APK uses `com.galletrix.allinonetoday`; the business APK uses `com.galletrix.allinonetoday.business`. They compile against the live HTTPS API, but have not yet been tested on a physical phone.

Download them from https://allinonetoday.galletrix.com/download. Local copies and unsigned iOS build ZIPs are in the ignored `artifacts` folder; signing keys are stored separately and must never be uploaded with downloads.

The apps use the live HTTPS origin by default. Override it with `--dart-define=PLATFORM_URL=https://your-host`. Local Vite development proxies `/api` and `/uploads` to port 8080. Copy the API `.env.example` privately and provide a PostgreSQL connection.

`tools/api-smoke.mjs` checks account creation, passwords, uploads, listing ownership, private inquiries, unpaid-shop restrictions, fake-payment rejection and reports. It creates temporary accounts, then removes their personal data and hides test listings. Prefer staging for subsequent runs. `tools/web-smoke.mjs` checks Chrome desktop and mobile layouts; install Playwright locally to use it.

## Shop billing configuration

Server-calculated prices use paise: base price plus `(branches - 1) × additional branch price`. The example configuration has `approved: false` and no fabricated category rates. Supply an approved period of `month` or `year`, a version and category entries in `/opt/allinonetoday/deployment/pricing.json`.

Store `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` in the root-only VPS environment file. Configure Razorpay subscriptions and a dedicated webhook at `https://allinonetoday.galletrix.com/api/billing/webhook`. Enable `subscription.charged`, `subscription.cancelled`, `subscription.completed`, `subscription.halted` and `subscription.expired`. Test the full payment, renewal and cancellation flow with test-mode credentials before opening live registration.

The API verifies signatures, matches captured payments to the subscription invoice and checks the full price. Webhooks are deduplicated and access requires a future paid-through date. A small verification charge or client-side success alone does not publish a shop. Normal cancellation stops renewals at the paid-cycle end; confirmed account deletion stops the mandate immediately before removing personal data.

## VPS operation

Production lives under `/opt/allinonetoday`. Compose project `allinonetoday` owns its own database and uploads volumes. Only API port `127.0.0.1:5088` is exposed; PostgreSQL has no public port. Nginx has a dedicated site. Existing ERP and other VPS applications are outside this deployment.

```sh
cd /opt/allinonetoday
docker compose -p allinonetoday -f deployment/compose.yml --env-file deployment/.env ps
curl -f https://allinonetoday.galletrix.com/api/health
```

Treat the environment file, database and uploads as private. The release archive contains no secrets. `deployment/install.sh` preserves private environment and pricing files on updates. Back up the database and photos before major changes, and monitor disk capacity, moderation reports and failed webhooks.

## App Store preparation

See `app-store/README.md` for identities and submission requirements. iOS source includes product names, icons and photo permission messages. A manual GitHub workflow prepares unsigned builds. Signed IPAs require Apple Developer signing and App Store Connect access. New shop subscription purchases are disabled in iOS pending the applicable payment implementation; existing subscribers can manage their shops.

## Source provenance

Imported from https://github.com/Akhilrs-RS/marketplace at `57d5463c529bc87c2e24f623d791049eba9b6492`, preserving history. Company repository: https://github.com/infogalletrix/AllinoneToday. Confirm rights to redistribute upstream code and supplied imagery before broad commercial distribution; the source has no license file.
