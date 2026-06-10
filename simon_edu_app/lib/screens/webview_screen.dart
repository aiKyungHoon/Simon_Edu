import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter/foundation.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:vibration/vibration.dart';
import 'package:app_links/app_links.dart';
import 'package:permission_handler/permission_handler.dart';
import 'dart:async';
import 'dart:convert';
import 'intro_overlay.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import '../core/push/push_notification_service.dart';

class WebViewScreen extends StatefulWidget {
  const WebViewScreen({super.key});

  @override
  State<WebViewScreen> createState() => _WebViewScreenState();
}

class _WebViewScreenState extends State<WebViewScreen>
    with WidgetsBindingObserver {
  WebViewController? _controller;
  late final AppLinks _appLinks;
  StreamSubscription<Uri>? _linkSubscription;
  String? _pendingDeepLink;
  bool _isPageFinished = false;
  bool _isLoading = true;
  double _loadingProgress = 0.0;
  bool _canGoBack = false;
  bool _canGoForward = false;
  bool _showIntro = false;
  bool _introVisible = false;
  bool _videoCompleted = false;
  int _currentIndex = 0;
  int _unreadNotificationsCount = 0;
  bool _isLoggedIn = false;
  bool _hideBottomNav = false;
  String _appVersion = '';
  String? _fcmToken;
  DateTime? _lastPressedAt;
  String _currentWebView = 'dashboard';

  // Native Settings Profile State
  String _userName = '';
  String _userEmail = '';
  int _userPoints = 0;
  bool _pushEnabled = false;
  bool _marketingPushEnabled = false;
  bool _isNotificationPermissionGranted = true;
  bool _isProfileLoading = true;
  List<dynamic> _pointsHistory = [];

  static const String _appWebVersion = '1.5.13';
  final String _targetUrl = kDebugMode
      ? 'http://localhost:8080?platform=app&app_v=$_appWebVersion'
      : 'https://simon-edu-bible-game.firebaseapp.com?platform=app&app_v=$_appWebVersion';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _loadAppVersion();
    _initFcmToken();

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
            onPageFinished: _handlePageFinished,
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
        ..addJavaScriptChannel(
          'MobileAppChannel',
          onMessageReceived: (JavaScriptMessage message) {
            _handleMobileAppMessage(message.message);
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
    WidgetsBinding.instance.removeObserver(this);
    if (!kIsWeb) {
      _linkSubscription?.cancel();
    }
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && _isLoggedIn) {
      _checkAndSendNotificationPermission().then((_) => _syncUserProfile());
    }
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
      _controller!.runJavaScript(
          'if (window.handleDeepLink) { window.handleDeepLink("$linkStr"); }');
    } else {
      debugPrint('Page not loaded. Saving pending deep link: $linkStr');
      _pendingDeepLink = linkStr;
    }
  }

  void _handlePageFinished(String url) {
    try {
      if (!mounted) return;

      setState(() {
        _isLoading = false;
      });
      _isPageFinished = true;
      _checkIntroFinished();
      unawaited(_updateNavigationState().catchError((Object error) {
        debugPrint('Error updating WebView navigation state: $error');
      }));
      _injectJavaScriptBridge();
      if (_fcmToken != null) {
        _syncTokenToWebView(_fcmToken);
      }
      _syncPlatformToWebView();

      // Synchronize auth state and active view state after page finish.
      unawaited(_controller?.runJavaScript('''
        (function() {
          if (window.app && window.app.currentUser && window.MobileAppChannel) {
            window.MobileAppChannel.postMessage(JSON.stringify({
              event: 'login',
              role: window.app.currentUser.role || 'user'
            }));
            var activeView = document.querySelector('.view-container.active');
            if (activeView) {
              window.MobileAppChannel.postMessage(JSON.stringify({
                event: 'view_changed',
                view: activeView.id.replace('View', '')
              }));
            }
          }
        })();
      ''').catchError((Object error) {
        debugPrint('Error syncing WebView page-finished state: $error');
      }));

      if (_pendingDeepLink != null) {
        final link = _pendingDeepLink!;
        _pendingDeepLink = null;
        Future.delayed(const Duration(milliseconds: 500), () {
          if (mounted && _controller != null) {
            debugPrint('Executing pending deep link JS: $link');
            unawaited(_controller!.runJavaScript(
                'if (window.handleDeepLink) { window.handleDeepLink(${jsonEncode(link)}); }'));
          }
        });
      }
    } catch (error, stackTrace) {
      debugPrint('Error handling WebView page finish for $url: $error');
      debugPrintStack(stackTrace: stackTrace);
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

            // Sync auth state and view state to Flutter once window.app is ready
            if (window.app.currentUser && window.MobileAppChannel) {
              window.MobileAppChannel.postMessage(JSON.stringify({
                event: 'login',
                role: window.app.currentUser.role || 'user'
              }));
              var activeView = document.querySelector('.view-container.active');
              if (activeView) {
                window.MobileAppChannel.postMessage(JSON.stringify({
                  event: 'view_changed',
                  view: activeView.id.replace('View', '')
                }));
              }
            }
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

  void _handleMobileAppMessage(String jsonStr) {
    try {
      final Map<String, dynamic> data = json.decode(jsonStr);
      final event = data['event'];
      if (event == 'login') {
        setState(() {
          _isLoggedIn = true;
        });
        if (_fcmToken != null) {
          _syncTokenToWebView(_fcmToken);
        }
        _syncPlatformToWebView();
        _syncUserProfile();
      } else if (event == 'logout') {
        setState(() {
          _isLoggedIn = false;
          _currentIndex = 0;
          _hideBottomNav = false;
        });
      } else if (event == 'view_changed') {
        final view = data['view'] as String?;
        _currentWebView = view ?? 'dashboard';
        int newIndex = _currentIndex;
        final shouldHideBottomNav = view == 'game' || 
                                    view == 'exam' || 
                                    view == 'journeyChapterDetail' || 
                                    view == 'journeyVerseStudy' || 
                                    view == 'journeyResult' ||
                                    view == 'eventDetail' ||
                                    view == 'noticeDetail';
        if (view == 'dashboard' || view == 'events' || view == 'eventDetail' || view == 'noticeDetail') {
          newIndex = 0;
        } else if (view == 'journey' || 
                   view == 'journeyChapterDetail' || 
                   view == 'journeyVerseStudy' || 
                   view == 'journeyResult') {
          newIndex = 1;
        } else if (view == 'ranking') {
          newIndex = 2;
        } else if (view == 'notifications') {
          newIndex = 3;
        } else if (view == 'settings') {
          newIndex = 4;
        }
        if (newIndex != _currentIndex ||
            shouldHideBottomNav != _hideBottomNav) {
          setState(() {
            _currentIndex = newIndex;
            _hideBottomNav = shouldHideBottomNav;
            if (newIndex == 4) {
              _isProfileLoading = true;
            }
          });
          if (newIndex == 4) {
            _syncUserProfile();
          }
        }
      } else if (event == 'check_device_permission') {
        _checkAndSendNotificationPermission().then((_) => _syncUserProfile());
      } else if (event == 'request_device_permission') {
        _requestNotificationPermission().then((_) => _syncUserProfile());
      } else if (event == 'toast') {
        final message = data['message'] ?? '';
        if (message.isNotEmpty) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Row(
                children: [
                  const Icon(Icons.check_circle_outline_rounded,
                      color: Colors.white),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      message,
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                        fontSize: 14,
                      ),
                    ),
                  ),
                ],
              ),
              backgroundColor: const Color(0xFF10B981), // Emerald green
              behavior: SnackBarBehavior.floating,
              elevation: 6,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
              duration: const Duration(seconds: 3),
            ),
          );
        }
      }
    } catch (e) {
      debugPrint('Error parsing MobileAppChannel message: $e');
    }
  }

  void _switchWebViewTab(int index) {
    if (_controller == null || !_isLoggedIn) return;

    // Light haptic feedback
    HapticFeedback.lightImpact();

    setState(() {
      _currentIndex = index;
      if (index == 4) {
        _isProfileLoading = true;
      }
    });

    String viewName = 'dashboard';
    if (index == 1) {
      viewName = 'journey';
    } else if (index == 2) {
      viewName = 'ranking';
    } else if (index == 3) {
      viewName = 'notifications';
    } else if (index == 4) {
      viewName = 'settings';
    }

    _controller!.runJavaScript(
        'if (window.app && window.app.switchView) { window.app.switchView("$viewName"); }');

    if (index == 4) {
      _syncUserProfile();
    }
  }

  void _openEventsFromSettings() {
    if (_controller == null || !_isLoggedIn) return;
    HapticFeedback.lightImpact();
    setState(() {
      _currentIndex = 0;
      _hideBottomNav = false;
    });
    _controller!.runJavaScript(
        'if (window.app && window.app.switchView) { window.app.switchView("events"); }');
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

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) async {
        if (didPop) return;
        await _handleBackNavigation();
      },
      child: Stack(
        children: [
          Scaffold(
            backgroundColor: const Color(0xFFFDF8E6),
            body: SafeArea(
              bottom: false,
              child: Column(
                children: [
                  Expanded(
                    child: Stack(
                      children: [
                        Offstage(
                          offstage: _isLoggedIn && _currentIndex == 4,
                          child: _controller != null
                              ? WebViewWidget(controller: _controller!)
                              : const SizedBox(),
                        ),

                        if (_isLoggedIn && _currentIndex == 4)
                          NativeSettingsView(
                            userName: _userName,
                            userEmail: _userEmail,
                            userPoints: _userPoints,
                            pushEnabled: _pushEnabled,
                            marketingPushEnabled: _marketingPushEnabled,
                            isPermissionGranted: _isNotificationPermissionGranted,
                            isLoading: _isProfileLoading,
                            version: _appVersion.isEmpty ? '1.4.2' : _appVersion,
                            fcmToken: _fcmToken,
                            pointsHistory: _pointsHistory,
                            onLogout: () {
                              _controller?.runJavaScript(
                                  'if (window.app && window.app.logout) { window.app.logout(); }');
                            },
                            onWithdraw: () {
                              _controller?.runJavaScript(
                                  'if (window.app && window.app.withdrawAccount) { window.app.withdrawAccount(); }');
                            },
                            onPushChanged: _togglePushSetting,
                            onMarketingChanged: _toggleMarketingSetting,
                            onRequestPermission: () {
                              _requestNotificationPermission()
                                  .then((_) => _syncUserProfile());
                            },
                            onOpenEvents: _openEventsFromSettings,
                          ),

                        // Linear progress bar for loading
                        if (_isLoading && _currentIndex != 4)
                          Positioned(
                            top: 0,
                            left: 0,
                            right: 0,
                            child: LinearProgressIndicator(
                              value: _loadingProgress > 0.0
                                  ? _loadingProgress
                                  : null,
                              color: theme.colorScheme.primary,
                              backgroundColor: const Color(0xFFFDF8E6),
                              minHeight: 3,
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            bottomNavigationBar: _isLoggedIn && !_hideBottomNav
                ? BottomNavigationBar(
                    currentIndex: _currentIndex,
                    onTap: _switchWebViewTab,
                    backgroundColor: const Color(0xFFFDF8E6),
                    selectedItemColor: const Color(0xFFB8860B),
                    unselectedItemColor: const Color(0xFF96855B),
                    selectedLabelStyle: const TextStyle(
                        fontWeight: FontWeight.bold, fontSize: 12),
                    unselectedLabelStyle: const TextStyle(
                        fontWeight: FontWeight.w500, fontSize: 11),
                    elevation: 8,
                    type: BottomNavigationBarType.fixed,
                    items: [
                      const BottomNavigationBarItem(
                        icon: Icon(Icons.menu_book_rounded),
                        activeIcon: Icon(Icons.menu_book_rounded),
                        label: '오늘의 말씀',
                      ),
                      const BottomNavigationBarItem(
                        icon: Icon(Icons.map_rounded),
                        activeIcon: Icon(Icons.map_rounded),
                        label: '성경여정',
                      ),
                      const BottomNavigationBarItem(
                        icon: Icon(Icons.emoji_events_rounded),
                        activeIcon: Icon(Icons.emoji_events_rounded),
                        label: '명예의 전당',
                      ),
                      BottomNavigationBarItem(
                        icon: _unreadNotificationsCount > 0
                            ? Badge.count(
                                count: _unreadNotificationsCount,
                                child: const Icon(Icons.notifications_rounded),
                              )
                            : const Icon(Icons.notifications_rounded),
                        activeIcon: _unreadNotificationsCount > 0
                            ? Badge.count(
                                count: _unreadNotificationsCount,
                                child: const Icon(Icons.notifications_rounded),
                              )
                            : const Icon(Icons.notifications_rounded),
                        label: '알림센터',
                      ),
                      const BottomNavigationBarItem(
                        icon: Icon(Icons.settings_rounded),
                        activeIcon: Icon(Icons.settings_rounded),
                        label: '설정',
                      ),
                    ],
                  )
                : null,
          ),
          if (_showIntro)
            Positioned.fill(
              child: IntroOverlay(
                visible: _introVisible,
                isPageLoaded: _isPageFinished,
                onFadeOutComplete: () {
                  if (mounted) {
                    setState(() {
                      _showIntro = false;
                    });
                  }
                },
                onSkip: () {
                  if (mounted) {
                    if (_isPageFinished) {
                      setState(() {
                        _introVisible = false;
                      });
                    } else {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text("앱을 불러오는 중입니다. 잠시만 기다려주세요."),
                          duration: Duration(milliseconds: 1500),
                          backgroundColor: Color(0xFFB8860B),
                        ),
                      );
                    }
                  }
                },
                onVideoCompleted: () {
                  if (mounted) {
                    // Wait for 2.0 seconds so the user can see the final branding scene (children & logo) before fading out
                    Future.delayed(const Duration(milliseconds: 2000), () {
                      if (mounted) {
                        setState(() {
                          _videoCompleted = true;
                        });
                        _checkIntroFinished();
                      }
                    });
                  }
                },
              ),
            ),
        ],
      ),
    );
  }

  void _checkIntroFinished() {
    if (_isPageFinished && _videoCompleted) {
      if (mounted) {
        setState(() {
          _introVisible = false;
        });
      }
    }
  }

  Future<void> _handleBackNavigation() async {
    if (_controller == null) {
      Navigator.of(context).pop();
      return;
    }

    try {
      final result = await _controller!.runJavaScriptReturningResult(
        'window.app ? window.app.handleBackNavigation() : "tab_screen"'
      );
      final String resultStr = result.toString().replaceAll('"', '').trim();

      if (resultStr == 'modal_closed' || resultStr == 'navigated' || resultStr == 'confirmation_opened') {
        // WebView back navigation handled successfully
        return;
      }
    } catch (e) {
      debugPrint('Error running handleBackNavigation: $e');
    }

    // Double-back-to-exit logic for Tab views on Android
    final now = DateTime.now();
    if (_lastPressedAt == null || now.difference(_lastPressedAt!) > const Duration(seconds: 3)) {
      _lastPressedAt = now;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: const Text(
            '한 번 더 누르면 종료됩니다.',
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.white, fontSize: 14),
          ),
          backgroundColor: Colors.black.withOpacity(0.7),
          behavior: SnackBarBehavior.floating,
          width: 220,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(20),
          ),
          duration: const Duration(seconds: 2),
        ),
      );
    } else {
      SystemNavigator.pop();
    }
  }

  Future<void> _loadAppVersion() async {
    try {
      final packageInfo = await PackageInfo.fromPlatform();
      if (mounted) {
        setState(() {
          _appVersion = packageInfo.version;
        });
      }
    } catch (e) {
      debugPrint('Error getting package info: $e');
    }
  }

  Future<void> _syncUserProfile() async {
    if (_controller == null || !_isLoggedIn) return;
    try {
      final result = await _controller!.runJavaScriptReturningResult('''
        (function() {
          if (window.app && window.app.currentUser) {
            return JSON.stringify({
              name: window.app.currentUser.name || '',
              email: window.app.currentUser.email || '',
              points: window.app.currentUser.points || 0,
              pushEnabled: window.app.currentUser.pushEnabled !== false,
              marketingPushEnabled: !!window.app.currentUser.marketingPushEnabled,
              pointsHistory: window.app.currentUser.pointsHistory || [],
              unreadNotificationsCount: window.app.currentUser.notifications ? window.app.currentUser.notifications.filter(function(n) { return !(n.isRead || n.read); }).length : 0
            });
          }
          return '{}';
        })()
      ''');

      String jsonStr = result.toString();
      if (jsonStr.startsWith('"') && jsonStr.endsWith('"')) {
        try {
          jsonStr = json.decode(jsonStr);
        } catch (_) {}
      }

      final Map<String, dynamic> data = json.decode(jsonStr);
      if (data.isNotEmpty && mounted) {
        final status = await Permission.notification.status;
        setState(() {
          _userName = data['name'] ?? '';
          _userEmail = data['email'] ?? '';
          _userPoints = data['points'] ?? 0;
          _pushEnabled = data['pushEnabled'] ?? false;
          _marketingPushEnabled = data['marketingPushEnabled'] ?? false;
          _pointsHistory = data['pointsHistory'] ?? [];
          _unreadNotificationsCount = data['unreadNotificationsCount'] ?? 0;
          _isNotificationPermissionGranted =
              status.isGranted || status.isProvisional;
          _isProfileLoading = false;
        });
      }
    } catch (e) {
      debugPrint('Error syncing user profile: $e');
    }
  }

  Future<void> _togglePushSetting(bool value) async {
    if (_controller == null) return;

    if (value) {
      final status = await Permission.notification.status;
      if (!status.isGranted && !status.isProvisional) {
        await _requestNotificationPermission();
        final afterStatus = await Permission.notification.status;
        if (!afterStatus.isGranted && !afterStatus.isProvisional) {
          // If permission is still not granted, do not enable the toggle
          return;
        }
      }
    }

    setState(() {
      _pushEnabled = value;
      if (!value) {
        _marketingPushEnabled = false;
      }
    });

    await _controller!.runJavaScript('''
      (function() {
        if (window.app) {
          var togglePush = document.getElementById('togglePush');
          if (togglePush) {
            togglePush.checked = $value;
            window.app.togglePushSetting();
          }
        }
      })()
    ''');

    Future.delayed(const Duration(milliseconds: 300), _syncUserProfile);
  }

  Future<void> _toggleMarketingSetting(bool value) async {
    if (_controller == null) return;

    if (value) {
      if (!mounted) return;
      showDialog(
        context: context,
        builder: (BuildContext context) {
          return AlertDialog(
            backgroundColor: const Color(0xFFFCFCF7),
            surfaceTintColor: Colors.transparent,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
              side: const BorderSide(color: Color(0x33B8860B)),
            ),
            title: const Text(
              '마케팅 정보 수신 동의',
              style: TextStyle(
                color: Color(0xFF3D341C),
                fontWeight: FontWeight.bold,
              ),
            ),
            content: const Text(
              '이벤트 및 푸시 마케팅 알림 수신에 동의하십니까?\n\n'
              '동의하시면 Simon Edu 말씀 암송 서비스에서 제공하는 다양한 혜택과 이벤트 소식을 푸시 알림으로 받아보실 수 있습니다.',
              style: TextStyle(
                color: Color(0xFF6B5C37),
                fontSize: 14,
                height: 1.5,
              ),
            ),
            actions: [
              TextButton(
                onPressed: () async {
                  Navigator.of(context).pop();
                  await _controller!.runJavaScript(
                      'if (window.app) { window.app.acceptMarketingConsent(true); }');
                  _syncUserProfile();
                },
                child: const Text(
                  '동의함',
                  style: TextStyle(
                    color: Color(0xFFB8860B),
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
              TextButton(
                onPressed: () async {
                  Navigator.of(context).pop();
                  await _controller!.runJavaScript(
                      'if (window.app) { window.app.acceptMarketingConsent(false); }');
                  _syncUserProfile();
                },
                child: const Text(
                  '동의 안 함',
                  style: TextStyle(
                    color: Color(0xFFEF4444),
                  ),
                ),
              ),
            ],
          );
        },
      );
    } else {
      setState(() {
        _marketingPushEnabled = false;
      });
      await _controller!.runJavaScript('''
        (function() {
          if (window.app) {
            var toggle = document.getElementById('toggleMarketingPush');
            if (toggle) {
              toggle.checked = false;
            }
            window.app.toggleMarketingPushSetting();
          }
        })()
      ''');
      Future.delayed(const Duration(milliseconds: 300), _syncUserProfile);
    }
  }

  Future<void> _checkAndSendNotificationPermission() async {
    final status = await Permission.notification.status;
    _sendDevicePermissionStatus(status.isGranted || status.isProvisional);
  }

  Future<void> _requestNotificationPermission() async {
    final status = await Permission.notification.status;
    if (status.isPermanentlyDenied) {
      if (!mounted) return;
      await showDialog(
        context: context,
        builder: (BuildContext context) {
          return AlertDialog(
            backgroundColor: const Color(0xFFFCFCF7),
            surfaceTintColor: Colors.transparent,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
              side: const BorderSide(color: Color(0x33B8860B)),
            ),
            title: const Text(
              '알림 권한 설정 필요',
              style: TextStyle(
                color: Color(0xFF3D341C),
                fontWeight: FontWeight.bold,
              ),
            ),
            content: const Text(
              '기기 설정에서 Simon Edu의 알림 권한을 허용해 주셔야 알림을 받으실 수 있습니다. 설정 화면으로 이동하시겠습니까?',
              style: TextStyle(
                color: Color(0xFF6B5C37),
                fontSize: 14,
                height: 1.5,
              ),
            ),
            actions: [
              TextButton(
                onPressed: () {
                  Navigator.of(context).pop();
                },
                child: const Text(
                  '취소',
                  style: TextStyle(
                    color: Color(0xFFEF4444),
                  ),
                ),
              ),
              TextButton(
                onPressed: () async {
                  Navigator.of(context).pop();
                  await openAppSettings();
                },
                child: const Text(
                  '설정으로 이동',
                  style: TextStyle(
                    color: Color(0xFFB8860B),
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ],
          );
        },
      );
    } else {
      final granted =
          await PushNotificationService.instance.requestPermission();
      _sendDevicePermissionStatus(granted);
    }
  }

  void _sendDevicePermissionStatus(bool granted) {
    if (mounted && _controller != null) {
      _controller!.runJavaScript(
          'if (window.app && window.app.updateDevicePermissionStatus) { window.app.updateDevicePermissionStatus($granted); }');
    }
  }

  Future<void> _initFcmToken() async {
    try {
      final pushService = PushNotificationService.instance;

      // Set foreground notification options
      await FirebaseMessaging.instance
          .setForegroundNotificationPresentationOptions(
        alert: true,
        badge: true,
        sound: true,
      );

      // Get the current token cached in the service
      String? token = pushService.token;
      if (mounted) {
        setState(() {
          _fcmToken = token;
        });
        debugPrint("FCM Token (from service): $token");
        _syncTokenToWebView(token);
      }

      // Listen to token refresh events from the service
      pushService.onTokenRefresh.listen((newToken) {
        if (mounted) {
          setState(() {
            _fcmToken = newToken;
          });
          _syncTokenToWebView(newToken);
        }
      });

      // Handle foreground notifications
      FirebaseMessaging.onMessage.listen((RemoteMessage message) {
        debugPrint('Got a message whilst in the foreground!');
        debugPrint('Message data: ${message.data}');

        if (message.notification != null && mounted) {
          debugPrint(
              'Message also contained a notification: ${message.notification}');
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                '${message.notification!.title ?? ""}: ${message.notification!.body ?? ""}',
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
              backgroundColor: const Color(0xFFB8860B),
            ),
          );
        }
      });
    } catch (e) {
      debugPrint("Error initializing FCM token: $e");
    }
  }

  void _syncTokenToWebView(String? token) {
    if (token == null || _controller == null) return;
    debugPrint("Syncing push token to webview: $token");
    _controller!.runJavaScript(
        'if (window.app && window.app.updatePushToken) { window.app.updatePushToken("$token"); }');
  }

  void _syncPlatformToWebView() {
    if (_controller == null) return;
    String osName =
        defaultTargetPlatform == TargetPlatform.iOS ? 'iOS' : 'Android';
    debugPrint("Syncing platform to webview: $osName");
    _controller!.runJavaScript(
        'if (window.app && window.app.updateDevicePlatform) { window.app.updateDevicePlatform("$osName"); }');
  }
}

void _openWebPopup({
  required BuildContext context,
  required String title,
  required String url,
  VoidCallback? onLogout,
}) {
  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (context) {
      return Container(
        height: MediaQuery.of(context).size.height * 0.85,
        decoration: const BoxDecoration(
          color: Color(0xFFFDF8E6),
          borderRadius: BorderRadius.only(
            topLeft: Radius.circular(20),
            topRight: Radius.circular(20),
          ),
        ),
        child: Column(
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: const BoxDecoration(
                border: Border(
                  bottom: BorderSide(color: Color(0x1FB8860B)),
                ),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF3D341C),
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close_rounded,
                        color: Color(0xFF96855B)),
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                ],
              ),
            ),
            Expanded(
              child: ClipRRect(
                borderRadius: const BorderRadius.only(
                  bottomLeft: Radius.circular(20),
                  bottomRight: Radius.circular(20),
                ),
                child: _PopupWebView(
                  url: url,
                  onLogout: () {
                    Navigator.of(context).pop();
                    onLogout?.call();
                  },
                ),
              ),
            ),
          ],
        ),
      );
    },
  );
}

