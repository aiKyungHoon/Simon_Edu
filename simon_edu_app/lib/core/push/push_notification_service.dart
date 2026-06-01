import 'dart:async';
import 'dart:io';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';

class PushNotificationService {
  PushNotificationService._();

  static final instance = PushNotificationService._();

  final FirebaseMessaging _messaging = FirebaseMessaging.instance;
  String? token;

  final StreamController<String?> _tokenController = StreamController<String?>.broadcast();
  Stream<String?> get onTokenRefresh => _tokenController.stream;

  Future<void> initialize() async {
    try {
      await requestPermission();
      token = await _messaging.getToken();
      debugPrint('FCM Token: $token');
    } catch (e) {
      debugPrint('Error initializing Firebase Messaging: $e');
    }

    _messaging.onTokenRefresh.listen((newToken) {
      token = newToken;
      _tokenController.add(newToken);
    });

    FirebaseMessaging.onMessage.listen((RemoteMessage message) {
      debugPrint(
        'Foreground Message : ${message.notification?.title}',
      );
    });

    FirebaseMessaging.onMessageOpenedApp.listen(
      (RemoteMessage message) {
        debugPrint(
          'Notification Clicked : ${message.data}',
        );
      },
    );
  }

  Future<bool> requestPermission() async {
    if (Platform.isIOS) {
      NotificationSettings settings =
          await _messaging.requestPermission(
        alert: true,
        badge: true,
        sound: true,
        provisional: false,
      );

      return settings.authorizationStatus ==
          AuthorizationStatus.authorized ||
          settings.authorizationStatus ==
          AuthorizationStatus.provisional;
    }

    if (Platform.isAndroid) {
      final status = await Permission.notification.request();

      return status.isGranted;
    }

    return false;
  }

  Future<AuthorizationStatus> getPermissionStatus() async {
    final settings =
        await _messaging.getNotificationSettings();

    return settings.authorizationStatus;
  }

  Future<void> openSetting() async {
    await openAppSettings();
  }
}
