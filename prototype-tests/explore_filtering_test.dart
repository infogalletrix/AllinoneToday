import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/services/api_service.dart';
import 'package:mobile_app/features/explore/presentation/explore_screen.dart';
import 'package:mobile_app/features/home/presentation/widgets/figma_bottom_nav_bar.dart';
import 'package:mobile_app/main.dart';
import 'package:shared_models/shared_models.dart';

class MockApiService extends ApiService {
  @override
  Future<List<Category>> getCategories() async => [];

  @override
  Future<List<Product>> getProducts({
    String? categoryId,
    String? search,
  }) async => [];
}

void main() {
  testWidgets('Explore screen category filtering and search test', (
    WidgetTester tester,
  ) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 2.0;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    final mockService = MockApiService();
    await tester.pumpWidget(GalletrixMarketplaceApp(apiService: mockService));
    await tester.pumpAndSettle();

    // 1. Navigate to Explore screen using footer Search icon
    final searchNavBtn = find.descendant(
      of: find.byType(FigmaBottomNavBar),
      matching: find.byIcon(Icons.search_rounded),
    );
    await tester.tap(searchNavBtn);
    await tester.pumpAndSettle();

    // Verify initial state
    expect(find.text('Explore'), findsOneWidget);
    expect(find.text('128 Results'), findsOneWidget);
    expect(find.text('2022 Hyundai Creta EX'), findsOneWidget);
    expect(find.text('Flagship Phone -\n256GB'), findsOneWidget);

    // 2. Click "Mobiles" category chip
    final mobilesChip = find.descendant(
      of: find.byType(ExploreScreen),
      matching: find.text('Mobiles'),
    );
    expect(mobilesChip, findsOneWidget);
    await tester.tap(mobilesChip);
    await tester.pumpAndSettle();

    // Verify: Only mobile ads are shown, non-mobile ads are filtered out
    expect(find.text('Flagship Phone -\n256GB'), findsOneWidget);
    expect(find.text('iPhone 15 Pro\nMax 256GB'), findsOneWidget);
    expect(find.text('Samsung Galaxy\nS24 Ultra 5G'), findsOneWidget);
    expect(find.text('2022 Hyundai Creta EX'), findsNothing);
    expect(find.text('3BHK Apartment -\nKowdiar'), findsNothing);
    expect(find.text('6 Results'), findsOneWidget);

    // 3. Click "Vehicles" category chip
    final vehiclesChip = find.descendant(
      of: find.byType(ExploreScreen),
      matching: find.text('Vehicles'),
    );
    await tester.tap(vehiclesChip);
    await tester.pumpAndSettle();

    // Verify: Only vehicle ads are shown
    expect(find.text('2022 Hyundai Creta EX'), findsOneWidget);
    expect(find.text('2021 Kia Seltos\nGTX+ Diesel'), findsOneWidget);
    expect(find.text('Flagship Phone -\n256GB'), findsNothing);
    expect(find.text('4 Results'), findsOneWidget);

    // 4. Click "All" category chip
    final allChip = find.descendant(
      of: find.byType(ExploreScreen),
      matching: find.text('All'),
    );
    await tester.tap(allChip);
    await tester.pumpAndSettle();

    // Verify: All ads restored
    expect(find.text('128 Results'), findsOneWidget);
    expect(find.text('2022 Hyundai Creta EX'), findsOneWidget);
    expect(find.text('Flagship Phone -\n256GB'), findsOneWidget);

    // 5. Test text search
    final searchInput = find.byType(TextField);
    await tester.enterText(searchInput, 'Pixel');
    await tester.pumpAndSettle();

    expect(find.text('Google Pixel 8\nPro 128GB Mint'), findsOneWidget);
    expect(find.text('2022 Hyundai Creta EX'), findsNothing);
  });
}
