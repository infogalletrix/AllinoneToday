import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';

const platformUrl = String.fromEnvironment(
  'PLATFORM_URL',
  defaultValue: 'https://allinonetoday.galletrix.com',
);
const categories = [
  'Vehicles',
  'Property',
  'Jobs',
  'Groceries',
  'Electronics',
  'Mobiles',
  'Services',
  'Furniture',
];
typedef Json = Map<String, dynamic>;

class MarketplaceApi {
  final http.Client client;
  final FlutterSecureStorage storage;
  String? token;
  Json? user;
  MarketplaceApi({http.Client? client, FlutterSecureStorage? storage})
    : client = client ?? http.Client(),
      storage = storage ?? const FlutterSecureStorage();
  Future<void> initialize() async {
    token = await storage.read(key: 'ait_token');
    if (token != null) {
      try {
        user = Map<String, dynamic>.from(await get('/auth/session'));
      } catch (e) {
        if (e is ApiError && e.status == 401) {
          await clearSession();
        } else {
          rethrow;
        }
      }
    }
  }

  Future<dynamic> get(String path) => send('GET', path);
  Future<dynamic> post(String path, Json data) => send('POST', path, data);
  Future<dynamic> send(String method, String path, [Json? data]) async {
    final request = http.Request(method, Uri.parse('$platformUrl/api$path'));
    request.headers['Content-Type'] = 'application/json';
    if (token != null) request.headers['Authorization'] = 'Bearer $token';
    if (data != null) request.body = jsonEncode(data);
    final response = await http.Response.fromStream(
      await client.send(request).timeout(const Duration(seconds: 30)),
    );
    final value = jsonDecode(response.body);
    if (response.statusCode >= 400 || value['success'] != true) {
      throw ApiError(
        value['message'] ?? 'Unable to complete request.',
        response.statusCode,
      );
    }
    return value['data'];
  }

  Future<void> authenticate(bool register, Json data) async {
    final result = await post(
      register ? '/auth/register' : '/auth/login',
      data,
    );
    token = result['token'];
    user = Map<String, dynamic>.from(result['user']);
    await storage.write(key: 'ait_token', value: token);
  }

  Future<void> logout() async {
    await post('/auth/logout', {});
    await clearSession();
  }

  Future<void> clearSession() async {
    token = null;
    user = null;
    await storage.delete(key: 'ait_token');
  }

  Future<String> upload(XFile file) async {
    final bytes = await file.readAsBytes();
    if (bytes.length > 8 * 1024 * 1024) {
      throw ApiError('Choose a photo smaller than 8 MB.', 400);
    }
    final req = http.MultipartRequest(
      'POST',
      Uri.parse('$platformUrl/api/uploads'),
    );
    if (token != null) req.headers['Authorization'] = 'Bearer $token';
    req.files.add(
      http.MultipartFile.fromBytes('image', bytes, filename: file.name),
    );
    final response = await http.Response.fromStream(
      await client.send(req).timeout(const Duration(seconds: 40)),
    );
    final result = jsonDecode(response.body);
    if (response.statusCode >= 400 || result['success'] != true) {
      throw ApiError(
        result['message'] ?? 'Upload failed.',
        response.statusCode,
      );
    }
    return result['data']['url'];
  }

  String image(String path) =>
      path.startsWith('https://') ? path : '$platformUrl$path';
}

class ApiError implements Exception {
  final String message;
  final int status;
  ApiError(this.message, this.status);
  @override
  String toString() => message;
}

bool strongPassword(String value) =>
    value.length >= 10 &&
    value.length <= 128 &&
    RegExp('[A-Z]').hasMatch(value) &&
    RegExp('[a-z]').hasMatch(value) &&
    RegExp('[0-9]').hasMatch(value) &&
    RegExp(r'[^a-zA-Z0-9\s]').hasMatch(value);
