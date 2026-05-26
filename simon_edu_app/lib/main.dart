import 'package:flutter/material.dart';
import 'screens/webview_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    // Custom Gold/Beige Light Theme color palette
    final goldTheme = ThemeData(
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
        titleLarge: TextStyle(color: Color(0xFF3D341C), fontWeight: FontWeight.bold),
        labelLarge: TextStyle(color: Color(0xFF96855B)),
      ),
    );

    return MaterialApp(
      title: 'Simon Edu 말씀 암송',
      theme: goldTheme,
      debugShowCheckedModeBanner: false,
      home: const WebViewScreen(),
    );
  }
}
