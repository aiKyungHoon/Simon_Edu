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
  startDate: string;
  endDate: string;
  active: boolean;
  rewardPoints: number;
  imageUrl?: string;
  participantsCount?: number;
}

interface NoticeItem {
  id: string;
  title: string;
  createdAt: string;
  pinned: boolean;
  active: boolean;
}

interface SystemSettings {
  signUpPoints: number;
  checkInPoints: number;
  bonus7Days: number;
  bonus15Days: number;
  bonus30Days: number;
}

interface DashboardProps {
  setCurrentTab: (tab: string) => void;
}

export default function Dashboard({ setCurrentTab }: DashboardProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [settings, setSettings] = useState<SystemSettings>({
    signUpPoints: 100,
    checkInPoints: 10,
    bonus7Days: 50,
    bonus15Days: 100,
    bonus30Days: 200,
  });
  const [loading, setLoading] = useState(true);

  // Real-time synchronization
  useEffect(() => {
    let unsubscribeUsers = () => {};
    let unsubscribeEvents = () => {};
    let unsubscribeNotices = () => {};
    let unsubscribeSettings = () => {};

    try {
      // 1. Users Listener
      const qUsers = query(collection(db, 'users'));
      unsubscribeUsers = onSnapshot(qUsers, (snapshot) => {
        const userList: User[] = [];
        snapshot.forEach((doc) => {
          userList.push({ id: doc.id, ...doc.data() } as User);
        });
        setUsers(userList);
        setLoading(false);
      }, (err) => {
        console.error("Users load error: ", err);
        setLoading(false);
      });

      // 2. Events Listener
      const qEvents = query(collection(db, 'events'));
      unsubscribeEvents = onSnapshot(qEvents, (snapshot) => {
        const eventList: EventItem[] = [];
        snapshot.forEach((doc) => {
          eventList.push({ id: doc.id, ...doc.data() } as EventItem);
        });
        setEvents(eventList);
      }, (err) => console.error("Events load error: ", err));

      // 3. Notices Listener
      const qNotices = query(collection(db, 'notices'));
      unsubscribeNotices = onSnapshot(qNotices, (snapshot) => {
        const noticeList: NoticeItem[] = [];
        snapshot.forEach((doc) => {
          noticeList.push({ id: doc.id, ...doc.data() } as NoticeItem);
        });
        noticeList.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setNotices(noticeList);
      }, (err) => console.error("Notices load error: ", err));

      // 4. Settings Listener
      const docRef = doc(db, 'settings', 'global');
      unsubscribeSettings = onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
          setSettings(docSnap.data() as SystemSettings);
        }
      }, (err) => console.error("Settings load error: ", err));

    } catch (e) {
      console.error("Firestore sync init error: ", e);
      setLoading(false);
    }

    return () => {
      unsubscribeUsers();
      unsubscribeEvents();
      unsubscribeNotices();
      unsubscribeSettings();
    };
  }, []);

  const totalVerses = BIBLE_DATA_RAW.length;

  // Date helpers
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

  // Sparse database fallbacks for mockup visuals
  const isDbEmpty = users.length === 0 && !loading;
  
  let displayUsers = users;
  let displayEvents = events;
  let displayNotices = notices;

  if (isDbEmpty) {
    // Mock Users
    displayUsers = [
      {
        id: 'mock1',
        username: 'faith_0312',
        name: '최믿음',
        email: 'faith0312@gmail.com',
        role: 'user',
        points: 2450,
        consecutiveCheckIns: 5,
        lastCheckInDate: todayStr,
        lastMissionDate: todayStr,
        currentVerseIndex: 320, // Ch 18
        pointsHistory: [
          { id: 'h1', type: 'signup', title: '회원가입 축하금', amount: 100, date: todayStr + ' 10:00:00' },
          { id: 'h2', type: 'attendance', title: '출석 체크', amount: 10, date: todayStr + ' 09:12:00' },
          { id: 'h3', type: 'challenge', title: '암송 완료 (요한계시록 18장 2절)', amount: 50, date: todayStr + ' 14:32:00' }
        ]
      },
      {
        id: 'mock2',
        username: 'grace_jun',
        name: '임은혜',
        email: 'gracejun@naver.com',
        role: 'user',
        points: 4890,
        consecutiveCheckIns: 12,
        lastCheckInDate: todayStr,
        lastMissionDate: todayStr,
        currentVerseIndex: totalVerses, // Completed
        pointsHistory: [
          { id: 'h4', type: 'attendance', title: 'Easy 챌린지', amount: 80, date: todayStr + ' 13:45:00' },
          { id: 'h5', type: 'challenge', title: '암송 완료 (요한계시록 22장 21절)', amount: 50, date: yesterdayStr + ' 07:22:00' },
          { id: 'h6', type: 'signup', title: '회원가입 축하금', amount: 100, date: yesterdayStr + ' 10:00:00' }
        ]
      },
      {
        id: 'mock3',
        username: 'bible_lover',
        name: '박성경',
        email: 'biblelover@gmail.com',
        role: 'user',
        points: 1520,
        consecutiveCheckIns: 0,
        lastCheckInDate: yesterdayStr,
        lastMissionDate: yesterdayStr,
        currentVerseIndex: 85, // Ch 5
        pointsHistory: [
          { id: 'h7', type: 'signup', title: '회원가입 축하금', amount: 100, date: '2026-06-01 14:22:01' }
        ]
      },
      {
        id: 'mock4',
        username: 'hope_777',
        name: '소망',
        email: 'hope777@gmail.com',
        role: 'user',
        points: 3820,
        consecutiveCheckIns: 3,
        lastCheckInDate: todayStr,
        lastMissionDate: null,
        currentVerseIndex: 120, // Ch 7
        pointsHistory: [
          { id: 'h8', type: 'attendance', title: '회원가입 보너스', amount: 100, date: '2026-06-01 11:08:00' }
        ]
      },
      {
        id: 'mock5',
        username: 'simon_lee',
        name: '이시몬',
        email: 'simonlee@naver.com',
        role: 'user',
        points: 1150,
        consecutiveCheckIns: 5,
        lastCheckInDate: yesterdayStr,
        lastMissionDate: yesterdayStr,
        currentVerseIndex: 165, // Ch 10
        pointsHistory: [
          { id: 'h9', type: 'attendance', title: '5일 연속 출석', amount: 150, date: '2026-06-01 22:31:00' },
          { id: 'h10', type: 'signup', title: '회원가입 축하금', amount: 100, date: '2026-06-01 10:00:00' }
        ]
      }
    ];

    // Mock Events
    displayEvents = [
      {
        id: 'mock_ev_1',
        title: '7일 출석 이벤트',
        startDate: '2026-06-01',
        endDate: '2026-06-30',
        active: true,
        rewardPoints: 200,
        imageUrl: 'https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=500&auto=format&fit=crop&q=60',
        participantsCount: 102
      },
      {
        id: 'mock_ev_2',
        title: 'Easy 챌린지 이벤트',
        startDate: '2026-05-25',
        endDate: '2026-06-15',
        active: true,
        rewardPoints: 300,
        imageUrl: 'https://images.unsplash.com/photo-1504052434569-70ad58565b90?w=500&auto=format&fit=crop&q=60',
        participantsCount: 78
      },
      {
        id: 'mock_ev_3',
        title: '신규 가입 이벤트',
        startDate: '2026-06-01',
        endDate: '2026-06-30',
        active: true,
        rewardPoints: 100,
        imageUrl: 'https://images.unsplash.com/photo-1461360370896-922624d12aa1?w=500&auto=format&fit=crop&q=60',
        participantsCount: 65
      }
    ];

    // Mock Notices
    displayNotices = [
      { id: 'n1', title: '서비스 점검 안내', createdAt: '2026-06-05', pinned: true, active: true },
      { id: 'n2', title: '포인트 정책 변경 안내', createdAt: '2026-06-01', pinned: false, active: true },
      { id: 'n3', title: '6월 이벤트 안내', createdAt: '2026-05-31', pinned: false, active: true },
      { id: 'n4', title: '이용약관 변경 안내', createdAt: '2026-05-28', pinned: false, active: true }
    ];
  }

  // 1. STATS GRID row calculations
  const totalMembers = displayUsers.length;
  // Today's signups
  const todaySignups = displayUsers.filter(u => {
    const signup = u.pointsHistory?.find(h => h.type === 'signup');
    return signup && signup.date.startsWith(todayStr);
  }).length;

  // Attendance Comparison
  const todayAttendance = displayUsers.filter(u => u.lastCheckInDate === todayStr).length;
  const yesterdayAttendance = displayUsers.filter(u => u.lastCheckInDate === yesterdayStr).length;
  const diffAttendance = todayAttendance - yesterdayAttendance;
  const compareAttendance = diffAttendance >= 0 ? `+${diffAttendance}명` : `${diffAttendance}명`;

  // Quiz Comparison
  const todayQuiz = displayUsers.filter(u => u.lastMissionDate === todayStr).length;
  const yesterdayQuiz = displayUsers.filter(u => u.lastMissionDate === yesterdayStr).length;
  const diffQuiz = todayQuiz - yesterdayQuiz;
  const compareQuiz = diffQuiz >= 0 ? `+${diffQuiz}명` : `${diffQuiz}명`;

  // Points Comparison
  let todayPaidPoints = 0;
  let yesterdayPaidPoints = 0;
  displayUsers.forEach(u => {
    u.pointsHistory?.forEach(h => {
      const amt = Number(h.amount) || 0;
      if (amt > 0) {
        if (h.date.startsWith(todayStr)) {
          todayPaidPoints += amt;
        } else if (h.date.startsWith(yesterdayStr)) {
          yesterdayPaidPoints += amt;
        }
      }
    });
  });
  const diffPoints = todayPaidPoints - yesterdayPaidPoints;
  const comparePoints = diffPoints >= 0 ? `+${diffPoints.toLocaleString()}P` : `${diffPoints.toLocaleString()}P`;

  // 21장 완주자 수 (currentVerseIndex >= start of chapter 22)
  const chap22StartIndex = BIBLE_DATA_RAW.findIndex(v => v.chapter === 22);
  const finishIndex = chap22StartIndex !== -1 ? chap22StartIndex : totalVerses - 21;
  const completersCount = displayUsers.filter(u => u.currentVerseIndex >= finishIndex).length;
  const yesterdayCompleters = displayUsers.filter(u => u.currentVerseIndex >= finishIndex && u.lastMissionDate !== todayStr).length;
  const diffCompleters = completersCount - yesterdayCompleters;
  const compareCompleters = diffCompleters >= 0 ? `+${diffCompleters}명` : `${diffCompleters}명`;

  const activeEvents = displayEvents.filter(e => e.active);

  // 2. BAR CHART calculations (요한계시록 장별 완료 현황)
  const getChapterFirstVerseIndex = (chap: number) => {
    const index = BIBLE_DATA_RAW.findIndex(v => v.chapter === chap);
    return index !== -1 ? index : BIBLE_DATA_RAW.length;
  };

  const chapterCompleters = Array.from({ length: 21 }, (_, i) => {
    const chapterNum = i + 1;
    const nextChapIdx = getChapterFirstVerseIndex(chapterNum + 1);
    const count = displayUsers.filter(u => u.currentVerseIndex >= nextChapIdx).length;
    return { chapter: chapterNum, count };
  });

  const maxBarValue = Math.max(...chapterCompleters.map(c => c.count), 1);

  // 1장 / 10장 / 21장 완료율
  const pctCh1 = totalMembers > 0 ? ((chapterCompleters[0].count / totalMembers) * 100).toFixed(1) : '0.0';
  const pctCh10 = totalMembers > 0 ? ((chapterCompleters[9].count / totalMembers) * 100).toFixed(1) : '0.0';
  const pctCh21 = totalMembers > 0 ? ((chapterCompleters[20].count / totalMembers) * 100).toFixed(1) : '0.0';

  // 가장 많이 이탈한 구간 (Drop-off transition with highest absolute user drop)
  let maxDrop = 0;
  let maxDropChapter = 3;
  let maxDropFrom = 81;
  let maxDropTo = 63;
  for (let c = 1; c <= 20; c++) {
    const fromCount = chapterCompleters[c - 1].count;
    const toCount = chapterCompleters[c].count;
    const drop = fromCount - toCount;
    if (drop > maxDrop && fromCount > 0) {
      maxDrop = drop;
      maxDropChapter = c;
      maxDropFrom = fromCount;
      maxDropTo = toCount;
    }
  }
  const maxDropRate = maxDropFrom > 0 ? ((maxDrop / maxDropFrom) * 100).toFixed(1) : '0.0';

  // 3. DONUT CHART calculations (진도 분포)
  const rangeCounts = {
    notStarted: 0,
    range1_5: 0,
    range6_10: 0,
    range11_15: 0,
    range16_20: 0,
    completed21: 0
  };

  displayUsers.forEach(u => {
    const idx = u.currentVerseIndex;
    if (idx === 0) {
      rangeCounts.notStarted++;
    } else {
      const verse = BIBLE_DATA_RAW[idx];
      const chap = verse ? verse.chapter : 22;
      if (chap >= 21) {
        rangeCounts.completed21++;
      } else if (chap >= 16) {
        rangeCounts.range16_20++;
      } else if (chap >= 11) {
        rangeCounts.range11_15++;
      } else if (chap >= 6) {
        rangeCounts.range6_10++;
      } else {
        rangeCounts.range1_5++;
      }
    }
  });

  const getRangePct = (val: number) => totalMembers > 0 ? Math.round((val / totalMembers) * 100) : 0;
  const donutSegments = [
    { label: '1 ~ 5장', count: rangeCounts.range1_5, color: '#3b82f6', pct: getRangePct(rangeCounts.range1_5) },
    { label: '6 ~ 10장', count: rangeCounts.range6_10, color: '#10b981', pct: getRangePct(rangeCounts.range6_10) },
    { label: '11 ~ 15장', count: rangeCounts.range11_15, color: '#f59e0b', pct: getRangePct(rangeCounts.range11_15) },
    { label: '16 ~ 20장', count: rangeCounts.range16_20, color: '#a855f7', pct: getRangePct(rangeCounts.range16_20) },
    { label: '21장 완료', count: rangeCounts.completed21, color: '#f43f5e', pct: getRangePct(rangeCounts.completed21) },
    { label: '학습 전', count: rangeCounts.notStarted, color: '#94a3b8', pct: getRangePct(rangeCounts.notStarted) }
  ];

  // 4. WEEKLY SUMMARY calculations (가입자, 학습률 등)
  const getDaysAgoDateStr = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const w7Ago = getDaysAgoDateStr(7);
  const w14Ago = getDaysAgoDateStr(14);

  const thisWeekSignups = displayUsers.filter(u => {
    const signup = u.pointsHistory?.find(h => h.type === 'signup');
    return signup && signup.date >= w7Ago;
  }).length;

  const lastWeekSignups = displayUsers.filter(u => {
    const signup = u.pointsHistory?.find(h => h.type === 'signup');
    return signup && signup.date >= w14Ago && signup.date < w7Ago;
  }).length;

  const diffWSignups = thisWeekSignups - lastWeekSignups;
  const weeklySignupsPct = lastWeekSignups > 0 ? Math.round((diffWSignups / lastWeekSignups) * 100) : thisWeekSignups * 100;

  let thisWeekQuizzes = 0;
  let lastWeekQuizzes = 0;
  displayUsers.forEach(u => {
    u.pointsHistory?.forEach(h => {
      if (h.type === 'challenge') {
        if (h.date >= w7Ago) thisWeekQuizzes++;
        else if (h.date >= w14Ago && h.date < w7Ago) lastWeekQuizzes++;
      }
    });
  });
  const diffWQuizzes = thisWeekQuizzes - lastWeekQuizzes;
  const weeklyQuizzesPct = lastWeekQuizzes > 0 ? Math.round((diffWQuizzes / lastWeekQuizzes) * 100) : thisWeekQuizzes * 100;

  // Find popular chapter
  const popularCounts = Array(23).fill(0);
  displayUsers.forEach(u => {
    const verse = BIBLE_DATA_RAW[u.currentVerseIndex];
    const chap = verse ? verse.chapter : 21;
    popularCounts[chap]++;
  });
  let popularChapter = 3;
  let maxPopularCount = 0;
  for (let c = 1; c <= 21; c++) {
    if (popularCounts[c] > maxPopularCount) {
      maxPopularCount = popularCounts[c];
      popularChapter = c;
    }
  }
  const popularCompleters = chapterCompleters[popularChapter - 1]?.count || 0;

  // 5. 4-COLUMN TABLES mappings
  // Recent Signups (sorted by signup points timestamp)
  const usersWithSignup = displayUsers.map(u => {
    const signup = u.pointsHistory?.find(h => h.type === 'signup');
    return {
      ...u,
      signupDate: signup ? signup.date.split(' ')[0] : '2026-06-01'
    };
  });
  usersWithSignup.sort((a, b) => b.signupDate.localeCompare(a.signupDate));
  const recentSignupsList = usersWithSignup.slice(0, 5);

  // Recent Points Transactions
  interface ActivityItem {
    id: string;
    username: string;
    name?: string;
    title: string;
    amount: number;
    time: string;
  }
  const allActivities: ActivityItem[] = [];
  displayUsers.forEach(u => {
    u.pointsHistory?.forEach(h => {
      allActivities.push({
        id: h.id,
        username: u.username,
        name: u.name,
        title: h.title,
        amount: h.amount,
        time: h.date
      });
    });
  });
  allActivities.sort((a, b) => b.time.localeCompare(a.time));
  const recentPointsList = allActivities.slice(0, 5);

  // Fallback banners for events
  const getBannerUrl = (item: EventItem) => {
    if (item.imageUrl) return item.imageUrl;
    if (item.title.includes('출석')) return 'https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=500';
    if (item.title.includes('챌린지')) return 'https://images.unsplash.com/photo-1504052434569-70ad58565b90?w=500';
    return 'https://images.unsplash.com/photo-1461360370896-922624d12aa1?w=500';
  };

  return (
    <div className="view-container">
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
          <span className="material-icons-round" style={{ fontSize: '3rem', color: 'var(--accent-purple)', animation: 'spin 1.5s linear infinite' }}>
            sync
          </span>
          <style>{`
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
          `}</style>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* 1. STATS GRID ROW */}
          <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            
            {/* 전체 회원 수 */}
            <div className="glass-panel stat-card">
              <div className="stat-info">
                <span className="stat-lbl">전체 회원 수</span>
                <span className="stat-val">{totalMembers} <span style={{ fontSize: '1rem', fontWeight: 'normal' }}>명</span></span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  전일 대비 <span style={{ color: 'var(--accent-blue)', fontWeight: 'bold' }}>+{todaySignups}명</span>
                </span>
              </div>
              <div className="stat-icon-wrapper" style={{ background: 'rgba(59, 130, 246, 0.12)', color: '#3b82f6' }}>
                <span className="material-icons-round">people</span>
              </div>
            </div>

            {/* 오늘 출석자 수 */}
            <div className="glass-panel stat-card">
              <div className="stat-info">
                <span className="stat-lbl">오늘 출석자 수</span>
                <span className="stat-val">{todayAttendance} <span style={{ fontSize: '1rem', fontWeight: 'normal' }}>명</span></span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  전일 대비 <span style={{ color: diffAttendance >= 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)', fontWeight: 'bold' }}>{compareAttendance}</span>
                </span>
              </div>
              <div className="stat-icon-wrapper" style={{ background: 'rgba(16, 185, 129, 0.12)', color: 'var(--accent-emerald)' }}>
                <span className="material-icons-round">how_to_reg</span>
              </div>
            </div>

            {/* 오늘 퀴즈 참여자 수 */}
            <div className="glass-panel stat-card">
              <div className="stat-info">
                <span className="stat-lbl">오늘 퀴즈 참여자 수</span>
                <span className="stat-val">{todayQuiz} <span style={{ fontSize: '1rem', fontWeight: 'normal' }}>명</span></span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  전일 대비 <span style={{ color: diffQuiz >= 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)', fontWeight: 'bold' }}>{compareQuiz}</span>
                </span>
              </div>
              <div className="stat-icon-wrapper" style={{ background: 'rgba(168, 85, 247, 0.12)', color: '#a855f7' }}>
                <span className="material-icons-round">psychology</span>
              </div>
            </div>

            {/* 오늘 지급 포인트 */}
            <div className="glass-panel stat-card">
              <div className="stat-info">
                <span className="stat-lbl">오늘 지급 포인트</span>
                <span className="stat-val">{todayPaidPoints.toLocaleString()} <span style={{ fontSize: '1rem', fontWeight: 'normal' }}>P</span></span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  전일 대비 <span style={{ color: diffPoints >= 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)', fontWeight: 'bold' }}>{comparePoints}</span>
                </span>
              </div>
              <div className="stat-icon-wrapper" style={{ background: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b' }}>
                <span className="material-icons-round">toll</span>
              </div>
            </div>

            {/* 21장 완주자 수 */}
            <div className="glass-panel stat-card">
              <div className="stat-info">
                <span className="stat-lbl">21장 완주자 수</span>
                <span className="stat-val">{completersCount} <span style={{ fontSize: '1rem', fontWeight: 'normal' }}>명</span></span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  전일 대비 <span style={{ color: 'var(--accent-emerald)', fontWeight: 'bold' }}>{compareCompleters}</span>
                </span>
              </div>
              <div className="stat-icon-wrapper" style={{ background: 'rgba(244, 63, 94, 0.12)', color: 'var(--accent-rose)' }}>
                <span className="material-icons-round">workspace_premium</span>
              </div>
            </div>

            {/* 진행 중 이벤트 */}
            <div className="glass-panel stat-card">
              <div className="stat-info">
                <span className="stat-lbl">진행 중 이벤트</span>
                <span className="stat-val">{activeEvents.length} <span style={{ fontSize: '1rem', fontWeight: 'normal' }}>개</span></span>
                <span 
                  onClick={() => setCurrentTab('events')} 
                  style={{ fontSize: '0.75rem', color: 'var(--accent-purple)', fontWeight: 'bold', marginTop: '0.25rem', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  전체 이벤트 보기 &gt;
                </span>
              </div>
              <div className="stat-icon-wrapper" style={{ background: 'rgba(59, 130, 246, 0.12)', color: '#3b82f6' }}>
                <span className="material-icons-round">card_giftcard</span>
              </div>
            </div>

          </div>

          {/* 2. ANALYTICS ROW (Bar Chart / Donut Chart & Weekly Summary) */}
          <div className="dashboard-row">
            
            {/* 요한계시록 장별 완료 현황 막대그래프 */}
            <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div className="card-header-row" style={{ marginBottom: '0.5rem' }}>
                  <h2 className="card-title">
                    <span className="material-icons-round">bar_chart</span>
                    요한계시록 장별 완료 현황
                  </h2>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>전체 회원 기준</div>
                </div>
                
                {/* SVG Bar Chart container */}
                <div style={{ width: '100%', overflowX: 'auto', padding: '1rem 0' }}>
                  <svg width="100%" height="180" viewBox="0 0 820 180" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" />
                        <stop offset="100%" stopColor="var(--accent-purple)" />
                      </linearGradient>
                    </defs>

                    {/* Horizontal helper grid lines */}
                    <line x1="30" y1="30" x2="810" y2="30" stroke="var(--glass-border)" strokeDasharray="2 2" />
                    <line x1="30" y1="71" x2="810" y2="71" stroke="var(--glass-border)" strokeDasharray="2 2" />
                    <line x1="30" y1="113" x2="810" y2="113" stroke="var(--glass-border)" strokeDasharray="2 2" />
                    <line x1="30" y1="155" x2="810" y2="155" stroke="var(--glass-border)" />

                    {/* Draw Bars */}
                    {chapterCompleters.map((c, i) => {
                      const barWidth = 22;
                      const x = 35 + i * 36.5;
                      // Calculate height
                      const barHeight = (c.count / maxBarValue) * 125;
                      const y = 155 - barHeight;

                      return (
                        <g key={c.chapter}>
                          {/* Hoverable Bar Background */}
                          <rect x={x - 4} y="20" width={barWidth + 8} height="135" fill="transparent" style={{ cursor: 'pointer' }} />
                          {/* Main Bar */}
                          <rect 
                            x={x} 
                            y={y} 
                            width={barWidth} 
                            height={barHeight} 
                            fill="url(#barGrad)" 
                            rx="4" 
                            style={{ transition: 'all 0.3s ease' }} 
                          />
                          {/* Value above bar */}
                          {c.count > 0 && (
                            <text x={x + 11} y={y - 6} textAnchor="middle" fontSize="9" fontWeight="bold" fill="var(--text-secondary)">
                              {c.count}
                            </text>
                          )}
                          {/* X-axis Label */}
                          <text x={x + 11} y="170" textAnchor="middle" fontSize="9.5" fill="var(--text-muted)">
                            {c.chapter}장
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>
              </div>

              {/* Bar Chart bottom summary boxes */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', borderTop: '1px solid var(--glass-border)', paddingTop: '1rem', marginTop: '1rem' }}>
                <div style={{ background: 'rgba(255,255,255,0.4)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>1장 완료율</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 'bold', margin: '0.2rem 0' }}>{pctCh1}%</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{chapterCompleters[0].count}명 / {totalMembers}명</div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.4)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>10장 완료율</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 'bold', margin: '0.2rem 0' }}>{pctCh10}%</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{chapterCompleters[9].count}명 / {totalMembers}명</div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.4)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>21장 완료율</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 'bold', margin: '0.2rem 0' }}>{pctCh21}%</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{chapterCompleters[20].count}명 / {totalMembers}명</div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.4)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>가장 많이 이탈한 구간</div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 'bold', color: 'var(--accent-rose)', margin: '0.2rem 0' }}>
                    {maxDropChapter}장 ➔ {maxDropChapter + 1}장
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>이탈률 <span style={{ color: 'var(--accent-rose)', fontWeight: 'bold' }}>{maxDropRate}%</span> ({maxDropFrom}명 ➔ {maxDropTo}명)</div>
                </div>
              </div>
            </div>

            {/* Donut Chart & Weekly Summary Column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              
              {/* 진도 분포 도넛 차트 */}
              <div className="glass-panel" style={{ padding: '1.25rem 1.5rem' }}>
                <h2 className="card-title" style={{ marginBottom: '1rem' }}>
                  <span className="material-icons-round">donut_large</span>
                  진도 분포
                </h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', justifyContent: 'space-around' }}>
                  <div style={{ position: 'relative', width: '130px', height: '130px' }}>
                    <svg width="130" height="130" viewBox="0 0 130 130">
                      {/* Grey background ring */}
                      <circle cx="65" cy="65" r="42" stroke="rgba(184,134,11,0.05)" strokeWidth="12" fill="transparent" />
                      
                      {/* Dynamic segments stroke mapping */}
                      {(() => {
                        let accumulatedAngle = -90;
                        const circ = 2 * Math.PI * 42;
                        return donutSegments.map((seg, idx) => {
                          if (seg.pct <= 0) return null;
                          const offset = circ - (seg.pct / 100) * circ;
                          const currentRot = accumulatedAngle;
                          accumulatedAngle += (seg.pct / 100) * 360;
                          return (
                            <circle
                              key={idx}
                              cx="65"
                              cy="65"
                              r="42"
                              stroke={seg.color}
                              strokeWidth="12"
                              fill="transparent"
                              strokeDasharray={circ}
                              strokeDashoffset={offset}
                              transform={`rotate(${currentRot} 65 65)`}
                              strokeLinecap="round"
                              style={{ transition: 'all 0.5s ease' }}
                            />
                          );
                        });
                      })()}
                    </svg>
                    
                    {/* Inner counter */}
                    <div style={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      textAlign: 'center'
                    }}>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block' }}>전체 회원</span>
                      <span style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                        {totalMembers}명
                      </span>
                    </div>
                  </div>

                  {/* Legend list */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.82rem', minWidth: '165px' }}>
                    {donutSegments.map((seg, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: seg.color, flexShrink: 0 }}></span>
                          <span style={{ color: 'var(--text-secondary)', fontWeight: '500' }}>{seg.label}</span>
                        </div>
                        <span style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{seg.count}명 ({seg.pct}%)</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* 이번 주 요약 */}
              <div className="glass-panel" style={{ padding: '1.25rem 1.5rem', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <h2 className="card-title" style={{ marginBottom: '0.75rem' }}>
                  <span className="material-icons-round">date_range</span>
                  이번 주 요약 <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: 'var(--text-muted)', marginLeft: '0.25rem' }}>({w7Ago.substring(5)} ~ {todayStr.substring(5)})</span>
                </h2>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', textAlign: 'center' }}>
                  <div style={{ borderRight: '1px solid var(--glass-border)', paddingRight: '0.5rem' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>신규 가입자</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: '0.2rem 0', color: 'var(--accent-blue)' }}>
                      {diffWSignups >= 0 ? `+${weeklySignupsPct}%` : `${weeklySignupsPct}%`}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{thisWeekSignups}명 가입</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>퀴즈 학습률</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: '0.2rem 0', color: 'var(--accent-emerald)' }}>
                      {diffWQuizzes >= 0 ? `+${weeklyQuizzesPct}%` : `${weeklyQuizzesPct}%`}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>▲ 지난주 대비</div>
                  </div>
                  <div style={{ borderRight: '1px solid var(--glass-border)', borderTop: '1px solid var(--glass-border)', paddingTop: '0.75rem', paddingRight: '0.5rem' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>가장 인기 장</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: '0.2rem 0', color: 'var(--accent-purple)' }}>
                      {popularChapter}장
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>완료자 {popularCompleters}명</div>
                  </div>
                  <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '0.75rem' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>최대 이탈 구간</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: '0.2rem 0', color: 'var(--accent-rose)' }}>
                      {maxDropChapter}➔{maxDropChapter + 1}장
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>이탈률 {maxDropRate}%</div>
                  </div>
                </div>
              </div>

            </div>

          </div>

          {/* 3. 4-COLUMN TABLES ROW */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem' }}>
            
            {/* 최근 가입 회원 */}
            <div className="glass-panel" style={{ padding: '1.25rem' }}>
              <div className="card-header-row">
                <h2 className="card-title" style={{ fontSize: '0.95rem' }}>
                  <span className="material-icons-round">person_add</span>
                  최근 가입 회원
                </h2>
                <div onClick={() => setCurrentTab('members')} className="card-link" style={{ fontSize: '0.75rem' }}>더보기 &gt;</div>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--glass-border)', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '0.4rem 0.2rem' }}>No.</th>
                    <th style={{ padding: '0.4rem 0.2rem' }}>사용자명</th>
                    <th style={{ padding: '0.4rem 0.2rem' }}>가입일</th>
                    <th style={{ padding: '0.4rem 0.2rem', textAlign: 'right' }}>포인트</th>
                  </tr>
                </thead>
                <tbody>
                  {recentSignupsList.map((user, idx) => (
                    <tr key={user.id} style={{ borderBottom: '1px solid rgba(184,134,11,0.06)' }}>
                      <td style={{ padding: '0.5rem 0.2rem', color: 'var(--text-muted)' }}>{idx + 1}</td>
                      <td style={{ padding: '0.5rem 0.2rem', fontWeight: '600' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <span className="material-icons-round" style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>account_circle</span>
                          {user.name || user.username}
                        </div>
                      </td>
                      <td style={{ padding: '0.5rem 0.2rem', color: 'var(--text-muted)' }}>{user.signupDate}</td>
                      <td style={{ padding: '0.5rem 0.2rem', textAlign: 'right', fontWeight: 'bold' }}>{user.points.toLocaleString()}P</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 진행 중 이벤트 */}
            <div className="glass-panel" style={{ padding: '1.25rem' }}>
              <div className="card-header-row">
                <h2 className="card-title" style={{ fontSize: '0.95rem' }}>
                  <span className="material-icons-round">emoji_events</span>
                  진행 중 이벤트
                </h2>
                <div onClick={() => setCurrentTab('events')} className="card-link" style={{ fontSize: '0.75rem' }}>이벤트 관리 &gt;</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {displayEvents.slice(0, 3).map((item) => (
                  <div key={item.id} style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', background: 'rgba(255,255,255,0.4)', border: '1px solid var(--glass-border)', padding: '0.4rem', borderRadius: '8px' }}>
                    <img 
                      src={getBannerUrl(item)} 
                      alt="Banner" 
                      style={{ width: '48px', height: '48px', borderRadius: '6px', objectFit: 'cover' }} 
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{item.startDate} ~ {item.endDate}</div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--accent-purple)', fontWeight: '500' }}>참여자 {item.participantsCount || 0}명</div>
                    </div>
                    <span className="badge active" style={{ fontSize: '0.6rem', padding: '0.15rem 0.35rem' }}>진행 중</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 최근 포인트 지급 내역 */}
            <div className="glass-panel" style={{ padding: '1.25rem' }}>
              <div className="card-header-row">
                <h2 className="card-title" style={{ fontSize: '0.95rem' }}>
                  <span className="material-icons-round">toll</span>
                  최근 포인트 지급 내역
                </h2>
                <div onClick={() => setCurrentTab('points')} className="card-link" style={{ fontSize: '0.75rem' }}>더보기 &gt;</div>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--glass-border)', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '0.4rem 0.2rem' }}>사용자명</th>
                    <th style={{ padding: '0.4rem 0.2rem' }}>사유</th>
                    <th style={{ padding: '0.4rem 0.2rem', textAlign: 'right' }}>포인트</th>
                  </tr>
                </thead>
                <tbody>
                  {recentPointsList.map((act) => (
                    <tr key={act.id} style={{ borderBottom: '1px solid rgba(184,134,11,0.06)' }}>
                      <td style={{ padding: '0.5rem 0.2rem', fontWeight: '600' }}>{act.name || act.username}</td>
                      <td style={{ padding: '0.5rem 0.2rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '80px' }} title={act.title}>
                        {act.title}
                      </td>
                      <td style={{ 
                        padding: '0.5rem 0.2rem', 
                        textAlign: 'right', 
                        fontWeight: 'bold',
                        color: act.amount >= 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)' 
                      }}>
                        {act.amount >= 0 ? `+${act.amount}` : act.amount}P
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 공지사항 */}
            <div className="glass-panel" style={{ padding: '1.25rem' }}>
              <div className="card-header-row">
                <h2 className="card-title" style={{ fontSize: '0.95rem' }}>
                  <span className="material-icons-round">notifications</span>
                  공지사항
                </h2>
                <div onClick={() => setCurrentTab('notices')} className="card-link" style={{ fontSize: '0.75rem' }}>공지 관리 &gt;</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {displayNotices.slice(0, 4).map((notice) => (
                  <div key={notice.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', borderBottom: '1px solid rgba(184,134,11,0.06)', paddingBottom: '0.4rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', minWidth: 0 }}>
                      <span className="material-icons-round" style={{ fontSize: '0.75rem', color: 'var(--accent-purple)' }}>circle</span>
                      <span style={{ fontWeight: '500', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '140px' }} title={notice.title}>
                        {notice.title}
                      </span>
                    </div>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{notice.createdAt.split(' ')[0]}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* 4. POLICY SETTINGS SUMMARY ROW */}
          <div className="glass-panel" style={{ padding: '1rem 1.5rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span className="material-icons-round">settings</span>
                정책 설정 요약
              </h3>

              <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span className="material-icons-round" style={{ fontSize: '1.1rem', color: 'var(--accent-purple)' }}>person_add</span>
                  <span style={{ color: 'var(--text-muted)' }}>가입 보너스:</span>
                  <span style={{ fontWeight: 'bold' }}>{settings.signUpPoints}P</span>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span className="material-icons-round" style={{ fontSize: '1.1rem', color: 'var(--accent-emerald)' }}>event</span>
                  <span style={{ color: 'var(--text-muted)' }}>출석 포인트:</span>
                  <span style={{ fontWeight: 'bold' }}>{settings.checkInPoints}P/일</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span className="material-icons-round" style={{ fontSize: '1.1rem', color: '#3b82f6' }}>looks_one</span>
                  <span style={{ color: 'var(--text-muted)' }}>7일 연속 보너스:</span>
                  <span style={{ fontWeight: 'bold' }}>{settings.bonus7Days}P</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span className="material-icons-round" style={{ fontSize: '1.1rem', color: '#a855f7' }}>looks_two</span>
                  <span style={{ color: 'var(--text-muted)' }}>15일 연속 보너스:</span>
                  <span style={{ fontWeight: 'bold' }}>{settings.bonus15Days}P</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span className="material-icons-round" style={{ fontSize: '1.1rem', color: 'var(--accent-rose)' }}>looks_3</span>
                  <span style={{ color: 'var(--text-muted)' }}>30일 연속 보너스:</span>
                  <span style={{ fontWeight: 'bold' }}>{settings.bonus30Days}P</span>
                </div>
              </div>
            </div>

            <button 
              onClick={() => setCurrentTab('settings')}
              className="btn-secondary" 
              style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
            >
              <span className="material-icons-round" style={{ fontSize: '0.95rem' }}>settings</span>
              설정 관리 &gt;
            </button>
          </div>

        </div>
      )}
    </div>
  );
}
