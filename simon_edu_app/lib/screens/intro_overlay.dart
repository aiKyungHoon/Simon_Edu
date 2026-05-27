import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';

class IntroOverlay extends StatefulWidget {
  final bool visible;
  final VoidCallback onFadeOutComplete;
  final bool isPageLoaded;
  final VoidCallback onSkip;

  const IntroOverlay({
    super.key,
    required this.visible,
    required this.onFadeOutComplete,
    required this.isPageLoaded,
    required this.onSkip,
  });

  @override
  State<IntroOverlay> createState() => _IntroOverlayState();
}

class _IntroOverlayState extends State<IntroOverlay> {
  late VideoPlayerController _videoController;
  bool _isControllerInitialized = false;

  @override
  void initState() {
    super.initState();
    _videoController = VideoPlayerController.asset('assets/videos/intro.mp4');
    _videoController.initialize().then((_) {
      if (mounted) {
        setState(() {
          _isControllerInitialized = true;
        });
        _videoController.play();
        _videoController.setPlaybackSpeed(1.5);
        _videoController.setLooping(true);
      }
    }).catchError((error) {
      debugPrint('Error initializing video player: $error');
    });
  }

  @override
  void didUpdateWidget(covariant IntroOverlay oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.visible && !widget.visible) {
      // Pause video when fade-out starts
      _videoController.pause();
    }
  }

  @override
  void dispose() {
    _videoController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      ignoring: !widget.visible,
      child: AnimatedOpacity(
        opacity: widget.visible ? 1.0 : 0.0,
        duration: const Duration(milliseconds: 800),
        curve: Curves.easeInOut,
        onEnd: () {
          if (!widget.visible) {
            widget.onFadeOutComplete();
          }
        },
        child: Container(
          color: Colors.black, // Dark background to prevent flashing during load
          child: Stack(
            children: [
              // 1. Full-screen Video Player
              if (_isControllerInitialized)
                SizedBox.expand(
                  child: FittedBox(
                    fit: BoxFit.cover,
                    child: SizedBox(
                      width: _videoController.value.size.width,
                      height: _videoController.value.size.height,
                      child: VideoPlayer(_videoController),
                    ),
                  ),
                )
              else
                // Initial beige placeholder matching app style
                Container(
                  decoration: const BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [
                        Color(0xFFFFFDF5),
                        Color(0xFFFDF8E6),
                        Color(0xFFF6EFCF),
                      ],
                    ),
                  ),
                  child: const Center(
                    child: CircularProgressIndicator(
                      color: Color(0xFFB8860B),
                    ),
                  ),
                ),

              // 2. Skip (건너뛰기) Button at Top Right
              SafeArea(
                child: Align(
                  alignment: Alignment.topRight,
                  child: Padding(
                    padding: const EdgeInsets.only(top: 16.0, right: 16.0),
                    child: TextButton(
                      style: TextButton.styleFrom(
                        backgroundColor: Colors.black.withOpacity(0.5),
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(20),
                          side: BorderSide(color: Colors.white.withOpacity(0.3), width: 1),
                        ),
                      ),
                      onPressed: widget.onSkip,
                      child: const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            "건너뛰기",
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.bold,
                              letterSpacing: 0.5,
                            ),
                          ),
                          SizedBox(width: 4),
                          Icon(Icons.chevron_right_rounded, size: 18),
                        ],
                      ),
                    ),
                  ),
                ),
              ),

              // 3. Subtle bottom loading indicator if the WebView is not yet ready
              if (!widget.isPageLoaded)
                Positioned(
                  bottom: 50,
                  left: 0,
                  right: 0,
                  child: Center(
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                      decoration: BoxDecoration(
                        color: Colors.black.withOpacity(0.6),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          SizedBox(
                            width: 14,
                            height: 14,
                            child: CircularProgressIndicator(
                              strokeWidth: 2.0,
                              valueColor: AlwaysStoppedAnimation<Color>(Colors.white70),
                            ),
                          ),
                          SizedBox(width: 10),
                          Text(
                            "데이터를 불러오는 중...",
                            style: TextStyle(
                              fontSize: 12,
                              color: Colors.white,
                              fontWeight: FontWeight.w500,
                              letterSpacing: 0.5,
                              decoration: TextDecoration.none,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
