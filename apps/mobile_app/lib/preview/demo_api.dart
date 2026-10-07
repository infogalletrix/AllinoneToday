import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';
import '../production/api.dart';

/// Entirely in memory. The rejecting client is a second safety boundary: even
/// an accidentally inherited network operation cannot reach any real service.
class PreviewOnlyClient extends http.BaseClient {
  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async =>
      throw StateError('Network requests are disabled in the app preview.');
}

class DemoMarketplaceApi extends MarketplaceApi {
  final bool business;
  final String mode;
  final List<Json> shops = [];
  final List<Json> listings = [];
  final List<Json> conversations = [];
  final Map<String, List<Json>> messages = {};
  final Set<String> favorites = {};
  final List<Json> blocks = [];
  int _sequence = 10;

  DemoMarketplaceApi({required this.business, this.mode = 'sample'})
    : super(client: PreviewOnlyClient()) {
    if (mode != 'visitor' && mode != 'login') _sampleLogin();
    final paidUntil = DateTime.now()
        .add(const Duration(days: 30))
        .toIso8601String();
    shops.addAll([
      {
        'id': 'shop-motors',
        'owner_id': 'sample-merchant',
        'name': 'Horizon Motors · Sample',
        'category': 'Vehicles',
        'branches': 1,
        'size': 'small',
        'expected_photos': 100,
        'location': 'Coimbatore, Tamil Nadu',
        'phone': '0000000000',
        'description': 'A sample local vehicle showroom for reviewing the app.',
        'image_path': 'h1.png',
        'status': 'active',
        'listings_count': 1,
        'subscription': {
          'id': 'sample-subscription',
          'provider_id': 'preview-only',
          'status': 'active',
          'paid_until': paidUntil,
        },
      },
      {
        'id': 'shop-homes',
        'owner_id': 'sample-other',
        'name': 'City Homes · Sample',
        'category': 'Property',
        'branches': 1,
        'size': 'small',
        'expected_photos': 100,
        'location': 'Coimbatore, Tamil Nadu',
        'phone': '0000000000',
        'description': 'Sample property listings. Not a real offer.',
        'image_path': 'h2.png',
        'status': 'active',
        'listings_count': 1,
        'subscription': {'paid_until': paidUntil, 'status': 'active'},
      },
    ]);
    listings.addAll([
      {
        'id': 'listing-car',
        'shop_id': 'shop-motors',
        'seller_id': 'sample-merchant',
        'seller_name': 'Horizon Motors · Sample',
        'title': 'Adventure SUV · Sample listing',
        'category': 'Vehicles',
        'price': 2500000,
        'formatted_price': '₹25,00,000',
        'location': 'Coimbatore, Tamil Nadu',
        'image_path': 'h1.png',
        'description':
            'Sample data only, not a vehicle offered for sale. Explore the listing detail, save it, or send a sample inquiry.',
        'status': 'active',
      },
      {
        'id': 'listing-home',
        'shop_id': 'shop-homes',
        'seller_id': 'sample-other',
        'seller_name': 'City Homes · Sample',
        'title': 'Modern city apartment · Sample listing',
        'category': 'Property',
        'price': 4500000,
        'formatted_price': '₹45,00,000',
        'location': 'Coimbatore, Tamil Nadu',
        'image_path': 'h2.png',
        'description':
            'Sample data only, not a property offered for sale. This listing demonstrates the public app browsing experience.',
        'status': 'active',
      },
    ]);
    conversations.add({
      'id': 'conversation-sample',
      'item_tag': 'Adventure SUV · Sample inquiry',
      'is_buying': !business,
      'recipient_name': 'Horizon Motors · Sample',
      'sender_name': 'Sample customer',
      'phone': '0000000000',
      'message': 'Hello! Is this available for a viewing?',
    });
    messages['conversation-sample'] = [
      {
        'is_from_me': !business,
        'content': 'Hello! Is this available for a viewing?',
      },
      {
        'is_from_me': business,
        'content':
            'Yes, welcome! This is a sample conversation, so nothing is sent to a real shop.',
      },
    ];
    if (business && mode == 'new-shop') {
      shops.removeWhere((s) => s['owner_id'] == 'sample-merchant');
      listings.removeWhere((s) => s['seller_id'] == 'sample-merchant');
    }
    if (business && mode == 'payment') {
      shops.first['status'] = 'pending_payment';
      shops.first['subscription'] = null;
    }
  }

  @override
  bool get browserPreview => true;

