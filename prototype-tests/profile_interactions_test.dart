import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/services/api_service.dart';
import 'package:mobile_app/features/home/presentation/widgets/figma_bottom_nav_bar.dart';
import 'package:mobile_app/features/messages/presentation/messages_screen.dart';
import 'package:mobile_app/features/profile/presentation/screens/favorites_screen.dart';
import 'package:mobile_app/features/profile/presentation/screens/help_center_screen.dart';
import 'package:mobile_app/features/profile/presentation/screens/my_listings_screen.dart';
import 'package:mobile_app/features/profile/presentation/screens/payments_invoices_screen.dart';
import 'package:mobile_app/features/profile/presentation/screens/privacy_security_screen.dart';
import 'package:mobile_app/features/profile/presentation/screens/recently_viewed_screen.dart';
import 'package:mobile_app/features/profile/presentation/screens/saved_searches_screen.dart';
import 'package:mobile_app/features/profile/presentation/screens/seller_profile_screen.dart';
import 'package:mobile_app/features/profile/presentation/screens/settings_screen.dart';
import 'package:mobile_app/features/profile/presentation/profile_screen.dart';
import 'package:mobile_app/main.dart';
import 'package:shared_models/shared_models.dart';

class _MockApiService extends ApiService {
  @override
  Future<List<Category>> getCategories() async => [];

  @override
  Future<List<Product>> getProducts({
    String? categoryId,
    String? search,
  }) async => [];
}

