import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'dart:math';

// Unified User Data Model for Native Side
class UserProfile {
  final String id;
  final String name;
  final String email;
  final int points;
  final int currentVerseIndex;
  final bool isTrial;
  final List<dynamic> bookmarks;
  final List<dynamic> journeyRewardsClaimed;
  final List<dynamic> notifications;

  UserProfile({
    required this.id,
    required this.name,
    required this.email,
    required this.points,
    required this.currentVerseIndex,
    this.isTrial = false,
    required this.bookmarks,
    required this.journeyRewardsClaimed,
    required this.notifications,
  });

  factory UserProfile.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>? ?? {};
    return UserProfile(
      id: doc.id,
      name: data['name'] ?? '사용자',
      email: data['email'] ?? '',
      points: data['points'] ?? 0,
      currentVerseIndex: data['currentVerseIndex'] ?? 0,
      bookmarks: data['bookmarks'] ?? [],
      journeyRewardsClaimed: data['journeyRewardsClaimed'] ?? [],
      notifications: data['notifications'] ?? [],
    );
  }

  factory UserProfile.trial(int currentVerseIndex, int points) {
    return UserProfile(
      id: 'trial',
      name: '체험 사용자',
      email: 'trial@simonedu.com',
      points: points,
      currentVerseIndex: currentVerseIndex,
      isTrial: true,
      bookmarks: [],
      journeyRewardsClaimed: [],
      notifications: [],
    );
  }
}

class BibleVerse {
  final String book;
  final int chapter;
  final int verse;
  final String text;

  BibleVerse({
    required this.book,
    required this.chapter,
    required this.verse,
    required this.text,
  });

  factory BibleVerse.fromJson(Map<String, dynamic> json) {
    return BibleVerse(
      book: json['book'] ?? '요한계시록',
      chapter: json['chapter'] ?? 1,
      verse: json['verse'] ?? 1,
      text: json['text'] ?? '',
    );
  }
}

class HomePage extends StatefulWidget {
  final UserProfile user;
  final List<BibleVerse> bibleData;
  final List<dynamic> activeEvents;
  final VoidCallback onStartMission;
  final VoidCallback onReviewMission;
  final ValueChanged<int> onChapterClick;
  final VoidCallback onContinueJourney;
  final ValueChanged<String> onEventClick;
  final ValueChanged<String> onNoticeClick;
  final VoidCallback onOpenNotifications;

  const HomePage({
    super.key,
    required this.user,
    required this.bibleData,
    required this.activeEvents,
    required this.onStartMission,
    required this.onReviewMission,
    required this.onChapterClick,
    required this.onContinueJourney,
    required this.onEventClick,
    required this.onNoticeClick,
    required this.onOpenNotifications,
  });

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  int _activeEventIndex = 0;
  late final PageController _pageController;

