import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter/foundation.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:vibration/vibration.dart';
import 'package:app_links/app_links.dart';
import 'dart:async';
import 'intro_overlay.dart';

class WebViewScreen extends StatefulWidget {
  const WebViewScreen({super.key});

  @override
  State<WebViewScreen> createState() => _WebViewScreenState();
}

class _WebViewScreenState extends State<WebViewScreen> {
  WebViewController? _controller;
  late final AppLinks _appLinks;
  StreamSubscription<Uri>? _linkSubscription;
  String? _pendingDeepLink;
  bool _isPageFinished = false;
  bool _isLoading = true;
  double _loadingProgress = 0.0;
  bool _canGoBack = false;
  bool _canGoForward = false;
  bool _showIntro = true;
  bool _introVisible = true;

  final String _targetUrl = 'https://simon-edu-bible-game.web.app';

  @override
  void initState() {
    super.initState();
    
    // Only initialize WebView controller on native mobile platforms (Android/iOS)
    if (!kIsWeb) {
      _appLinks = AppLinks();
      _controller = WebViewController()
        ..setJavaScriptMode(JavaScriptMode.unrestricted)
        ..setBackgroundColor(const Color(0xFFFDF8E6))
        ..setNavigationDelegate(
          NavigationDelegate(
            onProgress: (int progress) {
              setState(() {
                _loadingProgress = progress / 100.0;
              });
            },
            onPageStarted: (String url) {
              _isPageFinished = false;
              setState(() {
                _isLoading = true;
                _loadingProgress = 0.0;
              });
            },
            onPageFinished: (String url) {
              setState(() {
                _isLoading = false;
                _introVisible = false; // Start intro fade-out
              });
              _updateNavigationState();
              _injectJavaScriptBridge();
              _isPageFinished = true;
              if (_pendingDeepLink != null) {
                final link = _pendingDeepLink!;
                _pendingDeepLink = null;
                Future.delayed(const Duration(milliseconds: 500), () {
                  if (mounted && _controller != null) {
                    debugPrint('Executing pending deep link JS: $link');
                    _controller!.runJavaScript('if (window.handleDeepLink) { window.handleDeepLink("$link"); }');
                  }
                });
              }
            },
            onWebResourceError: (WebResourceError error) {
              debugPrint('WebView Resource Error: ${error.description}');
            },
          ),
        )
        ..addJavaScriptChannel(
          'Vibration',
          onMessageReceived: (JavaScriptMessage message) {
            _handleVibration(message.message);
          },
        )
        ..addJavaScriptChannel(
          'ConsoleLog',
          onMessageReceived: (JavaScriptMessage message) {
            debugPrint('[WebView Console] ${message.message}');
          },
        )
        ..loadRequest(Uri.parse(_targetUrl));

      _initDeepLinking();
    } else {
      // For Web platform (Chrome)
      _isLoading = false;
      _showIntro = false;
      _introVisible = false;
    }
  }

  @override
  void dispose() {
    if (!kIsWeb) {
      _linkSubscription?.cancel();
    }
    super.dispose();
  }

  Future<void> _initDeepLinking() async {
    if (kIsWeb) return;

    // Listen to incoming deep links (app running in foreground/background)
    _linkSubscription = _appLinks.uriLinkStream.listen((uri) {
      debugPrint('Incoming deep link in stream: $uri');
      _handleIncomingLink(uri);
    }, onError: (err) {
      debugPrint('Deep link stream error: $err');
    });

    // Check for initial deep link (app opened from closed state)
    try {
      final initialUri = await _appLinks.getInitialLink();
      if (initialUri != null) {
        debugPrint('Initial deep link received: $initialUri');
        _handleIncomingLink(initialUri);
      }
    } catch (e) {
      debugPrint('Error getting initial deep link: $e');
    }
  }

  void _handleIncomingLink(Uri uri) {
    final String linkStr = uri.toString();
    if (_isPageFinished && _controller != null) {
      debugPrint('Executing handleDeepLink JS directly: $linkStr');
      _controller!.runJavaScript('if (window.handleDeepLink) { window.handleDeepLink("$linkStr"); }');
    } else {
      debugPrint('Page not loaded. Saving pending deep link: $linkStr');
      _pendingDeepLink = linkStr;
    }
  }

  // Update navigation history state
  Future<void> _updateNavigationState() async {
    if (_controller == null) return;
    final canBack = await _controller!.canGoBack();
    final canForward = await _controller!.canGoForward();
    if (mounted) {
      setState(() {
        _canGoBack = canBack;
        _canGoForward = canForward;
      });
    }
  }