void main() {
  testWidgets(
    'Every icon and interactive target on ProfileScreen functions when clicked',
    (tester) async {
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 2.0;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      final mockService = _MockApiService();
      await tester.pumpWidget(GalletrixMarketplaceApp(apiService: mockService));
      await tester.pumpAndSettle();

      // ── Navigate to Profile Tab ──
      final profileNavBtn = find.descendant(
        of: find.byType(FigmaBottomNavBar),
        matching: find.byIcon(Icons.person_outline_rounded),
      );
      await tester.tap(profileNavBtn);
      await tester.pumpAndSettle();

      // Verify initial Profile screen state
      expect(find.text('Profile'), findsOneWidget);
      expect(find.text('+7 904 599 xxx 11'), findsOneWidget);

      // ── 1. Test AppBar Settings Gear Icon ──
      final settingsBtn = find.byKey(const Key('profile_settings_btn'));
      expect(settingsBtn, findsOneWidget);
      await tester.tap(settingsBtn);
      await tester.pumpAndSettle();

      expect(find.byType(SettingsScreen), findsOneWidget);
      expect(find.text('Preferences'), findsOneWidget);
      expect(find.text('Clear Cached Media'), findsOneWidget);

      // Pop back to Profile
      await tester.tap(find.byIcon(Icons.arrow_back_ios_new_rounded));
      await tester.pumpAndSettle();
      expect(find.byType(SettingsScreen), findsNothing);

      // ── 2. Test Avatar Edit Photo Badge & Removal ──
      final editPhotoBtn = find.byKey(const Key('profile_edit_photo_btn'));
      await tester.tap(editPhotoBtn);
      await tester.pumpAndSettle();

      expect(find.text('Profile Photo'), findsOneWidget);
      expect(find.text('Remove Current Photo'), findsOneWidget);
      await tester.tap(find.text('Remove Current Photo'));
      await tester.pumpAndSettle();

      // Check initials avatar shown
      expect(find.text('AG'), findsOneWidget);

      // Tap avatar to restore photo via gallery option
      await tester.tap(find.byKey(const Key('profile_avatar_tap')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Choose from Gallery'));
      await tester.pumpAndSettle();
      expect(find.text('AG'), findsNothing);

      // ── 3. Test Edit Phone Card ──
      final phoneCard = find.byKey(const Key('contact_phone_card'));
      await tester.tap(phoneCard);
      await tester.pumpAndSettle();

      expect(find.text('Edit Phone Number'), findsOneWidget);
      final phoneInput = find.byKey(const Key('edit_phone_input'));
      await tester.enterText(phoneInput, '+7 904 777 88 99');
      await tester.tap(find.byKey(const Key('save_phone_btn')));
      await tester.pumpAndSettle();

      // Verify phone updated on Profile screen
      expect(find.text('+7 904 777 88 99'), findsOneWidget);

      // ── 4. Test Edit Email Card ──
      final emailCard = find.byKey(const Key('contact_email_card'));
      await tester.tap(emailCard);
      await tester.pumpAndSettle();

      expect(find.text('Edit Email Address'), findsOneWidget);
      final emailInput = find.byKey(const Key('edit_email_input'));
      await tester.enterText(emailInput, 'alex.pro@gamil.com');
      await tester.tap(find.byKey(const Key('save_email_btn')));
      await tester.pumpAndSettle();

      expect(find.text('alex.pro@gamil.com'), findsOneWidget);

      // ── 5. Test Edit Address Card ──
      final addressCard = find.byKey(const Key('contact_address_card'));
      await tester.tap(addressCard);
      await tester.pumpAndSettle();

      expect(find.text('Edit Default Address'), findsOneWidget);
      final addressInput = find.byKey(const Key('edit_address_input'));
      await tester.enterText(addressInput, 'Kowdiar, Thiruvananthapuram');
      await tester.tap(find.byKey(const Key('save_address_btn')));
      await tester.pumpAndSettle();

      expect(find.text('Kowdiar, Thiruvananthapuram'), findsOneWidget);

      // ── 6. Test "My favorites" navigation ──
      await tester.tap(find.byKey(const Key('action_favorites')));
      await tester.pumpAndSettle();

      expect(find.byType(FavoritesScreen), findsOneWidget);
      expect(find.text('Hyundai Creta SX(O) 1.5 Turbo'), findsWidgets);
      // Remove one item
      final removeFav = find.byKey(const Key('remove_fav_fav_1'));
      await tester.tap(removeFav);
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('remove_fav_fav_1')), findsNothing);

      // Pop back to Profile and clear any floating snackbars
      await tester.tap(find.byIcon(Icons.arrow_back_ios_new_rounded));
      await tester.pumpAndSettle();
      ScaffoldMessenger.of(
        tester.element(find.byType(ProfileScreen)),
      ).clearSnackBars();
      await tester.pumpAndSettle();

      // ── 7. Test "Saved Searches" navigation ──
      await tester.tap(find.byKey(const Key('action_saved_searches')));
      await tester.pumpAndSettle();

      expect(find.byType(SavedSearchesScreen), findsOneWidget);
      expect(find.text('Automatic SUVs under ₹15 Lakhs'), findsOneWidget);

      // Pop back to Profile
      await tester.tap(find.byIcon(Icons.arrow_back_ios_new_rounded));
      await tester.pumpAndSettle();

      // ── 8. Test "Recently viewed" navigation ──
      await tester.tap(find.byKey(const Key('action_recently_viewed')));
      await tester.pumpAndSettle();

      expect(find.byType(RecentlyViewedScreen), findsOneWidget);
      expect(find.text('Apple MacBook Pro 14" M3 Pro'), findsOneWidget);

      // Pop back to Profile
      await tester.tap(find.byIcon(Icons.arrow_back_ios_new_rounded));
      await tester.pumpAndSettle();

      // ── 9. Test "My enquiries" navigation to MessagesScreen ──
      await tester.tap(find.byKey(const Key('action_my_enquiries')));
      await tester.pumpAndSettle();

      expect(find.byType(MessagesScreen), findsOneWidget);
      expect(find.text('Rohan Sharma'), findsOneWidget);

      // Pop back to Profile
      await tester.tap(find.byIcon(Icons.arrow_back_ios_new_rounded));
      await tester.pumpAndSettle();

      // ── 10. Test "Seller Profile" navigation ──
      await tester.tap(find.byKey(const Key('action_seller_profile')));
      await tester.pumpAndSettle();

      expect(find.byType(SellerProfileScreen), findsOneWidget);
      expect(find.text('Verified Seller'), findsWidgets);
      expect(find.text('Government ID Verified'), findsOneWidget);

      // Pop back to Profile
      await tester.tap(find.byIcon(Icons.arrow_back_ios_new_rounded));
      await tester.pumpAndSettle();

      // ── 11. Test "My Listings" navigation ──
      await tester.tap(find.byKey(const Key('action_my_listings')));
      await tester.pumpAndSettle();

      expect(find.byType(MyListingsScreen), findsOneWidget);
      expect(find.byKey(const Key('post_new_ad_fab')), findsOneWidget);

      // Pop back to Profile
      await tester.tap(find.byIcon(Icons.arrow_back_ios_new_rounded));
      await tester.pumpAndSettle();

      // ── 12. Test "Payments & invoices" navigation ──
      await tester.tap(find.byKey(const Key('action_payments_invoices')));
      await tester.pumpAndSettle();

      expect(find.byType(PaymentsInvoicesScreen), findsOneWidget);
      expect(find.text('Apple Pay'), findsOneWidget);
      expect(
        find.text('INV-2024-0821 • 18 Sep 2024, 02:45 PM'),
        findsOneWidget,
      );

      // Tap first receipt to open modal
      await tester.tap(find.byKey(const Key('invoice_tile_0')));
      await tester.pumpAndSettle();
      expect(find.text('Tax Invoice / Receipt'), findsOneWidget);
      expect(find.text('Download PDF Receipt'), findsOneWidget);
      // Dismiss modal by tapping download button
      await tester.tap(find.text('Download PDF Receipt'));
      await tester.pumpAndSettle();

      // Pop back to Profile
      await tester.tap(find.byIcon(Icons.arrow_back_ios_new_rounded));
      await tester.pumpAndSettle();

      // ── 13. Test "Help center" navigation ──
      final helpCenterFinder = find.byKey(const Key('action_help_center'));
      await tester.scrollUntilVisible(
        helpCenterFinder,
        200,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();
      await tester.tap(helpCenterFinder);
      await tester.pumpAndSettle();

      expect(find.byType(HelpCenterScreen), findsOneWidget);
      expect(find.text('Your Open Tickets (2)'), findsOneWidget);
      expect(find.byKey(const Key('contact_support_btn')), findsOneWidget);

      // Pop back to Profile
      await tester.tap(find.byIcon(Icons.arrow_back_ios_new_rounded));
      await tester.pumpAndSettle();

      // ── 14. Test "Privacy & Security" navigation ──
      final privSecFinder = find.byKey(const Key('action_privacy_security'));
      await tester.scrollUntilVisible(
        privSecFinder,
        200,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();
      await tester.tap(privSecFinder);
      await tester.pumpAndSettle();

      expect(find.byType(PrivacySecurityScreen), findsOneWidget);
      expect(find.text('Your Account is Protected'), findsOneWidget);
      expect(find.text('Two-Factor Authentication (2FA)'), findsOneWidget);

      // Pop back to Profile
      await tester.tap(find.byIcon(Icons.arrow_back_ios_new_rounded));
      await tester.pumpAndSettle();
      expect(find.byType(PrivacySecurityScreen), findsNothing);
    },
  );
}
