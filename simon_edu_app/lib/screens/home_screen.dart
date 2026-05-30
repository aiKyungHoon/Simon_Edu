import 'package:flutter/material.dart';

import '../core/push/push_notification_service.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text("Push Permission"),
      ),
      body: Center(
        child: ElevatedButton(
          onPressed: () async {
            final granted =
                await PushNotificationService
                    .instance
                    .requestPermission();

            if (!context.mounted) return;

            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(
                  granted
                      ? "권한 허용"
                      : "권한 거부",
                ),
              ),
            );
          },
          child: const Text(
            "푸시 권한 요청",
          ),
        ),
      ),
    );
  }
}