  @override
  void initState() {
    super.initState();
    _pageController = PageController(initialPage: 0);
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final h = MediaQuery.sizeOf(context).height;

    // Responsive height boundaries — 오늘의 말씀 카드 축소, 전체 균형 재조정
    // iPhone 17 Pro (852pt) 기준:
    //   todayCard  : 852 * 0.28 = 238px (clamp 220~260)
    //   eventBanner: 852 * 0.12 = 102px (clamp  90~110)
    //   mission    : 852 * 0.15 = 128px (clamp 118~140)
    //   journey    : 852 * 0.24 = 204px (clamp 188~220)
    final todayCardHeight = (h * 0.22).clamp(180.0, 210.0);
    final bannerHeight = (h * 0.12).clamp(90.0, 110.0);
    final missionHeight = (h * 0.15).clamp(118.0, 140.0);
    final journeyHeight = (h * 0.24).clamp(188.0, 220.0);

    return Scaffold(
      backgroundColor: const Color(0xFFFDF8E6), // Theme warm cream
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            // 1. Home Header
            HomeHeader(
              user: widget.user,
              onOpenNotifications: widget.onOpenNotifications,
            ),

            // 2. Main Content
            Expanded(
              child: SingleChildScrollView(
                padding: EdgeInsets.fromLTRB(16.w, 6.h, 16.w, 20.h),
                child: Column(
                  children: [
                    TodayVerseCard(
                      height: todayCardHeight,
                      user: widget.user,
                      bibleData: widget.bibleData,
                      onStartMission: widget.onStartMission,
                      onReviewMission: widget.onReviewMission,
                    ),
                    SizedBox(height: 6.h),

                    EventBanner(
                      height: bannerHeight,
                      activeEvents: widget.activeEvents,
                      pageController: _pageController,
                      currentIndex: _activeEventIndex,
                      onPageChanged: (idx) {
                        setState(() {
                          _activeEventIndex = idx;
                        });
                      },
                      onEventClick: widget.onEventClick,
                    ),
                    SizedBox(height: 6.h),

                    TodayMissionCard(
                      height: missionHeight,
                      user: widget.user,
                      onStartMission: widget.onStartMission,
                    ),
                    SizedBox(height: 6.h),

                    BibleJourneyCard(
                      height: journeyHeight,
                      user: widget.user,
                      bibleData: widget.bibleData,
                      onChapterClick: widget.onChapterClick,
                      onContinueJourney: widget.onContinueJourney,
                    ),
                    SizedBox(height: 6.h),

                    FriendActivityCard(user: widget.user),
                    SizedBox(height: 6.h),

                    NoticeCard(
                      activeEvents: widget.activeEvents,
                      onNoticeClick: widget.onNoticeClick,
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ──────────────────────────────────────────────────────────
// Sub-Widget: HomeHeader
// ──────────────────────────────────────────────────────────
class HomeHeader extends StatelessWidget {
  final UserProfile user;
  final VoidCallback onOpenNotifications;

  const HomeHeader({
    super.key,
    required this.user,
    required this.onOpenNotifications,
  });

  @override
  Widget build(BuildContext context) {
    final initial = user.name.isNotEmpty ? user.name.substring(0, 1) : 'U';

    return Container(
      height: 48.h,
      padding: EdgeInsets.symmetric(horizontal: 16.w),
      decoration: const BoxDecoration(
        color: Color(0xFFFDF8E6),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          // 왼쪽: 로고
          Row(
            children: [
              Icon(
                Icons.auto_stories,
                color: const Color(0xFFB8860B),
                size: 22.sp,
              ),
              SizedBox(width: 6.w),
              Text(
                'Simon Edu',
                style: TextStyle(
                  fontFamily: 'Outfit',
                  color: const Color(0xFF855B17),
                  fontSize: 18.sp,
                  fontWeight: FontWeight.w900,
                  letterSpacing: -0.5,
                ),
              ),
            ],
          ),

          // 오른쪽: 포인트 배지 + 아바타
          Row(
            children: [
              Container(
                padding: EdgeInsets.symmetric(horizontal: 8.w, vertical: 3.h),
                decoration: BoxDecoration(
                  color: const Color(0xFFFDF5EA),
                  border: Border.all(color: const Color(0xFFF2E3D3), width: 1),
                  borderRadius: BorderRadius.circular(12.r),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      Icons.monetization_on,
                      color: const Color(0xFFB8860B),
                      size: 14.sp,
                    ),
                    SizedBox(width: 3.w),
                    Text(
                      '${user.points} P',
                      style: TextStyle(
                        color: const Color(0xFFB8860B),
                        fontSize: 11.sp,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                ),
              ),
              SizedBox(width: 8.w),
              Container(
                width: 28.w,
                height: 28.w,
                decoration: const BoxDecoration(
                  color: Color(0xFFD89F07),
                  shape: BoxShape.circle,
                ),
                alignment: Alignment.center,
                child: Text(
                  initial,
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 12.sp,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ──────────────────────────────────────────────────────────
// Sub-Widget: TodayVerseCard
// ──────────────────────────────────────────────────────────
class TodayVerseCard extends StatelessWidget {
  final double height;
  final UserProfile user;
  final List<BibleVerse> bibleData;
  final VoidCallback onStartMission;
  final VoidCallback onReviewMission;

  const TodayVerseCard({
    super.key,
    required this.height,
    required this.user,
    required this.bibleData,
    required this.onStartMission,
    required this.onReviewMission,
  });

  @override
  Widget build(BuildContext context) {
    if (bibleData.isEmpty) return const SizedBox();

    final curIdx = min(user.currentVerseIndex, bibleData.length - 1);
    final verse = bibleData[curIdx];
    final totalVerses = bibleData.length;
    final progressPct = totalVerses > 0 ? (curIdx / totalVerses) : 0.0;
    final progressPercentText = totalVerses > 0 ? '${(progressPct * 100).toInt()}%' : '0%';

    return Container(
      height: height,
      padding: EdgeInsets.fromLTRB(14.r, 12.r, 14.r, 12.r),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: const Color(0xFFF2E7D5), width: 1),
        borderRadius: BorderRadius.circular(16.r),
        boxShadow: const [
          BoxShadow(
            color: Color(0x0A3D341C),
            blurRadius: 12,
            offset: Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── 헤더 행 ──────────────────────────────────────
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Icon(Icons.emoji_events,
                      color: const Color(0xFFFBBF24), size: 16.sp),
                  SizedBox(width: 4.w),
                  Text(
                    '오늘의 말씀 암송 미션',
                    style: TextStyle(
                      color: const Color(0xFF3D341C),
                      fontSize: 13.sp,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ],
              ),
              GestureDetector(
                onTap: () {},
                child: Container(
                  padding:
                      EdgeInsets.symmetric(horizontal: 7.w, vertical: 2.5.h),
                  decoration: BoxDecoration(
                    border: Border.all(color: const Color(0xFFE0E0E0)),
                    borderRadius: BorderRadius.circular(12.r),
                  ),
                  child: Text(
                    '도전 기록 >',
                    style: TextStyle(
                      color: const Color(0xFF888888),
                      fontSize: 9.sp,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ),
            ],
          ),
          SizedBox(height: 10.h),

          // ── 본문 2컬럼 (아트 + 말씀) ─────────────────────
          Expanded(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                // 왼쪽: 아트 박스 (컴팩트)
                Container(
                  width: 68.w,
                  height: 68.w,
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [Color(0xFFFFFBEE), Color(0xFFFFF5D6)],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    border: Border.all(
                        color: const Color(0xFFF2E3D3), width: 1),
                    borderRadius: BorderRadius.circular(14.r),
                  ),
                  alignment: Alignment.center,
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      Icon(Icons.spa_outlined,
                          color: const Color(0xFF8CA885).withOpacity(0.25),
                          size: 54.sp),
                      Positioned(
                        bottom: 8.h,
                        child: Icon(Icons.menu_book,
                            color: const Color(0xFFCBB294), size: 32.sp),
                      ),
                      Positioned(
                        top: 10.h,
                        child: Icon(Icons.add,
                            color: const Color(0xFFC49A45), size: 22.sp),
                      ),
                    ],
                  ),
                ),
                SizedBox(width: 12.w),

                // 오른쪽: 절 정보 + 본문
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      // 책 배지 + 장절 한 줄
                      Row(
                        children: [
                          Container(
                            padding: EdgeInsets.symmetric(
                                horizontal: 5.w, vertical: 1.5.h),
                            decoration: BoxDecoration(
                              color: const Color(0xFFFDF5EA),
                              border: Border.all(
                                  color: const Color(0x1FC89211)),
                              borderRadius: BorderRadius.circular(4.r),
                            ),
                            child: Text(
                              verse.book,
                              style: TextStyle(
                                color: const Color(0xFFC09020),
                                fontSize: 8.sp,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ),
                          SizedBox(width: 5.w),
                          Text(
                            '${verse.chapter}장 ${verse.verse}절',
                            style: TextStyle(
                              color: const Color(0xFF3D341C),
                              fontSize: 12.sp,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                        ],
                      ),
                      SizedBox(height: 6.h),
                      // 말씀 본문 (3줄)
                      Text(
                        '"${verse.text}"',
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: const Color(0xFF444444),
                          fontSize: 11.sp,
                          height: 1.4,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          SizedBox(height: 8.h),

          // ── 진행도 바 ─────────────────────────────────────
          Row(
            children: [
              Text(
                '오늘의 달성도',
                style: TextStyle(
                  color: const Color(0xFF333333),
                  fontSize: 10.sp,
                  fontWeight: FontWeight.w800,
                ),
              ),
              SizedBox(width: 6.w),
              Expanded(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(3.r),
                  child: LinearProgressIndicator(
                    value: progressPct,
                    minHeight: 5.h,
                    color: const Color(0xFFD89F07),
                    backgroundColor: const Color(0xFFEAE6DE),
                  ),
                ),
              ),
              SizedBox(width: 6.w),
              RichText(
                text: TextSpan(
                  style: TextStyle(
                    color: const Color(0xFF333333),
                    fontSize: 10.sp,
                    fontWeight: FontWeight.w800,
                  ),
                  children: [
                    TextSpan(text: progressPercentText),
                    TextSpan(
                      text: ' (${curIdx + 1}/$totalVerses)',
                      style: TextStyle(
                        color: const Color(0xFF888888),
                        fontSize: 9.sp,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          SizedBox(height: 8.h),

          // ── 버튼 2개 ─────────────────────────────────────
          Row(
            children: [
              // 암송 챌린지 시작 (gold fill)
              Expanded(
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFFB8860B),
                    foregroundColor: Colors.white,
                    minimumSize: Size(0, 34.h),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8.r),
                    ),
                    elevation: 0,
                    padding: EdgeInsets.zero,
                  ),
                  onPressed: onStartMission,
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        '암송 챌린지 시작',
                        style: TextStyle(
                          fontSize: 11.sp,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      SizedBox(width: 3.w),
                      Icon(Icons.play_arrow_rounded, size: 13.sp),
                    ],
                  ),
                ),
              ),
              SizedBox(width: 6.w),

              // 복습하기 (outlined)
              Expanded(
                child: OutlinedButton(
                  style: OutlinedButton.styleFrom(
                    foregroundColor: const Color(0xFF333333),
                    side: const BorderSide(color: Color(0xFFE0E0E0)),
                    minimumSize: Size(0, 34.h),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8.r),
                    ),
                    padding: EdgeInsets.zero,
                  ),
                  onPressed: onReviewMission,
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        '복습하기',
                        style: TextStyle(
                          fontSize: 11.sp,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      SizedBox(width: 3.w),
                      Icon(Icons.refresh_rounded,
                          size: 13.sp,
                          color: const Color(0xFF666666)),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ──────────────────────────────────────────────────────────
// Sub-Widget: EventBanner
// ──────────────────────────────────────────────────────────
class EventBanner extends StatelessWidget {
  final double height;
  final List<dynamic> activeEvents;
  final PageController pageController;
  final int currentIndex;
  final ValueChanged<int> onPageChanged;
  final ValueChanged<String> onEventClick;

  const EventBanner({
    super.key,
    required this.height,
    required this.activeEvents,
    required this.pageController,
    required this.currentIndex,
    required this.onPageChanged,
    required this.onEventClick,
  });

  @override
  Widget build(BuildContext context) {
    if (activeEvents.isEmpty) return const SizedBox();

    return Column(
      children: [
        // Event Banner Carousel Card
        Container(
          height: height,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16.r),
            boxShadow: const [
              BoxShadow(
                color: Color(0x0A0F2B48),
                blurRadius: 14,
                offset: Offset(0, 4),
              ),
            ],
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(16.r),
            child: PageView.builder(
              controller: pageController,
              onPageChanged: onPageChanged,
              itemCount: activeEvents.length,
              itemBuilder: (context, index) {
                final evt = activeEvents[index];
                final title = evt['title'] ?? '이벤트';
                final desc = evt['description'] ?? '하나님의 사명을 알고, 믿음으로 도전하세요!';
                final dateStr = (evt['startDate'] != null && evt['endDate'] != null)
                    ? '${evt['startDate']} ~ ${evt['endDate']}'
                    : '진행 중';

                return GestureDetector(
                  onTap: () => onEventClick(evt['id'] ?? ''),
                  child: Container(
                    decoration: const BoxDecoration(
                      gradient: LinearGradient(
                        colors: [Color(0xFF0F2E59), Color(0xFF0B1F3C)],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                    ),
                    padding: EdgeInsets.all(12.r),
                    child: Row(
                      children: [
                        // Left Copy
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Container(
                                padding: EdgeInsets.symmetric(horizontal: 6.w, vertical: 2.h),
                                decoration: BoxDecoration(
                                  color: const Color(0xFF10B981),
                                  borderRadius: BorderRadius.circular(4.r),
                                ),
                                child: Text(
                                  '진행중',
                                  style: TextStyle(
                                    color: Colors.white,
                                    fontSize: 8.sp,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                              ),
                              SizedBox(height: 4.h),
                              Text(
                                title,
                                style: TextStyle(
                                  color: Colors.white,
                                  fontSize: 13.sp,
                                  fontWeight: FontWeight.w900,
                                ),
                              ),
                              SizedBox(height: 2.h),
                              Text(
                                desc,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  color: Colors.white.withOpacity(0.85),
                                  fontSize: 9.sp,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                              SizedBox(height: 2.h),
                              Text(
                                dateStr,
                                style: TextStyle(
                                  color: Colors.white.withOpacity(0.65),
                                  fontSize: 9.sp,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                              SizedBox(height: 4.h),
                              Container(
                                padding: EdgeInsets.symmetric(horizontal: 10.w, vertical: 3.5.h),
                                decoration: BoxDecoration(
                                  color: Colors.white,
                                  borderRadius: BorderRadius.circular(12.r),
                                ),
                                child: Text(
                                  '참여하기 >',
                                  style: TextStyle(
                                    color: const Color(0xFF16365A),
                                    fontSize: 9.sp,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                        SizedBox(width: 8.w),

                        // Right Art: Book + Shield mockup
                        SizedBox(
                          width: 80.w,
                          height: 70.h,
                          child: Stack(
                            alignment: Alignment.center,
                            children: [
                              // Stars / Confetti dots
                              Positioned(
                                top: 5.h,
                                left: 10.w,
                                child: Icon(Icons.star, color: Colors.yellow, size: 8.sp),
                              ),
                              Positioned(
                                bottom: 10.h,
                                right: 5.w,
                                child: Icon(Icons.star, color: Colors.pinkAccent, size: 6.sp),
                              ),
                              // Open Book
                              Positioned(
                                bottom: 4.h,
                                child: Icon(Icons.menu_book, color: Colors.white.withOpacity(0.8), size: 42.sp),
                              ),
                              // Gold Shield
                              Positioned(
                                top: 4.h,
                                child: Icon(Icons.shield, color: const Color(0xFFD97706), size: 36.sp),
                              ),
                              // Cross in shield
                              Positioned(
                                top: 12.h,
                                child: Icon(Icons.add, color: Colors.white, size: 16.sp),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
        ),

        // Indicator dots below banner
        if (activeEvents.length > 1) ...[
          SizedBox(height: 6.h),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: List.generate(
              activeEvents.length,
              (index) => Container(
                width: index == currentIndex ? 14.w : 6.w,
                height: 6.w,
                margin: EdgeInsets.symmetric(horizontal: 2.w),
                decoration: BoxDecoration(
                  color: index == currentIndex
                      ? const Color(0xFFB8860B)
                      : const Color(0xFFE5E5E5),
                  borderRadius: BorderRadius.circular(3.r),
                ),
              ),
            ),
          ),
        ],
      ],
    );
  }
}

// ──────────────────────────────────────────────────────────
// Sub-Widget: TodayMissionCard
// ──────────────────────────────────────────────────────────
class TodayMissionCard extends StatelessWidget {
  final double height;
  final UserProfile user;
  final VoidCallback onStartMission;

  const TodayMissionCard({
    super.key,
    required this.height,
    required this.user,
    required this.onStartMission,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      height: height,
      padding: EdgeInsets.all(12.r),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: const Color(0xFFF2E7D5), width: 1),
        borderRadius: BorderRadius.circular(16.r),
        boxShadow: const [
          BoxShadow(
            color: Color(0x0A3D341C),
            blurRadius: 12,
            offset: Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                '오늘의 미션',
                style: TextStyle(
                  color: const Color(0xFF3D341C),
                  fontSize: 13.sp,
                  fontWeight: FontWeight.w900,
                ),
              ),
              GestureDetector(
                onTap: onStartMission,
                child: Text(
                  '더보기 >',
                  style: TextStyle(
                    color: const Color(0xFFB8860B),
                    fontSize: 10.sp,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ],
          ),
          SizedBox(height: 8.h),

          // 3 Columns Grid
          Expanded(
            child: Row(
              children: [
                // Mission 1: Attendance
                Expanded(
                  child: _buildMissionTile(
                    icon: Icons.calendar_today_rounded,
                    iconBg: const Color(0x1010B981),
                    iconColor: const Color(0xFF10B981),
                    title: '출석체크',
                    desc: '연속 출석',
                    pts: '+50P',
                    onTap: () {},
                  ),
                ),
                SizedBox(width: 6.w),

                // Mission 2: Word Study
                Expanded(
                  child: _buildMissionTile(
                    icon: Icons.auto_stories,
                    iconBg: const Color(0x10B8860B),
                    iconColor: const Color(0xFFB8860B),
                    title: '오늘의 말씀',
                    desc: '암송하기',
                    pts: '+100P',
                    onTap: onStartMission,
                  ),
                ),
                SizedBox(width: 6.w),

                // Mission 3: Cheer Friend
                Expanded(
                  child: _buildMissionTile(
                    icon: Icons.people_rounded,
                    iconBg: const Color(0x108A640E),
                    iconColor: const Color(0xFF8A640E),
                    title: '친구에게',
                    desc: '응원 보내기',
                    pts: '+30P',
                    onTap: () {},
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMissionTile({
    required IconData icon,
    required Color iconBg,
    required Color iconColor,
    required String title,
    required String desc,
    required String pts,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: EdgeInsets.all(8.r),
        decoration: BoxDecoration(
          color: const Color(0xFFFAFAFA),
          border: Border.all(color: const Color(0xFFEEEEEE)),
          borderRadius: BorderRadius.circular(10.r),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              padding: EdgeInsets.all(5.r),
              decoration: BoxDecoration(
                color: iconBg,
                shape: BoxShape.circle,
              ),
              child: Icon(icon, color: iconColor, size: 14.sp),
            ),
            SizedBox(height: 6.h),
            Text(
              title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: const Color(0xFF333333),
                fontSize: 10.sp,
                fontWeight: FontWeight.w900,
              ),
            ),
            Text(
              desc,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: const Color(0xFF666666),
                fontSize: 9.sp,
                fontWeight: FontWeight.w500,
              ),
            ),
            SizedBox(height: 3.h),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  pts,
                  style: TextStyle(
                    color: const Color(0xFFD89F07),
                    fontSize: 10.sp,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                Icon(Icons.chevron_right_rounded, color: const Color(0xFFCCCCCC), size: 12.sp),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

// ──────────────────────────────────────────────────────────
// Sub-Widget: BibleJourneyCard
// ──────────────────────────────────────────────────────────
class BibleJourneyCard extends StatelessWidget {
  final double height;
  final UserProfile user;
  final List<BibleVerse> bibleData;
  final ValueChanged<int> onChapterClick;
  final VoidCallback onContinueJourney;

  const BibleJourneyCard({
    super.key,
    required this.height,
    required this.user,
    required this.bibleData,
    required this.onChapterClick,
    required this.onContinueJourney,
  });

  @override
  Widget build(BuildContext context) {
    // Determine progress parameters
    const totalChapters = 22;
    int completedChapters = 0;
    final curIdx = user.currentVerseIndex;

    // Calculate completed chapters based on index range mapping
    if (bibleData.isNotEmpty) {
      for (int ch = 1; ch <= totalChapters; ch++) {
        final chVerses = bibleData.where((v) => v.chapter == ch).toList();
        if (chVerses.isEmpty) continue;
        final firstIdx = bibleData.indexWhere((v) => v.chapter == ch);
        final lastIdx = firstIdx + chVerses.length - 1;
        if (curIdx > lastIdx) {
          completedChapters++;
        }
      }
    }

    final progressPct = completedChapters / totalChapters;

    return Container(
      height: height,
      padding: EdgeInsets.all(12.r),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: const Color(0xFFF2E7D5), width: 1),
        borderRadius: BorderRadius.circular(16.r),
        boxShadow: const [
          BoxShadow(
            color: Color(0x0A3D341C),
            blurRadius: 12,
            offset: Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                '성경여정',
                style: TextStyle(
                  color: const Color(0xFF3D341C),
                  fontSize: 13.sp,
                  fontWeight: FontWeight.w900,
                ),
              ),
              GestureDetector(
                onTap: onContinueJourney,
                child: Text(
                  '전체보기 >',
                  style: TextStyle(
                    color: const Color(0xFFB8860B),
                    fontSize: 10.sp,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ],
          ),
          SizedBox(height: 8.h),

          // Core Container (2 columns: Left progress info, Right horizontal ListView)
          Expanded(
            child: Row(
              children: [
                // Left progress summary box
                Container(
                  width: 104.w,
                  padding: EdgeInsets.all(8.r),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFFFDF5),
                    border: Border.all(color: const Color(0xFFFDF0D5)),
                    borderRadius: BorderRadius.circular(12.r),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              '요한계시록 여정',
                              style: TextStyle(
                                color: const Color(0xFF3D341C),
                                fontSize: 9.sp,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                          ),
                          Icon(Icons.help_outline, color: const Color(0xFF888888), size: 10.sp),
                        ],
                      ),
                      SizedBox(height: 4.h),
                      Text(
                        '전체 진행률',
                        style: TextStyle(
                          color: const Color(0xFF888888),
                          fontSize: 8.sp,
                        ),
                      ),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.baseline,
                        textBaseline: TextBaseline.alphabetic,
                        children: [
                          Text(
                            '${(progressPct * 100).toInt()}%',
                            style: TextStyle(
                              color: const Color(0xFFB8860B),
                              fontSize: 15.sp,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                          SizedBox(width: 3.w),
                          Text(
                            '$completedChapters/22장',
                            style: TextStyle(
                              color: const Color(0xFF666666),
                              fontSize: 9.sp,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
                      SizedBox(height: 4.h),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(2.r),
                        child: LinearProgressIndicator(
                          value: progressPct,
                          minHeight: 3.h,
                          color: const Color(0xFFB8860B),
                          backgroundColor: const Color(0xFFEAE6DE),
                        ),
                      ),
                      SizedBox(height: 6.h),
                      GestureDetector(
                        onTap: onContinueJourney,
                        child: Container(
                          height: 22.h,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            color: const Color(0xFFFDF5EA),
                            border: Border.all(color: const Color(0x3DB8860B)),
                            borderRadius: BorderRadius.circular(11.r),
                          ),
                          child: Text(
                            '이어서 학습하기',
                            style: TextStyle(
                              color: const Color(0xFFB8860B),
                              fontSize: 8.5.sp,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                SizedBox(width: 8.w),

                // Right horizontal ListView
                Expanded(
                  child: ListView.builder(
                    scrollDirection: Axis.horizontal,
                    itemCount: totalChapters,
                    itemBuilder: (context, index) {
                      final ch = index + 1;
                      final chVerses = bibleData.where((v) => v.chapter == ch).toList();
                      if (chVerses.isEmpty) return const SizedBox();

                      final firstIdx = bibleData.indexWhere((v) => v.chapter == ch);
                      final lastIdx = firstIdx + chVerses.length - 1;

                      final isCompleted = curIdx > lastIdx;
                      final isOngoing = !isCompleted && curIdx >= firstIdx;
                      final isLocked = curIdx < firstIdx;

                      // Renders circle design
                      Color circleBg = const Color(0xFFF4EFE0);
                      Color circleBorder = Colors.transparent;
                      IconData circleIcon = Icons.lock;
                      Color iconColor = const Color(0xFFA8A29E);
                      String statusText = '잠김';
                      Color statusColor = const Color(0xFFA8A29E);

                      if (isCompleted) {
                        circleBg = const Color(0xFFFDF8E6);
                        circleBorder = const Color(0x33B8860B);
                        circleIcon = Icons.check;
                        iconColor = const Color(0xFFB8860B);
                        statusText = '완료';
                        statusColor = const Color(0xFFB8860B);
                      } else if (isOngoing) {
                        circleBg = Colors.white;
                        circleBorder = const Color(0xFFB8860B);
                        circleIcon = Icons.menu_book;
                        iconColor = const Color(0xFFB8860B);
                        statusText = '진행중';
                        statusColor = const Color(0xFFB8860B);
                      }

                      return GestureDetector(
                        onTap: () => onChapterClick(ch),
                        child: Container(
                          width: 44.w,
                          margin: EdgeInsets.only(right: 8.w),
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Text(
                                '${ch}장',
                                style: TextStyle(
                                  color: const Color(0xFF333333),
                                  fontSize: 9.sp,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                              SizedBox(height: 3.h),
                              Container(
                                width: 34.w,
                                height: 34.w,
                                decoration: BoxDecoration(
                                  color: circleBg,
                                  border: Border.all(color: circleBorder, width: 1.5),
                                  shape: BoxShape.circle,
                                  boxShadow: isOngoing
                                      ? [BoxShadow(color: const Color(0x26B8860B), blurRadius: 4.r)]
                                      : null,
                                ),
                                alignment: Alignment.center,
                                child: Icon(circleIcon, color: iconColor, size: 14.sp),
                              ),
                              SizedBox(height: 3.h),
                              Text(
                                statusText,
                                style: TextStyle(
                                  color: statusColor,
                                  fontSize: 8.5.sp,
                                  fontWeight: isOngoing || isCompleted ? FontWeight.w800 : FontWeight.w500,
                                ),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
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

// ──────────────────────────────────────────────────────────
// Sub-Widget: FriendActivityCard
// ──────────────────────────────────────────────────────────
class FriendActivityCard extends StatelessWidget {
  final UserProfile user;

  const FriendActivityCard({
    super.key,
    required this.user,
  });

  @override
  Widget build(BuildContext context) {
    // Mock friends matching SVG profiles
    final friends = [
      {'name': '상암임원', 'avatarIdx': 0, 'status': '요한계시록 3장 진행 중', 'badge': '3장'},
      {'name': 'faith777', 'avatarIdx': 1, 'status': '요한계시록 2장 완료!', 'badge': '2장'},
      {'name': '춘식이', 'avatarIdx': 2, 'status': '요한계시록 5장 진행 중', 'badge': '5장'},
    ];

    return Container(
      padding: EdgeInsets.all(12.r),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: const Color(0xFFF2E7D5), width: 1),
        borderRadius: BorderRadius.circular(16.r),
        boxShadow: const [
          BoxShadow(
            color: Color(0x0A3D341C),
            blurRadius: 12,
            offset: Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                '친구 활동',
                style: TextStyle(
                  color: const Color(0xFF3D341C),
                  fontSize: 13.sp,
                  fontWeight: FontWeight.w900,
                ),
              ),
              Text(
                '전체보기 >',
                style: TextStyle(
                  color: const Color(0xFFB8860B),
                  fontSize: 10.sp,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
          SizedBox(height: 8.h),

          // 3 Columns Cards Row
          Row(
            children: friends.map((f) {
              final String name = f['name'] as String;
              final int avatarIdx = f['avatarIdx'] as int;
              final String status = f['status'] as String;
              final String badge = f['badge'] as String;

              return Expanded(
                child: Container(
                  margin: EdgeInsets.symmetric(horizontal: 2.w),
                  padding: EdgeInsets.all(6.r),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFAFAFA),
                    border: Border.all(color: const Color(0xFFEEEEEE)),
                    borderRadius: BorderRadius.circular(10.r),
                  ),
                  child: Stack(
                    clipBehavior: Clip.none,
                    children: [
                      Column(
                        children: [
                          // Avatar Character SVG representation
                          Container(
                            width: 32.w,
                            height: 32.w,
                            decoration: const BoxDecoration(
                              color: Color(0xFFEAE6DE),
                              shape: BoxShape.circle,
                            ),
                            alignment: Alignment.center,
                            child: Icon(
                              avatarIdx == 1 ? Icons.face_3 : Icons.face_5,
                              color: Colors.brown,
                              size: 20.sp,
                            ),
                          ),
                          SizedBox(height: 4.h),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              // Green active dot
                              Container(
                                width: 4.w,
                                height: 4.w,
                                decoration: const BoxDecoration(
                                  color: Color(0xFF10B981),
                                  shape: BoxShape.circle,
                                ),
                              ),
                              SizedBox(width: 3.w),
                              Text(
                                name,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  color: const Color(0xFF333333),
                                  fontSize: 9.sp,
                                  fontWeight: FontWeight.w900,
                                ),
                              ),
                            ],
                          ),
                          SizedBox(height: 1.h),
                          Text(
                            status,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: const Color(0xFF666666),
                              fontSize: 7.5.sp,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ],
                      ),
                      // Floating Badge
                      Positioned(
                        bottom: -4.h,
                        right: -4.w,
                        child: Container(
                          padding: EdgeInsets.symmetric(horizontal: 4.w, vertical: 1.5.h),
                          decoration: BoxDecoration(
                            color: const Color(0xFFEAE6DE),
                            border: Border.all(color: const Color(0xFFE0E0E0)),
                            borderRadius: BorderRadius.circular(4.r),
                          ),
                          child: Text(
                            badge,
                            style: TextStyle(
                              color: const Color(0xFF666666),
                              fontSize: 7.sp,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              );
            }).toList(),
          ),
        ],
      ),
    );
  }
}

// ──────────────────────────────────────────────────────────
// Sub-Widget: NoticeCard
// ──────────────────────────────────────────────────────────
class NoticeCard extends StatelessWidget {
  final List<dynamic> activeEvents;
  final ValueChanged<String> onNoticeClick;

  const NoticeCard({
    super.key,
    required this.activeEvents,
    required this.onNoticeClick,
  });

  @override
  Widget build(BuildContext context) {
    // Load notice events
    final notices = activeEvents
        .where((evt) => evt['eventType'] == 'notice' || evt['category'] == 'notice')
        .toList();

    // Default notifications backup if Firestore notices list is empty
    final displayNotices = notices.isNotEmpty
        ? notices.take(3).toList()
        : [
            {
              'id': 'default-1',
              'title': '출석체크는 오늘의 말씀 상단에서 진행할 수 있습니다.',
              'date': '2026.06.05',
              'isNew': true,
            },
            {
              'id': 'default-2',
              'title': '요한계시록 완독 이벤트 안내',
              'date': '2026.06.03',
              'isNew': false,
            },
            {
              'id': 'default-3',
              'title': '서버 점검 안내 (6/8 새벽 2시~4시)',
              'date': '2026.06.02',
              'isNew': false,
            }
          ];

    return Container(
      padding: EdgeInsets.all(12.r),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: const Color(0xFFF2E7D5), width: 1),
        borderRadius: BorderRadius.circular(16.r),
        boxShadow: const [
          BoxShadow(
            color: Color(0x0A3D341C),
            blurRadius: 12,
            offset: Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                '공지사항',
                style: TextStyle(
                  color: const Color(0xFF3D341C),
                  fontSize: 13.sp,
                  fontWeight: FontWeight.w900,
                ),
              ),
              Text(
                '전체보기 >',
                style: TextStyle(
                  color: const Color(0xFFB8860B),
                  fontSize: 10.sp,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
          SizedBox(height: 4.h),

          // Notices List
          Column(
            children: displayNotices.map((n) {
              final id = n['id'] as String;
              final title = n['title'] as String;
              final dateStr = n['date'] as String? ?? n['startDate'] as String? ?? '진행 중';
              final isNew = n['isNew'] == true || n['isNew'] == null; // default new tag

              return GestureDetector(
                onTap: () => onNoticeClick(id),
                child: Container(
                  padding: EdgeInsets.symmetric(vertical: 8.h),
                  decoration: const BoxDecoration(
                    border: Border(bottom: BorderSide(color: Color(0xFFF9F9F9))),
                  ),
                  child: Row(
                    children: [
                      // Bell Circle Container
                      Container(
                        padding: EdgeInsets.all(5.r),
                        decoration: const BoxDecoration(
                          color: Color(0xFFFFFDF5),
                          shape: BoxShape.circle,
                        ),
                        child: Icon(
                          Icons.notifications_none_rounded,
                          color: const Color(0xFFD89F07),
                          size: 14.sp,
                        ),
                      ),
                      SizedBox(width: 8.w),

                      // Title & Badge
                      Expanded(
                        child: Row(
                          children: [
                            if (isNew) ...[
                              Container(
                                padding: EdgeInsets.symmetric(horizontal: 4.w, vertical: 2.h),
                                decoration: BoxDecoration(
                                  color: const Color(0xFFFF5722),
                                  borderRadius: BorderRadius.circular(4.r),
                                ),
                                child: Text(
                                  'NEW',
                                  style: TextStyle(
                                    color: Colors.white,
                                    fontSize: 7.sp,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                              ),
                              SizedBox(width: 4.w),
                            ],
                            Expanded(
                              child: Text(
                                title,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  color: const Color(0xFF333333),
                                  fontSize: 10.sp,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      SizedBox(width: 8.w),

                      // Date
                      Text(
                        dateStr,
                        style: TextStyle(
                          color: const Color(0xFF999999),
                          fontSize: 9.sp,
                        ),
                      ),
                    ],
                  ),
                ),
              );
            }).toList(),
          ),
        ],
      ),
    );
  }
}
