import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/services/api_service.dart';
import 'package:mobile_app/features/categories/presentation/category_browse_screen.dart';
import 'package:mobile_app/features/categories/presentation/screens/inquiry_success_screen.dart';
import 'package:mobile_app/features/categories/presentation/screens/merchant_contact_details_screen.dart';
import 'package:mobile_app/features/categories/presentation/screens/send_inquiry_screen.dart';
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
  group('View & Contact Multi-Page Flow Tests', () {
    testWidgets(
      'Tapping View & Contact navigates through details, inquiry form, and confirmation pages',
      (WidgetTester tester) async {
        tester.view.physicalSize = const Size(1080, 2400);
        tester.view.devicePixelRatio = 2.0;
        addTearDown(() {
          tester.view.resetPhysicalSize();
          tester.view.resetDevicePixelRatio();
        });

        final mockService = _MockApiService();
        await tester.pumpWidget(
          GalletrixMarketplaceApp(apiService: mockService),
        );
        await tester.pumpAndSettle();

        // 1. Navigate to "Property" category from Home Screen
        final propertyCard = find.text('Property');
        expect(propertyCard, findsOneWidget);
        await tester.tap(propertyCard);
        await tester.pumpAndSettle();

        expect(find.byType(CategoryBrowseScreen), findsOneWidget);
        expect(find.text('Skyline Prime Realty'), findsOneWidget);

        // 2. Tap on "Skyline Prime Realty" card to open preview bottom sheet
        await tester.tap(find.text('Skyline Prime Realty'));
        await tester.pumpAndSettle();

        // Verify preview bottom sheet with 'View & Contact' button
        final viewContactBtn = find.byKey(const Key('view_and_contact_btn'));
        expect(viewContactBtn, findsOneWidget);
        expect(find.text('View & Contact'), findsOneWidget);

        // 3. Click 'View & Contact' -> should transition to Page 1: MerchantContactDetailsScreen
        await tester.tap(viewContactBtn);
        await tester.pumpAndSettle();

        expect(find.byType(MerchantContactDetailsScreen), findsOneWidget);
        expect(find.text('Skyline Prime Realty'), findsWidgets);
        expect(find.text('Direct Contact Channels'), findsOneWidget);
        expect(find.text('Kowdiar, Thiruvananthapuram'), findsOneWidget);
        expect(find.text('Featured Offerings & Rates'), findsOneWidget);

        // 4. Verify and test the quick contact channels
        final callBtn = find.byKey(const Key('contact_call_btn'));
        final chatBtn = find.byKey(const Key('contact_chat_btn'));
        final whatsappBtn = find.byKey(const Key('contact_whatsapp_btn'));
        final emailBtn = find.byKey(const Key('contact_email_btn'));

        expect(callBtn, findsOneWidget);
        expect(chatBtn, findsOneWidget);
        expect(whatsappBtn, findsOneWidget);
        expect(emailBtn, findsOneWidget);

        // Test Call Sheet
        await tester.tap(callBtn);
        await tester.pumpAndSettle();
        expect(find.text('Dial Now'), findsOneWidget);
        expect(
          find.text('+91 98470 12345 • Verified Business Line'),
          findsOneWidget,
        );
        await tester.tap(find.text('Cancel'));
        await tester.pumpAndSettle();

        // Test Chat Sheet
        await tester.tap(chatBtn);
        await tester.pumpAndSettle();
        expect(find.textContaining('Online Now'), findsOneWidget);
        await tester.tap(find.byIcon(Icons.close_rounded));
        await tester.pumpAndSettle();

        // 5. Tap Primary CTA "Send Inquiry / Book" -> transition to Page 2: SendInquiryScreen
        final sendInquiryBtn = find.byKey(const Key('send_inquiry_cta_btn'));
        expect(sendInquiryBtn, findsOneWidget);
        await tester.tap(sendInquiryBtn);
        await tester.pumpAndSettle();

        expect(find.byType(SendInquiryScreen), findsOneWidget);
        expect(find.text('Send Inquiry'), findsOneWidget);
        expect(find.text('What is this inquiry regarding?'), findsOneWidget);
        expect(find.text('Preferred Date & Time Slot'), findsOneWidget);
        expect(find.text('Your Contact Details'), findsOneWidget);

        // 6. Select purpose chip, enter message, and submit inquiry
        final visitChip = find.byKey(
          const Key('inquiry_chip_Schedule Site Visit'),
        );
        if (visitChip.evaluate().isNotEmpty) {
          await tester.tap(visitChip);
          await tester.pumpAndSettle();
        }

        final messageInput = find.byKey(const Key('inquiry_message_input'));
        expect(messageInput, findsOneWidget);
        await tester.enterText(
          messageInput,
          'I would like to schedule a site inspection this weekend.',
        );

        final submitBtn = find.byKey(const Key('submit_inquiry_button'));
        expect(submitBtn, findsOneWidget);
        await tester.tap(submitBtn);
        await tester.pumpAndSettle();

        // 7. Verify transition to Page 3: InquirySuccessScreen
        expect(find.byType(InquirySuccessScreen), findsOneWidget);
        expect(find.text('Inquiry Sent Successfully!'), findsOneWidget);
        expect(find.text('Track in Messages'), findsOneWidget);
        expect(find.text('Back to Category'), findsOneWidget);

        // 8. Tap 'Back to Category' and verify return to CategoryBrowseScreen
        final backToCategoryBtn = find.byKey(
          const Key('inquiry_success_browse_btn'),
        );
        expect(backToCategoryBtn, findsOneWidget);
        await tester.tap(backToCategoryBtn);
        await tester.pumpAndSettle();

        expect(find.byType(CategoryBrowseScreen), findsOneWidget);
      },
    );
  });
}
