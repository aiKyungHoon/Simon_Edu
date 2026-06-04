import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, doc } from 'firebase/firestore';
import { db } from '../firebase';
import BIBLE_DATA_RAW from '../assets/bible_data.json';

interface User {
  id: string;
  username: string;
  name?: string;
  email: string;
  role: string;
  points: number;
  consecutiveCheckIns: number;
  lastCheckInDate: string | null;
  lastMissionDate: string | null;
  currentVerseIndex: number;
  checkInHistory?: string[];
  os?: string;
  pointsHistory?: Array<{
    id: string;
    type: string;
    title: string;
    amount: number;
    date: string;
  }>;
}

interface EventItem {
  id: string;
  title: string;
  description: string;
  rewardPoints: number;
  imageUrl?: string;
  active: boolean;
  startDate: string;
  endDate: string;
  participantsCount?: number;
}

interface NoticeItem {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  active: boolean;
  createdAt: string;
  rawTimestamp?: number;
}

interface DashboardProps {
  setCurrentTab: (tab: string) => void;
  selectedInspectorUser: User | null;
  setSelectedInspectorUser: (u: User | null) => void;
}

export default function Dashboard({
  setCurrentTab,
  selectedInspectorUser,
  setSelectedInspectorUser
}: DashboardProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [settings, setSettings] = useState({
    signUpPoints: 100,
    checkInPoints: 10,
    bonus5Days: 150,
    bonus10Days: 200,
    bonus15Days: 250,
    bonus30Days: 300
  });

  const [loading, setLoading] = useState(true);

  // Active tab state inside the History Drawer
  const [activeHistoryTab, setActiveHistoryTab] = useState<'summary' | 'points' | 'attendance' | 'memorization' | 'events' | 'logs'>('summary');

  const [showHelpTooltip, setShowHelpTooltip] = useState(false);

  useEffect(() => {
    if (!showHelpTooltip) return;
    const handleOutsideClick = () => {
      setShowHelpTooltip(false);
    };
    document.addEventListener('click', handleOutsideClick);
    return () => {
      document.removeEventListener('click', handleOutsideClick);
    };
  }, [showHelpTooltip]);

  // Real-time listener for users
  useEffect(() => {
    const q = query(collection(db, 'users'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const userList: User[] = [];
      snapshot.forEach((doc) => {
        userList.push({ id: doc.id, ...doc.data() } as User);
      });
      setUsers(userList);
      setLoading(false);
    }, (error) => {
      console.error("Error listening to users: ", error);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Real-time listener for events
  useEffect(() => {
    const q = query(collection(db, 'events'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const eventList: EventItem[] = [];
      snapshot.forEach((doc) => {
        eventList.push({ id: doc.id, ...doc.data() } as EventItem);
      });
      setEvents(eventList);
    }, () => {});
    return () => unsubscribe();
  }, []);

  // Real-time listener for notices
  useEffect(() => {
    const q = query(collection(db, 'notices'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const noticeList: NoticeItem[] = [];
      snapshot.forEach((doc) => {
        noticeList.push({ id: doc.id, ...doc.data() } as NoticeItem);
      });
      noticeList.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return (b.rawTimestamp || 0) - (a.rawTimestamp || 0);
      });
      setNotices(noticeList);
    }, () => {});
    return () => unsubscribe();
  }, []);

  // Real-time listener for settings
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'settings', 'global'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setSettings({
          signUpPoints: data.signUpPoints || 100,
          checkInPoints: data.checkInPoints || 10,
          bonus5Days: data.bonus5Days || 150,
          bonus10Days: data.bonus10Days || 200,
          bonus15Days: data.bonus15Days || 250,
          bonus30Days: data.bonus30Days || 300
        });
      }
    });
    return () => unsubscribe();
  }, []);

  const totalVerses = BIBLE_DATA_RAW.length;

  // Helper: format user verse position
  const getVerseText = (index: number) => {
    if (index === 0) return '미시작 (0%)';
    if (index >= totalVerses) return '요한계시록 완주 완료 🎉';
    const verse = BIBLE_DATA_RAW[index];
    return verse ? `요한계시록 ${verse.chapter}장 ${verse.verse}절` : `미시작 (0%)`;
  };

  const formatDateOnly = (dateStr: string) => {
    if (!dateStr) return '';
    if (dateStr.includes('-') && dateStr.includes(' ')) {
      return dateStr.split(' ')[0];
    }
    const timeIndex = dateStr.indexOf('오');
    if (timeIndex !== -1) {
      return dateStr.substring(0, timeIndex).trim();
    }
    const match = dateStr.match(/\s*(am|pm)/i);
    if (match && match.index !== undefined) {
      return dateStr.substring(0, match.index).trim();
    }
    return dateStr;
  };

  const getSignupDate = (user: User) => {
    const signupEvent = user.pointsHistory?.find(h => h.type === 'signup');
    if (signupEvent) return formatDateOnly(signupEvent.date);
    if (user.pointsHistory && user.pointsHistory.length > 0) {
      const sorted = [...user.pointsHistory].sort((a, b) => a.date.localeCompare(b.date));
      return formatDateOnly(sorted[0].date);
    }
    return '가입일 정보 없음';
  };

  const getAttendanceHistory = (user: User) => {
    const dates = new Set<string>();
    user.pointsHistory?.forEach(h => {
      if (h.type === 'attendance') {
        dates.add(formatDateOnly(h.date));
      }
    });
    user.checkInHistory?.forEach(d => {
      dates.add(formatDateOnly(d));
    });
    return Array.from(dates).sort((a, b) => b.localeCompare(a));
  };

  const getTodayDateStr = () => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const getYesterdayDateStr = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const todayStr = getTodayDateStr();
  const yesterdayStr = getYesterdayDateStr();

  // Determine if we should show mock values for premium experience
  const isDbEmpty = users.length === 0 && !loading;

  // Render variables & Mock Generation
  let displayUsers = users;
  let displayEvents = events;
  let displayNotices = notices;

  if (isDbEmpty) {
    displayUsers = [
      {
        id: 'mock1',
        username: 'faith_0312',
        name: '정신혜',
        email: 'faith0312@gmail.com',
        role: 'user',
        points: 2450,
        consecutiveCheckIns: 5,
        lastCheckInDate: todayStr,
        lastMissionDate: todayStr,
        currentVerseIndex: 120, // 7장 완료자
        os: 'Android',
        pointsHistory: [
          { id: 'h1', type: 'signup', title: '회원가입 축하금', amount: 100, date: '2026-06-02 10:00:00' },
          { id: 'h2', type: 'attendance', title: '일일 출석 체크', amount: 10, date: todayStr + ' 08:30:12' },
          { id: 'h3', type: 'challenge', title: '암송 성공 (요한계시록 3장 2절)', amount: 50, date: todayStr + ' 09:05:44' }
        ]
      },
      {
        id: 'mock2',
        username: 'grace_jun',
        name: '이준우',
        email: 'gracejun@naver.com',
        role: 'user',
        points: 4890,
        consecutiveCheckIns: 12,
        lastCheckInDate: todayStr,
        lastMissionDate: todayStr,
        currentVerseIndex: 320, // 21장 완료자
        os: 'iOS',
        pointsHistory: [
          { id: 'h4', type: 'attendance', title: '연속 출석 보너스 (12일차)', amount: 30, date: todayStr + ' 07:12:00' },
          { id: 'h5', type: 'challenge', title: '암송 성공 (요한계시록 21장 2절)', amount: 80, date: '2026-06-02 13:45:00' }
        ]
      },
      {
        id: 'mock3',
        username: 'bible_lover',
        name: '박은혜',
        email: 'biblelover@gmail.com',
        role: 'user',
        points: 1520,
        consecutiveCheckIns: 0,
        lastCheckInDate: yesterdayStr,
        lastMissionDate: yesterdayStr,
        currentVerseIndex: 85, // 5장
        os: 'Android',
        pointsHistory: [
          { id: 'h6', type: 'signup', title: '회원가입 축하금', amount: 100, date: '2026-06-01 14:22:01' }
        ]
      },
      {
        id: 'mock4',
        username: 'hope_777',
        name: '최소망',
        email: 'hope777@gmail.com',
        role: 'user',
        points: 3820,
        consecutiveCheckIns: 3,
        lastCheckInDate: todayStr,
        lastMissionDate: null,
        currentVerseIndex: 45, // 3장
        os: 'iOS',
        pointsHistory: [
          { id: 'h7', type: 'signup', title: '회원가입 축하금', amount: 100, date: '2026-06-01 11:08:00' },
          { id: 'h8', type: 'attendance', title: '일일 출석 체크', amount: 10, date: todayStr + ' 11:45:00' }
        ]
      },
      {
        id: 'mock5',
        username: 'simon_lee',
        name: '이시몬',
        email: 'simonlee@naver.com',
        role: 'user',
        points: 5820,
        consecutiveCheckIns: 30,
        lastCheckInDate: yesterdayStr,
        lastMissionDate: null,
        currentVerseIndex: 250, // 15장
        os: 'Android',
        pointsHistory: [
          { id: 'h9', type: 'signup', title: '회원가입 축하금', amount: 100, date: '2026-06-01 11:00:00' },
          { id: 'h10', type: 'attendance', title: '5월 연속 출석', amount: 150, date: '2026-06-01 22:31:00' }
        ]
      }
    ];

    displayEvents = [
      {
        id: 'mock_event_1',
        title: '7일 출석 이벤트',
        description: '7일 연속 출석 미션 성공 시 보너스 200P!',
        rewardPoints: 200,
        imageUrl: 'https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=100&auto=format&fit=crop&q=60',
        active: true,
        startDate: '2026.06.01',
        endDate: '2026.06.30',
        participantsCount: 102
      },
      {
        id: 'mock_event_2',
        title: 'Easy 챌린지 이벤트',
        description: '요한계시록 1~5장 쉬움 난이도 완료자',
        rewardPoints: 80,
        imageUrl: 'https://images.unsplash.com/photo-1504052434569-70ad58565b90?w=100&auto=format&fit=crop&q=60',
        active: true,
        startDate: '2026.05.25',
        endDate: '2026.06.15',
        participantsCount: 78
      },
      {
        id: 'mock_event_3',
        title: '신규 가입 이벤트',
        description: '6월 한달 신규 가입자 전원 웰컴 보너스 지급',
        rewardPoints: 100,
        imageUrl: 'https://images.unsplash.com/photo-1461360370896-922624d12aa1?w=100&auto=format&fit=crop&q=60',
        active: true,
        startDate: '2026.06.01',
        endDate: '2026.06.30',
        participantsCount: 65
      }
    ];

    displayNotices = [
      {
        id: 'mock_notice_1',
        title: '서비스 점검 안내',
        content: '',
        pinned: false,
        active: true,
        createdAt: '2026.06.05'
      },
      {
        id: 'mock_notice_2',
        title: '포인트 정책 변경 안내',
        content: '',
        pinned: false,
        active: true,
        createdAt: '2026.06.01'
      },
      {
        id: 'mock_notice_3',
        title: '6월 이벤트 안내',
        content: '',
        pinned: false,
        active: true,
        createdAt: '2026.05.31'
      },
      {
        id: 'mock_notice_4',
        title: '이용약관 변경 안내',
        content: '',
        pinned: false,
        active: true,
        createdAt: '2026.05.28'
      }
    ];
  }

  // 1. STATS GRID CALCULATIONS
  const totalMembers = isDbEmpty ? 321 : displayUsers.length;
  const todaySignups = displayUsers.filter(u => {
    const signupRecord = u.pointsHistory?.find(h => h.type === 'signup');
    if (!signupRecord) return false;
    return signupRecord.date.startsWith(todayStr);
  }).length;

  const todayAttendance = isDbEmpty ? 1 : displayUsers.filter(u => u.lastCheckInDate === todayStr).length;
  const yesterdayAttendance = displayUsers.filter(u => u.lastCheckInDate === yesterdayStr).length;
  const attendanceChange = todayAttendance - yesterdayAttendance;

  const todayQuizParticipants = isDbEmpty ? 0 : displayUsers.filter(u => u.lastMissionDate === todayStr).length;
  const yesterdayQuizParticipants = displayUsers.filter(u => u.lastMissionDate === yesterdayStr).length;
  const quizChange = todayQuizParticipants - yesterdayQuizParticipants;

  let todayPaidPoints = 0;
  let yesterdayPaidPoints = 0;
  displayUsers.forEach(u => {
    u.pointsHistory?.forEach(h => {
      const amt = Number(h.amount) || 0;
      if (amt > 0) {
        if (h.date.startsWith(todayStr)) todayPaidPoints += amt;
        if (h.date.startsWith(yesterdayStr)) yesterdayPaidPoints += amt;
      }
    });
  });
  const pointsChange = todayPaidPoints - yesterdayPaidPoints;

  // Chapter boundaries mapping
  const chapterMap: Record<number, number> = {};
  for (let c = 1; c <= 22; c++) {
    const idx = BIBLE_DATA_RAW.findIndex(v => v.chapter === c);
    chapterMap[c] = idx !== -1 ? idx : totalVerses;
  }

  const getChapterOfUser = (index: number) => {
    if (index === 0) return 0;
    if (index >= totalVerses) return 22;
    const verse = BIBLE_DATA_RAW[index];
    return verse ? verse.chapter : 0;
  };

  const chap22StartIndex = chapterMap[22];
  const completersCount = isDbEmpty ? 12 : displayUsers.filter(u => u.currentVerseIndex >= chap22StartIndex).length;
  const activeEventsCount = displayEvents.filter(e => e.active).length;

  // 2. BAR CHART: 요한계시록 장별 완료 현황
  const mockCounts = [120, 102, 81, 63, 52, 45, 38, 31, 28, 24, 20, 17, 15, 12, 11, 10, 9, 8, 7, 5, 12];
  const chapterCounts = Array.from({ length: 21 }, (_, i) => {
    const ch = i + 1;
    if (isDbEmpty) {
      return mockCounts[i];
    } else {
      const nextChapterStart = ch === 21 ? chap22StartIndex : chapterMap[ch + 1];
      return displayUsers.filter(u => u.currentVerseIndex >= nextChapterStart).length;
    }
  });

  const maxCompletionCount = Math.max(...chapterCounts) || 1;

  let yMax = 150;
  if (maxCompletionCount > 150) {
    yMax = Math.ceil(maxCompletionCount / 50) * 50;
  } else if (maxCompletionCount > 100) {
    yMax = 150;
  } else if (maxCompletionCount > 50) {
    yMax = 100;
  } else if (maxCompletionCount > 20) {
    yMax = 50;
  } else {
    yMax = Math.ceil(maxCompletionCount / 5) * 5 || 5;
  }

  // 3. BAR CHART METRICS
  const ch1CompletedCount = chapterCounts[0];
  const ch10CompletedCount = chapterCounts[9];
  const ch21CompletedCount = chapterCounts[20];

  const ch1Rate = Math.round((ch1CompletedCount / totalMembers) * 1000) / 10;
  const ch10Rate = Math.round((ch10CompletedCount / totalMembers) * 1000) / 10;
  const ch21Rate = Math.round((ch21CompletedCount / totalMembers) * 1000) / 10;

  // Calculate highest drop-off interval
  let maxDropRate = 0;
  let maxDropInterval = { from: 3, to: 4, fromCount: 81, toCount: 63 };
  for (let ch = 1; ch <= 20; ch++) {
    const fromCount = chapterCounts[ch - 1];
    const toCount = chapterCounts[ch];
    if (fromCount > 0) {
      const dropRate = ((fromCount - toCount) / fromCount) * 100;
      if (dropRate > maxDropRate) {
        maxDropRate = dropRate;
        maxDropInterval = { from: ch, to: ch + 1, fromCount, toCount };
      }
    }
  }
  const calculatedDropRate = Math.round(maxDropRate * 10) / 10;

  // 4. DONUT CHART: 진도 분포
  const progressCounts = { g1: 0, g2: 0, g3: 0, g4: 0, g5: 0, g6: 0 };
  if (isDbEmpty) {
    progressCounts.g1 = 102; // 1~5장
    progressCounts.g2 = 68;  // 6~10장
    progressCounts.g3 = 54;  // 11~15장
    progressCounts.g4 = 45;  // 16~20장
    progressCounts.g5 = 12;  // 21장 완료
    progressCounts.g6 = 40;  // 학습 전
  } else {
    displayUsers.forEach(u => {
      const ch = getChapterOfUser(u.currentVerseIndex);
      if (ch === 0) progressCounts.g6++;
      else if (ch >= 1 && ch <= 5) progressCounts.g1++;
      else if (ch >= 6 && ch <= 10) progressCounts.g2++;
      else if (ch >= 11 && ch <= 15) progressCounts.g3++;
      else if (ch >= 16 && ch <= 20) progressCounts.g4++;
      else if (ch >= 21) progressCounts.g5++;
    });
  }

  const progressPcts = {
    g1: Math.round((progressCounts.g1 / totalMembers) * 1000) / 10,
    g2: Math.round((progressCounts.g2 / totalMembers) * 1000) / 10,
    g3: Math.round((progressCounts.g3 / totalMembers) * 1000) / 10,
    g4: Math.round((progressCounts.g4 / totalMembers) * 1000) / 10,
    g5: Math.round((progressCounts.g5 / totalMembers) * 1000) / 10,
    g6: Math.round((progressCounts.g6 / totalMembers) * 1000) / 10
  };

  const donutRadius = 60;
  const donutStroke = 18;
  const donutCirc = 2 * Math.PI * donutRadius;

  const donutSlices = [
    { label: '1 ~ 5장', count: progressCounts.g1, pct: progressPcts.g1, color: '#3b82f6' },
    { label: '6 ~ 10장', count: progressCounts.g2, pct: progressPcts.g2, color: '#10b981' },
    { label: '11 ~ 15장', count: progressCounts.g3, pct: progressPcts.g3, color: '#f59e0b' },
    { label: '16 ~ 20장', count: progressCounts.g4, pct: progressPcts.g4, color: '#8b5cf6' },
    { label: '21장 완료', count: progressCounts.g5, pct: progressPcts.g5, color: '#ec4899' },
    { label: '학습 전', count: progressCounts.g6, pct: progressPcts.g6, color: '#9ca3af' }
  ];

  // OS distribution calculations
  const iosCount = isDbEmpty ? 2 : displayUsers.filter(u => u.os?.toLowerCase() === 'ios').length;
  const androidCount = isDbEmpty ? 3 : displayUsers.filter(u => u.os?.toLowerCase() === 'android' || u.os?.toLowerCase() === 'aos').length;
  const unknownCount = totalMembers - iosCount - androidCount;

  // 5. ACTIVITY LISTS
  // Flatten activities
  interface ActivityItem {
    id: string;
    username: string;
    name?: string;
    type: string;
    title: string;
    amount: number;
    time: string;
  }

  const activities: ActivityItem[] = [];
  displayUsers.forEach(u => {
    u.pointsHistory?.forEach(h => {
      activities.push({
        id: h.id,
        username: u.username,
        name: u.name,
        type: h.type,
        title: h.title,
        amount: h.amount,
        time: h.date
      });
    });
  });

  activities.sort((a, b) => b.time.localeCompare(a.time));
  const recentActivities = isDbEmpty ? [
    { id: '1', username: 'bible_777', name: '김태호', type: 'admin', title: '관리자 지급', amount: 500, time: '06.02 14:32' },
    { id: '2', username: 'grace_jun', name: '이준우', type: 'challenge', title: 'Easy 챌린지', amount: 80, time: '06.02 13:45' },
    { id: '3', username: 'faith_0312', name: '정신혜', type: 'attendance', title: '출석 체크', amount: 10, time: '06.02 09:12' },
    { id: '4', username: 'simon_lee', name: '이시몬', type: 'attendance', title: '5월 연속 출석', amount: 150, time: '06.01 22:31' },
    { id: '5', username: 'hope_777', name: '최소망', type: 'signup', title: '회원가입 보너스', amount: 100, time: '06.01 11:08' }
  ] : activities.slice(0, 5).map(act => ({
    id: act.id,
    username: act.username,
    name: act.name,
    type: act.type,
    title: act.title,
    amount: act.amount,
    time: act.time.includes(' ') ? act.time.split(' ')[0].substring(5) + ' ' + act.time.split(' ')[1].substring(0, 5) : act.time
  }));

  // Recent Users: 5 most recent signups
  const sortedUsersBySignup = [...displayUsers].sort((a, b) => {
    const signupA = a.pointsHistory?.find(h => h.type === 'signup')?.date || '0000-00-00';
    const signupB = b.pointsHistory?.find(h => h.type === 'signup')?.date || '0000-00-00';
    return signupB.localeCompare(signupA);
  });
  const recentUsersList = sortedUsersBySignup.slice(0, 5);

  // Timeline activities constructor
  const getTimelineActivities = (user: User) => {
    interface ActivityTimelineItem {
      id: string;
      type: 'attendance' | 'challenge' | 'bonus' | 'signup' | 'chapter_complete' | 'admin';
      title: string;
      sublabel?: string;
      date: string;
      amount?: number;
      badge?: string;
    }
    const items: ActivityTimelineItem[] = [];

    // 1. Points History items
    user.pointsHistory?.forEach((h, idx) => {
      let type: ActivityTimelineItem['type'] = 'admin';
      if (h.type === 'attendance') type = 'attendance';
      else if (h.type === 'signup') type = 'signup';
      else if (h.type === 'challenge') type = 'challenge';
      else if (h.type?.includes('bonus') || h.title?.includes('보너스')) type = 'bonus';

      items.push({
        id: h.id || `pt-${idx}`,
        type,
        title: h.title,
        date: h.date,
        amount: h.amount
      });
    });

    // 2. Attendance history items (avoid duplicate if already in points history)
    const attendanceDates = getAttendanceHistory(user);
    attendanceDates.forEach((dateStr, idx) => {
      const hasPointEvent = user.pointsHistory?.some(h => h.type === 'attendance' && formatDateOnly(h.date) === dateStr);
      if (!hasPointEvent) {
        items.push({
          id: `att-${idx}`,
          type: 'attendance',
          title: '출석 체크 완료',
          date: dateStr + ' 09:00:00'
        });
      }
    });

    // 3. Mock some chapter completions based on current verse index for realistic UI
    const currentChapter = getChapterOfUser(user.currentVerseIndex);
    if (currentChapter > 1) {
      for (let c = 1; c < currentChapter; c++) {
        items.push({
          id: `chap-${c}`,
          type: 'chapter_complete',
          title: `요한계시록 ${c}장 완료`,
          date: `2026-06-0${Math.min(9, c)} 22:30:00`,
          badge: `${c + 1}장 진입`
        });
      }
    }

    return items.sort((a, b) => b.date.localeCompare(a.date));
  };

  return (
    <div className="view-container" style={{ padding: '1.5rem', maxWidth: '100%' }}>
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
          <span className="material-icons-round" style={{ fontSize: '3rem', color: 'var(--accent-purple)', animation: 'spin 1.5s linear infinite' }}>
            sync
          </span>
        </div>
      ) : (
        <div className="dashboard-wrapper-premium">
          {/* LEFT COLUMN: Main Dashboard Content */}
          <div className="dashboard-left-content">
            {/* STATS GRID (6 Indicator Cards) */}
            <div className="stats-grid-6">
              <div className="glass-panel stat-card-premium">
                <div className="stat-info">
                  <span className="stat-lbl-premium">전체 회원 수</span>
                  <span className="stat-val-premium">{totalMembers}명</span>
                  <span className="stat-change-premium text-plus">전일 대비 +{isDbEmpty ? '0' : todaySignups}명</span>
                </div>
                <div className="stat-icon-premium" style={{ background: '#eef2ff', color: '#4f46e5' }}>
                  <span className="material-icons-round">people</span>
                </div>
              </div>

              <div className="glass-panel stat-card-premium">
                <div className="stat-info">
                  <span className="stat-lbl-premium">오늘 출석자 수</span>
                  <span className="stat-val-premium">{todayAttendance}명</span>
                  <span className={`stat-change-premium ${attendanceChange >= 0 ? 'text-plus' : 'text-minus'}`}>
                    전일 대비 {attendanceChange >= 0 ? '+' : ''}{attendanceChange}명
                  </span>
                </div>
                <div className="stat-icon-premium" style={{ background: '#ecfdf5', color: '#059669' }}>
                  <span className="material-icons-round">how_to_reg</span>
                </div>
              </div>

              <div className="glass-panel stat-card-premium">
                <div className="stat-info">
                  <span className="stat-lbl-premium">오늘 퀴즈 참여자 수</span>
                  <span className="stat-val-premium">{todayQuizParticipants}명</span>
                  <span className={`stat-change-premium ${quizChange >= 0 ? 'text-plus' : 'text-minus'}`}>
                    전일 대비 {quizChange >= 0 ? '+' : ''}{quizChange}명
                  </span>
                </div>
                <div className="stat-icon-premium" style={{ background: '#fef3c7', color: '#d97706' }}>
                  <span className="material-icons-round">psychology</span>
                </div>
              </div>

              <div className="glass-panel stat-card-premium">
                <div className="stat-info">
                  <span className="stat-lbl-premium">오늘 지급 포인트</span>
                  <span className="stat-val-premium">{todayPaidPoints.toLocaleString()}P</span>
                  <span className={`stat-change-premium ${pointsChange >= 0 ? 'text-plus' : 'text-minus'}`}>
                    전일 대비 {pointsChange >= 0 ? '+' : ''}{pointsChange}P
                  </span>
                </div>
                <div className="stat-icon-premium" style={{ background: '#fff7ed', color: '#ea580c' }}>
                  <span className="material-icons-round">toll</span>
                </div>
              </div>

              <div className="glass-panel stat-card-premium">
                <div className="stat-info">
                  <span className="stat-lbl-premium">21장 완주자 수</span>
                  <span className="stat-val-premium">{completersCount}명</span>
                  <span className="stat-change-premium text-plus">전일 대비 +0명</span>
                </div>
                <div className="stat-icon-premium" style={{ background: '#fdf2f8', color: '#db2777' }}>
                  <span className="material-icons-round">workspace_premium</span>
                </div>
              </div>

              <div className="glass-panel stat-card-premium">
                <div className="stat-info">
                  <span className="stat-lbl-premium">진행 중 이벤트</span>
                  <span className="stat-val-premium">{activeEventsCount}개</span>
                  <span className="stat-change-premium text-link" onClick={() => setCurrentTab('events')}>
                    전체 이벤트 보기 &gt;
                  </span>
                </div>
                <div className="stat-icon-premium" style={{ background: '#f0fdfa', color: '#0d9488' }}>
                  <span className="material-icons-round">event_available</span>
                </div>
              </div>
            </div>

            {/* MAIN ROW 1: SVG Bar Chart & Donut Chart Layout */}
            <div className="dashboard-charts-layout">
              {/* 요한계시록 장별 완료 현황 (Bar Chart) */}
              <div className="glass-panel main-chart-box">
                <div className="card-header-row" style={{ marginBottom: '1.5rem', position: 'relative' }}>
                  <h2 className="card-title-premium">
                    요한계시록 장별 완료 현황
                    <button
                      type="button"
                      className="info-icon-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowHelpTooltip(!showHelpTooltip);
                      }}
                      style={{ cursor: 'pointer', border: 'none', background: 'none', display: 'inline-flex', padding: 0 }}
                      aria-label="도움말 표시"
                    >
                      <span className="material-icons-round info-icon">help_outline</span>
                    </button>

                    {showHelpTooltip && (
                      <div className="premium-help-tooltip" onClick={(e) => e.stopPropagation()}>
                        <div className="tooltip-header">
                          <h3>장별 완료 현황 도움말</h3>
                          <button
                            type="button"
                            className="close-tooltip-btn"
                            onClick={() => setShowHelpTooltip(false)}
                          >
                            <span className="material-icons-round">close</span>
                          </button>
                        </div>
                        <div className="tooltip-body">
                          <p><strong>📊 장별 완료자 수:</strong></p>
                          <p>각 장을 완전히 암송하고 <strong>다음 장 이상으로 진입한 누적 회원 수</strong>를 의미합니다. (예: 1장 완료자는 2장 이상에 도달한 회원 수)</p>
                          <hr />
                          <p><strong>📉 이탈 분석 계산법:</strong></p>
                          <ul>
                            <li><strong>완료율:</strong> 해당 장의 완료자 수 / 전체 회원 수</li>
                            <li><strong>구간 이탈률:</strong> 이전 장 완료자 대비 현재 장 완료자의 감소 비율</li>
                            <li><strong>공식:</strong> <code>((이전 장 완료자 - 현재 장 완료자) / 이전 장 완료자) &times; 100%</code></li>
                          </ul>
                          <hr />
                          <p>💡 회원들이 막히거나 암송을 포기하기 쉬운 구간을 한눈에 시각화하여 신속하게 학습을 코칭할 수 있도록 돕습니다.</p>
                        </div>
                      </div>
                    )}
                  </h2>
                  <select className="premium-select">
                    <option>전체 회원 기준</option>
                  </select>
                </div>

                <div className="svg-chart-container">
                  <svg viewBox="0 0 600 300" width="100%" height="100%" style={{ background: 'transparent' }}>
                    {/* Grid Lines & Y-Axis Labels */}
                    {[1, 0.67, 0.33, 0].map((ratio, idx) => {
                      const y = 30 + (1 - ratio) * 220;
                      const val = Math.round(yMax * ratio);
                      return (
                        <g key={idx}>
                          <text
                            x="35"
                            y={y + 3}
                            fill="var(--text-muted)"
                            fontSize="9"
                            fontWeight="600"
                            textAnchor="end"
                          >
                            {val}
                          </text>
                          <line
                            x1="45"
                            y1={y}
                            x2="585"
                            y2={y}
                            stroke="rgba(184, 134, 11, 0.1)"
                            strokeWidth="1"
                            strokeDasharray={ratio === 0 ? "none" : "4 4"}
                          />
                        </g>
                      );
                    })}

                    {/* Bars */}
                    {chapterCounts.map((count, i) => {
                      const barWidth = 12;
                      const x = 55 + i * 25;
                      const barHeight = yMax > 0 ? (count / yMax) * 220 : 0;
                      const y = 250 - barHeight;
                      const radius = Math.min(6, barHeight);

                      return (
                        <g key={i} className="chart-bar-group">
                          {/* Background Pill Track */}
                          <rect
                            x={x}
                            y={30}
                            width={barWidth}
                            height={220}
                            rx={barWidth / 2}
                            fill="rgba(184, 134, 11, 0.04)"
                          />
                          {/* Active Rounded-top Bar */}
                          {count > 0 && (
                            <path
                              d={`M ${x},250 L ${x},${y + radius} A ${radius},${radius} 0 0 1 ${x + barWidth},${y + radius} L ${x + barWidth},250 Z`}
                              fill="url(#barBlueGrad)"
                            />
                          )}
                          {/* Label value at the top */}
                          {count > 0 && (
                            <text
                              x={x + barWidth / 2}
                              y={y - 8}
                              fill="var(--text-primary)"
                              fontSize="9"
                              fontWeight="700"
                              textAnchor="middle"
                            >
                              {count}
                            </text>
                          )}
                          {/* X-Axis Label */}
                          <text
                            x={x + barWidth / 2}
                            y="268"
                            fill="var(--text-secondary)"
                            fontSize="9"
                            fontWeight="600"
                            textAnchor="middle"
                          >
                            {i + 1}장
                          </text>
                        </g>
                      );
                    })}

                    <defs>
                      <linearGradient id="barBlueGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" />
                        <stop offset="100%" stopColor="#60a5fa" />
                      </linearGradient>
                    </defs>
                  </svg>
                </div>

                {/* Sub-Metrics Boxes */}
                <div className="bar-sub-metrics-grid">
                  <div className="sub-metric-box">
                    <div className="box-header-row">
                      <span className="sub-lbl">1장 완료율</span>
                      <span className="material-icons-round" style={{ color: '#4f46e5', fontSize: '1.2rem' }}>flag</span>
                    </div>
                    <div className="sub-val">{ch1Rate}%</div>
                    <div className="sub-desc">{ch1CompletedCount}명 / {totalMembers}명</div>
                  </div>
                  <div className="sub-metric-box">
                    <div className="box-header-row">
                      <span className="sub-lbl">10장 완료율</span>
                      <span className="material-icons-round" style={{ color: '#f59e0b', fontSize: '1.2rem' }}>star</span>
                    </div>
                    <div className="sub-val">{ch10Rate}%</div>
                    <div className="sub-desc">{ch10CompletedCount}명 / {totalMembers}명</div>
                  </div>
                  <div className="sub-metric-box">
                    <div className="box-header-row">
                      <span className="sub-lbl">21장 완료율</span>
                      <span className="material-icons-round" style={{ color: '#db2777', fontSize: '1.2rem' }}>workspace_premium</span>
                    </div>
                    <div className="sub-val">{ch21Rate}%</div>
                    <div className="sub-desc">{ch21CompletedCount}명 / {totalMembers}명</div>
                  </div>
                  <div className="sub-metric-box highlight">
                    <div className="box-header-row">
                      <span className="sub-lbl" style={{ color: 'var(--accent-rose)' }}>가장 많이 이탈한 구간</span>
                      <span className="material-icons-round" style={{ color: 'var(--accent-rose)', fontSize: '1.2rem' }}>trending_down</span>
                    </div>
                    <div className="sub-val" style={{ color: 'var(--accent-rose)' }}>
                      {isDbEmpty ? '3장 -> 4장' : (maxDropRate > 0 ? `${maxDropInterval.from}장 -> ${maxDropInterval.to}장` : '이탈 구간 없음')}
                    </div>
                    <div className="sub-desc" style={{ color: 'var(--text-muted)' }}>
                      {isDbEmpty 
                        ? '이탈률 22.2% (81명 → 63명)' 
                        : (maxDropRate > 0 
                            ? `이탈률 ${calculatedDropRate}% (${maxDropInterval.fromCount}명 → ${maxDropInterval.toCount}명)` 
                            : '이탈 분석을 위한 완료자가 부족합니다.')}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Donut Chart & Weekly Summary */}
              <div className="dashboard-donut-column">
                {/* 진도 분포 */}
                <div className="glass-panel donut-card-premium">
                  <h2 className="card-title-premium" style={{ marginBottom: '1.25rem' }}>진도 분포</h2>
                  <div className="donut-main-container">
                    {/* SVG Donut */}
                    <div style={{ position: 'relative', width: '130px', height: '130px', flexShrink: 0 }}>
                      <svg width="130" height="130" viewBox="0 0 150 150" style={{ transform: 'rotate(-90deg)' }}>
                        <circle cx="75" cy="75" r={donutRadius} stroke="rgba(0,0,0,0.03)" strokeWidth={donutStroke} fill="transparent" />
                        {(() => {
                          let accumulatedAngle = 0;
                          return donutSlices.map((slice, idx) => {
                            if (slice.pct === 0) return null;
                            const offset = donutCirc - (slice.pct / 100) * donutCirc;
                            const rotation = accumulatedAngle;
                            accumulatedAngle += (slice.pct / 100) * 360;

                            return (
                              <circle
                                key={idx}
                                cx="75"
                                cy="75"
                                r={donutRadius}
                                stroke={slice.color}
                                strokeWidth={donutStroke}
                                fill="transparent"
                                strokeDasharray={donutCirc}
                                strokeDashoffset={offset}
                                style={{
                                  transform: `rotate(${rotation}deg)`,
                                  transformOrigin: '75px 75px',
                                  transition: 'all 0.5s ease'
                                }}
                              />
                            );
                          });
                        })()}
                      </svg>

                      <div className="donut-center-text">
                        <div className="donut-center-title">전체 회원</div>
                        <div className="donut-center-val">{totalMembers}명</div>
                      </div>
                    </div>

                    {/* Donut Legend */}
                    <div className="donut-legend-premium">
                      {donutSlices.map((slice, idx) => (
                        <div key={idx} className="legend-row-premium">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <span className="legend-dot-premium" style={{ background: slice.color }}></span>
                            <span className="legend-lbl-premium">{slice.label}</span>
                          </div>
                          <span className="legend-val-premium">
                            {slice.count}명 ({slice.pct}%)
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* OS 기기 분포 */}
                <div className="glass-panel donut-card-premium" style={{ marginTop: '1rem', padding: '1.25rem' }}>
                  <h2 className="card-title-premium" style={{ marginBottom: '1rem' }}>기기 OS별 분포</h2>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {/* iOS Bar */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.25rem' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontWeight: 600 }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#007AFF' }}></span>
                          iOS
                        </span>
                        <span>{iosCount}명 ({totalMembers > 0 ? Math.round((iosCount / totalMembers) * 100) : 0}%)</span>
                      </div>
                      <div style={{ height: '8px', background: 'rgba(0,0,0,0.04)', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ width: `${totalMembers > 0 ? (iosCount / totalMembers) * 100 : 0}%`, height: '100%', background: '#007AFF', borderRadius: '4px' }}></div>
                      </div>
                    </div>

                    {/* Android Bar */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.25rem' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontWeight: 600 }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#34C759' }}></span>
                          Android (AOS)
                        </span>
                        <span>{androidCount}명 ({totalMembers > 0 ? Math.round((androidCount / totalMembers) * 100) : 0}%)</span>
                      </div>
                      <div style={{ height: '8px', background: 'rgba(0,0,0,0.04)', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ width: `${totalMembers > 0 ? (androidCount / totalMembers) * 100 : 0}%`, height: '100%', background: '#34C759', borderRadius: '4px' }}></div>
                      </div>
                    </div>

                    {/* Web / Unknown Bar */}
                    {unknownCount > 0 && (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.25rem' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontWeight: 600 }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#9ca3af' }}></span>
                            Web / 기타
                          </span>
                          <span>{unknownCount}명 ({totalMembers > 0 ? Math.round((unknownCount / totalMembers) * 100) : 0}%)</span>
                        </div>
                        <div style={{ height: '8px', background: 'rgba(0,0,0,0.04)', borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{ width: `${(unknownCount / totalMembers) * 100}%`, height: '100%', background: '#9ca3af', borderRadius: '4px' }}></div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* 이번 주 요약 */}
                <div className="glass-panel summary-card-premium">
                  <h2 className="card-title-premium" style={{ marginBottom: '1rem' }}>이번 주 요약 <span className="summary-date-span">(05.27 ~ 06.02)</span></h2>
                  <div className="summary-stats-grid">
                    <div className="summary-stat-premium">
                      <span className="lbl">가입자</span>
                      <span className="val color-blue">+14%</span>
                      <span className="desc">42명</span>
                    </div>
                    <div className="summary-stat-premium">
                      <span className="lbl">학습률</span>
                      <span className="val color-green">+8%</span>
                      <span className="desc">▲ 지난주 대비</span>
                    </div>
                    <div className="summary-stat-premium">
                      <span className="lbl">가장 인기 장</span>
                      <span className="val color-dark">3장</span>
                      <span className="desc">완료자 81명</span>
                    </div>
                    <div className="summary-stat-premium">
                      <span className="lbl">이탈 구간</span>
                      <span className="val color-red">7장 → 8장</span>
                      <span className="desc">이탈률 19.8%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* MAIN ROW 2: Four-Column Management Widgets */}
            <div className="dashboard-grids-4">
              {/* 최근 가입 회원 */}
              <div className="glass-panel grid-list-card">
                <div className="card-header-row">
                  <h3 className="card-title-sub">최근 가입 회원</h3>
                  <span className="card-link" onClick={() => setCurrentTab('members')}>더보기 &gt;</span>
                </div>
                <div className="premium-list-container">
                  <table className="premium-compact-table">
                    <thead>
                      <tr>
                        <th style={{ width: '40px' }}>No.</th>
                        <th>사용자명</th>
                        <th>가입일</th>
                        <th style={{ textAlign: 'right' }}>포인트</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentUsersList.map((u, idx) => (
                        <tr key={u.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedInspectorUser(u)}>
                          <td>{idx + 1}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <div className="avatar-mini-premium">
                                {(u.name || u.username).charAt(0).toUpperCase()}
                              </div>
                              <div className="user-info-text">
                                <div className="name">{u.name || '이름 없음'}</div>
                                <div className="id">@{u.username}</div>
                              </div>
                            </div>
                          </td>
                          <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {getSignupDate(u)}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                            {u.points.toLocaleString()}P
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 진행 중 이벤트 */}
              <div className="glass-panel grid-list-card">
                <div className="card-header-row">
                  <h3 className="card-title-sub">진행 중 이벤트</h3>
                  <span className="card-link" onClick={() => setCurrentTab('events')}>이벤트 관리 &gt;</span>
                </div>
                <div className="premium-list-container gap-list">
                  {displayEvents.slice(0, 3).map((evt) => (
                    <div key={evt.id} className="event-list-item-premium">
                      <img src={evt.imageUrl} alt={evt.title} className="event-thumb" />
                      <div className="event-info">
                        <div className="title">{evt.title}</div>
                        <div className="date">{evt.startDate} ~ {evt.endDate}</div>
                        <div className="participants">참여자 {evt.participantsCount || 0}명</div>
                      </div>
                      <span className="event-badge-premium">진행 중</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 최근 포인트 지급 내역 */}
              <div className="glass-panel grid-list-card">
                <div className="card-header-row">
                  <h3 className="card-title-sub">최근 포인트 지급 내역</h3>
                  <span className="card-link" onClick={() => setCurrentTab('points')}>더보기 &gt;</span>
                </div>
                <div className="premium-list-container gap-list">
                  {recentActivities.map((act) => (
                    <div key={act.id} className="point-item-premium">
                      <div className="point-avatar">
                        {act.name ? act.name.charAt(0).toUpperCase() : act.username.charAt(0).toUpperCase()}
                      </div>
                      <div className="point-info">
                        <div className="name-row">
                          <span className="name">{act.name || act.username}</span>
                          <span className="date">{act.time}</span>
                        </div>
                        <div className="reason">{act.title}</div>
                      </div>
                      <span className={`point-amount-premium ${act.amount >= 0 ? 'plus' : 'minus'}`}>
                        {act.amount >= 0 ? `+${act.amount}` : act.amount}P
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 공지사항 */}
              <div className="glass-panel grid-list-card">
                <div className="card-header-row">
                  <h3 className="card-title-sub">공지사항</h3>
                  <span className="card-link" onClick={() => setCurrentTab('notices')}>공지 관리 &gt;</span>
                </div>
                <div className="premium-list-container gap-list">
                  {displayNotices.slice(0, 4).map((notice) => (
                    <div key={notice.id} className="notice-item-premium">
                      <span className="material-icons-round notice-icon">campaign</span>
                      <div className="notice-info">
                        <div className="title">{notice.title}</div>
                        <div className="date">{notice.createdAt}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* MAIN ROW 3: Policy Configuration Summary */}
            <div className="glass-panel policy-summary-card">
              <div className="card-header-row" style={{ marginBottom: '1.25rem' }}>
                <h3 className="card-title-sub" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span className="material-icons-round" style={{ color: 'var(--accent-purple)', fontSize: '1.2rem' }}>gavel</span>
                  정책 설정 요약
                </h3>
                <span className="card-link" onClick={() => setCurrentTab('settings')}>설정 관리 &gt;</span>
              </div>
              <div className="policy-badges-grid custom-scroll">
                <div className="policy-badge-item">
                  <span className="material-icons-round icon" style={{ color: '#4f46e5' }}>person_add</span>
                  <div>
                    <div className="lbl">가입 보너스</div>
                    <div className="val">{settings.signUpPoints}P</div>
                  </div>
                </div>
                <div className="policy-badge-item">
                  <span className="material-icons-round icon" style={{ color: '#10b981' }}>calendar_today</span>
                  <div>
                    <div className="lbl">출석 포인트</div>
                    <div className="val">{settings.checkInPoints}P/일</div>
                  </div>
                </div>
                <div className="policy-badge-item">
                  <span className="material-icons-round icon" style={{ color: '#f59e0b' }}>stars</span>
                  <div>
                    <div className="lbl">5일 연속 보너스</div>
                    <div className="val">{settings.bonus5Days}P</div>
                  </div>
                </div>
                <div className="policy-badge-item">
                  <span className="material-icons-round icon" style={{ color: '#d97706' }}>emoji_events</span>
                  <div>
                    <div className="lbl">10일 연속 보너스</div>
                    <div className="val">{settings.bonus10Days}P</div>
                  </div>
                </div>
                <div className="policy-badge-item">
                  <span className="material-icons-round icon" style={{ color: '#8b5cf6' }}>military_tech</span>
                  <div>
                    <div className="lbl">15일 연속 보너스</div>
                    <div className="val">{settings.bonus15Days}P</div>
                  </div>
                </div>
                <div className="policy-badge-item">
                  <span className="material-icons-round icon" style={{ color: '#db2777' }}>workspace_premium</span>
                  <div>
                    <div className="lbl">30일 연속 보너스</div>
                    <div className="val">{settings.bonus30Days}P</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Sliding Inspector Panel (mockup requirement) */}
          {selectedInspectorUser && (
            <div className="dashboard-right-panel-drawer">
              {(() => {
                const currentInspectorUser = displayUsers.find(u => u.id === selectedInspectorUser.id) || selectedInspectorUser;
                const userChapter = getChapterOfUser(currentInspectorUser.currentVerseIndex);
                const userProgressPct = Math.min(100, Math.round((currentInspectorUser.currentVerseIndex / totalVerses) * 100));

                return (
                  <div className="drawer-inner-container">
                    {/* Drawer Header */}
                    <div className="drawer-header-row">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span className="badge-select-indicator">② 회원 선택 시</span>
                        <span className="material-icons-round" style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>expand_more</span>
                      </div>
                      <button className="drawer-close-btn" onClick={() => setSelectedInspectorUser(null)}>
                        <span className="material-icons-round">close</span>
                      </button>
                    </div>

                    <h3 className="drawer-title-main">회원 상세 이력 조회</h3>

                    <div className="drawer-scrollable-content custom-scroll">
                      {/* Profile Card */}
                      <div className="drawer-profile-card">
                        <div className="drawer-avatar-wrapper">
                          <div className="drawer-avatar-large">
                            {(currentInspectorUser.name || currentInspectorUser.username).charAt(0).toUpperCase()}
                          </div>
                          <div className="drawer-user-details">
                            <div className="username-row">
                              <span className="username">{currentInspectorUser.name || '이름 없음'}</span>
                              <span className="status-badge active">활성</span>
                            </div>
                            <div className="email">{currentInspectorUser.email}</div>
                          </div>
                          <span className="material-icons-round star-favorite-icon">star_border</span>
                        </div>

                        <div className="drawer-profile-meta-grid">
                          <div className="meta-item">
                            <span className="lbl">가입일</span>
                            <span className="val">{getSignupDate(currentInspectorUser)}</span>
                          </div>
                          <div className="meta-item">
                            <span className="lbl">권한</span>
                            <span className="val">USER</span>
                          </div>
                          <div className="meta-item">
                            <span className="lbl">현재 포인트</span>
                            <span className="val point-val">
                              {currentInspectorUser.points?.toLocaleString()} P
                              <span className="material-icons-round coin-icon">toll</span>
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Quick Stats Grid */}
                      <div className="drawer-stats-row">
                        <div className="stat-box">
                          <span className="lbl">현재 진도</span>
                          <span className="val">{userChapter}장 진행 중</span>
                        </div>
                        <div className="stat-box">
                          <span className="lbl">연속 출석</span>
                          <span className="val">{currentInspectorUser.consecutiveCheckIns || 0}일</span>
                        </div>
                        <div className="stat-box">
                          <span className="lbl">전체 학습률</span>
                          <span className="val">{userProgressPct}%</span>
                        </div>
                      </div>

                      {/* Tab Navigation */}
                      <div className="drawer-tabs-navigation">
                        {[
                          { id: 'summary', label: '요약' },
                          { id: 'points', label: '포인트 이력' },
                          { id: 'attendance', label: '출석 이력' },
                          { id: 'memorization', label: '암송 기록' },
                          { id: 'events', label: '이벤트' },
                          { id: 'logs', label: '관리 로그' }
                        ].map(tab => (
                          <button
                            key={tab.id}
                            className={`drawer-tab-btn ${activeHistoryTab === tab.id ? 'active' : ''}`}
                            onClick={() => setActiveHistoryTab(tab.id as any)}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>

                      {/* Tab Content Area */}
                      <div className="drawer-tab-content-area">
                        {activeHistoryTab === 'summary' && (
                          <div className="timeline-container">
                            <div className="timeline-header">
                              <span className="title">최근 활동 타임라인</span>
                              <span className="view-all-link" onClick={() => setCurrentTab('members')}>전체 보기 &gt;</span>
                            </div>

                            <div className="timeline-list">
                              {getTimelineActivities(currentInspectorUser).length === 0 ? (
                                <div className="empty-logs">활동 이력이 없습니다.</div>
                              ) : (
                                getTimelineActivities(currentInspectorUser).slice(0, 8).map((act, idx) => {
                                  let icon = 'check_circle';
                                  let iconColor = '#10b981';
                                  let iconBg = 'rgba(16, 185, 129, 0.1)';

                                  if (act.type === 'challenge') {
                                    icon = 'emoji_events';
                                    iconColor = '#8b5cf6';
                                    iconBg = 'rgba(139, 92, 246, 0.1)';
                                  } else if (act.type === 'bonus') {
                                    icon = 'stars';
                                    iconColor = '#f59e0b';
                                    iconBg = 'rgba(245, 158, 11, 0.1)';
                                  } else if (act.type === 'signup') {
                                    icon = 'person_add';
                                    iconColor = '#3b82f6';
                                    iconBg = 'rgba(59, 130, 246, 0.1)';
                                  } else if (act.type === 'chapter_complete') {
                                    icon = 'menu_book';
                                    iconColor = '#ec4899';
                                    iconBg = 'rgba(236, 72, 153, 0.1)';
                                  }

                                  return (
                                    <div key={act.id || idx} className="timeline-item">
                                      <div className="timeline-badge-icon" style={{ background: iconBg, color: iconColor }}>
                                        <span className="material-icons-round" style={{ fontSize: '1rem' }}>{icon}</span>
                                      </div>
                                      <div className="timeline-body">
                                        <div className="timeline-time">{act.date}</div>
                                        <div className="timeline-text">{act.title}</div>
                                        {act.sublabel && <div className="timeline-subtext">{act.sublabel}</div>}
                                      </div>
                                      <div className="timeline-right-metric">
                                        {act.amount !== undefined ? (
                                          <span className={`point-badge ${act.amount >= 0 ? 'plus' : 'minus'}`}>
                                            {act.amount >= 0 ? `+${act.amount}` : act.amount}P
                                          </span>
                                        ) : act.badge ? (
                                          <span className="badge-blue-outline">{act.badge}</span>
                                        ) : null}
                                      </div>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        )}

                        {activeHistoryTab === 'points' && (
                          <div className="logs-tab-list">
                            {!currentInspectorUser.pointsHistory || currentInspectorUser.pointsHistory.length === 0 ? (
                              <div className="empty-logs">포인트 내역이 없습니다.</div>
                            ) : (
                              currentInspectorUser.pointsHistory.map((h, idx) => (
                                <div key={h.id || idx} className="log-row-item">
                                  <div className="log-row-details">
                                    <div className="title">{h.title}</div>
                                    <div className="date">{h.date}</div>
                                  </div>
                                  <span className={`amount ${h.amount >= 0 ? 'plus' : 'minus'}`}>
                                    {h.amount >= 0 ? `+${h.amount}` : h.amount}P
                                  </span>
                                </div>
                              ))
                            )}
                          </div>
                        )}

                        {activeHistoryTab === 'attendance' && (
                          <div className="logs-tab-list">
                            {getAttendanceHistory(currentInspectorUser).length === 0 ? (
                              <div className="empty-logs">출석 내역이 없습니다.</div>
                            ) : (
                              getAttendanceHistory(currentInspectorUser).map((d, idx) => (
                                <div key={idx} className="log-row-item">
                                  <div className="log-row-details" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span className="material-icons-round" style={{ color: 'var(--accent-emerald)', fontSize: '1.1rem' }}>check_circle</span>
                                    <div className="title">출석 체크 완료</div>
                                  </div>
                                  <span className="date-badge-simple">{d}</span>
                                </div>
                              ))
                            )}
                          </div>
                        )}

                        {activeHistoryTab === 'memorization' && (
                          <div className="logs-tab-list">
                            <div className="memorization-status-box">
                              <div className="progress-info-row">
                                <span>요한계시록 전체 진도율</span>
                                <span style={{ fontWeight: 'bold', color: 'var(--accent-purple)' }}>{userProgressPct}%</span>
                              </div>
                              <div className="progress-track" style={{ height: '8px', margin: '0.5rem 0' }}>
                                <div className="progress-fill" style={{ width: `${userProgressPct}%`, background: 'var(--accent-purple)' }}></div>
                              </div>
                              <div className="progress-details" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                진행 단계: {getVerseText(currentInspectorUser.currentVerseIndex)}
                              </div>
                            </div>
                            <div className="completed-chapters-list">
                              <div style={{ fontSize: '0.85rem', fontWeight: 600, margin: '1.05rem 0 0.5rem 0' }}>완료된 장 목록</div>
                              {userChapter <= 1 ? (
                                <div className="empty-logs" style={{ padding: '1rem' }}>완료한 장이 없습니다.</div>
                              ) : (
                                <div className="chapter-badge-container">
                                  {Array.from({ length: userChapter - 1 }, (_, i) => (
                                    <span key={i} className="completed-chapter-badge">
                                      {i + 1}장 완료
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {activeHistoryTab === 'events' && (
                          <div className="logs-tab-list">
                            <div className="event-list-drawer">
                              {displayEvents.slice(0, 2).map((evt) => (
                                <div key={evt.id} className="event-drawer-card">
                                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                                    <span className="title">{evt.title}</span>
                                    <span className="status">참여 완료</span>
                                  </div>
                                  <span className="points">+{evt.rewardPoints}P 지급</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {activeHistoryTab === 'logs' && (
                          <div className="logs-tab-list">
                            <div className="empty-logs">로그인이 유효한 상태입니다. (마지막 활동: {currentInspectorUser.lastCheckInDate || 'N/A'})</div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Drawer Footer */}
                    <div className="drawer-footer-btn-wrapper">
                      <button className="drawer-footer-action-btn" onClick={() => setCurrentTab('members')}>
                        전체 이력 보기 (상세 페이지로 이동)
                        <span className="material-icons-round">arrow_forward</span>
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
