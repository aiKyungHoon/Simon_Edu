import 'package:flutter_test/flutter_test.dart';
import 'package:simon_edu/main.dart';
import 'package:simon_edu/screens/webview_screen.dart';

void main() {
  testWidgets('App startup smoke test', (WidgetTester tester) async {
    // Build our app and trigger a frame.
    await tester.pumpWidget(const MyApp());

    // Verify that the WebViewScreen is rendered and displays the app name
    expect(find.byType(WebViewScreen), findsOneWidget);
    expect(find.text('Simon Edu 말씀 암송'), findsOneWidget);
  });
}
