import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/services/api_service.dart';
import 'package:mobile_app/features/explore/presentation/explore_screen.dart';
import 'package:mobile_app/features/home/presentation/home_screen.dart';
import 'package:mobile_app/features/home/presentation/widgets/figma_bottom_nav_bar.dart';
import 'package:mobile_app/main.dart';
import 'package:shared_models/shared_models.dart';

class MockSearchApiService extends ApiService {
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
  }) async => [];
}

void main() {
  setUp(() {
    TestWidgetsFlutterBinding.ensureInitialized();
  });

  group('Search Functionality Tests', () {
    testWidgets(
      'Home screen live hero search, live results, and clear search',
      (WidgetTester tester) async {
        tester.view.physicalSize = const Size(1080, 2400);
        tester.view.devicePixelRatio = 2.0;
        addTearDown(() {
          tester.view.resetPhysicalSize();
          tester.view.resetDevicePixelRatio();
        });

        final mockService = MockSearchApiService();
        await tester.pumpWidget(
          GalletrixMarketplaceApp(apiService: mockService),
        );
        await tester.pumpAndSettle();

        // Ensure we are on Home Screen
        expect(find.byType(HomeScreen), findsOneWidget);
        expect(find.text('Browse by category'), findsOneWidget);
        expect(find.text('Fresh listings'), findsOneWidget);

        // 1. Find hero search input on Home Screen
        final homeSearchInput = find.byKey(const Key('home_search_input'));
        expect(homeSearchInput, findsOneWidget);

        // 2. Type "Creta" to trigger live search
        await tester.enterText(homeSearchInput, 'Creta');
        await tester.pumpAndSettle();

        // Verify dynamic header and matching listings (both fresh & featured)
        expect(find.text('Search Results for "Creta"'), findsOneWidget);
        expect(find.text('2 found'), findsOneWidget);
        expect(find.text('2024 Hyundai Creta SX'), findsOneWidget);
        expect(find.text('2021 Hyundai Creta SX'), findsOneWidget);
        // Browse by category header is replaced by search results
        expect(find.text('Browse by category'), findsNothing);

        // 3. Clear the search via the clear 'X' button
        final clearBtn = find.byKey(const Key('clear_search_button'));
        expect(clearBtn, findsOneWidget);
        await tester.tap(clearBtn);
        await tester.pumpAndSettle();

        // Verify search is cleared and default home sections return
        expect(find.text('Browse by category'), findsOneWidget);
        expect(find.text('Fresh listings'), findsOneWidget);
        expect(find.text('Search Results for "Creta"'), findsNothing);
      },
    );

    testWidgets('Home screen empty search state and reset button', (
      WidgetTester tester,
    ) async {
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 2.0;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      final mockService = MockSearchApiService();
      await tester.pumpWidget(GalletrixMarketplaceApp(apiService: mockService));
      await tester.pumpAndSettle();

      final homeSearchInput = find.byKey(const Key('home_search_input'));
      expect(homeSearchInput, findsOneWidget);

      // Type non-existent query
      await tester.enterText(homeSearchInput, 'NonExistentProductXYZ');
      await tester.pumpAndSettle();

      // Verify empty search state
      expect(
        find.text('No listings found matching "NonExistentProductXYZ"'),
        findsOneWidget,
      );
      expect(
        find.text(
          'Try searching for "Creta", "Apartment", "iPhone", "MacBook", or "Furniture"',
        ),
        findsOneWidget,
      );

      // Tap Reset Search button
      final resetBtn = find.byKey(const Key('reset_search_button'));
      expect(resetBtn, findsOneWidget);
      await tester.tap(resetBtn);
      await tester.pumpAndSettle();

      // Verify default home sections restored
      expect(find.text('Browse by category'), findsOneWidget);
      expect(find.text('Fresh listings'), findsOneWidget);
    });

    testWidgets(
      'Home search submit arrow transitions to ExploreScreen with query',
      (WidgetTester tester) async {
        tester.view.physicalSize = const Size(1080, 2400);
        tester.view.devicePixelRatio = 2.0;
        addTearDown(() {
          tester.view.resetPhysicalSize();
          tester.view.resetDevicePixelRatio();
        });

        final mockService = MockSearchApiService();
        await tester.pumpWidget(
          GalletrixMarketplaceApp(apiService: mockService),
        );
        await tester.pumpAndSettle();

        final homeSearchInput = find.byKey(const Key('home_search_input'));
        await tester.enterText(homeSearchInput, 'iPhone');
        await tester.pumpAndSettle();

        // Tap the submit green arrow button in the search capsule
        final submitBtn = find.byKey(const Key('home_search_submit_button'));
        expect(submitBtn, findsOneWidget);
        await tester.tap(submitBtn);
        await tester.pumpAndSettle();

        // Verify navigation to ExploreScreen
        expect(find.byType(ExploreScreen), findsOneWidget);

        // Verify query was passed and Explore shows search results
        expect(find.text('Showing 1 result for "iPhone"'), findsOneWidget);
        expect(find.text('iPhone 15 Pro\nMax 256GB'), findsOneWidget);
      },
    );

    testWidgets(
      'Bottom nav Search icon opens ExploreScreen and trending chips work',
      (WidgetTester tester) async {
        tester.view.physicalSize = const Size(1080, 2400);
        tester.view.devicePixelRatio = 2.0;
        addTearDown(() {
          tester.view.resetPhysicalSize();
          tester.view.resetDevicePixelRatio();
        });

        final mockService = MockSearchApiService();
        await tester.pumpWidget(
          GalletrixMarketplaceApp(apiService: mockService),
        );
        await tester.pumpAndSettle();

        // Tap Bottom Nav Search icon (tab index 1)
        final bottomSearchBtn = find.descendant(
          of: find.byType(FigmaBottomNavBar),
          matching: find.byIcon(Icons.search_rounded),
        );
        expect(bottomSearchBtn, findsOneWidget);
        await tester.tap(bottomSearchBtn);
        await tester.pumpAndSettle();

        // Verify on ExploreScreen
        expect(find.byType(ExploreScreen), findsOneWidget);

        // Trending tags should be visible when search is empty
        final cretaChip = find.byKey(
          const Key('quick_search_tag_Hyundai Creta'),
        );
        expect(cretaChip, findsOneWidget);
        expect(find.text('Hyundai Creta'), findsOneWidget);

        // Tap the "Hyundai Creta" trending chip
        await tester.tap(cretaChip);
        await tester.pumpAndSettle();

        // Verify search input is updated and Creta listing is displayed
        expect(
          find.text('Showing 1 result for "Hyundai Creta"'),
          findsOneWidget,
        );
        expect(find.text('2022 Hyundai Creta EX'), findsOneWidget);
      },
    );
  });
}
