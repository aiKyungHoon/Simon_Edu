import 'package:flutter/material.dart';
import 'home_page.dart';

class MainTabPage extends StatefulWidget {
  final int currentIndex;
  final int unreadNotificationsCount;
  final UserProfile user;
  final List<BibleVerse> bibleData;
  final List<dynamic> activeEvents;
  final Widget webViewWidget;
  final ValueChanged<int> onTabChanged;
  final VoidCallback onStartMission;
  final VoidCallback onReviewMission;
  final ValueChanged<int> onChapterClick;
  final VoidCallback onContinueJourney;
  final ValueChanged<String> onEventClick;
  final ValueChanged<String> onNoticeClick;
  final VoidCallback onOpenNotifications;
  
  // Settings view dependency
  final Widget nativeSettingsView;

  const MainTabPage({
    super.key,
    required this.currentIndex,
    required this.unreadNotificationsCount,
    required this.user,
    required this.bibleData,
    required this.activeEvents,
    required this.webViewWidget,
    required this.onTabChanged,
    required this.onStartMission,
    required this.onReviewMission,
    required this.onChapterClick,
    required this.onContinueJourney,
    required this.onEventClick,
    required this.onNoticeClick,
    required this.onOpenNotifications,
    required this.nativeSettingsView,
  });

  @override
  State<MainTabPage> createState() => _MainTabPageState();
}

class _MainTabPageState extends State<MainTabPage> {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFFDF8E6),
      body: SafeArea(
        bottom: false,
        child: IndexedStack(
          // 0: 오늘의 말씀 (Native HomePage)
          // 1: 웹뷰 영역 (성경여정/명예의전당/알림센터)
          // 2: 설정 (Native Settings)
          index: widget.currentIndex == 0
              ? 0
              : (widget.currentIndex == 4 ? 2 : 1),
          children: [
            HomePage(
              user: widget.user,
              bibleData: widget.bibleData,
              activeEvents: widget.activeEvents,
              onStartMission: widget.onStartMission,
              onReviewMission: widget.onReviewMission,
              onChapterClick: widget.onChapterClick,
              onContinueJourney: widget.onContinueJourney,
              onEventClick: widget.onEventClick,
              onNoticeClick: widget.onNoticeClick,
              onOpenNotifications: widget.onOpenNotifications,
            ),
            widget.webViewWidget,
            widget.nativeSettingsView,
          ],
        ),
      ),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: widget.currentIndex,
        onTap: widget.onTabChanged,
        backgroundColor: const Color(0xFFFDF8E6),
        selectedItemColor: const Color(0xFFB8860B),
        unselectedItemColor: const Color(0xFF96855B),
        selectedLabelStyle: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
        unselectedLabelStyle: const TextStyle(fontWeight: FontWeight.w500, fontSize: 11),
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
            icon: widget.unreadNotificationsCount > 0
                ? Badge.count(
                    count: widget.unreadNotificationsCount,
                    child: const Icon(Icons.notifications_rounded),
                  )
                : const Icon(Icons.notifications_rounded),
            activeIcon: widget.unreadNotificationsCount > 0
                ? Badge.count(
                    count: widget.unreadNotificationsCount,
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
      ),
    );
  }
}