  void _sampleLogin() {
    user = {
      'id': business ? 'sample-merchant' : 'sample-buyer',
      'name': business ? 'Sample shop owner' : 'Sample customer',
      'email': business ? 'shop@example.invalid' : 'customer@example.invalid',
      'phone': '0000000000',
      'role': business ? 'merchant' : 'buyer',
      'passwordSet': true,
      'googleLinked': false,
    };
    token = 'preview-only-not-a-real-token';
  }

  @override
  Future<void> initialize() async {}

  @override
  Future<void> authenticate(bool register, Json data) async {
    if (register && !strongPassword(data['password'] ?? '')) {
      throw ApiError('Use a strong sample password.', 400);
    }
    // Never retain the entered email, phone or password; these are UI samples.
    _sampleLogin();
  }

  @override
  Future<void> authenticateGoogle(bool business) async => throw ApiError(
    'Google sign-in needs the pending OAuth configuration. Use the preview account selector above; no Google login is simulated.',
    503,
  );

  @override
  Future<void> saveSession(Json result) async => throw ApiError(
    'Real authentication and product-owner activation are not available in this sample preview.',
    403,
  );

  @override
  Future<void> clearSession() async {
    user = null;
    token = null;
  }

  @override
  Future<void> logout() => clearSession();

  Json _quote(Json shop) {
    final review =
        (shop['branches'] ?? 1) > 1 ||
        (shop['size'] ?? 'small') != 'small' ||
        (shop['expected_photos'] ?? 100) > 100;
    return {
      'requiresReview': review,
      'amountMinor': review ? null : 49900,
      'message':
          'Larger shops, extra branches and additional photo storage need an owner-approved quote. This preview does not run AI pricing.',
      'reason': 'Small, single-branch shop with up to 100 photos.',
    };
  }

  Json _shop(String id) => shops.firstWhere(
    (s) => s['id'] == id,
    orElse: () => throw ApiError('Sample shop not found.', 404),
  );

  void _requireAccount() {
    if (user == null) throw ApiError('Use a sample account first.', 401);
  }

