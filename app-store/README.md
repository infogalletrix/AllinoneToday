# All in One Today iOS submission preparation

The public and business Flutter projects have separate iOS bundle identifiers, product names, icons and photo permission messages. A signed, installable IPA must be produced on macOS with company Apple Developer signing. Source preparation and an unsigned build do not constitute App Store approval.

## App identities

| Application | Project | Bundle identifier |
| --- | --- | --- |
| All in One Today | `apps/mobile_app` | `com.galletrix.allinonetoday` |
| All in One Business | `apps/merchant_app` | `com.galletrix.allinonetoday.business` |

Both projects require iOS 15 or newer. Reserve identifiers in the company developer account, create App Store Connect records and set the development team in each Runner target.

## Build on a Mac

Install Xcode, Flutter 3.47.6 and CocoaPods if required by the plugins. Run `flutter doctor -v`, accept Xcode terms and build each application separately.

```sh
cd apps/mobile_app
flutter pub get
flutter build ios --release --no-codesign
flutter build ipa --release --export-method app-store
cd ../merchant_app
flutter pub get
flutter build ios --release --no-codesign
flutter build ipa --release --export-method app-store
```

The unsigned build checks compilation. IPA export requires certificates and provisioning profiles. The manual repository workflow prepares unsigned ZIP artifacts only; it does not submit apps or use Apple secrets.

## Payments and accounts

The public app does not collect product purchase payments; buyers deal directly with sellers. Android shop subscriptions use Razorpay when server configuration is enabled. New purchases are disabled in the iOS business app; existing subscribers can manage listings and inquiries.

Resolve App Store payment requirements before enabling paid shop-listing features on iOS. Physical goods listed by shops do not automatically exempt a separate digital subscription. The advertising-management exception does not automatically cover ads displayed in the same app. See [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/).

Users can report listings, block messages, remove listings and delete their accounts in the app. Deletion requires the current password and cancels active mandates before removing personal account content. Required financial records remain without the deleted account’s original contact details.

## Submission checklist

- Sign and test both apps on real iPhones, including photos, secure sessions, deletion, inquiries and blocking.
- Supply a reviewer account and test-mode shop access; do not mark an unpaid production shop as paid.
- Enter company support details, privacy URL, age rating, territories and review contact in App Store Connect.
- Declare collected account contact information, user photos, listings and messages in the privacy questionnaire; inspect resolved plugins’ privacy manifests.
- Supply actual iPhone screenshots and final descriptions, not website screenshots.
- Confirm moderation staffing, refund handling, content and privacy policies, and upstream redistribution rights.
- Resolve the iOS subscription payment policy before enabling purchases. Store review time is outside the deployment timeline.

Privacy: https://allinonetoday.galletrix.com/privacy. Support: https://galletrix.com/contact. [Flutter iOS deployment](https://docs.flutter.dev/deployment/ios) covers signing and release steps.
