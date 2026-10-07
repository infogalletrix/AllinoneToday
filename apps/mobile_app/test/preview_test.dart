import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mobile_app/production/api.dart';
import 'package:mobile_app/preview/demo_api.dart';
import 'package:mobile_app/preview/preview.dart';

void main() {
  testWidgets('Chrome preview toolbar remains accessible outside app routes', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    await tester.pumpWidget(const BrowserPreview(business: false));
    await tester.pumpAndSettle();
    expect(
      find.bySemanticsLabel(RegExp('Public app · Chrome preview')),
      findsOneWidget,
    );
    expect(find.bySemanticsLabel('Reset preview'), findsOneWidget);
    await tester.tap(find.text('Sample account'));
    await tester.pumpAndSettle();
    expect(find.text('Profile'), findsOneWidget);
    expect(find.bySemanticsLabel('Reset preview'), findsOneWidget);
    semantics.dispose();
  });
  test('Real API has no browser simulation capability', () {
    final api = MarketplaceApi();
    expect(api.browserPreview, false);
    api.client.close();
  });
  test('Preview transport rejects every network request', () async {
    final api = DemoMarketplaceApi(business: true);
    await expectLater(
      api.client.send(
        http.Request(
          'POST',
          Uri.parse('https://example.invalid/api/billing/checkout'),
        ),
      ),
      throwsStateError,
    );
    await expectLater(
      api.post('/billing/checkout', {}),
      throwsA(isA<ApiError>()),
    );
    await expectLater(
      api.post('/billing/verify', {}),
      throwsA(isA<ApiError>()),
    );
    await expectLater(
      api.post('/admin/claim-owner', {}),
      throwsA(isA<ApiError>()),
    );
  });
  test('Public preview searches, filters and saves sample listings', () async {
    final api = DemoMarketplaceApi(business: false);
    expect(await api.get('/listings?category=Property'), hasLength(1));
    expect(await api.get('/listings?query=nonexistent'), isEmpty);
    await api.post('/profile/favorites', {'listing_id': 'listing-car'});
    expect(await api.get('/profile/favorites'), hasLength(1));
    await api.send('DELETE', '/profile/favorites/listing-car');
    expect(await api.get('/profile/favorites'), isEmpty);
  });
  test(
    'Payment simulation is in memory, resets, and does not approve larger shops',
    () async {
      final api = DemoMarketplaceApi(business: true, mode: 'payment');
      expect(
        (await api.get('/shops/mine') as List).first['subscription'],
        isNull,
      );
      await api.post('/preview/subscription', {'shopId': 'shop-motors'});
      expect((await api.get('/shops/mine') as List).first['status'], 'active');
      final reset = DemoMarketplaceApi(business: true, mode: 'payment');
      expect(
        (await reset.get('/shops/mine') as List).first['subscription'],
        isNull,
      );
      final shop = await api.post('/shops', {
        'name': 'Sample large shop',
        'branches': 3,
        'size': 'large',
        'expected_photos': 1000,
      });
      await expectLater(
        api.post('/preview/subscription', {'shopId': shop['id']}),
        throwsA(isA<ApiError>()),
      );
      expect(
        (await api.post('/billing/quote', {
          'branches': 1,
          'size': 'small',
          'expected_photos': 100,
        }))['amountMinor'],
        49900,
      );
    },
  );
  test(
    'Sample login never retains entered account details or passwords',
    () async {
      final api = DemoMarketplaceApi(business: false, mode: 'visitor');
      await api.initialize();
      expect(api.user, isNull);
      await api.authenticate(false, {
        'email': 'private@example.invalid',
        'password': 'never-store-this',
      });
      expect(api.user!['email'], 'customer@example.invalid');
      expect(api.user!.containsKey('password'), false);
      await expectLater(
        api.authenticateGoogle(false),
        throwsA(isA<ApiError>()),
      );
      await api.logout();
      expect(api.user, isNull);
      expect(api.token, isNull);
    },
  );
  test('Sample conversations and merchant catalogue are interactive', () async {
    final api = DemoMarketplaceApi(business: true);
    expect(await api.get('/seller/catalogue'), hasLength(1));
    await api.post('/conversations/conversation-sample/messages', {
      'content': 'Sample reply',
    });
    expect(
      (await api.get('/conversations/conversation-sample/messages') as List)
          .last['content'],
      'Sample reply',
    );
    await api.send('DELETE', '/listings/listing-car');
    expect((await api.get('/seller/metrics'))['active_listings'], 0);
    expect(
      (await api.get('/listings') as List).any((l) => l['id'] == 'listing-car'),
      false,
    );
  });
}
