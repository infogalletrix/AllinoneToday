import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/services/api_service.dart';
import 'package:mobile_app/features/home/presentation/widgets/figma_bottom_nav_bar.dart';
import 'package:mobile_app/features/products/presentation/car_details_screen.dart';
import 'package:mobile_app/features/selling/presentation/screens/create_listing_screen.dart';
import 'package:mobile_app/features/selling/presentation/screens/listing_preview_screen.dart';
import 'package:mobile_app/features/selling/presentation/screens/listing_success_screen.dart';
import 'package:mobile_app/features/selling/presentation/screens/select_listing_category_screen.dart';
import 'package:mobile_app/features/selling/presentation/selling_page_screen.dart';
import 'package:mobile_app/main.dart';
import 'package:shared_models/shared_models.dart';

class _MockApiService extends ApiService {
  final List<MarketListing> _mockListings = [];

  @override
  Future<List<Category>> getCategories() async => [];

  @override
  Future<List<Product>> getProducts({
    String? categoryId,
    String? search,
  }) async => [];

  @override
  Future<List<MarketListing>> getListings({
    String? category,
    String? subcategory,
    String? q,
    String? status,
    String? sort,
  }) async {
    return List.from(_mockListings);
  }

  @override
  Future<MarketListing?> createListing(MarketListing listing) async {
    _mockListings.insert(0, listing);
    return listing;
  }
}

