import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'core/services/api_service.dart';
import 'core/theme/app_theme.dart';
import 'features/cart/cubit/cart_cubit.dart';
import 'features/explore/presentation/explore_screen.dart';
import 'features/home/presentation/home_screen.dart';
import 'features/home/presentation/widgets/figma_bottom_nav_bar.dart';
import 'features/messages/presentation/messages_screen.dart';
import 'features/notifications/presentation/notifications_screen.dart';
import 'features/products/cubit/products_cubit.dart';
import 'features/profile/presentation/profile_screen.dart';
import 'features/selling/presentation/selling_page_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  final apiService = ApiService();
  runApp(GalletrixMarketplaceApp(apiService: apiService));
}

class GalletrixMarketplaceApp extends StatelessWidget {
  final ApiService apiService;

  const GalletrixMarketplaceApp({super.key, required this.apiService});

  @override
  Widget build(BuildContext context) {
    return RepositoryProvider<ApiService>.value(
      value: apiService,
      child: MultiBlocProvider(
        providers: [
          BlocProvider<ProductsCubit>(
            create: (_) => ProductsCubit(apiService)..loadInitialData(),
          ),
          BlocProvider<CartCubit>(
            create: (_) => CartCubit(),
          ),
        ],
        child: MaterialApp(
          title: 'Galletrix Marketplace',
          debugShowCheckedModeBanner: false,
          theme: AppTheme.lightTheme,
          darkTheme: AppTheme.darkTheme,
          themeMode: ThemeMode.light,
          home: const MainNavigationScreen(),
        ),
      ),
    );
  }
}

class MainNavigationScreen extends StatefulWidget {
  const MainNavigationScreen({super.key});

  @override
  State<MainNavigationScreen> createState() => _MainNavigationScreenState();
}

class _MainNavigationScreenState extends State<MainNavigationScreen> {
  int _currentIndex = 0;
  String? _searchQueryForExplore;

  void _goToTab(int index) {
    setState(() => _currentIndex = index);
  }

  void _openSearchWithQuery(String query) {
    setState(() {
      _searchQueryForExplore = query;
      _currentIndex = 1;
    });
  }

  @override
  Widget build(BuildContext context) {
    final screens = [
      // Tab 0: Home Screen
      HomeScreen(
        onOpenCart: () => _goToTab(1),
        onOpenSearch: () {
          setState(() => _searchQueryForExplore = null);
          _goToTab(1);
        },
        onOpenSearchWithQuery: _openSearchWithQuery,
        onOpenProfile: () => _goToTab(4),
        onStartSelling: () => _goToTab(2),
        onOpenNotifications: () {
          Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => const NotificationsScreen()),
          );
        },
      ),
      // Tab 1: Explore Screen
      ExploreScreen(
        initialQuery: _searchQueryForExplore,
      ),
      // Tab 2: Selling Page / "Your Marketplace"
      const SellingPageScreen(),
      // Tab 3: Messages Screen
      const MessagesScreen(),
      // Tab 4: Account / Profile Screen
      const ProfileScreen(),
    ];

    return Scaffold(
      extendBody: true,
      body: IndexedStack(
        index: _currentIndex,
        children: screens,
      ),
      bottomNavigationBar: FigmaBottomNavBar(
        currentIndex: _currentIndex,
        onTabSelected: _goToTab,
        onAddPressed: () => _goToTab(2),
      ),
    );
  }
}
