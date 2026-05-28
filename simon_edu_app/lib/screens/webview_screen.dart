import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'push_settings_screen.dart';
import 'package:flutter/foundation.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:vibration/vibration.dart';
import 'package:app_links/app_links.dart';
import 'package:permission_handler/permission_handler.dart';
import 'dart:async';
import 'dart:convert';
import 'intro_overlay.dart';
import 'package:package_info_plus/package_info_plus.dart';


class WebViewScreen extends StatefulWidget {
  const WebViewScreen({super.key});

  @override
  State<WebViewScreen> createState() => _WebViewScreenState();
}

class _WebViewScreenState extends State<WebViewScreen> with WidgetsBindingObserver {
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
  bool _isLoggedIn = false;
  String _appVersion = '';

  // Native Settings Profile State
  String _userName = '';
  String _userEmail = '';
  int _userPoints = 0;
  bool _pushEnabled = false;
  bool _marketingPushEnabled = false;
  bool _isNotificationPermissionGranted = true;
  bool _isProfileLoading = true;

  final String _targetUrl = 'https://simon-edu-bible-game.web.app?v=1.4.2';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _loadAppVersion();


    
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
              });
              _isPageFinished = true;
              _checkIntroFinished();
              _updateNavigationState();
              _injectJavaScriptBridge();
              
              // Synchronize auth state and active view state after page finish
              _controller?.runJavaScript('''
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
              ''');
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
        _syncUserProfile();
      } else if (event == 'logout') {
        setState(() {
          _isLoggedIn = false;
          _currentIndex = 0;
        });
      } else if (event == 'view_changed') {
        final view = data['view'];
        int newIndex = _currentIndex;
        if (view == 'dashboard') {
          newIndex = 0;
        } else if (view == 'attendance') {
          newIndex = 1;
        } else if (view == 'ranking') {
          newIndex = 2;
        } else if (view == 'settings') {
          newIndex = 3;
        }
        if (newIndex != _currentIndex) {
          setState(() {
            _currentIndex = newIndex;
            if (newIndex == 3) {
              _isProfileLoading = true;
            }
          });
          if (newIndex == 3) {
            _syncUserProfile();
          }
        }
      } else if (event == 'check_device_permission') {
        _checkAndSendNotificationPermission().then((_) => _syncUserProfile());
      } else if (event == 'request_device_permission') {
        _requestNotificationPermission().then((_) => _syncUserProfile());
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
      if (index == 3) {
        _isProfileLoading = true;
      }
    });

    String viewName = 'dashboard';
    if (index == 1) {
      viewName = 'attendance';
    } else if (index == 2) {
      viewName = 'ranking';
    } else if (index == 3) {
      viewName = 'settings';
    }

    _controller!.runJavaScript('if (window.app && window.app.switchView) { window.app.switchView("$viewName"); }');

    if (index == 3) {
      _syncUserProfile();
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
            child: Column(
              children: [
                Expanded(
                  child: Stack(
                    children: [
                      Offstage(
                        offstage: _isLoggedIn && _currentIndex == 3,
                        child: _controller != null ? WebViewWidget(controller: _controller!) : const SizedBox(),
                      ),
                      
                      if (_isLoggedIn && _currentIndex == 3)
                        NativeSettingsView(
                          userName: _userName,
                          userEmail: _userEmail,
                          userPoints: _userPoints,
                          pushEnabled: _pushEnabled,
                          marketingPushEnabled: _marketingPushEnabled,
                          isPermissionGranted: _isNotificationPermissionGranted,
                          isLoading: _isProfileLoading,
                          version: _appVersion.isEmpty ? '1.4.2' : _appVersion,
                          onLogout: () {
                            _controller?.runJavaScript('if (window.app && window.app.logout) { window.app.logout(); }');
                          },
                          onPushChanged: _togglePushSetting,
                          onMarketingChanged: _toggleMarketingSetting,
                          onRequestPermission: () {
                            _requestNotificationPermission().then((_) => _syncUserProfile());
                          },
                        ),
                      
                      // Linear progress bar for loading
                      if (_isLoading && _currentIndex != 3)
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
              ],
            ),
          ),
          bottomNavigationBar: _isLoggedIn
              ? BottomNavigationBar(
                  currentIndex: _currentIndex,
                  onTap: _switchWebViewTab,
                  backgroundColor: const Color(0xFFFDF8E6),
                  selectedItemColor: const Color(0xFFB8860B),
                  unselectedItemColor: const Color(0xFF96855B),
                  selectedLabelStyle: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
                  unselectedLabelStyle: const TextStyle(fontWeight: FontWeight.w500, fontSize: 11),
                  elevation: 8,
                  type: BottomNavigationBarType.fixed,
                  items: const [
                    BottomNavigationBarItem(
                      icon: Icon(Icons.menu_book_rounded),
                      activeIcon: Icon(Icons.menu_book_rounded),
                      label: '오늘의 말씀',
                    ),
                    BottomNavigationBarItem(
                      icon: Icon(Icons.event_available_rounded),
                      activeIcon: Icon(Icons.event_available_rounded),
                      label: '출석체크',
                    ),
                    BottomNavigationBarItem(
                      icon: Icon(Icons.emoji_events_rounded),
                      activeIcon: Icon(Icons.emoji_events_rounded),
                      label: '명예의 전당',
                    ),
                    BottomNavigationBarItem(
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
              marketingPushEnabled: !!window.app.currentUser.marketingPushEnabled
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
          _isNotificationPermissionGranted = status.isGranted;
          _isProfileLoading = false;
        });
      }
    } catch (e) {
      debugPrint('Error syncing user profile: $e');
    }
  }

  Future<void> _togglePushSetting(bool value) async {
    if (_controller == null) return;
    
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
                  await _controller!.runJavaScript('if (window.app) { window.app.acceptMarketingConsent(true); }');
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
                  await _controller!.runJavaScript('if (window.app) { window.app.acceptMarketingConsent(false); }');
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
    _sendDevicePermissionStatus(status.isGranted);
  }

  Future<void> _requestNotificationPermission() async {
    final status = await Permission.notification.status;
    if (status.isPermanentlyDenied || status.isDenied) {
      await openAppSettings();
    } else {
      final newStatus = await Permission.notification.request();
      _sendDevicePermissionStatus(newStatus.isGranted);
    }
  }

  void _sendDevicePermissionStatus(bool granted) {
    if (mounted && _controller != null) {
      _controller!.runJavaScript('if (window.app && window.app.updateDevicePermissionStatus) { window.app.updateDevicePermissionStatus($granted); }');
    }
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
  final VoidCallback onLogout;
  final ValueChanged<bool> onPushChanged;
  final ValueChanged<bool> onMarketingChanged;
  final VoidCallback onRequestPermission;

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
    required this.onLogout,
    required this.onPushChanged,
    required this.onMarketingChanged,
    required this.onRequestPermission,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
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
          // 1. Profile section
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
            child: Row(
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
                      const SizedBox(height: 8),
                      // Points badge
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                        decoration: BoxDecoration(
                          color: const Color(0xFFFFFBEA),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: const Color(0x33B8860B)),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(
                              Icons.monetization_on,
                              size: 16,
                              color: Color(0xFFB8860B),
                            ),
                            const SizedBox(width: 4),
                            Text(
                              '$userPoints P',
                              style: const TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.bold,
                                color: Color(0xFFB8860B),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),

          // 2. Notification Warning Banner
          if (!isPermissionGranted)
            GestureDetector(
              onTap: onRequestPermission,
              child: Container(
                margin: const EdgeInsets.only(bottom: 20),
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                decoration: BoxDecoration(
                  color: const Color(0xFFFFF0F0),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: const Color(0xFFEF4444)),
                ),
                child: const Row(
                  children: [
                    Icon(Icons.warning_amber_rounded, color: Color(0xFFEF4444), size: 20),
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

          // 3. Notification Settings Card
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
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Padding(
                  padding: EdgeInsets.fromLTRB(20, 20, 20, 10),
                  child: Row(
                    children: [
                      Icon(Icons.notifications_active_rounded, color: Color(0xFFB8860B), size: 20),
                      SizedBox(width: 8),
                      Text(
                        '알림 설정',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF3D341C),
                        ),
                      ),
                    ],
                  ),
                ),
                const Divider(color: Color(0x1FB8860B)),
                // Switch 1: Push enabled
                SwitchListTile(
                  activeColor: const Color(0xFFB8860B),
                  title: const Text(
                    '이벤트 및 푸시 알림 수신',
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF3D341C),
                    ),
                  ),
                  subtitle: const Text(
                    '알림 메시지 및 이벤트 소식을 받습니다.',
                    style: TextStyle(
                      fontSize: 12,
                      color: Color(0xFF96855B),
                    ),
                  ),
                  value: pushEnabled,
                  onChanged: onPushChanged,
                ),
                const Divider(color: Color(0x1FB8860B), height: 1),
                // Switch 2: Marketing push enabled
                SwitchListTile(
                  activeColor: const Color(0xFFB8860B),
                  title: const Text(
                    '마케팅 정보 수신 동의',
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF3D341C),
                    ),
                  ),
                  subtitle: const Text(
                    '이벤트 및 푸시 마케팅 알림 수신에 동의합니다.',
                    style: TextStyle(
                      fontSize: 12,
                      color: Color(0xFF96855B),
                    ),
                  ),
                  value: marketingPushEnabled,
                  onChanged: pushEnabled ? onMarketingChanged : null,
                ),
                const SizedBox(height: 8),
              ],
            ),
          ),
          const SizedBox(height: 24),

          // 4. App version & Logout card
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 20),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              boxShadow: [
                BoxShadow(
                  color: const Color(0xFF3D341C).withOpacity(0.04),
                  blurRadius: 12,
                  offset: const Offset(0, 4),
                ),
              ],
              border: Border.all(color: const Color(0x1FB8860B)),
            ),
            child: Column(
              children: [
                Text(
                  '앱 버전 : $version',
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: Color(0xFF96855B),
                    letterSpacing: 0.5,
                  ),
                ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  height: 44,
                  child: OutlinedButton.icon(
                    onPressed: onLogout,
                    icon: const Icon(Icons.logout, size: 18, color: Color(0xFFEF4444)),
                    label: const Text(
                      '로그아웃',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.bold,
                        color: Color(0xFFEF4444),
                      ),
                    ),
                    style: OutlinedButton.styleFrom(
                      side: BorderSide(color: const Color(0xFFEF4444).withOpacity(0.3)),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                      backgroundColor: Colors.transparent,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
