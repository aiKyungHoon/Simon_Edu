import { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, collection, onSnapshot, query } from 'firebase/firestore';
import { auth, db } from './firebase';

// Components
import Login from './components/Login';
import { Sidebar } from './components/Sidebar';
import Dashboard from './components/Dashboard';
import Members from './components/Members';
import Points from './components/Points';
import Quizzes from './components/Quizzes';
import Events from './components/Events';
import Stats from './components/Stats';
import Notices from './components/Notices';
import Settings from './components/Settings';
import Logs from './components/Logs';
import PushManagement from './components/PushManagement';
import MissionExam from './components/MissionExam';
import { canOpenAdmin } from './roles';

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
  status?: 'active' | 'suspended';
  checkInHistory?: string[];
  examRegion?: string;
  examApplicantName?: string;
  examSubmission?: {
    region?: string;
    applicantName?: string;
    regionNameKey?: string;
    score: number;
    pointsEarned?: number;
    attemptCount: number;
    lastAttemptDate?: string;
    lastScore?: number;
    attempts?: Array<{
      id?: string;
      score: number;
      correctCount?: number;
      totalCount?: number;
      submittedAt?: string;
      region?: string;
      applicantName?: string;
      answers?: Array<{
        question: string;
        correct: string;
        userAnswer: string;
        isCorrect: boolean;
      }>;
    }>;
  };
  pointsHistory?: Array<{
    id: string;
    type: string;
    title: string;
    amount: number;
    date: string;
  }>;
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [adminEmail, setAdminEmail] = useState<string>('');
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Lifted Search Inspector states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedInspectorUser, setSelectedInspectorUser] = useState<User | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);

  const getDisplayUsers = (): User[] => {
    if (users.length > 0) return users;
    const todayStr = new Date().toISOString().split('T')[0];
    const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    return [
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
        currentVerseIndex: 120,
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
        currentVerseIndex: 320,
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
        currentVerseIndex: 85,
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
        currentVerseIndex: 45,
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
        currentVerseIndex: 250,
        pointsHistory: [
          { id: 'h9', type: 'signup', title: '회원가입 축하금', amount: 100, date: '2026-06-01 11:00:00' },
          { id: 'h10', type: 'attendance', title: '5월 연속 출석', amount: 150, date: '2026-06-01 22:31:00' }
        ]
      }
    ];
  };

  // 1. Firebase Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          // Check role in Firestore
          const userDocRef = doc(db, 'users', user.uid);
          const userDoc = await getDoc(userDocRef);

          if (userDoc.exists() && canOpenAdmin(userDoc.data().role)) {
            setAdminEmail(user.email || 'Admin');
            setIsAuthenticated(true);
            setErrorMsg('');
          } else {
            setErrorMsg('관리자 권한이 없는 계정입니다.');
            await signOut(auth);
            setIsAuthenticated(false);
          }
        } catch (err) {
          console.error("Auth verification error:", err);
          setErrorMsg('인증 확인 도중 오류가 발생했습니다.');
          await signOut(auth);
          setIsAuthenticated(false);
        }
      } else {
        setIsAuthenticated(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // 2. Real-time Users synchronization once authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      setUsers([]);
      return;
    }

    const q = query(collection(db, 'users'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const userList: User[] = [];
      snapshot.forEach((doc) => {
        userList.push({ id: doc.id, ...doc.data() } as User);
      });
      setUsers(userList);
      setLoadingUsers(false);
    }, (err) => {
      console.error("Users load error:", err);
      setLoadingUsers(false);
    });

    return () => unsubscribe();
  }, [isAuthenticated]);

  // Formatter for top header
  const getTabTitle = (tab: string) => {
    switch (tab) {
      case 'dashboard': return '실시간 대시보드';
      case 'members': return '회원 계정 관리';
      case 'points': return '포인트 흐름 제어';
      case 'quizzes': return '말씀 암송 퀴즈 관리';
      case 'events': return '이벤트 & 챌린지 관리';
      case 'stats': return '성경 암송 통계 분석';
      case 'notices': return '공지사항 게시판 관리';
      case 'settings': return '시스템 전역 환경설정';
      case 'logs': return '관리자 시스템 감사 로그';
      case 'push': return '푸시 알림 및 발송 관리';
      case 'missionExam': return '시몬에듀 사명자 시험';
      default: return 'Simon Edu 관리자';
    }
  };

  const getTodayFullStr = () => {
    const options: Intl.DateTimeFormatOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    return new Date().toLocaleDateString('ko-KR', options);
  };

  // Render Sub-Views
  const renderView = () => {
    if (loadingUsers && users.length === 0) {
      return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
          <span className="material-icons-round" style={{ fontSize: '3rem', color: 'var(--accent-purple)', animation: 'spin 1.5s linear infinite' }}>
            sync
          </span>
        </div>
      );
    }

    switch (currentTab) {
      case 'dashboard':
        return (
          <Dashboard
            setCurrentTab={setCurrentTab}
            selectedInspectorUser={selectedInspectorUser}
            setSelectedInspectorUser={setSelectedInspectorUser}
          />
        );
      case 'members':
        return <Members users={users} adminEmail={adminEmail} />;
      case 'points':
        return <Points users={users} adminEmail={adminEmail} />;
      case 'quizzes':
        return <Quizzes adminEmail={adminEmail} />;
      case 'events':
        return <Events adminEmail={adminEmail} />;
      case 'stats':
        return <Stats users={users} />;
      case 'notices':
        return <Notices adminEmail={adminEmail} />;
      case 'settings':
        return <Settings adminEmail={adminEmail} />;
      case 'logs':
        return <Logs />;
      case 'push':
        return <PushManagement users={users} adminEmail={adminEmail} />;
      case 'missionExam':
        return <MissionExam users={users} />;
      default:
        return (
          <Dashboard
            setCurrentTab={setCurrentTab}
            selectedInspectorUser={selectedInspectorUser}
            setSelectedInspectorUser={setSelectedInspectorUser}
          />
        );
    }
  };

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Loading Screen for first boot
  if (isAuthenticated === null) {
    return (
      <div className="login-container">
        <div style={{ textAlign: 'center' }}>
          <span className="material-icons-round" style={{ fontSize: '4rem', color: 'var(--accent-purple)', animation: 'spin 1.5s linear infinite' }}>
            sync
          </span>
          <p style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>시스템 보안 모듈 로딩 중...</p>
        </div>
      </div>
    );
  }

  // Login View
  if (!isAuthenticated) {
    return (
      <>
        {errorMsg && (
          <div style={{
            position: 'absolute',
            top: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9999,
            background: 'rgba(244, 63, 94, 0.95)',
            color: 'white',
            padding: '0.75rem 2rem',
            borderRadius: '8px',
            boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
            fontSize: '0.9rem',
            fontWeight: 'bold',
            backdropFilter: 'blur(5px)'
          }}>
            ⚠️ {errorMsg}
          </div>
        )}
        <Login onLoginSuccess={(email: string) => {
          setAdminEmail(email);
          setIsAuthenticated(true);
        }} />
      </>
    );
  }

  // Admin Panel Main Shell Layout
  return (
    <div className="app-container">
      {/* Sidebar Nav */}
      <Sidebar
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        adminUser={{ name: '관리자', email: adminEmail }}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        onLogout={() => {
          setIsAuthenticated(false);
          setAdminEmail('');
        }}
      />

      {/* Main Container */}
      <div className="main-content">
        {/* Sticky Top Header */}
        <header className="top-header">
          <div className="header-left">
            {/* Hamburger menu button visible only on mobile */}
            <button className="btn-icon-action mobile-menu-btn mobile-menu-toggle-btn" onClick={() => setIsSidebarOpen(true)} style={{ marginRight: '0.5rem' }}>
              <span className="material-icons-round">menu</span>
            </button>
            <span className="material-icons-round header-tab-icon" style={{ color: 'var(--accent-purple)' }}>
              {currentTab === 'dashboard' ? 'dashboard' :
               currentTab === 'members' ? 'people' :
               currentTab === 'points' ? 'monetization_on' :
               currentTab === 'quizzes' ? 'menu_book' :
               currentTab === 'events' ? 'event' :
               currentTab === 'stats' ? 'analytics' :
               currentTab === 'notices' ? 'campaign' :
               currentTab === 'settings' ? 'settings' :
               currentTab === 'logs' ? 'terminal' :
               currentTab === 'missionExam' ? 'assignment' :
               currentTab === 'push' ? 'notifications' : 'security'}
            </span>
            <h1 className="header-title">{getTabTitle(currentTab)}</h1>
          </div>

          {/* Premium Header Search Bar */}
          {currentTab === 'dashboard' && (
            <div className="header-search-bar-premium">
              <select className="header-search-select-premium">
                <option>전체</option>
              </select>
              <div className="header-search-input-wrapper-premium">
                <input
                  type="text"
                  className="header-search-input-premium"
                  placeholder="사용자명 또는 이메일 검색..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setShowDropdown(true);
                  }}
                  onFocus={() => setShowDropdown(true)}
                />
                {searchQuery && (
                  <button
                    className="header-search-clear-premium"
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedInspectorUser(null);
                      setShowDropdown(false);
                    }}
                  >
                    <span className="material-icons-round">close</span>
                  </button>
                )}

                {/* Floating Dropdown */}
                {showDropdown && searchQuery.trim() !== '' && (
                  <div className="header-search-dropdown-premium custom-scroll">
                    {(() => {
                      const displayUsersList = getDisplayUsers();
                      const filteredList = displayUsersList.filter(u => {
                        const matchName = u.name?.toLowerCase().includes(searchQuery.toLowerCase());
                        const matchUsername = u.username.toLowerCase().includes(searchQuery.toLowerCase());
                        return matchName || matchUsername;
                      });

                      if (filteredList.length === 0) {
                        return (
                          <div style={{ padding: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', fontSize: '0.85rem' }}>
                            검색 결과가 없습니다.
                          </div>
                        );
                      }

                      return filteredList.map(u => (
                        <div
                          key={u.id}
                          className="header-search-dropdown-item-premium"
                          onMouseDown={() => {
                            setSelectedInspectorUser(u);
                            setSearchQuery(u.name || u.username);
                            setShowDropdown(false);
                          }}
                        >
                          <div className="header-avatar-mini-premium">
                            {(u.name || u.username).charAt(0).toUpperCase()}
                          </div>
                          <div className="header-user-info-premium">
                            <div className="name">{u.name || '이름 없음'}</div>
                            <div className="sub">@{u.username} | {u.email}</div>
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                )}
              </div>
              <button
                className="header-search-btn-premium"
                onClick={() => {
                  const displayUsersList = getDisplayUsers();
                  const filtered = displayUsersList.filter(u => {
                    const matchName = u.name?.toLowerCase().includes(searchQuery.toLowerCase());
                    const matchUsername = u.username.toLowerCase().includes(searchQuery.toLowerCase());
                    return matchName || matchUsername;
                  });
                  if (filtered.length > 0) {
                    setSelectedInspectorUser(filtered[0]);
                    setSearchQuery(filtered[0].name || filtered[0].username);
                  }
                  setShowDropdown(false);
                }}
              >
                <span className="material-icons-round" style={{ fontSize: '1.1rem' }}>search</span>
                검색
              </button>
            </div>
          )}

          <div className="header-right">
            <div className="date-badge">
              <span className="material-icons-round" style={{ fontSize: '1.1rem', color: 'var(--accent-blue)' }}>today</span>
              {getTodayFullStr()}
            </div>
          </div>
        </header>

        {/* Dynamic Inner Page View */}
        {renderView()}
      </div>
    </div>
  );
}