void main() {
  testWidgets('Complete + Add a Listing multi-page user journey', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 2.0;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    final mockService = _MockApiService();
    await tester.pumpWidget(GalletrixMarketplaceApp(apiService: mockService));
    await tester.pumpAndSettle();

    // ── 1. Tap Center Plus (+) Icon in FigmaBottomNavBar ──
    final plusButton = find.descendant(
      of: find.byType(FigmaBottomNavBar),
      matching: find.byIcon(Icons.add_rounded),
    );
    expect(plusButton, findsOneWidget);
    await tester.tap(plusButton);
    await tester.pumpAndSettle();

    // ── 2. Verify SellingPageScreen is opened ──
    expect(find.byType(SellingPageScreen), findsOneWidget);
    expect(find.text('Your Marketplace'), findsOneWidget);

    // ── 3. Tap "+ Add a listing" button ──
    final addListingBtn = find.byKey(const Key('add_a_listing_button'));
    expect(addListingBtn, findsOneWidget);
    await tester.tap(addListingBtn);
    await tester.pumpAndSettle();

    // ── 4. Verify Step 1: SelectListingCategoryScreen ──
    expect(find.byType(SelectListingCategoryScreen), findsOneWidget);
    expect(find.text('Select Category'), findsOneWidget);
    expect(find.text('Step 1 of 4 • Choose Category'), findsOneWidget);

    // Verify categories are listed
    expect(find.byKey(const Key('category_card_Vehicles')), findsOneWidget);
    expect(find.byKey(const Key('category_card_Property')), findsOneWidget);
    expect(find.byKey(const Key('category_card_Electronics')), findsOneWidget);

    // ── 5. Select Vehicles Category ──
    await tester.tap(find.byKey(const Key('category_card_Vehicles')));
    await tester.pumpAndSettle();

    // ── 6. Verify Step 2: CreateListingScreen ──
    expect(find.byType(CreateListingScreen), findsOneWidget);
    expect(find.text('Add Vehicles Listing'), findsOneWidget);
    expect(find.text('Step 2 of 4 • Item Details'), findsOneWidget);

    // Verify form fields exist
    final titleInput = find.byKey(const Key('listing_title_input'));
    final priceInput = find.byKey(const Key('listing_price_input'));
    final previewBtn = find.byKey(const Key('preview_listing_button'));

    expect(titleInput, findsOneWidget);
    expect(priceInput, findsOneWidget);
    expect(previewBtn, findsOneWidget);

    // Customize title and price
    await tester.enterText(titleInput, '2024 Tata Harrier Dark Edition');
    await tester.enterText(priceInput, '1950000');
    await tester.pumpAndSettle();

    // ── 7. Tap "Preview Listing" ──
    await tester.tap(previewBtn);
    await tester.pumpAndSettle();

    // ── 8. Verify Step 3: ListingPreviewScreen ──
    expect(find.byType(ListingPreviewScreen), findsOneWidget);
    expect(find.text('Listing Preview'), findsOneWidget);
    expect(find.text('Step 3 of 4 • Buyer View'), findsOneWidget);
    expect(find.text('2024 Tata Harrier Dark Edition'), findsOneWidget);
    expect(find.text('₹ 19,50,000'), findsOneWidget);
    expect(find.text('Standard Free Listing'), findsOneWidget);
    expect(find.text('Featured Top-Spot Boost'), findsOneWidget);

    // ── 9. Tap "Publish Listing Live" ──
    final publishBtn = find.byKey(const Key('publish_listing_button'));
    expect(publishBtn, findsOneWidget);
    await tester.tap(publishBtn);
    await tester.pumpAndSettle();

    // ── 10. Verify Step 4: ListingSuccessScreen ──
    expect(find.byType(ListingSuccessScreen), findsOneWidget);
    expect(find.text('Your Listing is Live!'), findsOneWidget);
    expect(find.text('● Active & Public'), findsOneWidget);
    expect(find.byKey(const Key('view_live_listing_button')), findsOneWidget);
    expect(find.byKey(const Key('back_to_my_listings_button')), findsOneWidget);

    // ── 11. Tap "View Live Listing" ──
    await tester.tap(find.byKey(const Key('view_live_listing_button')));
    await tester.pumpAndSettle();

    expect(find.byType(CarDetailsScreen), findsOneWidget);

    // Pop back from CarDetailsScreen
    final carBackBtn = find.byIcon(Icons.arrow_back_ios_new_rounded);
    await tester.tap(carBackBtn.first);
    await tester.pumpAndSettle();

    // ── 12. Tap "Back to My Listings" ──
    await tester.tap(find.byKey(const Key('back_to_my_listings_button')));
    await tester.pumpAndSettle();

    // Verify we are back on SellingPageScreen and the published item is visible
    expect(find.byType(SellingPageScreen), findsOneWidget);
    expect(find.text('2024 Tata Harrier Dark Edition'), findsOneWidget);
  });

  testWidgets('CreateListingScreen form validation test', (tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 2.0;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    const category = ListingCategoryItem(
      title: 'Vehicles',
      description: 'Cars and motorcycles',
      imagePath: 'assets/images/h1.png',
      icon: Icons.directions_car_rounded,
      accentColor: Color(0xFF6366F1),
      subcategories: ['Cars', 'Bikes'],
    );

    await tester.pumpWidget(
      const MaterialApp(home: CreateListingScreen(categoryItem: category)),
    );
    await tester.pumpAndSettle();

    // Clear Title and Price
    final titleInput = find.byKey(const Key('listing_title_input'));
    final priceInput = find.byKey(const Key('listing_price_input'));

    await tester.enterText(titleInput, '');
    await tester.enterText(priceInput, '');
    await tester.pumpAndSettle();

    // Tap Preview Listing
    final previewBtn = find.byKey(const Key('preview_listing_button'));
    await tester.tap(previewBtn);
    await tester.pumpAndSettle();

    // Expect validation errors and no screen transition
    expect(find.text('Please enter a title for your listing'), findsOneWidget);
    expect(find.text('Please enter asking price'), findsOneWidget);
    expect(find.byType(ListingPreviewScreen), findsNothing);
  });

  testWidgets('SelectListingCategoryScreen search filter test', (tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 2.0;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    await tester.pumpWidget(
      const MaterialApp(home: SelectListingCategoryScreen()),
    );
    await tester.pumpAndSettle();

    // Initially Vehicles and Property are visible
    expect(find.byKey(const Key('category_card_Vehicles')), findsOneWidget);
    expect(find.byKey(const Key('category_card_Property')), findsOneWidget);

    // Search for "Electronics"
    final searchInput = find.byType(TextField);
    await tester.enterText(searchInput, 'Electronics');
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('category_card_Electronics')), findsOneWidget);
    expect(find.byKey(const Key('category_card_Vehicles')), findsNothing);

    // Search for non-existent item
    await tester.enterText(searchInput, 'NonExistentCategoryXYZ');
    await tester.pumpAndSettle();

    expect(
      find.text('No categories found matching "NonExistentCategoryXYZ"'),
      findsOneWidget,
    );
  });
}
