import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/services/api_service.dart';
import 'package:mobile_app/features/home/presentation/widgets/figma_bottom_nav_bar.dart';
import 'package:mobile_app/demo_main.dart';
import 'package:shared_models/shared_models.dart';

class MockApiService extends ApiService {
  @override
  Future<List<Category>> getCategories() async {
    return [
      const Category(id: 'cat_electronics', name: 'Electronics', slug: 'electronics'),
      const Category(id: 'cat_fashion', name: 'Fashion & Apparel', slug: 'fashion'),
    ];
  }

  @override
  Future<List<Product>> getProducts({String? categoryId, String? search}) async {
    return [
      Product(
        id: 'prod_1',
        title: 'Pulse ANC Wireless Headphones',
        description: 'Studio-grade noise cancellation',
        price: 299.99,
        discountPrice: 249.99,
        rating: 4.9,
        reviewCount: 342,
        stock: 45,
        images: const [],
        categoryId: 'cat_electronics',
        vendorId: 'ven_101',
        vendorName: 'Acoustic Labs',
        isFeatured: true,
        createdAt: DateTime.now(),
      ),
    ];
  }
}

void main() {
  testWidgets('Navigation and screen redirection tests', (WidgetTester tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 2.0;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    final mockService = MockApiService();
    await tester.pumpWidget(GalletrixMarketplaceApp(apiService: mockService));
    await tester.pumpAndSettle();

    // 1. Home screen verification
    expect(find.text('MarketPlace'), findsOneWidget);
    expect(find.text('Browse by category'), findsOneWidget);
    expect(find.text('Vehicles'), findsOneWidget);

    // 2. Tap Search nav button -> redirect to Explore
    final searchNavBtn = find.descendant(
      of: find.byType(FigmaBottomNavBar),
      matching: find.byIcon(Icons.search_rounded),
    );
    await tester.tap(searchNavBtn);
    await tester.pumpAndSettle();
    expect(find.text('Explore'), findsOneWidget);
    expect(find.text('Search in the marketplace'), findsOneWidget);
    expect(find.text('ALL AROUND BENGALURU'), findsOneWidget);
    expect(find.text('128 Results'), findsOneWidget);
    expect(find.text('Within 10 Km'), findsOneWidget);
    expect(find.text('Recommended'), findsOneWidget);
    expect(find.text('2022 Hyundai Creta EX'), findsOneWidget);
    expect(find.text('₹ 95,00,000'), findsOneWidget);
    expect(find.text('All'), findsOneWidget);
    expect(find.text('Property'), findsOneWidget);
    expect(find.text('Jobs'), findsOneWidget);
    expect(find.text('Mobiles'), findsOneWidget);
    expect(find.text('Groceries'), findsOneWidget);

    // 3. Tap Center '+' nav button -> redirect to Selling Page ("Your Marketplace")
    final addNavBtn = find.descendant(
      of: find.byType(FigmaBottomNavBar),
      matching: find.byIcon(Icons.add_rounded),
    );
    await tester.tap(addNavBtn);
    await tester.pumpAndSettle();
    expect(find.text('Your Marketplace'), findsOneWidget);
    expect(find.text('Add a listing'), findsOneWidget);
    expect(find.text('Performance'), findsOneWidget);

    // 4. Tap Chat nav button -> redirect to Messages
    final chatNavBtn = find.descendant(
      of: find.byType(FigmaBottomNavBar),
      matching: find.byIcon(Icons.chat_bubble_outline_rounded),
    );
    await tester.tap(chatNavBtn);
    await tester.pumpAndSettle();
    expect(find.text('Messages'), findsOneWidget);
    expect(find.text('Buying'), findsOneWidget);
    expect(find.text('Rohan Sharma'), findsOneWidget);

    // 5. Tap Home nav button -> redirect back to Home
    final homeNavBtn = find.descendant(
      of: find.byType(FigmaBottomNavBar),
      matching: find.byIcon(Icons.home_outlined),
    );
    await tester.tap(homeNavBtn);
    await tester.pumpAndSettle();
    expect(find.text('MarketPlace'), findsOneWidget);

    // 6. Tap "Vehicles" category card on Home -> navigate to Vehicles screen
    await tester.tap(find.text('Vehicles'));
    await tester.pumpAndSettle();
    expect(find.text('Vehicle'), findsOneWidget);
    expect(find.text('Search the vehicle'), findsOneWidget);
    expect(find.text('Hyundai Auto Hub'), findsOneWidget);

    // 7. Tap Hyundai dealership car card -> open CarDetailsScreen ('Cars' / 'Hyundai Creta SX')
    await tester.tap(find.text('Hyundai Auto Hub'));
    await tester.pumpAndSettle();
    expect(find.text('Cars'), findsOneWidget);
    expect(find.text('Features'), findsOneWidget);
    expect(find.text('Total Capacity'), findsOneWidget);
    expect(find.text('6 Seats'), findsOneWidget);
    expect(find.text('Highest Speed'), findsOneWidget);
    expect(find.text('200 KM/H'), findsOneWidget);
    expect(find.text('Engine Output'), findsOneWidget);
    expect(find.text('500 HP'), findsOneWidget);
    expect(find.text('Details'), findsOneWidget);
    expect(find.text('Chat with the Seller'), findsOneWidget);

    // Tap "Chat with the Seller" and verify chat bottom sheet opens
    await tester.tap(find.text('Chat with the Seller'));
    await tester.pumpAndSettle();
    expect(find.text('Rohan Sharma'), findsOneWidget);
    expect(find.text('Verified Seller'), findsOneWidget);

    // Close chat bottom sheet
    await tester.tap(find.byIcon(Icons.close_rounded));
    await tester.pumpAndSettle();

    // Back from Car Details
    await tester.tap(find.byIcon(Icons.arrow_back_ios_new_rounded));
    await tester.pumpAndSettle();
    expect(find.text('Vehicle'), findsOneWidget);

    // Back from Vehicles to Home
    await tester.tap(find.byIcon(Icons.arrow_back_ios_new_rounded));
    await tester.pumpAndSettle();
    expect(find.text('MarketPlace'), findsOneWidget);

    // 8. Tap Profile tab in bottom navigation bar
    final profileNavBtn = find.descendant(
      of: find.byType(FigmaBottomNavBar),
      matching: find.byIcon(Icons.person_outline_rounded),
    );
    await tester.tap(profileNavBtn);
    await tester.pumpAndSettle();

    // Verify Profile screen matches Figma prototype
    expect(find.text('Profile'), findsOneWidget);
    expect(find.text('+7 904 599 xxx 11'), findsOneWidget);
    expect(find.text('alexg@gamil.com'), findsOneWidget);
    expect(find.text('St. Petersburg, Vos....'), findsOneWidget);
    expect(find.text('Your Activity'), findsOneWidget);
    expect(find.text('My favorites'), findsOneWidget);
    expect(find.text('Saved Searches'), findsOneWidget);
    expect(find.text('Recently viewed'), findsOneWidget);
    expect(find.text('My enquiries'), findsOneWidget);
    expect(find.text('Seller & Payments'), findsOneWidget);
    expect(find.text('Seller Profile'), findsOneWidget);
    expect(find.text('My Listings'), findsOneWidget);
    expect(find.text('Payments & invoices'), findsOneWidget);
    expect(find.text('2 receipts'), findsOneWidget);
    expect(find.text('Help & Settings'), findsOneWidget);
    expect(find.text('Help center'), findsOneWidget);
    expect(find.text('Notifications'), findsOneWidget);
    expect(find.text('Privacy & Security'), findsOneWidget);

    // 9. Tap Notifications item inside Profile screen -> opens NotificationsScreen
    await tester.tap(find.text('Notifications'));
    await tester.pumpAndSettle();
    expect(find.text('Price Drop Alert!'), findsOneWidget);
    expect(find.text('New Message from Rohan'), findsOneWidget);

    // Pop back to Profile
    await tester.tap(find.byIcon(Icons.arrow_back_ios_new_rounded));
    await tester.pumpAndSettle();

    // 10. Switch back to Home tab
    final returnHomeNavBtn = find.descendant(
      of: find.byType(FigmaBottomNavBar),
      matching: find.byIcon(Icons.home_outlined),
    );
    await tester.tap(returnHomeNavBtn);
    await tester.pumpAndSettle();

    // 11. Tap header navbar notification icon on Home screen
    final navNotifBtn = find.byKey(const Key('navbar_notification_icon'));
    expect(navNotifBtn, findsOneWidget);
    await tester.tap(navNotifBtn);
    await tester.pumpAndSettle();

    // Verify Notifications screen
    expect(find.text('Price Drop Alert!'), findsOneWidget);
    expect(find.text('Deals'), findsOneWidget);

    // Pop back
    await tester.tap(find.byIcon(Icons.arrow_back_ios_new_rounded));
    await tester.pumpAndSettle();

    // 12. Tap header navbar profile icon on Home screen
    final navProfileBtn = find.byKey(const Key('navbar_profile_icon'));
    expect(navProfileBtn, findsOneWidget);
    await tester.tap(navProfileBtn);
    await tester.pumpAndSettle();

    // Verify Profile screen is shown
    expect(find.text('alexg@gamil.com'), findsOneWidget);

    // 13. Return to Home and tap "Start selling" CTA button
    final backHomeBtn = find.descendant(
      of: find.byType(FigmaBottomNavBar),
      matching: find.byIcon(Icons.home_outlined),
    );
    await tester.tap(backHomeBtn);
    await tester.pumpAndSettle();

    final startSellingBtn = find.byKey(const Key('start_selling_cta_button'));
    await tester.scrollUntilVisible(
      startSellingBtn,
      200.0,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();
    expect(startSellingBtn, findsOneWidget);

    // Tap "Start selling"
    await tester.tap(startSellingBtn);
    await tester.pumpAndSettle();

    // Verify redirected to Selling Page ("Your Marketplace")
    expect(find.text('Your Marketplace'), findsOneWidget);
    expect(find.text('Add a listing'), findsOneWidget);
  });
}
