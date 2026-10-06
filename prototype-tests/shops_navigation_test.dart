import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/services/api_service.dart';
import 'package:mobile_app/features/shops/presentation/shop_details_screen.dart';
import 'package:mobile_app/features/shops/presentation/trusted_businesses_screen.dart';
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
    'Navigation to TrustedBusinessesScreen via View All and to ShopDetailsScreen via View Shop',
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

      // ── Test 1: Tap "View All >" from Section 5 on Home Screen ──
      // Scroll down to reveal Trusted Businesses section
      final viewAllFinder = find.byKey(const Key('home_view_all_trusted_btn'));
      await tester.scrollUntilVisible(
        viewAllFinder,
        300,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();

      expect(viewAllFinder, findsOneWidget);
      await tester.tap(viewAllFinder);
      await tester.pumpAndSettle();

      // Verify TrustedBusinessesScreen is visible
      expect(find.byType(TrustedBusinessesScreen), findsOneWidget);
      expect(find.text('Trusted Businesses'), findsOneWidget);
      expect(find.text('Search verified shops & dealers'), findsOneWidget);
      expect(find.text('Greenfield Realtors'), findsWidgets);
      expect(find.text('TechZone Electronics'), findsWidgets);

      // Test category filter chip: Electronics
      final electronicsChip = find.text('Electronics');
      expect(electronicsChip, findsOneWidget);
      await tester.tap(electronicsChip);
      await tester.pumpAndSettle();

      expect(find.text('TechZone Electronics'), findsWidgets);
      expect(find.text('Greenfield Realtors'), findsNothing);

      // Tap "View Shop" on TechZone Electronics inside TrustedBusinessesScreen
      final viewShopInDirectory = find.byKey(const Key('view_shop_btn_biz_2'));
      await tester.tap(viewShopInDirectory);
      await tester.pumpAndSettle();

      // Verify ShopDetailsScreen opens
      expect(find.byType(ShopDetailsScreen), findsOneWidget);
      expect(find.text('TechZone Electronics'), findsWidgets);
      expect(find.text('Call Business'), findsOneWidget);
      expect(find.text('Chat / Enquire'), findsOneWidget);

      // Pop back from ShopDetailsScreen to TrustedBusinessesScreen
      final backBtn1 = find.byIcon(Icons.arrow_back_ios_new_rounded);
      await tester.tap(backBtn1);
      await tester.pumpAndSettle();
      expect(find.byType(ShopDetailsScreen), findsNothing);
      expect(find.byType(TrustedBusinessesScreen), findsOneWidget);

      // Pop back from TrustedBusinessesScreen to HomeScreen
      final backBtn2 = find.byIcon(Icons.arrow_back_ios_new_rounded);
      await tester.tap(backBtn2);
      await tester.pumpAndSettle();
      expect(find.byType(TrustedBusinessesScreen), findsNothing);

      // ── Test 2: Tap "View Shop" directly on Home Screen card ──
      final firstCardFinder = find.byKey(const Key('trusted_biz_card_0'));
      await tester.scrollUntilVisible(
        firstCardFinder,
        200,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();

      final firstCardViewShop = find.descendant(
        of: firstCardFinder,
        matching: find.byType(OutlinedButton),
      );
      expect(firstCardViewShop, findsOneWidget);
      await tester.tap(firstCardViewShop);
      await tester.pumpAndSettle();

      // Verify ShopDetailsScreen opens with Greenfield Realtors
      expect(find.byType(ShopDetailsScreen), findsOneWidget);
      expect(find.text('Greenfield Realtors'), findsWidgets);
      expect(find.text('RERA Certified Agency'), findsOneWidget);
      expect(find.text('Call Business'), findsOneWidget);
      expect(find.text('Chat / Enquire'), findsOneWidget);
      expect(find.text('Active Catalogue'), findsOneWidget);

      // Pop back to Home
      final backBtn3 = find.byIcon(Icons.arrow_back_ios_new_rounded);
      await tester.tap(backBtn3);
      await tester.pumpAndSettle();
      expect(find.byType(ShopDetailsScreen), findsNothing);
    },
  );
}
