import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:razorpay_flutter/razorpay_flutter.dart';
import 'package:url_launcher/url_launcher.dart';
import 'api.dart';
import 'blocked.dart';
import 'owner_controls.dart';

const orange = Color(0xFFF95738), ink = Color(0xFF14171C);
Future<void> runMarketplace({bool business = false}) async {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(MarketplaceApp(business: business));
}

class MarketplaceApp extends StatelessWidget {
  final bool business;
  final MarketplaceApi? api;
  const MarketplaceApp({super.key, this.business = false, this.api});
  @override
  Widget build(BuildContext context) => MaterialApp(
    debugShowCheckedModeBanner: false,
    title: business ? 'All in One Business' : 'All in One Today',
    theme: ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(seedColor: orange),
      scaffoldBackgroundColor: const Color(0xFFF6F8FA),
      appBarTheme: const AppBarTheme(
        backgroundColor: ink,
        foregroundColor: Colors.white,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.white,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: orange,
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 15),
        ),
      ),
      cardTheme: CardThemeData(
        color: Colors.white,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
          side: const BorderSide(color: Color(0xFFE2E8F0)),
        ),
      ),
    ),
    home: MarketplaceShell(business: business, api: api ?? MarketplaceApi()),
  );
}

class MarketplaceShell extends StatefulWidget {
  final bool business;
  final MarketplaceApi api;
  const MarketplaceShell({
    super.key,
    required this.business,
    required this.api,
  });
  @override
  State<MarketplaceShell> createState() => _ShellState();
}

class _ShellState extends State<MarketplaceShell> {
  int selected = 0;
  bool ready = false;
  String? error;
  int revision = 0;
  @override
  void initState() {
    super.initState();
    initialize();
  }

  Future<void> initialize() async {
    try {
      await widget.api.initialize();
      if (mounted) setState(() => ready = true);
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    }
  }

  void refresh() async {
    try {
      final remote = await widget.api.get('/categories') as List;
      categories = remote.map((item) => item['name'] as String).toList();
    } catch (e) {
      if (mounted) notify(context, 'Categories could not refresh: $e');
    }
    if (mounted) setState(() => revision++);
  }

  @override
  Widget build(BuildContext context) {
    if (!ready) {
      return Scaffold(
        body: Center(
          child: error == null
              ? const CircularProgressIndicator()
              : Notice(
                  error!,
                  action: () => {setState(() => error = null), initialize()},
                  actionText: 'Retry',
                ),
        ),
      );
    }
    final api = widget.api;
    final pages = widget.business
        ? <Widget>[
            api.user?['role'] == 'admin'
                ? OwnerControls(api: api)
                : ShopDashboard(
                    api: api,
                    onAccount: () => setState(() => selected = 3),
                  ),
            MyListings(api: api, onAccount: () => setState(() => selected = 3)),
            MessagesPage(api: api),
            AccountPage(api: api, business: true, onChange: refresh),
          ]
        : <Widget>[
            BrowsePage(api: api),
            ShopDirectory(api: api),
            MessagesPage(api: api),
            AccountPage(api: api, onChange: refresh),
          ];
    return Scaffold(
      appBar: AppBar(
        title: Text(
          widget.business ? 'All in One · Business' : 'All in One Today',
          style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w800),
        ),
        actions: [
          IconButton(
            tooltip: 'Refresh',
            onPressed: refresh,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: KeyedSubtree(
        key: ValueKey('$selected:$revision'),
        child: pages[selected],
      ),
      floatingActionButton:
          widget.business && api.user?['role'] == 'merchant' && selected < 2
          ? FloatingActionButton.extended(
              onPressed: () async {
                if (api.user == null) {
                  setState(() => selected = 3);
                  return;
                }
                await Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => PublishPage(api: api)),
                );
                refresh();
              },
              backgroundColor: orange,
              foregroundColor: Colors.white,
              icon: const Icon(Icons.add),
              label: const Text('Post listing'),
            )
          : null,
      bottomNavigationBar: NavigationBar(
        selectedIndex: selected,
        onDestinationSelected: (i) => setState(() => selected = i),
        destinations: [
          NavigationDestination(
            icon: Icon(
              widget.business ? Icons.storefront : Icons.explore_outlined,
            ),
            label: widget.business
                ? (api.user?['role'] == 'admin' ? 'Controls' : 'My shop')
                : 'Discover',
          ),
          NavigationDestination(
            icon: Icon(
              widget.business
                  ? Icons.inventory_2_outlined
                  : Icons.storefront_outlined,
            ),
            label: widget.business ? 'Listings' : 'Shops',
          ),
          const NavigationDestination(
            icon: Icon(Icons.chat_bubble_outline),
            label: 'Messages',
          ),
          NavigationDestination(
            icon: const Icon(Icons.person_outline),
            label: api.user == null ? 'Login' : 'Profile',
          ),
        ],
      ),
    );
  }
}

class Notice extends StatelessWidget {
  final String text;
  final VoidCallback? action;
  final String actionText;
  const Notice(this.text, {super.key, this.action, this.actionText = 'Retry'});
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.all(24),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          text,
          textAlign: TextAlign.center,
          style: const TextStyle(height: 1.6),
        ),
        if (action != null) ...[
          const SizedBox(height: 18),
          FilledButton(onPressed: action, child: Text(actionText)),
        ],
      ],
    ),
  );
}

void notify(BuildContext context, String text) {
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(content: Text(text), duration: const Duration(seconds: 5)),
  );
}

Widget field(
  String label,
  TextEditingController controller, {
  bool secret = false,
  int lines = 1,
  TextInputType? keyboard,
  bool required = true,
  int min = 1,
  int max = 500,
  String? Function(String?)? validate,
}) => Padding(
  padding: const EdgeInsets.only(bottom: 16),
  child: TextFormField(
    controller: controller,
    obscureText: secret,
    maxLines: lines,
    keyboardType: keyboard,
    decoration: InputDecoration(
      labelText: label,
      alignLabelWithHint: lines > 1,
    ),
    validator:
        validate ??
        (v) => required && (v == null || v.trim().length < min)
            ? 'Enter $label'
            : v != null && v.length > max
            ? 'Maximum $max characters'
            : null,
  ),
);
Future<String?> ask(
  BuildContext context,
  String title,
  String label, {
  bool secret = false,
  String initial = '',
}) async {
  final c = TextEditingController(text: initial);
  final result = await showDialog<String>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(title),
      content: TextField(
        controller: c,
        obscureText: secret,
        decoration: InputDecoration(labelText: label),
        maxLines: secret ? 1 : 3,
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(ctx),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(ctx, c.text),
          child: const Text('Confirm'),
        ),
      ],
    ),
  );
  c.dispose();
  return result;
}