  // Inject JS to override console.log and bind playConfetti/triggerQuizFail events to Flutter
  void _injectJavaScriptBridge() {
    if (_controller == null) return;
    _controller!.runJavaScript('''
      // 1. Console Log Bridge
      (function() {
        var oldLog = console.log;
        console.log = function() {
          var args = Array.prototype.slice.call(arguments).join(' ');
          oldLog.apply(console, arguments);
          if (window.ConsoleLog) {
            window.ConsoleLog.postMessage(args);
          }
        };
        var oldError = console.error;
        console.error = function() {
          var args = Array.prototype.slice.call(arguments).join(' ');
          oldError.apply(console, arguments);
          if (window.ConsoleLog) {
            window.ConsoleLog.postMessage("ERROR: " + args);
          }
        };
        console.log("Console bridge initialized.");
      })();

      // 2. PlayConfetti & QuizFail Hooking
      (function() {
        var checkInterval = setInterval(function() {
          if (window.app) {
            clearInterval(checkInterval);
            
            // Hook playConfetti
            var originalConfetti = window.app.playConfetti;
            window.app.playConfetti = function(type) {
              if (originalConfetti) {
                originalConfetti.apply(window.app, arguments);
              }
              if (window.Vibration) {
                window.Vibration.postMessage(type);
              }
            };
            
            // Hook triggerQuizFail
            var originalFail = window.app.triggerQuizFail;
            window.app.triggerQuizFail = function(reason) {
              if (originalFail) {
                originalFail.apply(window.app, arguments);
              }
              if (window.Vibration) {
                window.Vibration.postMessage("fail");
              }
            };
            console.log("PlayConfetti and triggerQuizFail hooks attached successfully.");
          }
        }, 300);
      })();
    ''');
  }

  // Handle native haptic feedback based on web view event type
  void _handleVibration(String type) async {
    final hasVibrator = await Vibration.hasVibrator();
    if (hasVibrator != true) return;

    if (type == 'quiz') {
      // Quiz success: three short pulses
      Vibration.vibrate(pattern: [0, 100, 100, 100, 100, 150]);
    } else if (type == 'checkin' || type == 'signup') {
      // Checkin success: one medium pulse
      Vibration.vibrate(duration: 300);
    } else if (type == 'fail') {
      // Quiz failure: one long pulse
      Vibration.vibrate(duration: 800);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    // Render Web Platform Mock View if running on Web (Chrome)
    if (kIsWeb) {
      return Scaffold(
        appBar: AppBar(
          title: const Text("Simon Edu 말씀 암송 (웹 테스트)"),
        ),
        body: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24.0),
            child: Container(
              constraints: const BoxConstraints(maxWidth: 480),
              padding: const EdgeInsets.all(32),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(24),
                border: Border.all(color: const Color(0x33B8860B)),
                boxShadow: const [
                  BoxShadow(
                    color: Color(0x0A3D341C),
                    blurRadius: 20,
                    offset: Offset(0, 10),
                  )
                ],
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Icon(
                    Icons.mobile_friendly_rounded,
                    size: 64,
                    color: Color(0xFFB8860B),
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    "하이브리드 모바일 앱 안내",
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF3D341C),
                    ),
                  ),
                  const SizedBox(height: 12),
                  const Text(
                    "모바일 기기 내부 브라우저 엔진(WebView) 및 햅틱 진동 피드백은 안드로이드 또는 iOS 기기/에뮬레이터 환경에서 온전히 실행됩니다.\n\n"
                    "현재 테스트 중인 웹 브라우저(Chrome) 환경에서는 패키지 보안 및 호환성으로 인해 웹뷰 로드가 제한됩니다.",
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 13,
                      height: 1.6,
                      color: Color(0xFF6B5C37),
                    ),
                  ),
                  const SizedBox(height: 24),
                  ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: theme.colorScheme.primary,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10),
                      ),
                      elevation: 0,
                    ),
                    icon: const Icon(Icons.open_in_browser),
                    label: const Text("암송 웹 서비스 바로가기"),
                    onPressed: () {
                      // Show alert with URL or copy
                      Clipboard.setData(ClipboardData(text: _targetUrl));
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text("웹 링크가 복사되었습니다. 브라우저에서 바로 여실 수 있습니다."),
                          backgroundColor: Color(0xFFB8860B),
                        ),
                      );
                    },
                  ),
                  const SizedBox(height: 12),
                  const Divider(color: Color(0x1F96855B)),
                  const SizedBox(height: 12),
                  const Text(
                    "💡 실제 모바일 앱의 햅틱 진동 및 새로고침 앱바를 포함하여 완벽하게 테스트하려면 iOS 시뮬레이터 또는 안드로이드 기기를 연결한 뒤 구동해 주세요:\n"
                    "• flutter run -d iphonesimulator (iOS)\n"
                    "• flutter run -d android (AOS)",
                    style: TextStyle(
                      fontSize: 11,
                      height: 1.5,
                      color: Color(0xFF96855B),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    }

    return Stack(
      children: [
        Scaffold(
          backgroundColor: const Color(0xFFFDF8E6),
          body: SafeArea(
            bottom: false,
            child: Stack(
              children: [
                if (_controller != null) WebViewWidget(controller: _controller!),
                
                // Linear progress bar for loading
                if (_isLoading)
                  Positioned(
                    top: 0,
                    left: 0,
                    right: 0,
                    child: LinearProgressIndicator(
                      value: _loadingProgress > 0.0 ? _loadingProgress : null,
                      color: theme.colorScheme.primary,
                      backgroundColor: const Color(0xFFFDF8E6),
                      minHeight: 3,
                    ),
                  ),
              ],
            ),
          ),
        ),
        if (_showIntro)
          Positioned.fill(
            child: IntroOverlay(
              visible: _introVisible,
              onFadeOutComplete: () {
                setState(() {
                  _showIntro = false;
                });
              },
            ),
          ),
      ],
    );
  }
}
