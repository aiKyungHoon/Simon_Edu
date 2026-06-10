import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'firebase_options.dart';
import 'screens/splash_screen.dart';
import 'core/push/push_notification_service.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
// import 'screens/home_screen.dart'; // Uncomment to test with the HomeScreen

@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  debugPrint("Handling a background message: ${message.messageId}");
}

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );
  FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);
  await PushNotificationService.instance.initialize();
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    // Light theme (Gold palette)
    final lightTheme = ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(
        seedColor: const Color(0xFFB8860B),
        primary: const Color(0xFFB8860B),
        secondary: const Color(0xFF926F15),
        surface: const Color(0xFFFCFCF7),
        background: const Color(0xFFFDF8E6),
        error: const Color(0xFFE11D48),
      ),
      scaffoldBackgroundColor: const Color(0xFFFDF8E6),
      cardColor: Colors.white,
      dividerColor: const Color(0x33B8860B),
      fontFamily: 'Apple SD Gothic Neo',
      fontFamilyFallback: const ['Malgun Gothic', 'sans-serif'],
      appBarTheme: const AppBarTheme(
        backgroundColor: Color(0xCCFDF8E6),
        elevation: 0,
        centerTitle: true,
        titleTextStyle: TextStyle(
          color: Color(0xFF3D341C),
          fontSize: 17,
          fontWeight: FontWeight.bold,
          fontFamily: 'Apple SD Gothic Neo',
        ),
        iconTheme: IconThemeData(color: Color(0xFF3D341C)),
      ),
      textTheme: const TextTheme(
        bodyLarge: TextStyle(color: Color(0xFF3D341C)),
        bodyMedium: TextStyle(color: Color(0xFF6B5C37)),
        titleLarge:
            TextStyle(color: Color(0xFF3D341C), fontWeight: FontWeight.bold),
        labelLarge: TextStyle(color: Color(0xFF96855B)),
      ),
    );

    // Dark theme – use same seed but dark brightness
    final darkTheme = ThemeData.dark().copyWith(
      colorScheme: ColorScheme.fromSeed(
        seedColor: const Color(0xFFB8860B),
        brightness: Brightness.dark,
      ),
      scaffoldBackgroundColor: const Color(0xFF1E1E1E),
      appBarTheme: const AppBarTheme(
        backgroundColor: Color(0xFF2C2C2C),
        elevation: 0,
        centerTitle: true,
        titleTextStyle: TextStyle(
          color: Colors.white,
          fontSize: 17,
          fontWeight: FontWeight.bold,
        ),
        iconTheme: IconThemeData(color: Colors.white),
      ),
    );

    return ScreenUtilInit(
      designSize: const Size(393, 852),
      minTextAdapt: true,
      splitScreenMode: true,
      builder: (context, child) {
        return MaterialApp(
          title: 'Simon Edu 말씀 암송',
          theme: lightTheme,
          darkTheme: darkTheme,
          themeMode: ThemeMode.system, // follow system setting
          debugShowCheckedModeBanner: false,
          home: const SplashScreen(),
        );
      },
    );
  }
}
