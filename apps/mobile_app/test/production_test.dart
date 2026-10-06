import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile_app/production/api.dart';
import 'package:mobile_app/production/app.dart';

class TestApi extends MarketplaceApi {
  @override
  Future<void> initialize() async {}
  @override
  Future<dynamic> get(String path) async => [];
}

void main() {
  test('Password policy requires every character class', () {
    expect(strongPassword('LongPassword1!'), true);
    for (final p in [
      'Short1!',
      'alllowercase1!',
      'ALLUPPERCASE1!',
      'NoNumberHere!',
      'NoSymbolHere123',
    ]) {
      expect(strongPassword(p), false);
    }
  });
  test(
    'API sends authenticated bearer token and propagates failures',
    () async {
      final api = MarketplaceApi(
        client: MockClient((request) async {
          expect(request.headers['Authorization'], 'Bearer test-token');
          return http.Response(
            jsonEncode({'success': false, 'message': 'Subscription required.'}),
            403,
          );
        }),
      );
      api.token = 'test-token';
      await expectLater(api.get('/shops/mine'), throwsA(isA<ApiError>()));
    },
  );
  testWidgets('Public app opens without simulated listings', (tester) async {
    await tester.pumpWidget(MarketplaceApp(api: TestApi()));
    await tester.pumpAndSettle();
    expect(find.text('All in One Today'), findsOneWidget);
    expect(find.textContaining('No listings yet.'), findsOneWidget);
    expect(find.text('Alex Morgan'), findsNothing);
  });
}
