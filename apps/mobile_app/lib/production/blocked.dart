import 'package:flutter/material.dart';
import 'api.dart';

class BlockedAccounts extends StatefulWidget {
  final MarketplaceApi api;
  const BlockedAccounts({super.key, required this.api});
  @override
  State<BlockedAccounts> createState() => _BlockedState();
}

class _BlockedState extends State<BlockedAccounts> {
  List<dynamic>? accounts;
  String? error;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    try {
      final result = await widget.api.get('/blocks');
      if (mounted) setState(() => accounts = result);
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    }
  }

  Future<void> unblock(String id) async {
    try {
      await widget.api.send('DELETE', '/blocks/$id');
      await load();
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Blocked accounts')),
    body: accounts == null
        ? Center(
            child: error == null
                ? const CircularProgressIndicator()
                : Text(error!),
          )
        : ListView(
            padding: const EdgeInsets.all(20),
            children: [
              if (error != null) Text(error!),
              if (accounts!.isEmpty)
                const Text('You have not blocked any accounts.'),
              ...accounts!.map(
                (a) => ListTile(
                  title: Text(a['name']),
                  trailing: TextButton(
                    onPressed: () => unblock(a['blocked_id']),
                    child: const Text('Unblock'),
                  ),
                ),
              ),
            ],
          ),
  );
}