Future<bool> confirm(
  BuildContext context,
  String title,
  String message,
) async =>
    await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: Text(message),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Confirm'),
          ),
        ],
      ),
    ) ??
    false;

class AccountPage extends StatefulWidget {
  final MarketplaceApi api;
  final bool business;
  final VoidCallback onChange;
  const AccountPage({
    super.key,
    required this.api,
    this.business = false,
    required this.onChange,
  });
  @override
  State<AccountPage> createState() => _AccountState();
}

class _AccountState extends State<AccountPage> {
  final form = GlobalKey<FormState>(),
      name = TextEditingController(),
      phone = TextEditingController(),
      email = TextEditingController(),
      password = TextEditingController();
  bool register = false, busy = false;
  String? error;
  @override
  void dispose() {
    for (final c in [name, phone, email, password]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> submit() async {
    if (!form.currentState!.validate()) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await widget.api.authenticate(register, {
        'name': name.text.trim(),
        'phone': phone.text.trim(),
        'email': email.text.trim(),
        'password': password.text,
        'role': widget.business ? 'merchant' : 'buyer',
      });
      if (mounted) widget.onChange();
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> deleteAccount() async {
    if (!await confirm(
      context,
      'Delete your account?',
      'Your personal account data, listings and messages will be removed. Any shop AutoPay will stop immediately and your shop will be removed. This does not request a refund. Required financial records may be retained.',
    )) {
      return;
    }
    if (!mounted) return;
    final googleOnly = widget.api.user?['passwordSet'] == false;
    if (googleOnly) {
      try {
        await widget.api.authenticateGoogle(widget.business);
      } catch (e) {
        if (mounted) notify(context, '$e');
        return;
      }
      if (!mounted) return;
    }
    final value = await ask(
      context,
      'Confirm deletion',
      googleOnly ? 'Type DELETE' : 'Password',
      secret: !googleOnly,
    );
    if (value == null || value.isEmpty) return;
    try {
      await widget.api.send('DELETE', '/account', {
        'password': googleOnly ? '' : value,
        'confirmation': googleOnly ? value : '',
        'stopAutoPay': true,
      });
      await widget.api.clearSession();
      if (mounted) widget.onChange();
    } catch (e) {
      if (mounted) notify(context, '$e');
    }
  }

  Future<void> googleLogin() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await widget.api.authenticateGoogle(widget.business);
      if (mounted) widget.onChange();
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> claimOwner() async {
    final code = await ask(
      context,
      'Activate product-owner controls',
      'Private owner setup code',
      secret: true,
    );
    if (code == null || code.isEmpty) return;
    try {
      await widget.api.saveSession(
        Map<String, dynamic>.from(
          await widget.api.post('/admin/claim-owner', {'code': code}),
        ),
      );
      if (mounted) widget.onChange();
    } catch (e) {
      if (mounted) notify(context, '$e');
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = widget.api.user;
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        const SizedBox(height: 10),
        Text(
          user == null
              ? register
                    ? 'Join your local marketplace.'
                    : 'Welcome back.'
              : 'Your account',
          style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 24),
        if (user != null) ...[
          Card(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    user['name'],
                    style: const TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  Text(user['email']),
                  Text(user['phone'] ?? ''),
                  Text(
                    user['role'] == 'admin'
                        ? 'Product owner'
                        : user['role'] == 'merchant'
                        ? 'Shop owner'
                        : 'Marketplace member',
                  ),
                ],
              ),
            ),
          ),
          if (widget.business && user['role'] == 'merchant')
            ListTile(
              leading: const Icon(Icons.inventory_2_outlined),
              title: const Text('My listings'),
              onTap: () => Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => Scaffold(
                    appBar: AppBar(title: const Text('My listings')),
                    body: MyListings(
                      api: widget.api,
                      onAccount: widget.onChange,
                    ),
                  ),
                ),
              ),
            ),
          if (widget.business && user['role'] != 'admin')
            TextButton(
              onPressed: claimOwner,
              child: const Text('Product-owner setup'),
            ),
          OutlinedButton.icon(
            onPressed: busy ? null : googleLogin,
            icon: const Icon(Icons.account_circle_outlined),
            label: Text(
              user['googleLinked'] == true
                  ? 'Verify with Google'
                  : 'Link Google',
            ),
          ),
          if (error != null) Notice(error!),
          ListTile(
            leading: const Icon(Icons.block),
            title: const Text('Blocked accounts'),
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => BlockedAccounts(api: widget.api),
              ),
            ),
          ),
          FilledButton(
            onPressed: busy
                ? null
                : () async {
                    setState(() => busy = true);
                    try {
                      await widget.api.logout();
                      if (mounted) widget.onChange();
                    } catch (e) {
                      if (context.mounted) notify(context, '$e');
                    } finally {
                      if (mounted) setState(() => busy = false);
                    }
                  },
            child: const Text('Sign out'),
          ),
          TextButton(
            onPressed: busy ? null : deleteAccount,
            child: const Text('Delete my account'),
          ),
        ] else
          Form(
            key: form,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  widget.business
                      ? 'Use a shop-owner account to manage your business.'
                      : 'Login to save your favorites and connect with sellers.',
                ),
                const SizedBox(height: 22),
                OutlinedButton.icon(
                  onPressed: busy ? null : googleLogin,
                  icon: const Icon(Icons.account_circle_outlined),
                  label: const Text('Continue with Google'),
                ),
                const SizedBox(height: 16),
                if (register) ...[
                  field('Your name', name, min: 2, max: 100),
                  field(
                    'Phone',
                    phone,
                    keyboard: TextInputType.phone,
                    max: 30,
                    required: widget.business,
                  ),
                ],
                field(
                  'Email',
                  email,
                  keyboard: TextInputType.emailAddress,
                  validate: (v) =>
                      v != null &&
                          RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(v)
                      ? null
                      : 'Enter a valid email',
                ),
                field(
                  'Password',
                  password,
                  secret: true,
                  max: 128,
                  validate: (v) => register
                      ? strongPassword(v ?? '')
                            ? null
                            : 'Use 10+ characters: uppercase, lowercase, number and symbol'
                      : (v ?? '').isEmpty
                      ? 'Enter password'
                      : null,
                ),
                if (register)
                  const Padding(
                    padding: EdgeInsets.only(bottom: 16),
                    child: Text(
                      'By registering you agree to our Terms and Privacy notice.',
                    ),
                  ),
                if (error != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 16),
                    child: Text(
                      error!,
                      style: const TextStyle(color: Colors.red),
                    ),
                  ),
                FilledButton(
                  onPressed: busy ? null : submit,
                  child: Text(
                    busy
                        ? 'Please wait…'
                        : register
                        ? 'Sign up'
                        : 'Login',
                  ),
                ),
                TextButton(
                  onPressed: () => setState(() {
                    register = !register;
                    error = null;
                  }),
                  child: Text(
                    register
                        ? 'Already have an account? Sign in'
                        : 'New here? Sign up',
                  ),
                ),
              ],
            ),
          ),
        const SizedBox(height: 30),
        for (final entry in {
          'Privacy': 'privacy',
          'Terms': 'terms',
          'Safety tips': 'safety',
        }.entries)
          ListTile(
            title: Text(entry.key),
            trailing: const Icon(Icons.open_in_new, size: 18),
            onTap: () => launchUrl(
              Uri.parse('$platformUrl/${entry.value}'),
              mode: LaunchMode.externalApplication,
            ),
          ),
        ListTile(
          title: const Text('Contact All in One Today support'),
          onTap: () => launchUrl(
            Uri.parse('$platformUrl/support'),
            mode: LaunchMode.externalApplication,
          ),
        ),
        const Padding(
          padding: EdgeInsets.all(12),
          child: Text('All in One Today · 1.1.0', textAlign: TextAlign.center),
        ),
      ],
    );
  }
}