class _PopupWebView extends StatefulWidget {
  final String url;
  final VoidCallback? onLogout;

  const _PopupWebView({
    required this.url,
    this.onLogout,
  });

  @override
  State<_PopupWebView> createState() => _PopupWebViewState();
}

class _PopupWebViewState extends State<_PopupWebView> {
  late final WebViewController _controller;
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFFFDF8E6))
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageStarted: (_) {
            setState(() {
              _isLoading = true;
            });
          },
          onPageFinished: (_) {
            setState(() {
              _isLoading = false;
            });
          },
        ),
      )
      ..addJavaScriptChannel(
        'MobileAppChannel',
        onMessageReceived: (JavaScriptMessage message) {
          try {
            final Map<String, dynamic> data = json.decode(message.message);
            if (data['event'] == 'logout') {
              widget.onLogout?.call();
            }
          } catch (e) {
            debugPrint('Popup WebView channel error: $e');
          }
        },
      )
      ..loadRequest(Uri.parse(widget.url));
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        WebViewWidget(controller: _controller),
        if (_isLoading)
          const Center(
            child: CircularProgressIndicator(
              color: Color(0xFFB8860B),
            ),
          ),
      ],
    );
  }
}

class NativeSettingsView extends StatelessWidget {
  final String userName;
  final String userEmail;
  final int userPoints;
  final bool pushEnabled;
  final bool marketingPushEnabled;
  final bool isPermissionGranted;
  final bool isLoading;
  final String version;
  final String? fcmToken;
  final VoidCallback onLogout;
  final VoidCallback onWithdraw;
  final ValueChanged<bool> onPushChanged;
  final ValueChanged<bool> onMarketingChanged;
  final VoidCallback onRequestPermission;
  final VoidCallback onOpenEvents;
  final List<dynamic> pointsHistory;