  @override
  Future<dynamic> send(String method, String path, [Json? data]) async {
    final uri = Uri.parse(path), p = uri.path;
    final d = data ?? <String, dynamic>{};
    if (method == 'GET' && p == '/categories') {
      return categories.map((c) => {'name': c}).toList();
    }
    if (method == 'GET' && p == '/listings') {
      return listings.where((l) {
        final q = uri.queryParameters;
        return l['status'] == 'active' &&
            (q['category'] == null || l['category'] == q['category']) &&
            (q['shop_id'] == null || l['shop_id'] == q['shop_id']) &&
            '${l['title']} ${l['description']}'.toLowerCase().contains(
              (q['query'] ?? '').toLowerCase(),
            ) &&
            l['location'].toString().toLowerCase().contains(
              (q['location'] ?? '').toLowerCase(),
            );
      }).toList();
    }
    if (method == 'GET' && p.startsWith('/listings/')) {
      return listings.firstWhere(
        (l) => l['id'] == p.split('/').last,
        orElse: () => throw ApiError('Sample listing not found.', 404),
      );
    }
    if (method == 'GET' && p == '/shops') {
      return shops.where((s) => s['status'] == 'active').toList();
    }
    if (method == 'GET' && p == '/billing/pricing') {
      return {
        'checkoutEnabled': true,
        'baseMonthlyMinor': 49900,
        'paymentMode': 'preview',
      };
    }
    _requireAccount();
    if (method == 'GET' && p == '/auth/session') return user;
    if (method == 'GET' && p == '/shops/mine') {
      return shops.where((s) => s['owner_id'] == user!['id']).toList();
    }
    if (method == 'GET' && p == '/seller/metrics') {
      return {
        'active_listings': listings
            .where(
              (l) => l['seller_id'] == user!['id'] && l['status'] == 'active',
            )
            .length,
        'enquiries': conversations.length,
      };
    }
    if (method == 'GET' && p == '/seller/catalogue') {
      return listings.where((l) => l['seller_id'] == user!['id']).toList();
    }
    if (method == 'POST' && p == '/billing/quote') return _quote(d);
    if (method == 'GET' && p.startsWith('/shops/') && p.endsWith('/quote')) {
      return _quote(_shop(p.split('/')[2]));
    }
    if (method == 'POST' && p == '/shops') {
      final s = <String, dynamic>{
        ...d,
        'id': 'shop-${_sequence++}',
        'owner_id': user!['id'],
        'status': 'pending_payment',
        'image_path': 'h1.png',
        'listings_count': 0,
        'subscription': null,
      };
      shops.add(s);
      return s;
    }
    if (method == 'PATCH' && p.startsWith('/shops/')) {
      final s = _shop(p.split('/').last);
      s.addAll(d);
      return s;
    }
    if (method == 'POST' && p == '/preview/subscription') {
      if (user!['role'] != 'merchant') {
        throw ApiError('Choose the business preview.', 403);
      }
      final s = _shop(d['shopId']);
      if (_quote(s)['requiresReview'] == true) {
        throw ApiError('This shop needs a reviewed quote.', 409);
      }
      s['status'] = 'active';
      s['subscription'] = {
        'id': 'sample-sub-${_sequence++}',
        'provider_id': 'preview-only',
        'status': 'active',
        'paid_until': DateTime.now()
            .add(const Duration(days: 30))
            .toIso8601String(),
      };
      return {'message': 'Sample only. No payment was made.'};
    }
    if (method == 'POST' && p == '/billing/cancel') {
      for (final s in shops) {
        if (s['subscription']?['id'] == d['requestId']) {
          s['subscription']['status'] = 'cancelled';
        }
      }
      return {'message': 'Sample AutoPay canceled. No real mandate exists.'};
    }
    if (method == 'GET' && p == '/profile/favorites') {
      return listings.where((l) => favorites.contains(l['id'])).toList();
    }
    if (method == 'POST' && p == '/profile/favorites') {
      favorites.add(d['listing_id']);
      return {};
    }
    if (method == 'DELETE' && p.startsWith('/profile/favorites/')) {
      favorites.remove(p.split('/').last);
      return {};
    }
    if (method == 'GET' && p == '/conversations') return conversations;
    if (p.startsWith('/conversations/') && p.endsWith('/messages')) {
      final id = p.split('/')[2];
      if (method == 'GET') return messages[id] ?? [];
      if (method == 'POST') {
        messages.putIfAbsent(id, () => []).add({
          'is_from_me': true,
          'content': d['content'],
        });
        return {};
      }
    }
    if (method == 'POST' && p == '/conversations') {
      final listing = listings.firstWhere((l) => l['id'] == d['listing_id']);
      final id = 'conversation-${_sequence++}';
      final c = <String, dynamic>{
        'id': id,
        'item_tag': listing['title'],
        'is_buying': true,
        'recipient_name': listing['seller_name'],
        'sender_name': user!['name'],
        'phone': '0000000000',
        'message': d['message'],
      };
      conversations.add(c);
      messages[id] = [
        {'is_from_me': true, 'content': d['message']},
      ];
      return c;
    }
    if (method == 'POST' && p == '/listings') {
      final s = _shop(d['shop_id']);
      if (s['status'] != 'active') {
        throw ApiError('Simulate a subscription first.', 403);
      }
      final l = <String, dynamic>{
        ...d,
        'id': 'listing-${_sequence++}',
        'status': 'active',
        'seller_id': user!['id'],
        'seller_name': s['name'],
        'formatted_price': '₹${d['price']}',
      };
      listings.add(l);
      s['listings_count'] = (s['listings_count'] as int) + 1;
      return l;
    }
    if (method == 'DELETE' && p.startsWith('/listings/')) {
      listings.firstWhere((l) => l['id'] == p.split('/').last)['status'] =
          'removed';
      return {};
    }
    if (method == 'GET' && p == '/blocks') return blocks;
    if (method == 'POST' && p == '/blocks') {
      blocks.add({'blocked_id': d['accountId'], 'name': 'Sample seller'});
      return {};
    }
    if (method == 'DELETE' && p.startsWith('/blocks/')) {
      blocks.removeWhere((b) => b['blocked_id'] == p.split('/').last);
      return {};
    }
    if (method == 'POST' && p == '/reports') return {};
    if (method == 'DELETE' && p == '/account') {
      await clearSession();
      return {};
    }
    throw ApiError(
      'This action is unavailable in the sample preview. No real request was sent.',
      403,
    );
  }

  @override
  Future<String> upload(XFile file) async {
    final bytes = await file.readAsBytes();
    if (bytes.length > 8 * 1024 * 1024) {
      throw ApiError('Choose a photo smaller than 8 MB.', 400);
    }
    final ext = file.name.split('.').last.toLowerCase();
    if (!['jpg', 'jpeg', 'png', 'webp'].contains(ext)) {
      throw ApiError('Choose a JPG, PNG or WebP photo.', 400);
    }
    return 'data:image/${ext == 'jpg' ? 'jpeg' : ext};base64,${base64Encode(bytes)}';
  }

  @override
  String image(String path) => path.startsWith('data:image/')
      ? path
      : Uri.base.resolve('assets/assets/images/$path').toString();
}