class BrowsePage extends StatefulWidget {
  final MarketplaceApi api;
  final String? shopId;
  const BrowsePage({super.key, required this.api, this.shopId});
  @override
  State<BrowsePage> createState() => _BrowseState();
}

class _BrowseState extends State<BrowsePage> {
  final search = TextEditingController(), location = TextEditingController();
  String category = 'All';
  List<dynamic> items = [];
  bool loading = true, favoritesOnly = false;
  String? error;
  Set<String> favorites = {};
  @override
  void initState() {
    super.initState();
    load();
    loadFavorites();
  }

  @override
  void dispose() {
    search.dispose();
    location.dispose();
    super.dispose();
  }

  Future<void> loadFavorites() async {
    if (widget.api.user == null) return;
    try {
      final data = await widget.api.get('/profile/favorites');
      if (mounted) {
        setState(
          () =>
              favorites = (data as List).map((x) => x['id'] as String).toSet(),
        );
      }
    } catch (e) {
      if (mounted) notify(context, 'Could not load saved listings.');
    }
  }

  Future<void> load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final q = Uri(
        queryParameters: {
          if (category != 'All') 'category': category,
          'query': search.text.trim(),
          'location': location.text.trim(),
          if (widget.shopId != null) 'shop_id': widget.shopId!,
        },
      ).query;
      final data = await widget.api.get('/listings?$q');
      if (mounted) setState(() => items = data);
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> favorite(Json item) async {
    if (widget.api.user == null) {
      notify(context, 'Use Login to save listings.');
      return;
    }
    final id = item['id'] as String;
    try {
      if (favorites.contains(id)) {
        await widget.api.send('DELETE', '/profile/favorites/$id');
      } else {
        await widget.api.post('/profile/favorites', {'listing_id': id});
      }
      if (mounted) {
        setState(
          () =>
              favorites.contains(id) ? favorites.remove(id) : favorites.add(id),
        );
      }
    } catch (e) {
      if (mounted) notify(context, '$e');
    }
  }

  @override
  Widget build(BuildContext context) {
    final shown = favoritesOnly
        ? items.where((i) => favorites.contains(i['id'])).toList()
        : items;
    return RefreshIndicator(
      onRefresh: load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 24, 20, 100),
        children: [
          if (widget.shopId == null) ...[
            const Text(
              'Find your next\ngreat discovery.',
              style: TextStyle(
                fontSize: 30,
                height: 1.15,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 12),
            const Text(
              'Local finds. Real connections. All in one place.',
              style: TextStyle(color: Colors.black54),
            ),
            const SizedBox(height: 24),
          ],
          TextField(
            controller: search,
            onSubmitted: (_) => load(),
            decoration: InputDecoration(
              hintText: 'Search products, services, locations…',
              prefixIcon: const Icon(Icons.search),
              suffixIcon: IconButton(
                tooltip: 'Search',
                onPressed: load,
                icon: const Icon(Icons.arrow_forward),
              ),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: location,
            onSubmitted: (_) => load(),
            decoration: const InputDecoration(
              labelText: 'Location',
              prefixIcon: Icon(Icons.place_outlined),
            ),
          ),
          const SizedBox(height: 16),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: ['All', ...categories]
                  .map(
                    (c) => Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: ChoiceChip(
                        label: Text(c),
                        selected: c == category,
                        onSelected: (_) {
                          setState(() => category = c);
                          load();
                        },
                      ),
                    ),
                  )
                  .toList(),
            ),
          ),
          if (widget.api.user != null)
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Saved listings only'),
              value: favoritesOnly,
              onChanged: (v) => setState(() => favoritesOnly = v),
            ),
          const SizedBox(height: 16),
          if (loading)
            const Center(child: CircularProgressIndicator())
          else if (error != null)
            Notice(error!, action: load)
          else if (shown.isEmpty)
            const Notice(
              'No listings yet. Try another search or check back for new shop listings.',
            )
          else
            ...shown.map((x) {
              final item = Map<String, dynamic>.from(x);
              return ListingTile(
                api: widget.api,
                item: item,
                saved: favorites.contains(item['id']),
                onFavorite: () => favorite(item),
              );
            }),
        ],
      ),
    );
  }
}

class ListingTile extends StatelessWidget {
  final MarketplaceApi api;
  final Json item;
  final bool saved;
  final VoidCallback? onFavorite;
  const ListingTile({
    super.key,
    required this.api,
    required this.item,
    this.saved = false,
    this.onFavorite,
  });
  @override
  Widget build(BuildContext context) => Card(
    margin: const EdgeInsets.only(bottom: 18),
    clipBehavior: Clip.antiAlias,
    child: InkWell(
      onTap: () => Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => ListingDetails(api: api, id: item['id']),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Stack(
            children: [
              Image.network(
                api.image(item['image_path']),
                width: double.infinity,
                height: 210,
                fit: BoxFit.cover,
                errorBuilder: (_, e, s) => const SizedBox(
                  height: 210,
                  child: Center(
                    child: Icon(Icons.image_not_supported_outlined, size: 48),
                  ),
                ),
              ),
              if (onFavorite != null)
                Positioned(
                  right: 10,
                  top: 10,
                  child: IconButton.filledTonal(
                    onPressed: onFavorite,
                    icon: Icon(
                      saved ? Icons.favorite : Icons.favorite_outline,
                      color: orange,
                    ),
                    tooltip: 'Save listing',
                  ),
                ),
            ],
          ),
          Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item['category'],
                  style: const TextStyle(color: Colors.black54, fontSize: 12),
                ),
                const SizedBox(height: 6),
                Text(
                  item['title'],
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 18,
                  ),
                ),
                const SizedBox(height: 10),
                Text(
                  item['formatted_price'],
                  style: const TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 21,
                  ),
                ),
                const SizedBox(height: 10),
                Text(
                  item['location'],
                  style: const TextStyle(color: Colors.black54),
                ),
              ],
            ),
          ),
        ],
      ),
    ),
  );
}