  const NativeSettingsView({
    super.key,
    required this.userName,
    required this.userEmail,
    required this.userPoints,
    required this.pushEnabled,
    required this.marketingPushEnabled,
    required this.isPermissionGranted,
    required this.isLoading,
    required this.version,
    this.fcmToken,
    required this.onLogout,
    required this.onWithdraw,
    required this.onPushChanged,
    required this.onMarketingChanged,
    required this.onRequestPermission,
    required this.onOpenEvents,
    required this.pointsHistory,
  });

  @override
  Widget build(BuildContext context) {
    final initial = userName.isNotEmpty ? userName.substring(0, 1) : 'U';

    if (isLoading) {
      return const Center(
        child: CircularProgressIndicator(
          color: Color(0xFFB8860B),
        ),
      );
    }

    return Container(
      color: const Color(0xFFFDF8E6), // Match background color
      child: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 20),
        children: [
          // 1. 내 정보
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: const Color(0x1FB8860B)),
              boxShadow: [
                BoxShadow(
                  color: const Color(0xFF3D341C).withOpacity(0.04),
                  blurRadius: 12,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    CircleAvatar(
                      radius: 30,
                      backgroundColor: const Color(0xFFB8860B),
                      child: CircleAvatar(
                        radius: 28.5,
                        backgroundColor: const Color(0xFFFDF8E6),
                        child: Text(
                          initial,
                          style: const TextStyle(
                            fontSize: 22,
                            fontWeight: FontWeight.bold,
                            color: Color(0xFF3D341C),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            userName.isNotEmpty ? userName : '사용자',
                            style: const TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                              color: Color(0xFF3D341C),
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            userEmail.isNotEmpty ? userEmail : '이메일 정보 없음',
                            style: const TextStyle(
                              fontSize: 13,
                              color: Color(0xFF96855B),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),

                // Notification Warning Banner inside My Info
                if (!isPermissionGranted) ...[
                  const SizedBox(height: 16),
                  GestureDetector(
                    onTap: onRequestPermission,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 12),
                      decoration: BoxDecoration(
                        color: const Color(0xFFFFF0F0),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: const Color(0xFFEF4444)),
                      ),
                      child: const Row(
                        children: [
                          Icon(Icons.warning_amber_rounded,
                              color: Color(0xFFEF4444), size: 20),
                          SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              '기기 알림 권한이 꺼져 있습니다. (설정하려면 터치하세요)',
                              style: TextStyle(
                                color: Color(0xFFEF4444),
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],

                const SizedBox(height: 16),
                const Divider(color: Color(0x1FB8860B)),

                // Switch 1: Push enabled
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  activeColor: const Color(0xFFB8860B),
                  title: const Text(
                    '이벤트 및 푸시 알림 수신',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF3D341C),
                    ),
                  ),
                  subtitle: const Text(
                    '알림 메시지 및 이벤트 소식을 받습니다.',
                    style: TextStyle(
                      fontSize: 11,
                      color: Color(0xFF96855B),
                    ),
                  ),
                  value: pushEnabled,
                  onChanged: onPushChanged,
                ),
                const Divider(color: Color(0x1FB8860B), height: 1),
                // Switch 2: Marketing push enabled
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  activeColor: const Color(0xFFB8860B),
                  title: const Text(
                    '마케팅 정보 수신 동의',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF3D341C),
                    ),
                  ),
                  subtitle: const Text(
                    '이벤트 및 푸시 마케팅 알림 수신에 동의합니다.',
                    style: TextStyle(
                      fontSize: 11,
                      color: Color(0xFF96855B),
                    ),
                  ),
                  value: marketingPushEnabled,
                  onChanged: pushEnabled ? onMarketingChanged : null,
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          Container(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: const Color(0x1FB8860B)),
              boxShadow: [
                BoxShadow(
                  color: const Color(0xFF3D341C).withOpacity(0.04),
                  blurRadius: 12,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: ListTile(
              contentPadding:
                  const EdgeInsets.symmetric(horizontal: 20, vertical: 4),
              leading: const Icon(
                Icons.monetization_on_rounded,
                color: Color(0xFFB8860B),
                size: 24,
              ),
              title: const Text(
                '포인트 내역',
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.bold,
                  color: Color(0xFF3D341C),
                ),
              ),
              trailing: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    '$userPoints P',
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFFB8860B),
                    ),
                  ),
                  const SizedBox(width: 6),
                  const Icon(Icons.chevron_right_rounded,
                      color: Color(0xFF96855B)),
                ],
              ),
              onTap: () => _showPointHistoryDialog(context),
            ),
          ),
          const SizedBox(height: 16),

          // 2. 설정 메뉴
          Container(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: const Color(0x1FB8860B)),
              boxShadow: [
                BoxShadow(
                  color: const Color(0xFF3D341C).withOpacity(0.04),
                  blurRadius: 12,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Column(
              children: [
                const Padding(
                  padding: EdgeInsets.fromLTRB(20, 16, 20, 8),
                  child: Row(
                    children: [
                      Icon(Icons.settings_rounded,
                          color: Color(0xFFB8860B), size: 20),
                      SizedBox(width: 8),
                      Text(
                        '설정 메뉴',
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF3D341C),
                        ),
                      ),
                    ],
                  ),
                ),
                const Divider(color: Color(0x1FB8860B)),
                ListTile(
                  contentPadding: const EdgeInsets.symmetric(horizontal: 20),
                  title: const Text('공지사항',
                      style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: Color(0xFF3D341C))),
                  trailing: const Icon(Icons.chevron_right_rounded,
                      color: Color(0xFF96855B)),
                  onTap: onOpenEvents,
                ),
                const Divider(color: Color(0x1FB8860B), height: 1),
                ListTile(
                  contentPadding: const EdgeInsets.symmetric(horizontal: 20),
                  title: const Text('이벤트',
                      style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: Color(0xFF3D341C))),
                  trailing: const Icon(Icons.chevron_right_rounded,
                      color: Color(0xFF96855B)),
                  onTap: onOpenEvents,
                ),
                const Divider(color: Color(0x1FB8860B), height: 1),
                ListTile(
                  contentPadding: const EdgeInsets.symmetric(horizontal: 20),
                  title: const Text('이용약관',
                      style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: Color(0xFF3D341C))),
                  trailing: const Icon(Icons.chevron_right_rounded,
                      color: Color(0xFF96855B)),
                  onTap: () => _openWebPopup(
                    context: context,
                    title: '이용약관',
                    url:
                        'https://simon-edu-bible-game.firebaseapp.com/Terms_of_Use',
                  ),
                ),
                const Divider(color: Color(0x1FB8860B), height: 1),
                ListTile(
                  contentPadding: const EdgeInsets.symmetric(horizontal: 20),
                  title: const Text('개인정보처리방침',
                      style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: Color(0xFF3D341C))),
                  trailing: const Icon(Icons.chevron_right_rounded,
                      color: Color(0xFF96855B)),
                  onTap: () => _openWebPopup(
                    context: context,
                    title: '개인정보처리방침',
                    url: 'https://simon-edu-bible-game.firebaseapp.com/privacy',
                  ),
                ),
                const Divider(color: Color(0x1FB8860B), height: 1),
                ListTile(
                  contentPadding: const EdgeInsets.symmetric(horizontal: 20),
                  title: const Text('포인트 정책',
                      style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: Color(0xFF3D341C))),
                  trailing: const Icon(Icons.chevron_right_rounded,
                      color: Color(0xFF96855B)),
                  onTap: () => _openWebPopup(
                    context: context,
                    title: '포인트 정책',
                    url:
                        'https://simon-edu-bible-game.firebaseapp.com/points_policy',
                  ),
                ),
                const Divider(color: Color(0x1FB8860B), height: 1),
                ListTile(
                  contentPadding: const EdgeInsets.symmetric(horizontal: 20),
                  title: const Text('알림 설정',
                      style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: Color(0xFF3D341C))),
                  trailing: const Icon(Icons.notifications_active_rounded,
                      color: Color(0xFFB8860B)),
                  onTap: onRequestPermission,
                ),
                const Divider(color: Color(0x1FB8860B), height: 1),
                ListTile(
                  contentPadding: const EdgeInsets.symmetric(horizontal: 20),
                  title: const Text('로그아웃',
                      style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFFEF4444))),
                  trailing: const Icon(Icons.logout_rounded,
                      color: Color(0xFFEF4444)),
                  onTap: onLogout,
                ),
                const Divider(color: Color(0x1FB8860B), height: 1),
                ListTile(
                  contentPadding: const EdgeInsets.symmetric(horizontal: 20),
                  title: const Text('회원탈퇴',
                      style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF96855B))),
                  trailing: const Icon(Icons.person_remove_rounded,
                      color: Color(0xFF96855B)),
                  onTap: () => _openWebPopup(
                    context: context,
                    title: '회원 탈퇴',
                    url:
                        'https://simon-edu-bible-game.firebaseapp.com/Delete_account',
                    onLogout: onLogout,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),

          // Version info center aligned
          Center(
            child: Text(
              '버전 정보 : $version',
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: Color(0xFF96855B),
                letterSpacing: 0.5,
              ),
            ),
          ),
          const SizedBox(height: 20),
        ],
      ),
    );
  }

  void _showPointHistoryDialog(BuildContext context) {
    final history = List<Map<String, dynamic>>.from(
      pointsHistory.reversed
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item)),
    );

    if (history.isEmpty && userPoints > 0) {
      history.add({
        'type': 'legacy',
        'title': '이전 활동 누적 포인트',
        'amount': userPoints,
        'date': '기존 적립 이력',
      });
    }

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) {
        return Container(
          height: MediaQuery.of(context).size.height * 0.7,
          decoration: const BoxDecoration(
            color: Color(0xFFFDF8E6),
            borderRadius: BorderRadius.only(
              topLeft: Radius.circular(24),
              topRight: Radius.circular(24),
            ),
          ),
          child: Column(
            children: [
              const SizedBox(height: 12),
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: const Color(0xFF96855B).withOpacity(0.3),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text(
                      '포인트 적립 내역',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        color: Color(0xFF3D341C),
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close_rounded,
                          color: Color(0xFF96855B)),
                      onPressed: () => Navigator.of(context).pop(),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: const Color(0x1FB8860B)),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        '현재 보유 포인트',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: Color(0xFF6B5C37),
                        ),
                      ),
                      Text(
                        '$userPoints P',
                        style: const TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w900,
                          color: Color(0xFFB8860B),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Expanded(
                child: history.isEmpty
                    ? const Center(
                        child: Text(
                          '아직 포인트 적립 내역이 없습니다.',
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            color: Color(0xFF96855B),
                          ),
                        ),
                      )
                    : ListView.separated(
                        padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
                        itemCount: history.length,
                        separatorBuilder: (_, __) => const Divider(
                          color: Color(0x1FB8860B),
                          height: 1,
                        ),
                        itemBuilder: (context, index) {
                          final item = history[index];
                          final title = item['title']?.toString() ?? '포인트 적립';
                          final date = item['date']?.toString() ?? '';
                          final amount = (item['amount'] ?? 0).toString();

                          return ListTile(
                            contentPadding: EdgeInsets.zero,
                            leading: const CircleAvatar(
                              backgroundColor: Color(0xFFFFFBEB),
                              child: Icon(Icons.monetization_on_rounded,
                                  color: Color(0xFFB8860B)),
                            ),
                            title: Text(
                              title,
                              style: const TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.bold,
                                color: Color(0xFF3D341C),
                              ),
                            ),
                            subtitle: date.isEmpty
                                ? null
                                : Text(
                                    date,
                                    style: const TextStyle(
                                      fontSize: 11,
                                      color: Color(0xFF96855B),
                                    ),
                                  ),
                            trailing: Text(
                              '+$amount P',
                              style: const TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.w900,
                                color: Color(0xFFB8860B),
                              ),
                            ),
                          );
                        },
                      ),
              ),
            ],
          ),
        );
      },
    );
  }
}
