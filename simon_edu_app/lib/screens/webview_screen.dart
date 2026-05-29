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
  List<dynamic> _pointsHistory = [];

  final String _targetUrl = 'https://simon-edu-bible-game.firebaseapp.com?v=1.4.6';

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
                          pointsHistory: _pointsHistory,
                          onLogout: () {
                            _controller?.runJavaScript('if (window.app && window.app.logout) { window.app.logout(); }');
                          },
                          onWithdraw: () {
                            _controller?.runJavaScript('if (window.app && window.app.withdrawAccount) { window.app.withdrawAccount(); }');
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
              marketingPushEnabled: !!window.app.currentUser.marketingPushEnabled,
              pointsHistory: window.app.currentUser.pointsHistory || []
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
    
    if (value) {
      final status = await Permission.notification.status;
      if (!status.isGranted) {
        await _requestNotificationPermission();
        final afterStatus = await Permission.notification.status;
        if (!afterStatus.isGranted) {
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
  final VoidCallback onWithdraw;
  final ValueChanged<bool> onPushChanged;
  final ValueChanged<bool> onMarketingChanged;
  final VoidCallback onRequestPermission;
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
    required this.onLogout,
    required this.onWithdraw,
    required this.onPushChanged,
    required this.onMarketingChanged,
    required this.onRequestPermission,
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

          // 2. 포인트 내역
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
              contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 4),
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
                  const Icon(Icons.chevron_right_rounded, color: Color(0xFF96855B)),
                ],
              ),
              onTap: () => _showPointHistoryDialog(context),
            ),
          ),
          const SizedBox(height: 16),

          // 3. 약관 및 정책
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
                  padding: EdgeInsets.fromLTRB(20, 16, 20, 8),
                  child: Row(
                    children: [
                      Icon(Icons.description_rounded, color: Color(0xFFB8860B), size: 20),
                      SizedBox(width: 8),
                      Text(
                        '약관 및 정책',
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
                  title: const Text(
                    '이용약관',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: Color(0xFF3D341C),
                    ),
                  ),
                  trailing: const Icon(Icons.chevron_right_rounded, color: Color(0xFF96855B)),
                  onTap: () {
                    _openWebPopup(
                      context: context,
                      title: '이용약관',
                      url: 'https://simon-edu-bible-game.firebaseapp.com/Terms_of_Use',
                    );
                  },
                ),
                const Divider(color: Color(0x1FB8860B), height: 1),
                ListTile(
                  contentPadding: const EdgeInsets.symmetric(horizontal: 20),
                  title: const Text(
                    '개인정보처리방침',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: Color(0xFF3D341C),
                    ),
                  ),
                  trailing: const Icon(Icons.chevron_right_rounded, color: Color(0xFF96855B)),
                  onTap: () {
                    _openWebPopup(
                      context: context,
                      title: '개인정보처리방침',
                      url: 'https://simon-edu-bible-game.firebaseapp.com/privacy',
                    );
                  },
                ),
                const Divider(color: Color(0x1FB8860B), height: 1),
                ListTile(
                  contentPadding: const EdgeInsets.symmetric(horizontal: 20),
                  title: const Text(
                    '포인트 정책',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: Color(0xFF3D341C),
                    ),
                  ),
                  trailing: const Icon(Icons.chevron_right_rounded, color: Color(0xFF96855B)),
                  onTap: () {
                    _openWebPopup(
                      context: context,
                      title: '포인트 정책',
                      url: 'https://simon-edu-bible-game.firebaseapp.com/points_policy',
                    );
                  },
                ),
                const SizedBox(height: 8),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // 4. 로그아웃 및 회원탈퇴 그룹
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
                ListTile(
                  contentPadding: const EdgeInsets.symmetric(horizontal: 20),
                  leading: const Icon(Icons.logout_rounded, color: Color(0xFFEF4444), size: 20),
                  title: const Text(
                    '로그아웃',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFFEF4444),
                    ),
                  ),
                  trailing: const Icon(Icons.chevron_right_rounded, color: Color(0xFF96855B)),
                  onTap: onLogout,
                ),
                const Divider(color: Color(0x1FB8860B), height: 1),
                ListTile(
                  contentPadding: const EdgeInsets.symmetric(horizontal: 20),
                  leading: const Icon(Icons.person_remove_rounded, color: Color(0xFF96855B), size: 20),
                  title: const Text(
                    '회원 탈퇴',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF96855B),
                    ),
                  ),
                  trailing: const Icon(Icons.chevron_right_rounded, color: Color(0xFF96855B)),
                  onTap: () {
                    _openWebPopup(
                      context: context,
                      title: '회원 탈퇴',
                      url: 'https://simon-edu-bible-game.firebaseapp.com/Delete_account',
                      onLogout: onLogout,
                    );
                  },
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
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (BuildContext context) {
        final List<dynamic> reversedHistory = List.from(pointsHistory.reversed);
        if (reversedHistory.isEmpty && userPoints > 0) {
          reversedHistory.add({
            'type': 'legacy',
            'title': '이전 활동 누적 포인트',
            'amount': userPoints,
            'date': '기존 적립 이력',
          });
        }
        
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
              // Drag handle
              const SizedBox(height: 12),
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: const Color(0xFF96855B).withOpacity(0.3),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(height: 8),
              
              // Header
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
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
                      icon: const Icon(Icons.close_rounded, color: Color(0xFF96855B)),
                      onPressed: () => Navigator.of(context).pop(),
                    ),
                  ],
                ),
              ),
              
              // Points Summary Card
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: const Color(0x1FB8860B)),
                    boxShadow: [
                      BoxShadow(
                        color: const Color(0xFF3D341C).withOpacity(0.02),
                        blurRadius: 8,
                        offset: const Offset(0, 2),
                      ),
                    ],
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Row(
                        children: [
                          Icon(Icons.monetization_on_rounded, color: Color(0xFFB8860B), size: 24),
                          SizedBox(width: 8),
                          Text(
                            '현재 보유 포인트',
                            style: TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w600,
                              color: Color(0xFF6B5C37),
                            ),
                          ),
                        ],
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
              const SizedBox(height: 16),
              
              // History List
              Expanded(
                child: reversedHistory.isEmpty
                    ? Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(
                              Icons.monetization_on_outlined,
                              size: 64,
                              color: const Color(0xFF96855B).withOpacity(0.3),
                            ),
                            const SizedBox(height: 16),
                            const Text(
                              '아직 포인트 적립 내역이 없습니다.',
                              style: TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w500,
                                color: Color(0xFF96855B),
                              ),
                            ),
                            const SizedBox(height: 4),
                            const Text(
                              '출석 체크와 말씀 암송을 통해 포인트를 쌓아보세요!',
                              style: TextStyle(
                                fontSize: 12,
                                color: Color(0xFFB8860B),
                              ),
                            ),
                            const SizedBox(height: 40),
                          ],
                        ),
                      )
                    : ListView.separated(
                        padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
                        itemCount: reversedHistory.length,
                        separatorBuilder: (context, index) => const Divider(
                          color: Color(0x1FB8860B),
                          height: 1,
                        ),
                        itemBuilder: (context, index) {
                          final item = reversedHistory[index] as Map<String, dynamic>;
                          final type = item['type'] ?? '';
                          final title = item['title'] ?? '포인트 적립';
                          final amount = item['amount'] ?? 0;
                          final date = item['date'] ?? '';
                          
                          // Styling configurations based on type
                          Color bgColor;
                          Color iconColor;
                          IconData iconData;
                          
                          switch (type) {
                            case 'signup':
                              bgColor = const Color(0xFFFFF4EB);
                              iconColor = const Color(0xFFFD7E14);
                              iconData = Icons.celebration_rounded;
                              break;
                            case 'attendance':
                              bgColor = const Color(0xFFEBFDF2);
                              iconColor = const Color(0xFF20C997);
                              iconData = Icons.calendar_today_rounded;
                              break;
                            case 'challenge':
                              bgColor = const Color(0xFFF3EBFD);
                              iconColor = const Color(0xFF7048E8);
                              iconData = Icons.menu_book_rounded;
                              break;
                            case 'admin':
                              bgColor = const Color(0xFFF1F3F5);
                              iconColor = const Color(0xFF495057);
                              iconData = Icons.admin_panel_settings_rounded;
                              break;
                            case 'legacy':
                              bgColor = const Color(0xFFFFFBEB);
                              iconColor = const Color(0xFFF59E0B);
                              iconData = Icons.monetization_on_rounded;
                              break;
                            default:
                              bgColor = const Color(0xFFFFFBEB);
                              iconColor = const Color(0xFFF59E0B);
                              iconData = Icons.monetization_on_rounded;
                          }
                          
                          return Padding(
                            padding: const EdgeInsets.symmetric(vertical: 12),
                            child: Row(
                              children: [
                                // Icon Circle
                                Container(
                                  width: 40,
                                  height: 40,
                                  decoration: BoxDecoration(
                                    color: bgColor,
                                    shape: BoxShape.circle,
                                  ),
                                  child: Icon(
                                    iconData,
                                    color: iconColor,
                                    size: 20,
                                  ),
                                ),
                                const SizedBox(width: 14),
                                
                                // Text details
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        title,
                                        style: const TextStyle(
                                          fontSize: 14,
                                          fontWeight: FontWeight.bold,
                                          color: Color(0xFF3D341C),
                                        ),
                                      ),
                                      const SizedBox(height: 4),
                                      Text(
                                        date,
                                        style: const TextStyle(
                                          fontSize: 11,
                                          color: Color(0xFF96855B),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                
                                // Amount text
                                Text(
                                  '+${amount}P',
                                  style: const TextStyle(
                                    fontSize: 15,
                                    fontWeight: FontWeight.w900,
                                    color: Color(0xFFB8860B),
                                  ),
                                ),
                              ],
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

// Web Popup Helpers
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
            // Header bar
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
                    icon: const Icon(Icons.close_rounded, color: Color(0xFF96855B)),
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                ],
              ),
            ),
            // WebView Content
            Expanded(
              child: ClipRRect(
                borderRadius: const BorderRadius.only(
                  bottomLeft: Radius.circular(20),
                  bottomRight: Radius.circular(20),
                ),
                child: _PopupWebView(
                  url: url,
                  onLogout: () {
                    // Close the popup first
                    Navigator.of(context).pop();
                    // Trigger logout callback
                    if (onLogout != null) {
                      onLogout();
                    }
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
              if (widget.onLogout != null) {
                widget.onLogout!();
              }
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





