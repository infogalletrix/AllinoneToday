import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import '../production/api.dart';
import '../production/app.dart';
import 'demo_api.dart';

SemanticsHandle? _previewSemantics;

void runBrowserPreview({required bool business}) {
  if (!kIsWeb || !browserPreviewBuild || paymentTestBuild) {
    throw StateError('App previews are web-only, sample-data-only builds.');
  }
  WidgetsFlutterBinding.ensureInitialized();
  // Keep semantics on for keyboard navigation, screen readers and Chrome QA.
  _previewSemantics ??= SemanticsBinding.instance.ensureSemantics();
  runApp(BrowserPreview(business: business));
}

class BrowserPreview extends StatefulWidget {
  final bool business;
  const BrowserPreview({super.key, required this.business});
  @override
  State<BrowserPreview> createState() => _BrowserPreviewState();
}

class _BrowserPreviewState extends State<BrowserPreview> {
  late String mode;
  late DemoMarketplaceApi api;
  int revision = 0;

  @override
  void initState() {
    super.initState();
    mode = widget.business ? 'sample' : 'visitor';
    api = DemoMarketplaceApi(business: widget.business, mode: mode);
  }

  void reset([String? next]) {
    api.client.close();
    setState(() {
      mode = next ?? mode;
      api = DemoMarketplaceApi(business: widget.business, mode: mode);
      revision++;
    });
  }

  @override
  void dispose() {
    api.client.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => MarketplaceApp(
    key: ValueKey(revision),
    business: widget.business,
    api: api,
    previewFrame: (context, child) => Scaffold(
      backgroundColor: const Color(0xFFEAEEF2),
      body: SafeArea(
        child: Column(
          // Navigator routes block earlier painted semantics. Paint the
          // toolbar after the app, while keeping its visual position on top.
          verticalDirection: VerticalDirection.up,
          children: [
            Container(
              width: double.infinity,
              color: Colors.white,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              child: Column(
                children: [
                  Text(
                    widget.business
                        ? 'Business app · Chrome preview'
                        : 'Public app · Chrome preview',
                    style: const TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 4),
                  const Text(
                    'Sample data only · Nothing is saved or charged',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 12, color: Colors.black54),
                  ),
                  Wrap(
                    spacing: 12,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      ...(widget.business
                              ? {
                                  'sample': 'Sample shop',
                                  'new-shop': 'New shop',
                                  'payment': 'Payment required',
                                  'login': 'Login screen',
                                }
                              : {
                                  'visitor': 'Browse as visitor',
                                  'sample': 'Sample account',
                                })
                          .entries
                          .map(
                            (e) => TextButton(
                              onPressed: () => reset(e.key),
                              style: TextButton.styleFrom(
                                backgroundColor: mode == e.key
                                    ? const Color(0xFFFFE9E3)
                                    : null,
                                textStyle: const TextStyle(fontSize: 12),
                              ),
                              child: Text(e.value),
                            ),
                          ),
                      TextButton.icon(
                        onPressed: () => reset(),
                        icon: const Icon(Icons.restart_alt, size: 18),
                        label: const Text('Reset preview'),
                      ),
                    ],
                  ),
                  const Text(
                    'Use sample details, not real passwords. Google login and native Razorpay are not demonstrated here.',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 11, color: Colors.black54),
                  ),
                ],
              ),
            ),
            Expanded(
              child: LayoutBuilder(
                builder: (context, constraints) {
                  final desktop = constraints.maxWidth >= 600;
                  final width = desktop ? 430.0 : constraints.maxWidth;
                  final height = desktop
                      ? (constraints.maxHeight - 24).clamp(0.0, 850.0)
                      : constraints.maxHeight;
                  return Center(
                    child: Container(
                      width: width,
                      height: height,
                      clipBehavior: Clip.antiAlias,
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(desktop ? 24 : 0),
                        boxShadow: desktop
                            ? [
                                const BoxShadow(
                                  color: Color(0x26000000),
                                  blurRadius: 32,
                                  offset: Offset(0, 12),
                                ),
                              ]
                            : [],
                      ),
                      child: Semantics(
                        container: true,
                        explicitChildNodes: true,
                        child: MediaQuery(
                          data: MediaQuery.of(context).copyWith(
                            size: Size(width, height),
                            padding: EdgeInsets.zero,
                          ),
                          child: child!,
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
          ].reversed.toList(),
        ),
      ),
    ),
  );
}