class ListingDetails extends StatefulWidget {
  final MarketplaceApi api;
  final String id;
  const ListingDetails({super.key, required this.api, required this.id});
  @override
  State<ListingDetails> createState() => _DetailsState();
}

class _DetailsState extends State<ListingDetails> {
  Json? item;
  String? error;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    try {
      final d = await widget.api.get('/listings/${widget.id}');
      if (mounted) setState(() => item = Map<String, dynamic>.from(d));
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    }
  }

  Future<void> contact() async {
    if (widget.api.user == null) {
      notify(context, 'Use Login before contacting a seller.');
      return;
    }
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => InquiryPage(api: widget.api, item: item!),
      ),
    );
  }

  Future<void> report() async {
    if (widget.api.user == null) {
      notify(context, 'Sign in to report a listing.');
      return;
    }
    final reason = await ask(
      context,
      'Report this listing',
      'Reason (at least 10 characters)',
    );
    if (reason == null || reason.isEmpty) return;
    try {
      await widget.api.post('/reports', {
        'listingId': widget.id,
        'reason': reason,
      });
      if (mounted) notify(context, 'Report submitted for review.');
    } catch (e) {
      if (mounted) notify(context, '$e');
    }
  }

  Future<void> blockSeller() async {
    if (widget.api.user == null) {
      notify(context, 'Sign in to block a seller.');
      return;
    }
    if (!await confirm(
      context,
      'Block this seller?',
      'Neither account will be able to send new inquiries or replies to the other.',
    )) {
      return;
    }
    try {
      await widget.api.post('/blocks', {'accountId': item!['seller_id']});
      if (mounted) {
        notify(
          context,
          'Seller blocked. Manage blocked accounts from Profile.',
        );
      }
    } catch (e) {
      if (mounted) notify(context, '$e');
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Listing details')),
    body: item == null
        ? Center(
            child: error == null
                ? const CircularProgressIndicator()
                : Notice(error!, action: load),
          )
        : ListView(
            padding: const EdgeInsets.only(bottom: 30),
            children: [
              Image.network(
                widget.api.image(item!['image_path']),
                height: 300,
                fit: BoxFit.contain,
                errorBuilder: (_, e, s) => const SizedBox(
                  height: 250,
                  child: Icon(Icons.image_not_supported),
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      item!['category'],
                      style: const TextStyle(
                        color: orange,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      item!['title'],
                      style: const TextStyle(
                        fontSize: 28,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      item!['formatted_price'],
                      style: const TextStyle(
                        fontSize: 25,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    Text(item!['location']),
                    const SizedBox(height: 20),
                    Text('Listed by ${item!['seller_name']}'),
                    const SizedBox(height: 20),
                    FilledButton.icon(
                      onPressed: contact,
                      icon: const Icon(Icons.chat_bubble_outline),
                      label: const Text('Contact seller'),
                    ),
                    const SizedBox(height: 28),
                    const Text(
                      'About this listing',
                      style: TextStyle(
                        fontSize: 21,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      item!['description'],
                      style: const TextStyle(height: 1.7),
                    ),
                    const SizedBox(height: 24),
                    const Text(
                      'Inspect before paying. Never share an OTP or banking PIN. Product purchases are arranged directly with the seller.',
                      style: TextStyle(color: Colors.black54, height: 1.7),
                    ),
                    TextButton(
                      onPressed: report,
                      child: const Text('Report listing'),
                    ),
                    TextButton(
                      onPressed: blockSeller,
                      child: const Text('Block seller'),
                    ),
                  ],
                ),
              ),
            ],
          ),
  );
}

class InquiryPage extends StatefulWidget {
  final MarketplaceApi api;
  final Json item;
  const InquiryPage({super.key, required this.api, required this.item});
  @override
  State<InquiryPage> createState() => _InquiryState();
}

class _InquiryState extends State<InquiryPage> {
  final form = GlobalKey<FormState>(),
      phone = TextEditingController(),
      message = TextEditingController();
  bool busy = false;
  String? error;
  @override
  void initState() {
    super.initState();
    phone.text = widget.api.user?['phone'] ?? '';
    message.text =
        'Hi, I am interested in ${widget.item['title']}. Is it available?';
  }

  @override
  void dispose() {
    phone.dispose();
    message.dispose();
    super.dispose();
  }

  Future<void> submit() async {
    if (!form.currentState!.validate()) return;
    setState(() => busy = true);
    try {
      await widget.api.post('/conversations', {
        'listing_id': widget.item['id'],
        'phone': phone.text,
        'message': message.text,
      });
      if (mounted) {
        notify(context, 'Inquiry delivered. View replies in Messages.');
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Contact seller')),
    body: ListView(
      padding: const EdgeInsets.all(24),
      children: [
        Text(
          widget.item['title'],
          style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 20),
        Form(
          key: form,
          child: Column(
            children: [
              field(
                'Your phone',
                phone,
                keyboard: TextInputType.phone,
                min: 7,
                max: 30,
              ),
              field('Message', message, lines: 5, min: 2, max: 2000),
              const Text('Your name and phone are shared with this seller.'),
              if (error != null) Notice(error!),
              const SizedBox(height: 20),
              FilledButton(
                onPressed: busy ? null : submit,
                child: Text(busy ? 'Sending…' : 'Send inquiry'),
              ),
            ],
          ),
        ),
      ],
    ),
  );
}

class ShopDirectory extends StatefulWidget {
  final MarketplaceApi api;
  const ShopDirectory({super.key, required this.api});
  @override
  State<ShopDirectory> createState() => _DirectoryState();
}

class _DirectoryState extends State<ShopDirectory> {
  List<dynamic>? items;
  String? error;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    try {
      final data = await widget.api.get('/shops');
      if (mounted) setState(() => items = data);
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    }
  }

  @override
  Widget build(BuildContext context) => RefreshIndicator(
    onRefresh: load,
    child: ListView(
      padding: const EdgeInsets.all(20),
      children: [
        const Text(
          'Discover local shops.',
          style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 16),
        const Text(
          'Businesses with active shop registrations. Subscription status is not an identity or quality guarantee.',
        ),
        const SizedBox(height: 20),
        if (items == null)
          error == null
              ? const Center(child: CircularProgressIndicator())
              : Notice(error!, action: load)
        else if (items!.isEmpty)
          const Notice(
            'Subscribed shops will appear here when registration opens.',
          )
        else
          ...items!.map(
            (s) => Card(
              child: ListTile(
                contentPadding: const EdgeInsets.all(20),
                leading: const Icon(Icons.storefront, color: orange),
                title: Text(
                  s['name'],
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                subtitle: Text(
                  '${s['category']}\n${s['location']}\n${s['listings_count']} listing(s)',
                ),
                isThreeLine: true,
                trailing: const Icon(Icons.chevron_right),
                onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => Scaffold(
                      appBar: AppBar(title: Text(s['name'])),
                      body: BrowsePage(api: widget.api, shopId: s['id']),
                    ),
                  ),
                ),
              ),
            ),
          ),
      ],
    ),
  );
}

class MessagesPage extends StatefulWidget {
  final MarketplaceApi api;
  const MessagesPage({super.key, required this.api});
  @override
  State<MessagesPage> createState() => _MessagesState();
}

class _MessagesState extends State<MessagesPage> {
  List<dynamic>? items;
  String? error;
  @override
  void initState() {
    super.initState();
    if (widget.api.user != null) load();
  }

  Future<void> load() async {
    try {
      final data = await widget.api.get('/conversations');
      if (mounted) setState(() => items = data);
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    }
  }

  @override
  Widget build(BuildContext context) => widget.api.user == null
      ? const Center(
          child: Notice('Use Login to see your inquiries and messages.'),
        )
      : RefreshIndicator(
          onRefresh: load,
          child: ListView(
            padding: const EdgeInsets.all(20),
            children: [
              const Text(
                'Your conversations',
                style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 20),
              if (items == null)
                error == null
                    ? const Center(child: CircularProgressIndicator())
                    : Notice(error!, action: load)
              else if (items!.isEmpty)
                const Notice(
                  'No messages yet. Contact a seller to start a conversation.',
                )
              else
                ...items!.map(
                  (i) => Card(
                    child: ListTile(
                      leading: const CircleAvatar(
                        child: Icon(Icons.chat_bubble_outline),
                      ),
                      title: Text(i['item_tag'] ?? 'Shop inquiry'),
                      subtitle: Text(
                        '${i['is_buying'] ? i['recipient_name'] : i['sender_name']}\n${i['message']}',
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                      ),
                      isThreeLine: true,
                      onTap: () => Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => ConversationPage(
                            api: widget.api,
                            inquiry: Map<String, dynamic>.from(i),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        );
}

class ConversationPage extends StatefulWidget {
  final MarketplaceApi api;
  final Json inquiry;
  const ConversationPage({super.key, required this.api, required this.inquiry});
  @override
  State<ConversationPage> createState() => _ConversationState();
}

class _ConversationState extends State<ConversationPage> {
  List<dynamic>? messages;
  String? error;
  final reply = TextEditingController();
  bool busy = false;
  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void dispose() {
    reply.dispose();
    super.dispose();
  }

  Future<void> load() async {
    try {
      final data = await widget.api.get(
        '/conversations/${widget.inquiry['id']}/messages',
      );
      if (mounted) setState(() => messages = data);
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    }
  }

  Future<void> send() async {
    if (reply.text.trim().isEmpty) return;
    setState(() => busy = true);
    try {
      await widget.api.post('/conversations/${widget.inquiry['id']}/messages', {
        'content': reply.text,
      });
      reply.clear();
      await load();
    } catch (e) {
      if (mounted) notify(context, '$e');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Text(widget.inquiry['item_tag'] ?? 'Conversation'),
      actions: [
        IconButton(
          onPressed: load,
          tooltip: 'Refresh',
          icon: const Icon(Icons.refresh),
        ),
      ],
    ),
    body: Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(16),
          child: Text('Contact phone: ${widget.inquiry['phone']}'),
        ),
        Expanded(
          child: messages == null
              ? Center(
                  child: error == null
                      ? const CircularProgressIndicator()
                      : Notice(error!, action: load),
                )
              : ListView(
                  padding: const EdgeInsets.all(16),
                  children: messages!
                      .map(
                        (m) => Align(
                          alignment: m['is_from_me']
                              ? Alignment.centerRight
                              : Alignment.centerLeft,
                          child: Container(
                            margin: const EdgeInsets.only(bottom: 12),
                            padding: const EdgeInsets.all(16),
                            constraints: BoxConstraints(
                              maxWidth: MediaQuery.sizeOf(context).width * .8,
                            ),
                            decoration: BoxDecoration(
                              color: m['is_from_me']
                                  ? const Color(0xFFFFE9E3)
                                  : Colors.white,
                              borderRadius: BorderRadius.circular(14),
                            ),
                            child: Text(
                              m['content'],
                              style: const TextStyle(height: 1.5),
                            ),
                          ),
                        ),
                      )
                      .toList(),
                ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: reply,
                    maxLength: 2000,
                    decoration: const InputDecoration(
                      labelText: 'Reply',
                      counterText: '',
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                IconButton.filled(
                  onPressed: busy ? null : send,
                  icon: const Icon(Icons.send),
                ),
              ],
            ),
          ),
        ),
      ],
    ),
  );
}

class MyListings extends StatefulWidget {
  final MarketplaceApi api;
  final VoidCallback onAccount;
  const MyListings({super.key, required this.api, required this.onAccount});
  @override
  State<MyListings> createState() => _MyListingsState();
}

class _MyListingsState extends State<MyListings> {
  List<dynamic>? items;
  String? error;
  @override
  void initState() {
    super.initState();
    if (widget.api.user != null) load();
  }

  Future<void> load() async {
    try {
      final data = await widget.api.get('/seller/catalogue');
      if (mounted) setState(() => items = data);
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    }
  }

  Future<void> remove(String id) async {
    if (!await confirm(
      context,
      'Remove listing?',
      'This listing will no longer be visible to buyers.',
    )) {
      return;
    }
    try {
      await widget.api.send('DELETE', '/listings/$id');
      await load();
    } catch (e) {
      if (mounted) notify(context, '$e');
    }
  }

  @override
  Widget build(BuildContext context) => widget.api.user == null
      ? Center(
          child: Notice(
            'Sign in to view your listings.',
            action: widget.onAccount,
            actionText: 'Open Account',
          ),
        )
      : RefreshIndicator(
          onRefresh: load,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 100),
            children: [
              const Text(
                'Your listings',
                style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 20),
              if (items == null)
                error == null
                    ? const Center(child: CircularProgressIndicator())
                    : Notice(error!, action: load)
              else if (items!.isEmpty)
                const Notice('Your published listings will appear here.')
              else
                ...items!.map(
                  (i) => Column(
                    children: [
                      ListingTile(
                        api: widget.api,
                        item: Map<String, dynamic>.from(i),
                      ),
                      Row(
                        children: [
                          Text('Status: ${i['status']}'),
                          const Spacer(),
                          if (i['status'] == 'active')
                            TextButton(
                              onPressed: () => remove(i['id']),
                              child: const Text('Remove'),
                            ),
                        ],
                      ),
                      const SizedBox(height: 16),
                    ],
                  ),
                ),
            ],
          ),
        );
}

class PublishPage extends StatefulWidget {
  final MarketplaceApi api;
  const PublishPage({super.key, required this.api});
  @override
  State<PublishPage> createState() => _PublishState();
}

class _PublishState extends State<PublishPage> {
  final form = GlobalKey<FormState>(),
      title = TextEditingController(),
      price = TextEditingController(),
      location = TextEditingController(),
      description = TextEditingController();
  String category = categories.isEmpty ? '' : categories.first;
  String? shopId;
  XFile? photo;
  List<dynamic> shops = [];
  bool busy = false, loading = false;
  String? error;
  @override
  void initState() {
    super.initState();
    if (widget.api.user?['role'] == 'merchant') loadShops();
  }

  @override
  void dispose() {
    for (final c in [title, price, location, description]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> loadShops() async {
    setState(() => loading = true);
    try {
      final data = await widget.api.get('/shops/mine');
      if (mounted) {
        setState(
          () => shops = (data as List)
              .where(
                (s) =>
                    s['subscription']?['paid_until'] != null &&
                    DateTime.parse(
                      s['subscription']['paid_until'],
                    ).isAfter(DateTime.now()),
              )
              .toList(),
        );
      }
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> submit() async {
    if (!form.currentState!.validate()) return;
    if (photo == null) {
      notify(context, 'Choose a photo first.');
      return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final image = await widget.api.upload(photo!);
      await widget.api.post('/listings', {
        'title': title.text.trim(),
        'price': double.parse(price.text),
        'location': location.text.trim(),
        'category': category,
        'description': description.text.trim(),
        'image_path': image,
        'shop_id': shopId,
      });
      if (mounted) {
        notify(context, 'Your listing is now published.');
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Post a listing')),
    body: ListView(
      padding: const EdgeInsets.all(24),
      children: [
        if (loading)
          const Center(child: CircularProgressIndicator())
        else if (widget.api.user?['role'] == 'merchant' && shops.isEmpty)
          const Notice(
            'Activate your shop subscription before publishing business listings.',
          )
        else
          Form(
            key: form,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                field('Title', title, min: 3, max: 150),
                field(
                  'Price (₹)',
                  price,
                  keyboard: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  validate: (v) =>
                      double.tryParse(v ?? '') != null &&
                          double.parse(v!) >= 0 &&
                          double.parse(v) <= 99999999999
                      ? null
                      : 'Enter a valid price',
                ),
                DropdownButtonFormField<String>(
                  initialValue: category,
                  decoration: const InputDecoration(labelText: 'Category'),
                  items: categories
                      .map((c) => DropdownMenuItem(value: c, child: Text(c)))
                      .toList(),
                  onChanged: (v) => setState(() => category = v!),
                ),
                const SizedBox(height: 16),
                field('Location', location, min: 2, max: 180),
                if (widget.api.user?['role'] == 'merchant') ...[
                  DropdownButtonFormField<String>(
                    decoration: const InputDecoration(
                      labelText: 'Subscribed shop',
                    ),
                    items: shops
                        .map(
                          (s) => DropdownMenuItem<String>(
                            value: s['id'],
                            child: Text(s['name']),
                          ),
                        )
                        .toList(),
                    onChanged: (v) => setState(() => shopId = v),
                    validator: (v) => v == null ? 'Choose a shop' : null,
                  ),
                  const SizedBox(height: 16),
                ],
                field('Description', description, lines: 5, min: 10, max: 5000),
                OutlinedButton.icon(
                  onPressed: busy
                      ? null
                      : () async {
                          try {
                            final result = await ImagePicker().pickImage(
                              source: ImageSource.gallery,
                              maxWidth: 2000,
                              imageQuality: 85,
                            );
                            if (result != null && mounted) {
                              setState(() => photo = result);
                            }
                          } catch (e) {
                            if (context.mounted) {
                              notify(
                                context,
                                'Could not open the photo picker.',
                              );
                            }
                          }
                        },
                  icon: const Icon(Icons.add_photo_alternate_outlined),
                  label: Text(
                    photo == null ? 'Choose photo (up to 8 MB)' : photo!.name,
                  ),
                ),
                if (error != null) Notice(error!),
                const SizedBox(height: 20),
                const Text(
                  'Only list goods and services you are authorized to offer. By posting, you agree to the marketplace terms.',
                ),
                const SizedBox(height: 20),
                FilledButton(
                  onPressed: busy ? null : submit,
                  child: Text(busy ? 'Publishing…' : 'Publish listing'),
                ),
              ],
            ),
          ),
      ],
    ),
  );
}

class ShopDashboard extends StatefulWidget {
  final MarketplaceApi api;
  final VoidCallback onAccount;
  const ShopDashboard({super.key, required this.api, required this.onAccount});
  @override
  State<ShopDashboard> createState() => _ShopState();
}

class _ShopState extends State<ShopDashboard> {
  Json? pricing, price, checkout, metrics;
  List<dynamic>? shops;
  String? error, message;
  bool busy = false;
  final form = GlobalKey<FormState>(),
      name = TextEditingController(),
      phone = TextEditingController(),
      location = TextEditingController(),
      description = TextEditingController(),
      branches = TextEditingController(text: '1'),
      photos = TextEditingController(text: '100');
  String category = categories.isEmpty ? '' : categories.first, size = 'small';
  Razorpay? razorpay;
  int quoteVersion = 0;
  bool get ios => Platform.isIOS;
  @override
  void initState() {
    super.initState();
    load();
    if (Platform.isAndroid) {
      razorpay = Razorpay();
      razorpay!.on(Razorpay.EVENT_PAYMENT_SUCCESS, onPaid);
      razorpay!.on(Razorpay.EVENT_PAYMENT_ERROR, (
        PaymentFailureResponse response,
      ) {
        if (mounted) {
          setState(() {
            busy = false;
            error =
                response.message ??
                'Payment did not complete. Refresh status before retrying.';
          });
        }
      });
    }
  }

  @override
  void dispose() {
    razorpay?.clear();
    for (final c in [name, phone, location, description, branches, photos]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> load() async {
    try {
      final p = await widget.api.get('/billing/pricing');
      final s = widget.api.user == null
          ? []
          : await widget.api.get('/shops/mine');
      final m = widget.api.user == null
          ? null
          : await widget.api.get('/seller/metrics');
      if (mounted) {
        setState(() {
          pricing = Map<String, dynamic>.from(p);
          shops = s;
          metrics = m == null ? null : Map<String, dynamic>.from(m);
        });
      }
      await quotePrice();
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    }
  }

  Future<void> quotePrice() async {
    final version = ++quoteVersion;
    if (widget.api.user?['role'] != 'merchant' || category.isEmpty) return;
    final count = int.tryParse(branches.text);
    if (count == null || count < 1 || count > 100) {
      setState(() => price = null);
      return;
    }
    try {
      final p = await widget.api.post('/billing/quote', {
        'category': category,
        'branches': count,
        'size': size,
        'expected_photos': int.tryParse(photos.text) ?? 100,
      });
      if (mounted && version == quoteVersion) {
        setState(() => price = Map<String, dynamic>.from(p));
      }
    } catch (e) {
      if (mounted && version == quoteVersion) {
        setState(() {
          price = null;
          error = '$e';
        });
      }
    }
  }

  Future<void> pay(Json shop) async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final offer = await widget.api.get('/shops/${shop['id']}/quote');
      if (offer['requiresReview'] == true) {
        throw ApiError(offer['message'], 409);
      }
      if (!mounted) return;
      if (!await confirm(
        context,
        'Set up monthly AutoPay?',
        'Authorize ₹${offer['amountMinor'] / 100} every month for ${shop['name']} until canceled? Review the full mandate in Razorpay before approving.',
      )) {
        if (mounted) setState(() => busy = false);
        return;
      }
      checkout = Map<String, dynamic>.from(
        await widget.api.post('/billing/checkout', {
          'shopId': shop['id'],
          'acceptedAmountMinor': offer['amountMinor'],
        }),
      );
      razorpay!.open({
        'key': checkout!['key'],
        'subscription_id': checkout!['subscriptionId'],
        'name': checkout!['name'],
        'description': checkout!['description'],
        'prefill': checkout!['prefill'],
        'theme': {'color': '#F95738'},
      });
    } catch (e) {
      if (mounted) {
        setState(() {
          busy = false;
          error = '$e';
        });
      }
    }
  }

  Future<void> onPaid(PaymentSuccessResponse response) async {
    if (checkout == null) return;
    try {
      final verified = await widget.api.post('/billing/verify', {
        'requestId': checkout!['requestId'],
        'paymentId': response.paymentId,
        'subscriptionId':
            response.data?['razorpay_subscription_id'] ??
            checkout!['subscriptionId'],
        'signature': response.signature,
      });
      if (mounted) setState(() => message = verified['message']);
      await load();
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> register() async {
    if (!form.currentState!.validate()) return;
    setState(() => busy = true);
    try {
      final s = await widget.api.post('/shops', {
        'name': name.text.trim(),
        'phone': phone.text.trim(),
        'location': location.text.trim(),
        'description': description.text.trim(),
        'category': category,
        'branches': int.parse(branches.text),
        'size': size,
        'expected_photos': int.parse(photos.text),
      });
      await load();
      if (pricing?['checkoutEnabled'] == true &&
          price?['requiresReview'] != true) {
        await pay(Map<String, dynamic>.from(s));
      } else if (mounted) {
        setState(() {
          busy = false;
          message = price?['requiresReview'] == true
              ? 'Shop saved for an owner-approved monthly quote. Refresh status to check the offer.'
              : 'Shop saved. Payments will open after Razorpay configuration.';
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          busy = false;
          error = '$e';
        });
      }
    }
  }

  Future<void> cancel(Json subscription) async {
    if (!await confirm(
      context,
      'Cancel AutoPay?',
      'Future renewals will stop. Access continues through the paid period.',
    )) {
      return;
    }
    try {
      final r = await widget.api.post('/billing/cancel', {
        'requestId': subscription['id'],
      });
      if (mounted) setState(() => message = r['message']);
      await load();
    } catch (e) {
      if (mounted) notify(context, '$e');
    }
  }

  Future<void> viewQuote(Json shop) async {
    try {
      final q = await widget.api.get('/shops/${shop['id']}/quote');
      if (mounted) {
        notify(
          context,
          q['requiresReview'] == true
              ? q['message']
              : 'Approved subscription: ₹${q['amountMinor'] / 100}/month. ${q['reason'] ?? ''}',
        );
      }
    } catch (e) {
      if (mounted) notify(context, '$e');
    }
  }

  Future<void> editShop(Json shop) async {
    final n = await ask(
      context,
      'Edit shop',
      'Shop name',
      initial: shop['name'],
    );
    if (n == null || !mounted) return;
    final d = await ask(
      context,
      'Edit shop',
      'Description',
      initial: shop['description'],
    );
    if (d == null) return;
    try {
      await widget.api.send('PATCH', '/shops/${shop['id']}', {
        'name': n,
        'description': d,
        'location': shop['location'],
        'phone': shop['phone'],
        'image_path': shop['image_path'],
      });
      await load();
    } catch (e) {
      if (mounted) notify(context, '$e');
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = widget.api.user;
    final enabled = pricing?['checkoutEnabled'] == true && !ios;
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 100),
      children: [
        const Text(
          'Your shop.\nMore possibilities.',
          style: TextStyle(
            fontSize: 30,
            fontWeight: FontWeight.w800,
            height: 1.15,
          ),
        ),
        const SizedBox(height: 16),
        const Text('A connected home for your shop, listings and inquiries.'),
        if (error != null) Notice(error!, action: load),
        if (message != null) Notice(message!),
        if (ios)
          const Notice(
            'New shop subscription purchases are not available in this iOS release. Existing subscribed shop owners can manage listings and inquiries.',
          )
        else if (!enabled)
          const Notice(
            'Small single-branch shops start from ₹499/month. Payments are not open yet while Razorpay is being configured. Larger shops, extra branches and additional photo storage need an owner-approved quote.',
          ),
        if (user == null)
          Notice(
            'Create a shop-owner account to get started.',
            action: widget.onAccount,
            actionText: 'Login',
          )
        else if (user['role'] != 'merchant')
          const Notice(
            'Use a shop-owner account in this app. This account is for the public marketplace.',
          )
        else if (shops == null)
          const Center(child: CircularProgressIndicator())
        else ...[
          if (metrics != null)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceAround,
                  children: [
                    Column(
                      children: [
                        Text(
                          '${metrics!['active_listings']}',
                          style: const TextStyle(
                            fontSize: 24,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const Text('Active listings'),
                      ],
                    ),
                    Column(
                      children: [
                        Text(
                          '${metrics!['enquiries']}',
                          style: const TextStyle(
                            fontSize: 24,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const Text('Inquiries'),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ...shops!.map((s) {
            final subscription = s['subscription'];
            final active =
                subscription?['paid_until'] != null &&
                DateTime.parse(
                  subscription['paid_until'],
                ).isAfter(DateTime.now());
            return Card(
              child: Padding(
                padding: const EdgeInsets.all(22),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      s['name'],
                      style: const TextStyle(
                        fontSize: 23,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text('${s['category']} · ${s['branches']} branch(es)'),
                    Text(s['location']),
                    const SizedBox(height: 16),
                    Text(
                      active ? 'Subscription active' : 'Payment required',
                      style: TextStyle(
                        fontWeight: FontWeight.w700,
                        color: active ? Colors.green : Colors.orange.shade900,
                      ),
                    ),
                    if (subscription?['paid_until'] != null)
                      Text(
                        'Paid through ${subscription['paid_until'].toString().split('T').first}',
                      ),
                    const SizedBox(height: 16),
                    Wrap(
                      spacing: 12,
                      children: [
                        TextButton(
                          onPressed: () =>
                              editShop(Map<String, dynamic>.from(s)),
                          child: const Text('Edit shop'),
                        ),
                        TextButton(
                          onPressed: () =>
                              viewQuote(Map<String, dynamic>.from(s)),
                          child: const Text('View monthly quote'),
                        ),
                      ],
                    ),
                    if (active)
                      FilledButton(
                        onPressed: () async {
                          await Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => PublishPage(api: widget.api),
                            ),
                          );
                          await load();
                        },
                        child: const Text('Publish a listing'),
                      )
                    else if (!ios)
                      FilledButton(
                        onPressed: busy || !enabled
                            ? null
                            : () => pay(Map<String, dynamic>.from(s)),
                        child: Text(
                          busy ? 'Please wait…' : 'Continue to secure payment',
                        ),
                      ),
                    TextButton(
                      onPressed: load,
                      child: const Text('Refresh payment status'),
                    ),
                    if (subscription?['provider_id'] != null &&
                        ![
                          'cancelled',
                          'completed',
                          'expired',
                        ].contains(subscription['status']))
                      TextButton(
                        onPressed: () =>
                            cancel(Map<String, dynamic>.from(subscription)),
                        child: const Text('Cancel AutoPay'),
                      ),
                  ],
                ),
              ),
            );
          }),
          if (!ios && !shops!.any((s) => s['status'] == 'pending_payment'))
            Card(
              child: Padding(
                padding: const EdgeInsets.all(22),
                child: Form(
                  key: form,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Text(
                        'Register your shop',
                        style: TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 20),
                      field('Shop name', name, min: 2, max: 120),
                      DropdownButtonFormField<String>(
                        initialValue: category,
                        decoration: const InputDecoration(
                          labelText: 'Category',
                        ),
                        items: categories
                            .map(
                              (c) => DropdownMenuItem(value: c, child: Text(c)),
                            )
                            .toList(),
                        onChanged: (v) {
                          setState(() => category = v!);
                          quotePrice();
                        },
                      ),
                      const SizedBox(height: 16),
                      TextFormField(
                        controller: branches,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(
                          labelText: 'Number of branches',
                        ),
                        validator: (v) {
                          final n = int.tryParse(v ?? '');
                          return n == null || n < 1 || n > 100
                              ? 'Choose 1 to 100 branches'
                              : null;
                        },
                        onChanged: (_) => quotePrice(),
                      ),
                      const SizedBox(height: 16),
                      DropdownButtonFormField<String>(
                        initialValue: size,
                        decoration: const InputDecoration(
                          labelText: 'Shop size',
                        ),
                        items: ['small', 'medium', 'large']
                            .map(
                              (v) => DropdownMenuItem(value: v, child: Text(v)),
                            )
                            .toList(),
                        onChanged: (v) {
                          setState(() => size = v!);
                          quotePrice();
                        },
                      ),
                      const SizedBox(height: 16),
                      TextFormField(
                        controller: photos,
                        decoration: const InputDecoration(
                          labelText: 'Expected product photos',
                        ),
                        keyboardType: TextInputType.number,
                        validator: (v) {
                          final n = int.tryParse(v ?? '');
                          return n == null || n < 1 || n > 100000
                              ? 'Choose 1 to 100,000 photos'
                              : null;
                        },
                        onChanged: (_) => quotePrice(),
                      ),
                      const SizedBox(height: 16),
                      field('Location', location, min: 2, max: 180),
                      field(
                        'Shop phone',
                        phone,
                        keyboard: TextInputType.phone,
                        min: 7,
                        max: 30,
                      ),
                      field(
                        'About your shop',
                        description,
                        lines: 3,
                        max: 2000,
                        required: false,
                      ),
                      if (price != null)
                        Padding(
                          padding: const EdgeInsets.all(12),
                          child: Text(
                            price!['requiresReview'] == true
                                ? price!['message']
                                : 'Recurring subscription: ₹${price!['amountMinor'] / 100} / month. Review the exact amount and mandate in Razorpay before authorizing.',
                            style: const TextStyle(
                              height: 1.7,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      const Text(
                        'Your shop is published only after server-confirmed payment. AutoPay renews until canceled. See Terms for billing details.',
                        style: TextStyle(height: 1.7),
                      ),
                      const SizedBox(height: 20),
                      FilledButton(
                        onPressed: busy || price == null ? null : register,
                        child: Text(
                          busy
                              ? 'Please wait…'
                              : price?['requiresReview'] == true
                              ? 'Save shop & request a quote'
                              : enabled
                              ? 'Save shop & set up AutoPay'
                              : 'Save shop details',
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ],
    );
  }
}
