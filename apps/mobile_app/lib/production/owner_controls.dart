import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'api.dart';

/// Full CMS controls inside the business app, with a short-lived one-use login
/// handoff. The persistent native access token is never sent in a URL or JS.
class OwnerControls extends StatefulWidget {
  final MarketplaceApi api;
  const OwnerControls({super.key, required this.api});
  @override
  State<OwnerControls> createState() => _OwnerControlsState();
}

class _OwnerControlsState extends State<OwnerControls> {
  WebViewController? controller;
  String? error;
  bool loading = true;
  @override
  void initState() {
    super.initState();
    open();
  }

  Future<void> open() async {
    try {
      final grant = await widget.api.post('/auth/web-handoff', {});
      final view = WebViewController()
        ..setJavaScriptMode(JavaScriptMode.unrestricted)
        ..setNavigationDelegate(
          NavigationDelegate(
            onPageFinished: (_) {
              if (mounted) setState(() => loading = false);
            },
            onWebResourceError: (event) {
              if (event.isForMainFrame == true && mounted) {
                setState(
                  () => error =
                      'The owner dashboard could not load. Please retry.',
                );
              }
            },
            onNavigationRequest: (event) {
              final uri = Uri.tryParse(event.url);
              if (uri != null &&
                  ['http', 'https'].contains(uri.scheme) &&
                  uri.origin == Uri.parse(platformUrl).origin) {
                return NavigationDecision.navigate;
              }
              if (uri != null && uri.scheme == 'https') {
                launchUrl(uri, mode: LaunchMode.externalApplication);
              }
              return NavigationDecision.prevent;
            },
          ),
        );
      await view.loadRequest(
        Uri.parse('$platformUrl/api/auth/web-handoff'),
        method: LoadRequestMethod.post,
        body: utf8.encode('code=${Uri.encodeQueryComponent(grant['code'])}'),
      );
      if (mounted) setState(() => controller = view);
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    }
  }

  @override
  Widget build(BuildContext context) {
    if (widget.api.user?['role'] != 'admin') {
      return const Center(child: Text('Product-owner access is required.'));
    }
    if (error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(error!),
              TextButton(
                onPressed: () {
                  setState(() {
                    error = null;
                    loading = true;
                  });
                  open();
                },
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
      );
    }
    return Stack(
      children: [
        if (controller != null) WebViewWidget(controller: controller!),
        if (loading) const Center(child: CircularProgressIndicator()),
      ],
    );
  }
}
