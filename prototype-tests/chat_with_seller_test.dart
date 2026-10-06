import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/products/presentation/car_details_screen.dart';

void main() {
  group('Chat with Seller Functionality Tests', () {
    testWidgets(
      'CarDetailsScreen displays exact Figma bottom bar with Chat with the Seller and 7 Details boxes',
      (WidgetTester tester) async {
        tester.view.physicalSize = const Size(1080, 2400);
        tester.view.devicePixelRatio = 2.0;
        addTearDown(() {
          tester.view.resetPhysicalSize();
          tester.view.resetDevicePixelRatio();
        });

        await tester.pumpWidget(
          const MaterialApp(
            home: CarDetailsScreen(
              title: 'Hyundai Creta SX',
              price: '₹ 7,25,000',
              imagePath: 'assets/images/h1.png',
              location: 'Thiruvananthapuram',
            ),
          ),
        );
        await tester.pumpAndSettle();

        // 1. Verify Details section 7 boxed items matching screenshot
        expect(find.text('Details'), findsOneWidget);
        expect(find.text('Brand'), findsOneWidget);
        expect(find.text('Hyundai'), findsOneWidget);
        expect(find.text('Model'), findsOneWidget);
        expect(find.text('Creta SX'), findsOneWidget);
        expect(find.text('Year'), findsOneWidget);
        expect(find.text('2022'), findsOneWidget);
        expect(find.text('Fuel'), findsOneWidget);
        expect(find.text('Petrol'), findsOneWidget);
        expect(find.text('Transmission'), findsOneWidget);
        expect(find.text('Manual'), findsOneWidget);
        expect(find.text('Km'), findsOneWidget);
        expect(find.text('18400'), findsOneWidget);
        expect(find.text('Ownership'), findsOneWidget);
        expect(find.text('1st'), findsOneWidget);

        // 2. Verify bottom bar price and "Chat with the Seller" button
        expect(find.text('₹ 7,25,000'), findsOneWidget);
        final chatBtn = find.byKey(const Key('chat_with_seller_button'));
        expect(chatBtn, findsOneWidget);
        expect(find.text('Chat with the Seller'), findsOneWidget);
        expect(find.byIcon(Icons.chat_bubble_outline_rounded), findsOneWidget);

        // 3. Tap "Chat with the Seller" button to open interactive chat modal
        await tester.tap(chatBtn);
        await tester.pumpAndSettle();

        // Verify chat sheet header & seller
        expect(find.text('Rohan Sharma'), findsOneWidget);
        expect(find.text('Verified Seller'), findsOneWidget);
        expect(find.text('Quick Ask:'), findsOneWidget);
        expect(find.text('Is this still available?'), findsOneWidget);

        // 4. Tap a quick ask chip
        await tester.tap(find.text('Is this still available?'));
        await tester.pumpAndSettle();
        expect(find.text('Is this still available?'), findsWidgets);

        // 5. Send a custom message via input
        final chatInput = find.byKey(const Key('chat_seller_input'));
        expect(chatInput, findsOneWidget);
        await tester.enterText(chatInput, 'Can you share the RC document?');
        final sendBtn = find.byKey(const Key('chat_seller_send_btn'));
        await tester.tap(sendBtn);
        await tester.pumpAndSettle();

        expect(find.text('Can you share the RC document?'), findsOneWidget);

        // 6. Close the chat bottom sheet
        await tester.tap(find.byIcon(Icons.close_rounded));
        await tester.pumpAndSettle();

        // Verify back on CarDetailsScreen
        expect(find.text('Details'), findsOneWidget);
        expect(find.text('Chat with the Seller'), findsOneWidget);
      },
    );
  });
}
