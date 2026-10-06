import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/services/api_service.dart';
import 'package:mobile_app/features/categories/presentation/category_browse_screen.dart';
import 'package:mobile_app/features/categories/presentation/vehicles_screen.dart';
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
    'Category card navigation from Home page to respective category screens',
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

      // Verify Home Screen loaded
      expect(find.text('Browse by category'), findsOneWidget);

      // ── Test 1: Tap "Vehicles" card ──
      final vehiclesCard = find.text('Vehicles');
      expect(vehiclesCard, findsOneWidget);
      await tester.tap(vehiclesCard);
      await tester.pumpAndSettle();

      // Verify Vehicles Screen
      expect(find.byType(VehiclesScreen), findsOneWidget);
      expect(find.text('Vehicle'), findsOneWidget);
      expect(find.text('Search the vehicle'), findsOneWidget);
      expect(find.text('Car'), findsOneWidget);
      expect(find.text('Bikes'), findsOneWidget);

      // Pop back to Home
      final backBtn = find.byIcon(Icons.arrow_back_ios_new_rounded);
      await tester.tap(backBtn);
      await tester.pumpAndSettle();
      expect(find.byType(VehiclesScreen), findsNothing);

      // ── Test 2: Tap "Property" card ──
      final propertyCard = find.text('Property');
      expect(propertyCard, findsOneWidget);
      await tester.tap(propertyCard);
      await tester.pumpAndSettle();

      // Verify Property Screen
      expect(find.byType(CategoryBrowseScreen), findsOneWidget);
      expect(find.text('Property'), findsOneWidget);
      expect(find.text('Search properties & flats'), findsOneWidget);
      expect(find.text('Apartments'), findsWidgets);
      expect(find.text('Villas'), findsWidgets);
      expect(find.text('Skyline Prime Realty'), findsOneWidget);

      // Tap back to Home
      await tester.tap(find.byIcon(Icons.arrow_back_ios_new_rounded));
      await tester.pumpAndSettle();
      expect(find.byType(CategoryBrowseScreen), findsNothing);

      // ── Test 3: Tap "Mobiles" card ──
      final mobilesCard = find.text('Mobiles');
      expect(mobilesCard, findsOneWidget);
      await tester.tap(mobilesCard);
      await tester.pumpAndSettle();

      // Verify Mobiles Screen
      expect(find.byType(CategoryBrowseScreen), findsOneWidget);
      expect(find.text('Mobiles'), findsOneWidget);
      expect(find.text('Search mobiles & accessories'), findsOneWidget);
      expect(find.text('Smartphones'), findsWidgets);
      expect(find.text('Premium Tech Hub'), findsOneWidget);

      // Tap back to Home
      await tester.tap(find.byIcon(Icons.arrow_back_ios_new_rounded));
      await tester.pumpAndSettle();

      // ── Test 4: Tap "Jobs" card ──
      final jobsCard = find.text('Jobs');
      expect(jobsCard, findsOneWidget);
      await tester.tap(jobsCard);
      await tester.pumpAndSettle();

      // Verify Jobs Screen
      expect(find.byType(CategoryBrowseScreen), findsOneWidget);
      expect(find.text('Jobs'), findsOneWidget);
      expect(find.text('Search jobs & careers'), findsOneWidget);
      expect(find.text('Galletrix Talent Solutions'), findsOneWidget);

      // Tap subcategory chip
      await tester.tap(find.text('Remote').first);
      await tester.pumpAndSettle();

      // Tap back to Home
      await tester.tap(find.byIcon(Icons.arrow_back_ios_new_rounded));
      await tester.pumpAndSettle();
      expect(find.byType(CategoryBrowseScreen), findsNothing);
    },
  );
}
