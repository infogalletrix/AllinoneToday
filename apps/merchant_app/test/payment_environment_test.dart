import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/production/api.dart';
import 'package:mobile_app/production/app.dart';

class PaymentEnvironmentApi extends MarketplaceApi {
  @override
  Future<void> initialize() async {}
  @override
  Future<dynamic> get(String path) async => path == '/billing/pricing'
      ? {'approved': false, 'checkoutEnabled': false}
      : [];
}

void main() {
  testWidgets('Payment-test build is visibly marked and uses an isolated URL', (
    tester,
  ) async {
    if (paymentTestBuild) {
      expect(platformUrl.endsWith('/payment-test'), isTrue);
    } else {
      expect(platformUrl.endsWith('/payment-test'), isFalse);
    }
    await tester.pumpWidget(
      MarketplaceApp(business: true, api: PaymentEnvironmentApi()),
    );
    await tester.pumpAndSettle();
    expect(
      find.byWidgetPredicate(
        (widget) => widget is Banner && widget.message == 'TEST MODE',
      ),
      paymentTestBuild ? findsOneWidget : findsNothing,
    );
  });
}
