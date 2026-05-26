import 'package:flutter/material.dart';

class IntroOverlay extends StatefulWidget {
  final bool visible;
  final VoidCallback onFadeOutComplete;

  const IntroOverlay({
    super.key,
    required this.visible,
    required this.onFadeOutComplete,
  });

  @override
  State<IntroOverlay> createState() => _IntroOverlayState();
}

class _IntroOverlayState extends State<IntroOverlay> with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<double> _logoScale;
  late final Animation<double> _logoOpacity;
  late final Animation<double> _textSlide;
  late final Animation<double> _textOpacity;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1500),
    );

    _logoScale = Tween<double>(begin: 0.5, end: 1.0).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(0.0, 0.6, curve: Curves.easeOutBack),
      ),
    );

    _logoOpacity = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(0.0, 0.4, curve: Curves.easeIn),
      ),
    );

    _textSlide = Tween<double>(begin: 30.0, end: 0.0).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(0.4, 0.9, curve: Curves.easeOutCubic),
      ),
    );

    _textOpacity = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(0.4, 0.8, curve: Curves.easeIn),
      ),
    );

    // Start entrance animations
    _controller.forward();
  }

  @override
  void dispose() {
    _controller.dispose();
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
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                Color(0xFFFFFDF5),
                Color(0xFFFDF8E6),
                Color(0xFFF6EFCF),
              ],
              stops: [0.0, 0.6, 1.0],
            ),
          ),
          child: SafeArea(
            child: Stack(
              children: [
                // Top accent decorations (subtle gold circles)
                Positioned(
                  top: -100,
                  right: -100,
                  child: Container(
                    width: 300,
                    height: 300,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: const Color(0xFFB8860B).withOpacity(0.03),
                    ),
                  ),
                ),
                Positioned(
                  bottom: -150,
                  left: -150,
                  child: Container(
                    width: 400,
                    height: 400,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: const Color(0xFFB8860B).withOpacity(0.04),
                    ),
                  ),
                ),

                // Main Center Content
                Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      // Animated Logo Emblem
                      AnimatedBuilder(
                        animation: _controller,
                        builder: (context, child) {
                          return Opacity(
                            opacity: _logoOpacity.value,
                            child: Transform.scale(
                              scale: _logoScale.value,
                              child: child,
                            ),
                          );
                        },
                        child: Container(
                          width: 140,
                          height: 140,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            gradient: const LinearGradient(
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                              colors: [
                                Color(0xFFE5A922),
                                Color(0xFFB8860B),
                                Color(0xFF926F15),
                              ],
                            ),
                            boxShadow: [
                              BoxShadow(
                                color: const Color(0xFFB8860B).withOpacity(0.3),
                                blurRadius: 25,
                                offset: const Offset(0, 12),
                                spreadRadius: 2,
                              ),
                            ],
                          ),
                          child: Stack(
                            alignment: Alignment.center,
                            children: [
                              // Inner ring
                              Container(
                                width: 124,
                                height: 124,
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  border: Border.all(
                                    color: Colors.white.withOpacity(0.2),
                                    width: 1.5,
                                  ),
                                ),
                              ),
                              // Book / Cross Stacked Icon
                              Padding(
                                padding: const EdgeInsets.only(bottom: 4.0),
                                child: Icon(
                                  Icons.menu_book_rounded,
                                  size: 64,
                                  color: Colors.white.withOpacity(0.95),
                                ),
                              ),
                              Positioned(
                                top: 38,
                                child: Container(
                                  padding: const EdgeInsets.all(4),
                                  decoration: const BoxDecoration(
                                    shape: BoxShape.circle,
                                    color: Color(0xFFB8860B),
                                  ),
                                  child: const Icon(
                                    Icons.add,
                                    size: 20,
                                    color: Colors.white,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(height: 48),

                      // Animated Texts
                      AnimatedBuilder(
                        animation: _controller,
                        builder: (context, child) {
                          return Opacity(
                            opacity: _textOpacity.value,
                            child: Transform.translate(
                              offset: Offset(0, _textSlide.value),
                              child: child,
                            ),
                          );
                        },
                        child: Column(
                          children: [
                            Text(
                              "SIMON EDU",
                              style: TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w600,
                                letterSpacing: 6.0,
                                color: const Color(0xFFB8860B).withOpacity(0.8),
                              ),
                            ),
                            const SizedBox(height: 12),
                            const Text(
                              "말씀 암송",
                              style: TextStyle(
                                fontSize: 32,
                                fontWeight: FontWeight.bold,
                                letterSpacing: 2.0,
                                color: Color(0xFF3D341C),
                                fontFamily: 'Apple SD Gothic Neo',
                              ),
                            ),
                            const SizedBox(height: 16),
                            Container(
                              width: 40,
                              height: 1,
                              color: const Color(0xFFB8860B).withOpacity(0.3),
                            ),
                            const SizedBox(height: 16),
                            const Text(
                              "마음속에 새기는 생명의 말씀",
                              style: TextStyle(
                                fontSize: 15,
                                color: Color(0xFF7A6A48),
                                letterSpacing: 0.5,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),

                // Bottom loading indicator & copyright
                Positioned(
                  bottom: 40,
                  left: 0,
                  right: 0,
                  child: Center(
                    child: Column(
                      children: [
                        SizedBox(
                          width: 24,
                          height: 24,
                          child: CircularProgressIndicator(
                            strokeWidth: 2.5,
                            valueColor: AlwaysStoppedAnimation<Color>(
                              const Color(0xFFB8860B).withOpacity(0.6),
                            ),
                          ),
                        ),
                        const SizedBox(height: 16),
                        Text(
                          "말씀 구절을 불러오고 있습니다...",
                          style: TextStyle(
                            fontSize: 12,
                            color: const Color(0xFF96855B).withOpacity(0.7),
                            letterSpacing: 0.5,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
