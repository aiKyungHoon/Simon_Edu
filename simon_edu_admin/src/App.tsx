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

  // 1. Firebase Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          // Check role in Firestore
          const userDocRef = doc(db, 'users', user.uid);
          const userDoc = await getDoc(userDocRef);

          if (userDoc.exists() && userDoc.data().role === 'admin') {
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
        return <Dashboard setCurrentTab={setCurrentTab} />;
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
      default:
        return <Dashboard setCurrentTab={setCurrentTab} />;
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
            <button className="btn-icon-action mobile-menu-btn" onClick={() => setIsSidebarOpen(true)} style={{ marginRight: '0.5rem' }}>
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
               currentTab === 'settings' ? 'settings' : 'security'}
            </span>
            <h1 className="header-title">{getTabTitle(currentTab)}</h1>
          </div>

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
