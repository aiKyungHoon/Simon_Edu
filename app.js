/* ==========================================================================
   Simon Edu Scripture Memorization Platform - Core Application Logic
   ========================================================================== */

// Initialize Firebase
const firebaseConfig = {
  apiKey: "AIzaSyCMT0S0XCJ5N8e3giFkS7jJxMf8qhVIfs0",
  authDomain: "simon-edu-bible-game.firebaseapp.com",
  projectId: "simon-edu-bible-game",
  storageBucket: "simon-edu-bible-game.firebasestorage.app",
  messagingSenderId: "895429107859",
  appId: "1:895429107859:web:cae6da2ceb403b5747ed66"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Pre-configured passwords for transitioning mock seed data to Auth
const SEED_USERS = {
  admin: {
    name: '관리자 (Simon)',
    email: 'admin@simon.edu',
    password: 'admin123',
    role: 'admin',
    points: 2450,
    consecutiveCheckIns: 4,
    currentVerseIndex: 14,
  },
  yohan: {
    name: '이요한',
    email: 'yohan@gmail.com',
    password: 'password123',
    role: 'user',
    points: 1550,
    consecutiveCheckIns: 5,
    currentVerseIndex: 9,
  },
  peter: {
    name: '베드로',
    email: 'peter@gmail.com',
    password: 'password123',
    role: 'user',
    points: 980,
    consecutiveCheckIns: 2,
    currentVerseIndex: 5,
  },
  maria: {
    name: '마리아',
    email: 'maria@gmail.com',
    password: 'password123',
    role: 'user',
    points: 620,
    consecutiveCheckIns: 1,
    currentVerseIndex: 3,
  },
  timothy: {
    name: '디모데',
    email: 'timothy@gmail.com',
    password: 'password123',
    role: 'user',
    points: 120,
    consecutiveCheckIns: 0,
    currentVerseIndex: 1,
  }
};

class SimonEduApp {
  constructor() {
    this.currentUser = null;
    this.users = [];
    this.currentDifficulty = 'easy';
    this.gameTimerInterval = null;
    this.gameTimeRemaining = 60;
    this.gameHearts = 3;
    this.gameActive = false;
    this.currentQuizVerse = null;
    this.currentQuizBlanks = [];
    this.isTestMode = false;
    
    // Bible Journey States
    this.activeJourneyChapter = 1;
    this.activeJourneyVerseIndex = 0;
    this.isJourneyQuiz = false;
    this.journeyTab = 'all';
    this.chapterDetailTab = 'verses';
    this.verseTextSize = 'normal';

    // Interactive Study States
    this.studyMode = null;
    this.studyVerses = [];
    this.studyCurrentIndex = 0;
    this.studySelectedOptionIndex = null;
    this.studyExamQuestions = [];
    this.studyExamCurrentIndex = 0;
    this.studyAnswered = false;
    this.studyShowExplanation = false;
    this.studyCurrentOptions = [];
    this.studyCorrectOptionIndex = null;
    this.studyDictationAccuracy = 0;

    // Crew & Battle Arena states (Battle mode hidden)
    this.hideBattleMode = true;
    this.isExamMode = false;
    this.examQuestions = [];
    this.currentExamQuestionIndex = 0;
    this.examCorrectCount = 0;
    this.examIncorrectCount = 0;
    this.isEventQuizMode = false;
    this.currentEvent = null;
    this.eventQuestions = [];
    this.currentEventQuestionIndex = 0;
    this.eventCorrectCount = 0;
    this.eventIncorrectCount = 0;
    this.examSubmissions = null;
    this.missionExamSubmissions = [];
    this.missionExamListenerUnsubscribe = null;
    this.activeEvents = [];
    this.currentRankingTab = 'all';
    this.currentEventDetail = null;
    this.shownEventAnnouncementIds = [];

    this.crews = [];
    this.battles = [];
    this.notifiedInviteIds = [];
    this.currentBattleId = null;
    this.currentBattleVerses = [];
    this.currentBattleVerseIndex = 0;
    this.battleCorrectAnswersCount = 0;
    this.battleTotalTimeSpent = 0;
    this.battleStartTime = null;

    const today = new Date();
    this.currentCalendarYear = today.getFullYear();
    this.currentCalendarMonth = today.getMonth();

    // Load saved background color
    this.loadBgColor();

    // Bind theme button click handlers dynamically
    document.querySelectorAll('.theme-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.setTheme(btn.dataset.theme);
        const switcher = document.getElementById('themeSwitcher');
        if (switcher) switcher.classList.remove('expanded');
      });
    });

    // Global click listener to close dropdowns when clicking outside
    document.addEventListener('click', (event) => {
      const switcher = document.getElementById('themeSwitcher');
      const dropdown = document.getElementById('notificationDropdown');
      
      if (switcher && switcher.classList.contains('expanded')) {
        const btnPalette = document.querySelector('.btn-icon-action[title="테마 변경"]') || document.querySelector('.btn-icon-action');
        if (!switcher.contains(event.target) && (!btnPalette || !btnPalette.contains(event.target))) {
          switcher.classList.remove('expanded');
        }
      }
      
      if (dropdown && dropdown.classList.contains('active')) {
        const btnBell = document.getElementById('btnNotificationBell');
        if (!dropdown.contains(event.target) && (!btnBell || !btnBell.contains(event.target))) {
          dropdown.classList.remove('active');
        }
      }
    });

    this.currentUserPreviousRank = null;
    if (this.isMobileApp) {
      document.body.classList.add('mobile-app');
    }

    // Initialize database listener
    this.initDatabase();

    // Set up Auth state change listener
    auth.onAuthStateChanged(user => {
      if (user) {
        db.collection('users').doc(user.uid).get()
          .then(docSnap => {
            if (docSnap.exists) {
              this.currentUser = docSnap.data();
              document.body.classList.add('logged-in');
              this.renderAppForUser();
              
              if (this.isMobileApp && window.MobileAppChannel) {
                window.MobileAppChannel.postMessage(JSON.stringify({
                  event: 'login',
                  role: this.currentUser.role || 'user'
                }));
              }
            } else {
              document.body.classList.remove('logged-in');
              this.logout();
            }
          })
          .catch(err => {
            console.error("Error loading user profile:", err);
            document.body.classList.remove('logged-in');
            this.logout();
          });
      } else {
        this.currentUser = null;
        this.stopMissionExamRankingListener();
        this.missionExamSubmissions = [];
        document.body.classList.remove('logged-in');
        const userNav = document.getElementById('userNav');
        if (userNav) userNav.style.display = 'none';
        const btnNavAdmin = document.getElementById('btnNavAdmin');
        if (btnNavAdmin) btnNavAdmin.style.display = 'none';
        const desktopNav = document.getElementById('desktopNav');
        if (desktopNav) desktopNav.style.display = 'none';
        const fab = document.getElementById('fabCreateCrew');
        if (fab) fab.style.display = 'none';
        
        if (this.isMobileApp && window.MobileAppChannel) {
          window.MobileAppChannel.postMessage(JSON.stringify({
            event: 'logout'
          }));
        }
        
        if (!document.body.classList.contains('single-path-route')) {
          this.switchView('auth');
        }
      }
    });
    this.handleDirectPathRouting();
  }

  get isMobileApp() {
    return (
      typeof window.MobileAppChannel !== 'undefined' ||
      window.SIMON_CLIENT_TYPE === 'app' ||
      new URLSearchParams(window.location.search).get('platform') === 'app'
    );
  }

  createNotification({ title = '알림', message = '', type = 'notice', extra = {} }) {
    return {
      id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      title,
      message,
      type,
      isRead: false,
      read: false,
      timestamp: Date.now(),
      ...extra
    };
  }

  // 1. Database Initialization & Cloud Firestore real-time listener
  initDatabase() {
    db.collection('users').onSnapshot(snapshot => {
      this.users = [];
      snapshot.forEach(doc => {
        this.users.push(doc.data());
      });

      // Update current user details from updated DB array
      if (this.currentUser) {
        const freshUser = this.users.find(u => u.id === this.currentUser.id);
        if (freshUser) {
          this.currentUser = freshUser;
          const navPoints = document.getElementById('navPoints');
          if (navPoints) navPoints.textContent = this.currentUser.points;
          this.renderNotifications();
          this.updateFabVisibility();

          // Toast alert for new notifications
          const unreadInvites = (this.currentUser.notifications || []).filter(n => 
            (n.type === 'battle_invite' || n.type === 'battle_accepted') && !n.read
          );
          unreadInvites.forEach(n => {
            if (!this.notifiedInviteIds.includes(n.id)) {
              this.notifiedInviteIds.push(n.id);
              this.showToast(n.message);
            }
          });
        }
      }

      // Re-render UI widgets if dashboard is active
      const dashboardView = document.getElementById('dashboardView');
      if (dashboardView && dashboardView.classList.contains('active')) {
        this.renderLeaderboardWidget();
        this.renderDashboard();
      }

      // Re-render attendance panel if active
      const attendanceView = document.getElementById('attendanceView');
      if (attendanceView && attendanceView.classList.contains('active')) {
        this.renderAttendanceWidget();
      }

      // Re-render ranking panel if active
      const rankingView = document.getElementById('rankingView');
      if (rankingView && rankingView.classList.contains('active')) {
        this.renderLeaderboardWidget();
      }
      
      // Re-render admin panel if active
      const adminView = document.getElementById('adminView');
      if (adminView && adminView.classList.contains('active')) {
        this.renderAdmin();
      }

      // Re-render settings panel if active
      const settingsView = document.getElementById('settingsView');
      if (settingsView && settingsView.classList.contains('active')) {
        this.renderSettings();
      }
    }, error => {
      console.error("Firestore snapshot sync error:", error);
    });

    // Sync custom quizzes / verse overrides in real-time
    db.collection('customQuizzes').onSnapshot(snapshot => {
      const overrides = {};
      snapshot.forEach(doc => {
        overrides[doc.id] = doc.data();
      });

      // Merge overrides with window.BIBLE_DATA
      if (window.BIBLE_DATA) {
        window.BIBLE_DATA = window.BIBLE_DATA.map(v => {
          const key = `ch${v.chapter}_v${v.verse}`;
          if (overrides[key]) {
            return { ...v, ...overrides[key] };
          }
          return v;
        });
      }

      // If game is active and currently playing, update the current verse data in real-time
      if (this.gameActive && this.currentQuizVerse) {
        const key = `ch${this.currentQuizVerse.chapter}_v${this.currentQuizVerse.verse}`;
        if (overrides[key]) {
          this.currentQuizVerse = { ...this.currentQuizVerse, ...overrides[key] };
        }
      }
    }, error => {
      console.error("Firestore customQuizzes snapshot sync error:", error);
    });

    // Sync global settings in real-time
    db.collection('settings').doc('global').onSnapshot(doc => {
      if (doc.exists) {
        this.globalSettings = doc.data();
        this.renderChallengeCard();
      }
    }, error => {
      console.error("Firestore settings sync error:", error);
    });

    // Sync active events for in-app event popup
    db.collection('events').onSnapshot(snapshot => {
      this.activeEvents = [];
      const today = this.getRelativeDateStr(0);
      snapshot.forEach(doc => {
        const eventData = { id: doc.id, ...doc.data() };
        const startsOk = !eventData.startDate || eventData.startDate <= today;
        const endsOk = !eventData.endDate || eventData.endDate >= today;
        if (eventData.active !== false && startsOk && endsOk) {
          this.activeEvents.push(eventData);
        }
      });
      if (this.activeEvents.length === 0 && this.shouldUseLocalSampleEvents()) {
        this.activeEvents = this.getLocalSampleEvents(today);
      }
      this.updateExamEntryVisibility();
      this.renderChallengeCard();
      this.renderHomeEventsAndNotices();
      const eventsView = document.getElementById('eventsView');
      if (eventsView && eventsView.classList.contains('active')) {
        this.renderEventsView();
      }
      const journeyView = document.getElementById('journeyView');
      if (journeyView && journeyView.classList.contains('active')) {
        this.renderJourneyView();
      }
      const examView = document.getElementById('examView');
      if (examView && examView.classList.contains('active') && !this.hasActiveExamEvent()) {
        this.switchView('dashboard');
      }
      this.maybeShowEventAnnouncement();
    }, error => {
      console.error("Firestore events snapshot sync error:", error);
    });


    // Sync crews in real-time
    db.collection('crews').onSnapshot(snapshot => {
      this.crews = [];
      snapshot.forEach(doc => {
        const crewData = doc.data();
        crewData.id = doc.id;
        this.crews.push(crewData);
      });
      // Re-render crew views if active (mobile) or always update FAB
      const crewView = document.getElementById('crewView');
      if (crewView && crewView.classList.contains('active')) {
        this.renderCrewHub();
      }
      this.updateFabVisibility();
    }, error => {
      console.error("Firestore crews snapshot sync error:", error);
    });

    // Sync battles in real-time
    db.collection('battles').onSnapshot(snapshot => {
      this.battles = [];
      snapshot.forEach(doc => {
        const battleData = doc.data();
        battleData.id = doc.id;
        this.battles.push(battleData);
      });
      // Re-render crew views if active (mobile) or always update FAB
      const crewView = document.getElementById('crewView');
      if (crewView && crewView.classList.contains('active')) {
        this.renderCrewHub();
      }
      this.updateFabVisibility();
    }, error => {
      console.error("Firestore battles snapshot sync error:", error);
    });
  }

  shouldUseLocalSampleEvents() {
    const host = window.location.hostname;
    return host === 'localhost' || host === '127.0.0.1';
  }

  getLocalSampleEvents(today) {
    const samples = [
      {
        id: 'local_mock_event_1',
        eventType: 'special_challenge',
        title: '요한계시록 1장 암송 챌린지',
        description: '요한계시록 1장 1절부터 20절까지 암송을 모두 완료하면 지급되는 특별 보너스 포인트!',
        rewardPoints: 500,
        imageUrl: '',
        homeBanner: '',
        popup: true,
        active: true,
        startDate: '2026-05-28',
        endDate: '2026-06-15',
        participantsCount: 15
      },
      {
        id: 'local_mock_event_2',
        eventType: 'attendance',
        title: '7일 연속 출석 미션',
        description: '쉬지 않고 7일 동안 연속으로 출석 체크를 달성한 회원들에게 주어지는 축하금!',
        rewardPoints: 200,
        imageUrl: 'https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=500&auto=format&fit=crop&q=60',
        homeBanner: 'https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=500&auto=format&fit=crop&q=60',
        popup: false,
        active: true,
        startDate: '2026-05-01',
        endDate: '2026-06-30',
        participantsCount: 42
      },
      {
        id: 'local_mock_event_3',
        eventType: 'general_event',
        title: '호국보훈의 달 암송 대회',
        description: '나라를 사랑하는 마음으로 암송 퀴즈를 10회 이상 클리어 시 보너스 300P 지급',
        rewardPoints: 300,
        imageUrl: 'https://images.unsplash.com/photo-1461360370896-922624d12aa1?w=500&auto=format&fit=crop&q=60',
        homeBanner: 'https://images.unsplash.com/photo-1461360370896-922624d12aa1?w=500&auto=format&fit=crop&q=60',
        popup: false,
        active: false,
        startDate: '2026-06-01',
        endDate: '2026-06-07',
        participantsCount: 8
      }
    ];

    return samples.filter(eventItem => {
      const startsOk = !eventItem.startDate || eventItem.startDate <= today;
      const endsOk = !eventItem.endDate || eventItem.endDate >= today;
      return eventItem.active !== false && startsOk && endsOk;
    });
  }

  saveDatabase() {
    // Deprecated for local storage; data updates are pushed directly to Firestore
  }

  getSeedUserData(username) {
    const seed = SEED_USERS[username.toLowerCase()];
    if (!seed) return null;
    
    let lastCheckInDate = null;
    let lastMissionDate = null;
    if (username.toLowerCase() === 'admin') {
      lastCheckInDate = this.getRelativeDateStr(-1);
      lastMissionDate = this.getRelativeDateStr(-1);
    } else if (username.toLowerCase() === 'yohan') {
      lastCheckInDate = this.getRelativeDateStr(-1);
      lastMissionDate = this.getRelativeDateStr(-1);
    } else if (username.toLowerCase() === 'peter') {
      lastCheckInDate = this.getRelativeDateStr(-2);
      lastMissionDate = this.getRelativeDateStr(-2);
    } else if (username.toLowerCase() === 'maria') {
      lastCheckInDate = this.getRelativeDateStr(0);
      lastMissionDate = this.getRelativeDateStr(0);
    }
    
    const checkInHistory = [];
    if (lastCheckInDate) {
      let baseOffset = 0;
      if (username.toLowerCase() === 'admin' || username.toLowerCase() === 'yohan') {
        baseOffset = -1;
      } else if (username.toLowerCase() === 'peter') {
        baseOffset = -2;
      } else if (username.toLowerCase() === 'maria') {
        baseOffset = 0;
      }
      for (let i = 0; i < seed.consecutiveCheckIns; i++) {
        checkInHistory.push(this.getRelativeDateStr(baseOffset - i));
      }
      checkInHistory.sort();
    }
    
    return {
      id: '', // sets dynamically
      username: username.toLowerCase(),
      name: seed.name,
      email: seed.email,
      role: seed.role,
      points: seed.points,
      faithXP: seed.points,
      consecutiveCheckIns: seed.consecutiveCheckIns,
      lastCheckInDate: lastCheckInDate,
      checkInHistory: checkInHistory,
      currentVerseIndex: seed.currentVerseIndex,
      lastMissionDate: lastMissionDate
    };
  }

  // Helper to calculate date relative to today (e.g., -1 is yesterday, 0 is today)
  getRelativeDateStr(offsetDays) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const date = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${date}`;
  }

  showToast(message) {
    if (this.isMobileApp && window.MobileAppChannel) {
      window.MobileAppChannel.postMessage(JSON.stringify({
        event: 'toast',
        message: message
      }));
    }
  }

  // 2. Auth view tab switcher
  setAuthTab(tab) {
    const tabLogin = document.getElementById('tabLogin');
    const tabSignup = document.getElementById('tabSignup');
    const usernameIdGroup = document.getElementById('usernameIdGroup');
    const usernameGroup = document.getElementById('usernameGroup');
    const emailGroup = document.getElementById('emailGroup');
    const btnAuthSubmit = document.getElementById('btnAuthSubmit');
    const authFooterText = document.getElementById('authFooterText');
    const idMsg = document.getElementById('authUsernameIdMsg');
    const nameMsg = document.getElementById('authUsernameMsg');

    if (tab === 'login') {
      tabLogin.classList.add('active');
      tabSignup.classList.remove('active');
      usernameIdGroup.style.display = 'block';
      usernameGroup.style.display = 'none';
      emailGroup.style.display = 'none';
      document.getElementById('authUsernameId').setAttribute('required', 'true');
      document.getElementById('authUsername').removeAttribute('required');
      document.getElementById('authEmail').removeAttribute('required');
      btnAuthSubmit.textContent = '로그인';
      btnAuthSubmit.disabled = false;
      btnAuthSubmit.style.opacity = '1';
      if (idMsg) idMsg.textContent = '';
      if (nameMsg) nameMsg.textContent = '';
      authFooterText.innerHTML = `
        아직 계정이 없으신가요? <a href="#" onclick="app.setAuthTab('signup'); return false;">회원가입</a>
        <div style="margin-top: 0.75rem; font-size: 0.85rem; display: flex; justify-content: center; gap: 1rem;">
          <a href="#" onclick="app.openModal('modalFindId'); return false;" style="color: var(--text-secondary); text-decoration: underline;">아이디 찾기</a>
          <span style="color: var(--text-muted);">|</span>
          <a href="#" onclick="app.openModal('modalFindPassword'); return false;" style="color: var(--text-secondary); text-decoration: underline;">비밀번호 찾기</a>
        </div>
      `;
    } else {
      tabLogin.classList.remove('active');
      tabSignup.classList.add('active');
      usernameIdGroup.style.display = 'block';
      usernameGroup.style.display = 'block';
      emailGroup.style.display = 'block';
      document.getElementById('authUsernameId').setAttribute('required', 'true');
      document.getElementById('authUsername').setAttribute('required', 'true');
      document.getElementById('authEmail').setAttribute('required', 'true');
      btnAuthSubmit.textContent = '회원가입';
      this.validateSignup();
      authFooterText.innerHTML = `이미 계정이 있으신가요? <a href="#" onclick="app.setAuthTab('login'); return false;">로그인</a>`;
    }
  }

  // Theme presets
  static THEMES = {
    gold: {
      bg: '#F7F3E8',
      g1: 'rgba(200, 146, 17, 0.22)',
      g2: 'rgba(163, 117, 13, 0.12)',
      glass: 'rgba(255, 255, 255, 0.78)',
      glassHover: 'rgba(255, 255, 255, 0.92)',
      glassBorder: 'rgba(200, 146, 17, 0.2)',
      textPrimary: '#3D341C',
      textSecondary: '#5C4F2A',
      textMuted: '#8E7B45',
      glassBorderFocus: 'rgba(200, 146, 17, 0.6)',
      accentPurple: '#C89211',
      accentPurpleGlow: 'rgba(200, 146, 17, 0.12)',
      accentBlue: '#A3750D',
      headerBg: 'rgba(247, 243, 232, 0.85)',
      stampBg: 'rgba(200, 146, 17, 0.05)',
      leaderboardItemBg: 'rgba(255, 255, 255, 0.85)',
      footerBg: 'rgba(247, 243, 232, 0.95)'
    },
    dark: {
      bg: '#0a0b10',
      g1: 'rgba(99, 102, 241, 0.18)',
      g2: 'rgba(15, 23, 42, 0.3)',
      glass: 'rgba(20, 21, 35, 0.5)',
      glassHover: 'rgba(30, 32, 50, 0.65)',
      glassBorder: 'rgba(255, 255, 255, 0.08)',
      textPrimary: '#f3f4f6',
      textSecondary: '#9ca3af',
      textMuted: '#6b7280',
      glassBorderFocus: 'rgba(99, 102, 241, 0.4)',
      accentPurple: '#6366f1',
      accentPurpleGlow: 'rgba(99, 102, 241, 0.3)',
      accentBlue: '#3b82f6',
      headerBg: 'rgba(10, 11, 16, 0.8)',
      stampBg: 'rgba(255, 255, 255, 0.04)',
      leaderboardItemBg: 'rgba(20, 21, 35, 0.3)',
      footerBg: 'rgba(10, 11, 16, 0.9)'
    },
    dreamy: {
      bg: '#15102a',
      g1: 'rgba(167, 139, 250, 0.22)',
      g2: 'rgba(249, 168, 212, 0.15)',
      glass: 'rgba(30, 22, 52, 0.52)',
      glassHover: 'rgba(45, 34, 75, 0.68)',
      glassBorder: 'rgba(255, 255, 255, 0.1)',
      textPrimary: '#fcf8ff',
      textSecondary: '#d1c4e9',
      textMuted: '#9575cd',
      glassBorderFocus: 'rgba(167, 139, 250, 0.4)',
      accentPurple: '#a78bfa',
      accentPurpleGlow: 'rgba(167, 139, 250, 0.3)',
      accentBlue: '#f9a8d4',
      headerBg: 'rgba(21, 16, 42, 0.8)',
      stampBg: 'rgba(167, 139, 250, 0.05)',
      leaderboardItemBg: 'rgba(30, 22, 52, 0.3)',
      footerBg: 'rgba(21, 16, 42, 0.9)'
    },
    ocean: {
      bg: '#061325',
      g1: 'rgba(56, 189, 248, 0.22)',
      g2: 'rgba(6, 182, 212, 0.15)',
      glass: 'rgba(10, 28, 48, 0.58)',
      glassHover: 'rgba(15, 40, 70, 0.72)',
      glassBorder: 'rgba(56, 189, 248, 0.18)',
      textPrimary: '#e0f2fe',
      textSecondary: '#7dd3fc',
      textMuted: '#38bdf8',
      glassBorderFocus: 'rgba(6, 182, 212, 0.5)',
      accentPurple: '#06b6d4',
      accentPurpleGlow: 'rgba(6, 182, 212, 0.3)',
      accentBlue: '#38bdf8',
      headerBg: 'rgba(6, 19, 37, 0.8)',
      stampBg: 'rgba(56, 189, 248, 0.05)',
      leaderboardItemBg: 'rgba(10, 28, 48, 0.3)',
      footerBg: 'rgba(6, 19, 37, 0.9)'
    },
    cherry: {
      bg: '#240f14',
      g1: 'rgba(251, 113, 133, 0.22)',
      g2: 'rgba(253, 164, 175, 0.15)',
      glass: 'rgba(45, 18, 25, 0.58)',
      glassHover: 'rgba(60, 25, 35, 0.72)',
      glassBorder: 'rgba(251, 113, 133, 0.18)',
      textPrimary: '#ffe4e6',
      textSecondary: '#fecdd3',
      textMuted: '#fb7185',
      glassBorderFocus: 'rgba(251, 113, 133, 0.5)',
      accentPurple: '#fb7185',
      accentPurpleGlow: 'rgba(251, 113, 133, 0.3)',
      accentBlue: '#fda4af',
      headerBg: 'rgba(36, 15, 20, 0.8)',
      stampBg: 'rgba(251, 113, 133, 0.05)',
      leaderboardItemBg: 'rgba(45, 18, 25, 0.3)',
      footerBg: 'rgba(36, 15, 20, 0.9)'
    }
  };

  setTheme(name) {
    const theme = SimonEduApp.THEMES[name];
    if (!theme) return;

    // Apply background
    document.body.style.setProperty('background-color', theme.bg, 'important');
    document.body.style.setProperty('background-image',
      `radial-gradient(at 10% 20%, ${theme.g1} 0px, transparent 50%), radial-gradient(at 90% 80%, ${theme.g2} 0px, transparent 50%)`,
      'important'
    );

    // Set document background color for consistency
    document.documentElement.style.backgroundColor = theme.bg;

    // Update CSS variables
    const vars = {
      '--bg-primary': theme.bg,
      '--glass-bg': theme.glass,
      '--glass-bg-hover': theme.glassHover,
      '--glass-border': theme.glassBorder,
      '--text-primary': theme.textPrimary,
      '--text-secondary': theme.textSecondary,
      '--text-muted': theme.textMuted,
      '--glass-border-focus': theme.glassBorderFocus,
      '--accent-purple': theme.accentPurple,
      '--accent-purple-glow': theme.accentPurpleGlow,
      '--accent-blue': theme.accentBlue,
      '--header-bg': theme.headerBg,
      '--stamp-bg': theme.stampBg,
      '--leaderboard-item-bg': theme.leaderboardItemBg,
      '--footer-bg': theme.footerBg
    };

    for (const [key, value] of Object.entries(vars)) {
      document.documentElement.style.setProperty(key, value);
    }

    // Update active button UI
    document.querySelectorAll('.theme-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === name);
    });

    // Save choice
    localStorage.setItem('simon_edu_theme', name);
  }

  loadBgColor() {
    const saved = localStorage.getItem('simon_edu_theme');
    if (saved && SimonEduApp.THEMES[saved]) {
      this.setTheme(saved);
    } else {
      this.setTheme('gold'); // Default to gold
    }
  }

  // Real-time validation for signup
  validateSignup() {
    const isSignup = document.getElementById('tabSignup').classList.contains('active');
    if (!isSignup) return;

    const idInput = document.getElementById('authUsernameId');
    const nameInput = document.getElementById('authUsername');
    const idMsg = document.getElementById('authUsernameIdMsg');
    const nameMsg = document.getElementById('authUsernameMsg');
    const btnSubmit = document.getElementById('btnAuthSubmit');

    let isIdValid = true;
    let isNameValid = true;

    // Validate ID
    if (idInput && idMsg) {
      const idVal = idInput.value.trim();
      if (idVal.length > 0) {
        const idExists = this.users.some(u => u.username && u.username.toLowerCase() === idVal.toLowerCase());
        if (idExists) {
          idMsg.textContent = '❌ 이미 사용중인 아이디입니다.';
          idMsg.className = 'validation-msg error';
          isIdValid = false;
        } else {
          idMsg.textContent = '✅ 사용 가능한 아이디입니다.';
          idMsg.className = 'validation-msg success';
        }
      } else {
        idMsg.textContent = '';
      }
    }

    // Validate Name (Nickname)
    if (nameInput && nameMsg) {
      const nameVal = nameInput.value.trim();
      if (nameVal.length > 0) {
        const nameExists = this.users.some(u => u.name && u.name.toLowerCase() === nameVal.toLowerCase());
        if (nameExists) {
          nameMsg.textContent = '❌ 이미 사용중인 닉네임입니다.';
          nameMsg.className = 'validation-msg error';
          isNameValid = false;
        } else {
          nameMsg.textContent = '✅ 사용 가능한 닉네임입니다.';
          nameMsg.className = 'validation-msg success';
        }
      } else {
        nameMsg.textContent = '';
      }
    }

    if (btnSubmit) {
      btnSubmit.disabled = !(isIdValid && isNameValid);
      btnSubmit.style.opacity = (isIdValid && isNameValid) ? '1' : '0.5';
    }
  }

  // Play Confetti effect
  playConfetti(type) {
    if (typeof confetti !== 'function') return;

    if (type === 'signup') {
      var duration = 3000;
      var end = Date.now() + duration;
      (function frame() {
        confetti({ particleCount: 5, angle: 60, spread: 55, origin: { x: 0 }, colors: ['#9333ea', '#3b82f6', '#f59e0b'] });
        confetti({ particleCount: 5, angle: 120, spread: 55, origin: { x: 1 }, colors: ['#9333ea', '#3b82f6', '#f59e0b'] });
        if (Date.now() < end) requestAnimationFrame(frame);
      }());
    } else if (type === 'checkin') {
      confetti({ particleCount: 150, spread: 70, origin: { y: 0.1 }, colors: ['#f59e0b', '#fbbf24', '#fcd34d'], shapes: ['circle'] });
    } else if (type === 'quiz') {
      confetti({ particleCount: 100, spread: 100, origin: { y: 0.6 }, colors: ['#10b981', '#34d399', '#6ee7b7'] });
    }
  }

  // 3. User Authentication Flows
  handleAuth(event) {
    event.preventDefault();
    const usernameId = document.getElementById('authUsernameId').value.trim();
    const password = document.getElementById('authPassword').value;
    const isSignup = document.getElementById('tabSignup').classList.contains('active');

    if (isSignup) {
      // Sign Up Flow
      const name = document.getElementById('authUsername').value.trim();
      const email = document.getElementById('authEmail').value.trim();
      
      const existingUsername = this.users.find(u => u.username && u.username.toLowerCase() === usernameId.toLowerCase());
      if (existingUsername) {
        alert('이미 등록된 아이디입니다.');
        return;
      }

      const existingEmail = this.users.find(u => u.email && u.email.toLowerCase() === email.toLowerCase());
      if (existingEmail) {
        alert('이미 등록된 이메일 주소입니다.');
        return;
      }

      auth.createUserWithEmailAndPassword(email, password)
        .then((userCredential) => {
          this.playConfetti('signup');
          const newUser = {
            id: userCredential.user.uid,
            username: usernameId,
            name: name,
            email: email,
            role: 'user',
            points: 0,
            faithXP: 0,
            consecutiveCheckIns: 0,
            lastCheckInDate: null,
            checkInHistory: [],
            currentVerseIndex: 0,
            lastMissionDate: null,
          };

          return db.collection('users').doc(newUser.id).set(newUser)
            .then(() => {
              const signupHistory = {
                id: 'hist_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                type: 'signup',
                title: '회원가입 축하금',
                amount: 100,
                date: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
              };
              return db.collection('users').doc(newUser.id).update({
                points: firebase.firestore.FieldValue.increment(100),
                pointsHistory: firebase.firestore.FieldValue.arrayUnion(signupHistory)
              });
            })
            .then(() => {
              this.showPointsFloater(100, "가입 축하 보너스 +100P!");
              alert('회원가입 및 로그인이 완료되었습니다! 축하 포인트 100P가 지급되었습니다.');
            });
        })
        .catch(err => {
          console.error(err);
          alert(`회원가입 실패: ${err.message}`);
        });
    } else {
      // Login Flow
      const idLower = usernameId.toLowerCase();
      const dbUser = this.users.find(u => u.username && u.username.toLowerCase() === idLower);
      const realEmail = dbUser ? dbUser.email : null;
      const seedInfo = SEED_USERS[idLower];

      // Try real email first. If not found, use virtual email.
      const firstEmailToTry = realEmail || (seedInfo ? seedInfo.email : null) || `${idLower}@simon.edu`;

      auth.signInWithEmailAndPassword(firstEmailToTry, password)
        .then(() => {
          // Success handled by Auth state listener
        })
        .catch(err => {
          // If we tried realEmail but it failed, try the legacy virtual email in case they aren't migrated in Auth yet
          if (realEmail && firstEmailToTry === realEmail && 
              (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential')) {
            const virtualEmail = `${idLower}@simon.edu`;
            return auth.signInWithEmailAndPassword(virtualEmail, password)
              .then(() => {
                // Success with legacy virtual email! Update Auth email to their real email for future logins.
                return auth.currentUser.updateEmail(realEmail)
                  .catch(updateErr => {
                    console.warn("Auth email migration failed on login:", updateErr);
                  });
              })
              .catch(err2 => {
                // Wrong password for the virtual email account
                alert('pwd 가 다릅니다');
              });
          }

          // If it failed and we haven't logged in yet, check for seed user migration
          if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
            if (seedInfo && password === seedInfo.password) {
              // Migrate seed user directly using their real email
              auth.createUserWithEmailAndPassword(seedInfo.email, password)
                .then(userCredential => {
                  const seedData = this.getSeedUserData(usernameId);
                  seedData.id = userCredential.user.uid;
                  return db.collection('users').doc(seedData.id).set(seedData);
                })
                .catch(signUpErr => {
                  console.error("Seed user migration failure:", signUpErr);
                  alert('pwd 가 다릅니다');
                });
              return;
            }
          }

          console.error(err);
          // Check if ID exists in users collection or SEED_USERS
          const idExists = dbUser || seedInfo;
          if (!idExists) {
            alert('ID 가 다릅니다');
          } else {
            alert('pwd 가 다릅니다');
          }
        });
    }
  }

  logout() {
    if (this.currentUser && this.currentUser.isTrial) {
      this.currentUser = null;
      this.isTrialMode = false;
      this.stopMissionExamRankingListener();
      this.missionExamSubmissions = [];
      document.body.classList.remove('logged-in');
      const authForm = document.getElementById('authForm');
      if (authForm) authForm.reset();
      const userNav = document.getElementById('userNav');
      if (userNav) userNav.style.display = 'none';
      const btnNavAdmin = document.getElementById('btnNavAdmin');
      if (btnNavAdmin) btnNavAdmin.style.display = 'none';
      this.switchView('auth');
      return;
    }

    auth.signOut()
      .then(() => {
        this.currentUser = null;
        this.stopMissionExamRankingListener();
        this.missionExamSubmissions = [];
        const authForm = document.getElementById('authForm');
        if (authForm) authForm.reset();
        const userNav = document.getElementById('userNav');
        if (userNav) userNav.style.display = 'none';
        const btnNavAdmin = document.getElementById('btnNavAdmin');
        if (btnNavAdmin) btnNavAdmin.style.display = 'none';
        this.switchView('auth');
      })
      .catch(err => {
        console.error("Sign out error:", err);
      });
  }

  // 4. View Router & Screen Renders
  switchView(viewName) {
    this.currentViewName = viewName;
    if (this.hideBattleMode && viewName === 'crew') {
      viewName = 'dashboard';
    }
    if (viewName === 'exam' && !this.hasActiveExamEvent()) {
      alert('현재 진행 중인 사명자 시험 이벤트가 없습니다.');
      viewName = 'dashboard';
    }

    const singleDashboardViews = ['game', 'exam', 'settings', 'events', 'eventDetail', 'notices', 'journey', 'journeyChapterDetail', 'journeyVerseSelect', 'journeyVerseStudy', 'journeyResult', 'noticeDetail', 'notifications'];
    document.body.classList.toggle('single-dashboard-view', singleDashboardViews.includes(viewName));
    document.body.classList.toggle('hide-bottom-nav', ['game', 'exam', 'auth', 'journeyChapterDetail', 'journeyVerseSelect', 'journeyVerseStudy', 'journeyResult', 'eventDetail', 'noticeDetail'].includes(viewName));

    if (this.currentUser && this.currentUser.isTrial) {
      if (viewName === 'ranking' || viewName === 'crew') {
        this.openModal('modalTrialRestrictRanking');
        return;
      }
      if (viewName === 'attendance') {
        this.openModal('modalTrialRestrictAttendance');
        return;
      }
    }

    if (viewName !== 'game') {
      this.clearIntervals();
      this.gameActive = false;
      this.isTestMode = false;
      // Close game-related modals immediately to prevent overlay issues
      ['modalComplete', 'modalFail', 'modalReviewConfirm'].forEach(mId => {
        const modal = document.getElementById(mId);
        if (modal) {
          modal.classList.remove('active');
          modal.style.display = 'none';
        }
      });
    }

    const gridContainer = document.querySelector('.dashboard-grid-container');
    if (gridContainer) {
      if (['dashboard', 'attendance', 'ranking', 'crew', 'events', 'eventDetail', 'notices', 'journey', 'game', 'exam', 'settings', 'journeyChapterDetail', 'journeyVerseSelect', 'journeyVerseStudy', 'journeyResult', 'noticeDetail', 'notifications'].includes(viewName)) {
        gridContainer.style.display = '';
      } else {
        gridContainer.style.display = 'none';
      }
    }

    // FAB: hide on game/auth/settings, otherwise show based on crew status
    const fab = document.getElementById('fabCreateCrew');
    if (fab) {
      if (['game', 'auth', 'settings', 'admin'].includes(viewName)) {
        fab.style.display = 'none';
      } else {
        this.updateFabVisibility();
      }
    }

    if (!this.isMobileApp && ['dashboard', 'attendance', 'ranking', 'crew'].includes(viewName)) {
      // Hide auth, game, and admin views on desktop web
      ['auth', 'game', 'admin'].forEach(v => {
        const el = document.getElementById(v + 'View');
        if (el) el.classList.remove('active');
      });

      // Load view data
      if (viewName === 'dashboard') {
        this.renderDashboard();
      } else if (viewName === 'attendance') {
        this.renderAttendanceWidget();
      } else if (viewName === 'ranking') {
        this.renderLeaderboardWidget();
      } else if (viewName === 'crew') {
        this.renderCrewHub();
      } else if (viewName === 'events') {
        this.renderEventsView();
      } else if (viewName === 'journey') {
        this.renderJourneyView();
      }

      // Smooth scroll to target view
      const targetEl = document.getElementById(viewName + 'View');
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      // Update active tab in desktop nav
      document.querySelectorAll('.desktop-nav-item').forEach(item => {
        item.classList.remove('active');
      });
      const activeTab = document.getElementById('navTab' + viewName.charAt(0).toUpperCase() + viewName.slice(1));
      if (activeTab) {
        activeTab.classList.add('active');
      }
      this.updateBottomNavActive(viewName);
      return;
    }

    // Hide all views
    const containers = document.querySelectorAll('.view-container');
    containers.forEach(c => c.classList.remove('active'));

    // Show matching view
    const activeView = document.getElementById(viewName + 'View');
    if (activeView) {
      activeView.classList.add('active');
      if (this.isMobileApp && ['game', 'notices', 'noticeDetail', 'events', 'eventDetail'].includes(viewName)) {
        activeView.classList.remove('app-page-enter');
        void activeView.offsetWidth;
        activeView.classList.add('app-page-enter');
      }
    }

    // Load matching view data
    if (viewName === 'dashboard') {
      this.renderDashboard();
    } else if (viewName === 'attendance') {
      this.renderAttendanceWidget();
    } else if (viewName === 'ranking') {
      this.renderLeaderboardWidget();
    } else if (viewName === 'crew') {
      this.renderCrewHub();
    } else if (viewName === 'events') {
      this.renderEventsView();
    } else if (viewName === 'eventDetail') {
      this.renderEventDetailView();
    } else if (viewName === 'notices') {
      this.renderNoticesView();
    } else if (viewName === 'journey') {
      this.renderJourneyView();
    } else if (viewName === 'journeyChapterDetail') {
      this.renderChapterDetail();
    } else if (viewName === 'journeyVerseSelect') {
      this.renderVerseSelect();
    } else if (viewName === 'journeyVerseStudy') {
      this.renderVerseStudy();
    } else if (viewName === 'journeyResult') {
      this.renderJourneyResult();
    } else if (viewName === 'admin') {
      this.switchView('dashboard');
    } else if (viewName === 'settings') {
      this.renderSettings();
    } else if (viewName === 'exam') {
      this.renderExamView();
    } else if (viewName === 'notifications') {
      this.renderNotifications();
    }

    // Notify Flutter of view change
    if (this.isMobileApp && window.MobileAppChannel) {
      window.MobileAppChannel.postMessage(JSON.stringify({
        event: 'view_changed',
        view: viewName
      }));
    }

    // Update active tab in desktop nav
    document.querySelectorAll('.desktop-nav-item').forEach(item => {
      item.classList.remove('active');
    });
    const activeTab = document.getElementById('navTab' + viewName.charAt(0).toUpperCase() + viewName.slice(1));
    if (activeTab) {
      activeTab.classList.add('active');
    }
    this.updateBottomNavActive(viewName);
  }

  updateBottomNavActive(viewName) {
    document.querySelectorAll('.bottom-nav-item').forEach(item => item.classList.remove('active'));
    const map = {
      dashboard: 'bottomNavDashboard',
      attendance: 'bottomNavDashboard',
      ranking: 'bottomNavRanking',
      events: 'bottomNavDashboard',
      eventDetail: 'bottomNavDashboard',
      notices: 'bottomNavDashboard',
      journey: 'bottomNavJourney',
      settings: 'bottomNavSettings',
      notifications: 'bottomNavNotifications',
      noticeDetail: 'bottomNavDashboard'
    };
    const active = document.getElementById(map[viewName] || 'bottomNavDashboard');
    if (active) active.classList.add('active');
  }

  requestNativeScreen(viewName, payload = {}) {
    if (!this.isMobileApp || !window.MobileAppChannel || this._nativeRouteBypass) {
      return false;
    }
    window.MobileAppChannel.postMessage(JSON.stringify({
      event: 'open_native_screen',
      view: viewName,
      previousView: this.currentViewName || 'dashboard',
      ...payload
    }));
    return true;
  }

  __runNativeAction(payload = {}) {
    this._nativeRouteBypass = true;
    try {
      if (payload.action === 'startMission') {
        this.startMission();
      } else if (payload.action === 'startTestMode') {
        this.startTestMode();
      } else if (payload.action === 'openNotice') {
        this.openNotice(payload.noticeId);
      } else if (payload.action === 'openEvent') {
        this.openEventFromHome(payload.eventId);
      } else if (payload.action === 'startChapterTestFromDetail') {
        this.startChapterTestFromDetail();
      } else if (payload.action === 'clickChapterCard') {
        this.activeJourneyChapter = payload.chapter;
        this.clickChapterCard(payload.chapter, false);
      } else if (payload.action === 'startExpectedProblemQuiz') {
        this.startExpectedProblemQuiz(payload.verseIndex);
      } else {
        this.switchView(payload.view || 'dashboard');
      }
    } finally {
      this._nativeRouteBypass = false;
    }
  }

  openNotices() {
    this.noticesPrevView = this.currentViewName || 'dashboard';
    if (this.requestNativeScreen('notices', {
      title: '공지사항',
      action: 'switchView'
    })) {
      return;
    }
    this.switchView('notices');
  }

  openEvents() {
    this.eventsPrevView = this.currentViewName || 'dashboard';
    if (this.requestNativeScreen('events', {
      title: '이벤트',
      action: 'switchView'
    })) {
      return;
    }
    this.switchView('events');
  }

  handlePointBadgeClick() {
    if (this.currentUser && this.currentUser.isTrial) {
      this.openModal('modalTrialRestrictPoints');
    } else {
      this.openModal('modalPoints');
    }
  }

  startTrialMode() {
    this.closeModal('modalTrialConfirm');
    this.currentUser = {
      id: 'trial_user',
      name: '체험 사용자',
      points: 0,
      faithXP: 0,
      currentVerseIndex: 0,
      lastMissionDate: null,
      isTrial: true
    };
    this.isTrialMode = true;
    document.body.classList.add('logged-in');
    this.renderAppForUser();
  }

  switchToAuthFromTrial(tabName) {
    ['modalTrialRestrictRanking', 'modalTrialRestrictPoints', 'modalTrialRestrictAttendance', 'modalTrialQuizComplete', 'modalTrialConfirm', 'modalTrialUserMenu'].forEach(mId => {
      this.closeModal(mId);
    });
    this.currentUser = null;
    this.isTrialMode = false;
    
    const userNav = document.getElementById('userNav');
    if (userNav) userNav.style.display = 'none';
    const btnNavAdmin = document.getElementById('btnNavAdmin');
    if (btnNavAdmin) btnNavAdmin.style.display = 'none';
    
    document.body.classList.remove('logged-in');
    this.switchView('auth');
    this.setAuthTab(tabName);
  }

  handleUserAvatarClick() {
    if (this.currentUser && this.currentUser.isTrial) {
      this.openModal('modalTrialUserMenu');
    } else {
      this.switchView('settings');
    }
  }

  switchToAuthFromTrialMenu(tabName) {
    this.closeModal('modalTrialUserMenu');
    this.switchToAuthFromTrial(tabName);
  }

  renderAppForUser() {
    const userNav = document.getElementById('userNav');
    if (userNav) userNav.style.display = 'flex';
    
    const navUsername = document.getElementById('navUsername');
    if (navUsername) navUsername.textContent = this.currentUser.name;
    
    const navPoints = document.getElementById('navPoints');
    if (navPoints) navPoints.textContent = this.currentUser.points;
    
    const navAvatar = document.getElementById('navAvatar');
    if (navAvatar) navAvatar.textContent = this.currentUser.name.charAt(0);

    // Show Admin button if the user is an admin (Admin mode removed from client app)
    const btnNavAdmin = document.getElementById('btnNavAdmin');
    if (btnNavAdmin) {
      btnNavAdmin.style.display = 'none';
    }

    if (this.isMobileApp) {
      document.body.classList.add('mobile-app');
    }

    const desktopNav = document.getElementById('desktopNav');
    if (desktopNav) {
      desktopNav.style.display = 'none';
    }

    // Initialize FAB visibility
    this.updateFabVisibility();

    this.startMissionExamRankingListener();
    this.renderNotifications();
    this.updateExamEntryVisibility();
    this.maybeShowEventAnnouncement();
    if (!document.body.classList.contains('single-path-route')) {
      this.switchView('dashboard');
    }
  }

  // Update FAB visibility based on crew membership
  updateFabVisibility() {
    const fab = document.getElementById('fabCreateCrew');
    if (!fab || !this.currentUser || this.currentUser.isTrial) return;
    if (this.hideBattleMode) {
      fab.style.display = 'none';
      return;
    }
    // Show FAB when user has no crew
    if (!this.currentUser.crewId) {
      fab.style.display = 'flex';
    } else {
      fab.style.display = 'none';
    }
  }

  // 5. Dashboard View Setup
  renderDashboard() {
    if (!this.currentUser) return;

    this.populateTestVerseSelect();
    this.updateExamEntryVisibility();

    // 5.1 Points and Info
    // Always refresh currentUser details from memory array to stay synced
    if (!this.currentUser.isTrial) {
      const freshUser = this.users.find(u => u.id === this.currentUser.id);
      if (freshUser) {
        this.currentUser = freshUser;
      }
    }
    const navPoints = document.getElementById('navPoints');
    if (navPoints) {
      navPoints.textContent = this.currentUser.points;
    }

    // 5.2 Render Daily Mission Details
    const bibleData = window.BIBLE_DATA;
    const curIdx = this.currentUser.currentVerseIndex;

    const homeVerseArt = document.getElementById('homeVerseArt');
    if (homeVerseArt) {
      homeVerseArt.innerHTML = `
        <svg viewBox="0 0 120 120" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <!-- Background -->
          <rect width="120" height="120" rx="16" fill="#fdfaf0" />
          
          <!-- Subtle inner shadow or outline -->
          <rect x="2" y="2" width="116" height="116" rx="14" fill="none" stroke="#f0e2cf" stroke-width="1.5" />
          
          <!-- Leaves / Foliage on left and right -->
          <!-- Left twig -->
          <path d="M 35,90 C 25,80 20,65 25,50" fill="none" stroke="#8ca885" stroke-width="2" stroke-linecap="round"/>
          <path d="M 25,50 Q 22,48 24,44 Q 28,45 25,50" fill="#8ca885" />
          <path d="M 27,62 Q 21,58 24,55 Q 29,58 27,62" fill="#8ca885" />
          <path d="M 30,74 Q 22,70 25,67 Q 31,70 30,74" fill="#8ca885" />
          <path d="M 33,85 Q 26,82 28,78 Q 34,81 33,85" fill="#8ca885" />

          <!-- Right twig -->
          <path d="M 85,90 C 95,80 100,65 95,50" fill="none" stroke="#8ca885" stroke-width="2" stroke-linecap="round"/>
          <path d="M 95,50 Q 98,48 96,44 Q 92,45 95,50" fill="#8ca885" />
          <path d="M 93,62 Q 99,58 96,55 Q 91,58 93,62" fill="#8ca885" />
          <path d="M 90,74 Q 98,70 95,67 Q 89,70 90,74" fill="#8ca885" />
          <path d="M 87,85 Q 94,82 92,78 Q 86,81 87,85" fill="#8ca885" />

          <!-- Open Book at the bottom -->
          <path d="M 30,85 C 45,82 55,86 60,88 C 65,86 75,82 90,85 L 90,73 C 75,70 65,74 60,76 C 55,74 45,70 30,73 Z" fill="#ffffff" stroke="#cbb294" stroke-width="1.5" stroke-linejoin="round"/>
          <path d="M 33,83 C 45,80 55,84 60,86 C 65,84 75,80 87,83 L 87,71 C 75,68 65,72 60,74 C 55,72 45,68 33,71 Z" fill="#ffffff"/>
          
          <!-- Book spine line -->
          <line x1="60" y1="76" x2="60" y2="88" stroke="#cbb294" stroke-width="1.5"/>

          <!-- Cross in the center, standing behind/on the book -->
          <rect x="56" y="25" width="8" height="50" rx="2" fill="#c49a45" />
          <rect x="44" y="37" width="32" height="8" rx="2" fill="#c49a45" />
          <rect x="58" y="27" width="4" height="46" rx="1" fill="#e2c17b" opacity="0.7"/>
          <rect x="46" y="39" width="28" height="4" rx="1" fill="#e2c17b" opacity="0.7"/>
        </svg>
      `;
    }
    
    // Calculate and update Progress Ring
    const progressPercent = Math.min(Math.round((curIdx / bibleData.length) * 100), 100);
    const progressPct = document.getElementById('progressPct');
    if (progressPct) progressPct.textContent = `${progressPercent}%`;
    const homeProgressBar = document.getElementById('homeProgressBar');
    if (homeProgressBar) homeProgressBar.style.width = `${progressPercent}%`;
    const homeProgressCount = document.getElementById('homeProgressCount');
    if (homeProgressCount) homeProgressCount.textContent = `(${Math.min(curIdx + 1, bibleData.length)}/${bibleData.length})`;
    
    const circle = document.getElementById('missionCircle');
    if (circle) {
      // Circumference of r=45 circle is 2 * PI * 45 = 282.74 (approx 283)
      const offset = 283 - (progressPercent / 100) * 283;
      circle.style.strokeDashoffset = offset;
    }

    const startBtn = document.getElementById('btnDailyMissionStart');
    const todayStr = this.getRelativeDateStr(0);
    const hasDoneMissionToday = false; // Unlimited missions requested

    const titleEl = document.getElementById('currentVerseTitle');
    const previewEl = document.getElementById('currentVersePreview');

    if (curIdx < bibleData.length) {
      const currentVerse = bibleData[curIdx];
      if (titleEl) titleEl.textContent = `${currentVerse.chapter}장 ${currentVerse.verse}절`;
      
      if (hasDoneMissionToday) {
        if (previewEl) previewEl.textContent = `오늘의 암송 미션을 완료하셨습니다! 내일 다음 구절 시험이 해금됩니다. (현재 본문: "${currentVerse.text}")`;
        if (startBtn) {
          startBtn.style.display = 'inline-flex';
          startBtn.disabled = true;
          startBtn.style.background = 'rgba(255, 255, 255, 0.05)';
          startBtn.style.borderColor = 'rgba(255, 255, 255, 0.1)';
          startBtn.style.color = 'var(--text-muted)';
          startBtn.innerHTML = `오늘 미션 완료 (내일 오픈) <span class="material-icons-round">lock</span>`;
        }
      } else {
        if (previewEl) previewEl.textContent = `"${currentVerse.text}"`;
        if (startBtn) {
          startBtn.style.display = 'inline-flex';
          startBtn.disabled = false;
          startBtn.style.background = ''; // Revert to stylesheet default
          startBtn.style.borderColor = '';
          startBtn.style.color = '';
          startBtn.innerHTML = `암송 챌린지 시작 <span class="material-icons-round">play_arrow</span>`;
        }
      }
    } else {
      if (titleEl) titleEl.textContent = `축하합니다!`;
      if (previewEl) previewEl.textContent = `요한계시록 전 구절 암송 마스터 달성!`;
      if (startBtn) {
        startBtn.style.display = 'inline-flex';
        startBtn.disabled = false;
        startBtn.style.background = '';
        startBtn.style.borderColor = '';
        startBtn.style.color = '';
        startBtn.innerHTML = `처음부터 다시 복습 <span class="material-icons-round">replay</span>`;
      }
    }

    // 5.3 Render Attendance Widget
    this.renderAttendanceWidget();
    this.renderHomeAttendanceSummary();

    // 5.4 Render Leaderboard
    this.renderLeaderboardWidget();

    // 5.5 Render Scripture Challenge Card
    this.renderChallengeCard();
    this.renderHomeEventsAndNotices();
    this.renderHomeFriendActivities();
    this.renderJourneyView();
    this.renderHomeJourney();
  }

  renderHomeAttendanceSummary() {
    if (!this.currentUser) return;

    const todayStr = this.getRelativeDateStr(0);
    const consecutive = this.currentUser.consecutiveCheckIns || 0;
    const doneToday = this.currentUser.lastCheckInDate === todayStr;
    const milestones = [5, 10, 15, 30];
    const nextMilestone = milestones.find(day => consecutive < day);
    const remainText = nextMilestone
      ? `다음 보상까지 ${Math.max(nextMilestone - consecutive, 0)}일`
      : '모든 연속 출석 보상 달성';

    const statusEl = document.getElementById('homeAttendanceStatus');
    if (statusEl) {
      statusEl.textContent = doneToday ? '오늘 출석 완료' : '출석체크';
    }

    const streakEl = document.getElementById('homeAttendanceStreak');
    if (streakEl) {
      streakEl.textContent = doneToday ? `연속 ${consecutive}일` : `연속 ${consecutive}일`;
    }

    const btn = document.getElementById('btnHomeAttendance');
    if (btn) {
      btn.disabled = doneToday;
      btn.classList.toggle('completed', doneToday);
      btn.setAttribute('aria-label', doneToday ? `오늘 출석 완료, ${remainText}` : `출석체크, ${remainText}`);
    }
  }

  getEventTypeLabel(eventItem) {
    const type = eventItem?.eventType || 'event';
    if (type === 'mission_exam') return '사명자 시험';
    if (type === 'special_challenge') return '특별 암송 이벤트';
    if (type === 'attendance') return '출석 이벤트';
    return '이벤트';
  }

  getEventIcon(eventItem) {
    const type = eventItem?.eventType || 'event';
    if (type === 'mission_exam') return 'assignment_turned_in';
    if (type === 'special_challenge') return 'local_fire_department';
    if (type === 'attendance') return 'event_available';
    return 'campaign';
  }

  renderHomeEventsAndNotices() {
    this.renderHomeEventBanners();
    this.renderHomeNoticeList();
  }

  renderHomeEventBanners() {
    const list = document.getElementById('homeEventBanners');
    if (!list) return;

    const events = (this.activeEvents || []).filter(evt => this._eventTargetsCurrentUser(evt));
    const section = list.closest('.event-banners-section');
    if (events.length === 0) {
      if (section) {
        section.style.display = 'none';
      }
      list.innerHTML = '<div class="home-empty-state">진행 중인 이벤트가 없습니다.</div>';
      return;
    }
    if (section) {
      section.style.display = '';
    }

    const dotsHtml = events.length > 1
      ? `<div class="event-banner-dots">
          ${events.map((_, i) => `<span class="${i === 0 ? 'active' : ''}"></span>`).join('')}
         </div>`
      : '';

    list.innerHTML = `
      <div class="event-banner-track">
        ${events.slice(0, 5).map((evt, index) => {
          const bannerUrl = this.getEventBannerUrl(evt);
          const bgStyle = bannerUrl
            ? `background-image: linear-gradient(0deg, rgba(20,20,20,0.72), rgba(20,20,20,0.18)), url('${this.escapeHtml(bannerUrl)}');`
            : '';
          let artHtml = `<span class="material-icons-round">${this.getEventIcon(evt)}</span>`;
          if (!bannerUrl) {
            artHtml = `
              <svg viewBox="0 0 120 100" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                <!-- Confetti/Stars -->
                <circle cx="15" cy="20" r="1.5" fill="#fdfaf0" opacity="0.8"/>
                <circle cx="105" cy="25" r="2" fill="#ffd700" opacity="0.9"/>
                <path d="M 25 35 L 27 37 L 25 39 L 23 37 Z" fill="#60a5fa" opacity="0.7"/>
                <path d="M 95 30 L 97 32 L 95 34 L 93 32 Z" fill="#f472b6" opacity="0.7"/>

                <!-- Open Book at the bottom -->
                <path d="M 20,80 C 35,76 48,80 55,83 C 62,80 75,76 90,80 L 90,70 C 75,66 62,70 55,73 C 48,70 35,66 20,70 Z" fill="#ffffff" stroke="#94a3b8" stroke-width="1.2"/>
                <path d="M 23,78 C 35,74 48,78 55,81 C 62,78 75,74 87,78 L 87,68 C 75,64 62,68 55,71 C 48,68 35,64 23,68 Z" fill="#ffffff"/>
                <line x1="55" y1="73" x2="55" y2="83" stroke="#94a3b8" stroke-width="1.2"/>

                <!-- Shield -->
                <path d="M 55,30 C 68,30 74,23 74,23 C 74,23 74,50 55,68 C 36,50 36,23 36,23 C 36,23 42,30 55,30 Z" fill="#d97706" stroke="#fbbf24" stroke-width="1.5"/>
                <path d="M 55,33 C 65,33 70,27 70,27 C 70,27 70,47 55,63 C 40,47 40,27 40,27 C 40,27 45,33 55,33 Z" fill="#f59e0b"/>

                <!-- Cross inside shield -->
                <rect x="53.5" y="36" width="3" height="20" fill="#ffffff" rx="0.5"/>
                <rect x="47" y="41" width="16" height="3" fill="#ffffff" rx="0.5"/>
              </svg>
            `;
          }
          return `
            <button class="event-banner-card ${bannerUrl ? 'has-image' : ''}" style="${bgStyle}" onclick="app.openEventFromHome('${evt.id}')" aria-label="${this.escapeHtml(evt.title || this.getEventTypeLabel(evt))}">
              <div class="event-banner-overlay">
                <div>
                  <span class="event-banner-badge">진행중</span>
                  <div class="event-banner-title">${this.escapeHtml(evt.title || this.getEventTypeLabel(evt))}</div>
                  <div class="event-banner-meta">${this.escapeHtml(evt.description || '하나님의 사명을 알고, 믿음으로 도전하세요!')}</div>
                  <div class="event-banner-date">${this.escapeHtml(evt.startDate || '진행 중')} ~ ${this.escapeHtml(evt.endDate || '진행 중')}</div>
                  <span class="event-banner-cta-btn">참여하기 &gt;</span>
                </div>
                <div class="event-banner-art">${artHtml}</div>
              </div>
            </button>
          `;
        }).join('')}
      </div>
      ${dotsHtml}
    `;

    setTimeout(() => {
      const slider = list.querySelector('.event-banner-track');
      const dots = list.querySelectorAll('.event-banner-dots span');
      if (slider && dots.length > 0) {
        slider.addEventListener('scroll', () => {
          const index = Math.round(slider.scrollLeft / slider.offsetWidth);
          dots.forEach((dot, idx) => {
            if (idx === index) {
              dot.classList.add('active');
            } else {
              dot.classList.remove('active');
            }
          });
        });
      }
    }, 100);
  }

  renderHomeNoticeList() {
    const list = document.getElementById('homeNoticeList');
    if (!list) return;
    const notices = this.getNoticeItems().slice(0, 3);
    if (notices.length === 0) {
      list.innerHTML = '<div class="home-empty-state">등록된 공지사항이 없습니다.</div>';
      return;
    }
    list.innerHTML = notices.map((notice, idx) => {
      const isNew = idx === 0;
      const newBadgeHtml = isNew ? '<span class="notice-new-badge">NEW</span>' : '';
      return `
        <button class="notice-item-compact" onclick="app.openNotice('${notice.id}')">
          <div class="notice-item-title-col">
            <span class="notice-bell-container">
              <span class="material-icons-round">notifications</span>
            </span>
            ${newBadgeHtml}
            <span class="notice-item-compact-title">${this.escapeHtml(notice.title)}</span>
          </div>
          <span class="notice-item-compact-date">${this.escapeHtml(notice.date)}</span>
        </button>
      `;
    }).join('');
  }

  getFriendAvatarSVG(friend, index) {
    const idx = index % 3;
    if (idx === 0) {
      return `
        <svg viewBox="0 0 40 40" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <circle cx="20" cy="20" r="20" fill="#E2E8F0"/>
          <circle cx="20" cy="19" r="11" fill="#FCD34D"/>
          <path d="M 9,16 C 9,8 31,8 31,16 C 31,12 28,9 20,9 C 12,9 9,12 9,16 Z" fill="#475569"/>
          <path d="M 9,16 L 12,12 L 15,16 L 18,12 L 21,16 L 24,12 L 27,16 L 31,16 L 31,14 L 9,14 Z" fill="#475569"/>
          <circle cx="16" cy="19" r="1.5" fill="#1E293B"/>
          <circle cx="24" cy="19" r="1.5" fill="#1E293B"/>
          <path d="M 17,23 Q 20,26 23,23" fill="none" stroke="#1E293B" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M 10,36 C 10,29 30,29 30,36 Z" fill="#10B981"/>
        </svg>
      `;
    } else if (idx === 1) {
      return `
        <svg viewBox="0 0 40 40" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <circle cx="20" cy="20" r="20" fill="#FCE7F3"/>
          <path d="M 9,20 C 7,20 7,35 12,35 C 15,35 15,20 15,20 Z" fill="#78350F"/>
          <path d="M 31,20 C 33,20 33,35 28,35 C 25,35 25,20 25,20 Z" fill="#78350F"/>
          <circle cx="20" cy="19" r="11" fill="#FDE047"/>
          <path d="M 9,18 C 9,9 31,9 31,18 C 31,13 28,10 20,10 C 12,10 9,13 9,18 Z" fill="#78350F"/>
          <circle cx="16" cy="19" r="1.5" fill="#1E293B"/>
          <circle cx="24" cy="19" r="1.5" fill="#1E293B"/>
          <path d="M 17,23 Q 20,26 23,23" fill="none" stroke="#1E293B" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M 10,36 C 10,29 30,29 30,36 Z" fill="#F43F5E"/>
        </svg>
      `;
    } else {
      return `
        <svg viewBox="0 0 40 40" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <circle cx="20" cy="20" r="20" fill="#E0F2FE"/>
          <circle cx="20" cy="19" r="11" fill="#FCD34D"/>
          <path d="M 9,16 C 9,7 31,7 31,16 C 28,10 25,11 20,9 C 15,11 12,10 9,16 Z" fill="#1E293B"/>
          <circle cx="15.5" cy="19" r="3" fill="none" stroke="#1E293B" stroke-width="1.5"/>
          <circle cx="24.5" cy="19" r="3" fill="none" stroke="#1E293B" stroke-width="1.5"/>
          <line x1="18.5" y1="19" x2="21.5" y2="19" stroke="#1E293B" stroke-width="1.5"/>
          <circle cx="15.5" cy="19" r="1" fill="#1E293B"/>
          <circle cx="24.5" cy="19" r="1" fill="#1E293B"/>
          <path d="M 18,24 Q 20,26 22,24" fill="none" stroke="#1E293B" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M 10,36 C 10,29 30,29 30,36 Z" fill="#3B82F6"/>
        </svg>
      `;
    }
  }

  renderHomeFriendActivities() {
    const list = document.getElementById('homeFriendActivityList');
    if (!list) return;
    const friends = this.getFriendUsers().slice(0, 3);
    if (friends.length === 0) {
      list.innerHTML = '<div class="home-empty-state">최근 친구 활동이 없습니다.</div>';
      return;
    }
    list.innerHTML = friends.map((friend, index) => {
      const verse = this.getCurrentUserVerse(friend);
      const name = this.escapeHtml(friend.name || friend.username || '사용자');
      const avatarSVG = this.getFriendAvatarSVG(friend, index);
      const online = this.isUserOnline(friend);
      
      const bibleData = window.BIBLE_DATA || [];
      const chVerses = bibleData.filter(v => v.chapter === verse.chapter);
      const firstIdx = bibleData.findIndex(v => v.chapter === verse.chapter);
      const lastIdx = firstIdx + chVerses.length - 1;
      const curIdx = friend.currentVerseIndex || 0;
      const isCompleted = curIdx > lastIdx;
      const status = isCompleted ? '완료!' : '진행 중';
      const dotColor = online ? '#10b981' : '#cbd5e1';

      return `
        <div class="home-friend-card">
          <div class="home-friend-avatar ${online ? 'online' : ''}">${avatarSVG}</div>
          <div class="home-friend-body">
            <strong style="display: flex; align-items: center; gap: 4px;">
              <span style="width: 6px; height: 6px; border-radius: 50%; background: ${dotColor}; display: inline-block; flex-shrink: 0;"></span>
              ${name}
            </strong>
            <span>요한계시록 ${verse.chapter}장 ${status}</span>
          </div>
          <em>${verse.chapter}장</em>
        </div>
      `;
    }).join('');
  }

  // Dashboard Bible Journey Circles
  renderHomeJourney() {
    if (!this.currentUser || !window.BIBLE_DATA) return;

    const bibleData = window.BIBLE_DATA || [];
    const journeyTotalChapters = 22;
    const completedChapterCount = this.getCompletedChapterCount(this.currentUser);
    const progressPercent = Math.min(Math.round((completedChapterCount / journeyTotalChapters) * 100), 100);

    const pctEl = document.getElementById('homeJourneyProgressPct');
    if (pctEl) pctEl.textContent = `${progressPercent}%`;
    
    const countEl = document.getElementById('homeJourneyProgressCount');
    if (countEl) countEl.textContent = `${completedChapterCount} / 22장`;

    const fillEl = document.getElementById('homeJourneyProgressBar');
    if (fillEl) fillEl.style.width = `${progressPercent}%`;

    const chaptersListEl = document.getElementById('homeJourneyChaptersList');
    if (chaptersListEl) {
      const chapterList = [];
      for (let ch = 1; ch <= journeyTotalChapters; ch++) {
        const chVerses = bibleData.filter(v => v.chapter === ch);
        if (chVerses.length === 0) continue;
        const progress = this.getChapterProgress(ch);

        chapterList.push({
          chapter: ch,
          isCompleted: progress.status === 'completed',
          isOngoing: progress.status === 'ongoing',
          pct: progress.pct
        });
      }

      chaptersListEl.innerHTML = chapterList.map(item => {
        let circleClass = '';
        let iconHtml = '';
        let statusText = '';

        if (item.isCompleted) {
          circleClass = 'completed';
          iconHtml = '<span class="material-icons-round">check</span>';
          statusText = '완료';
        } else if (item.isOngoing) {
          circleClass = 'ongoing';
          iconHtml = '<span class="material-icons-round">menu_book</span>';
          statusText = `진행중 ${item.pct}%`;
        } else {
          circleClass = 'waiting';
          iconHtml = '<span class="material-icons-round">radio_button_unchecked</span>';
          statusText = '미시작';
        }

        return `
          <div class="home-journey-chapter-item ${circleClass}" onclick="app.clickChapterCard(${item.chapter}, false)">
            <span class="chapter-num">${item.chapter}장</span>
            <div class="chapter-circle">
              ${iconHtml}
            </div>
            <span class="chapter-status">${statusText}</span>
          </div>
        `;
      }).join('');
    }
  }

  renderEventsView() {
    this.renderHomeEventsAndNotices();
    const eventsList = document.getElementById('eventsPageList');

    if (eventsList) {
      const events = (this.activeEvents || []).filter(evt => this._eventTargetsCurrentUser(evt));
      if (events.length === 0) {
        eventsList.innerHTML = '<div class="home-empty-state">진행 중인 이벤트가 없습니다.</div>';
      } else {
        eventsList.innerHTML = events.map(evt => `
          <button class="app-list-item" onclick="app.openEventFromHome('${evt.id}')">
            <div class="app-list-icon">
              <span class="material-icons-round">${this.getEventIcon(evt)}</span>
            </div>
            <div class="app-list-body">
              <strong>${this.escapeHtml(evt.title || this.getEventTypeLabel(evt))}</strong>
              <span>${this.getEventTypeLabel(evt)} · ${this.escapeHtml(evt.endDate || '진행 중')}</span>
            </div>
            <span class="material-icons-round app-list-arrow">chevron_right</span>
          </button>
        `).join('');
      }
    }
  }

  renderNoticesView() {
    this.renderHomeEventsAndNotices();
    const noticesList = document.getElementById('noticesOnlyPageList');
    if (noticesList) {
      this.renderNoticeListInto(noticesList);
    }
  }

  renderNoticeListInto(listEl) {
    const notices = this.getNoticeItems();
    if (notices.length === 0) {
      listEl.innerHTML = '<div class="home-empty-state">등록된 공지사항이 없습니다.</div>';
      return;
    }
    listEl.innerHTML = notices.map(notice => `
      <button class="app-list-item" onclick="app.openNotice('${notice.id}')">
        <div class="app-list-icon notice">
          <span class="material-icons-round">notifications</span>
        </div>
        <div class="app-list-body">
          <strong>${this.escapeHtml(notice.title)}</strong>
          <span>${this.escapeHtml(notice.date)}</span>
        </div>
        <span class="material-icons-round app-list-arrow">chevron_right</span>
      </button>
    `).join('');
  }

  renderJourneyView() {
    if (!this.currentUser || !window.BIBLE_DATA) return;

    const bibleData = window.BIBLE_DATA || [];
    const curIdx = Math.min(this.currentUser.currentVerseIndex || 0, bibleData.length);
    const journeyTotalChapters = 22;
    const completedChapterCount = this.getCompletedChapterCount(this.currentUser);
    const progressPercent = Math.min(Math.round((completedChapterCount / journeyTotalChapters) * 100), 100);

    const isExamTab = this.journeyTab === 'exam';

    // Show/Hide headers and sections based on tab
    const headerCard = document.querySelector('.journey-header-card-new');
    const metricsGrid = document.getElementById('journeyMetricsGrid');
    const bannerCard = document.getElementById('journeyBannerCard');
    const examPrepArea = document.getElementById('journeyExamPrepArea');
    const examPrepBottom = document.getElementById('journeyExamPrepBottomArea');
    const stickyBottom = document.querySelector('.journey-sticky-bottom');

    if (isExamTab) {
      if (headerCard) headerCard.style.display = 'none';
      if (metricsGrid) metricsGrid.style.display = 'none';
      if (bannerCard) bannerCard.style.display = 'none';
      if (examPrepArea) examPrepArea.style.display = 'block';
      if (examPrepBottom) {
        examPrepBottom.style.display = 'block';
        if (!this.examRange) {
          this.examRange = JSON.parse(localStorage.getItem('examRange') || '{"start":1,"end":5}');
        }
        const examRangeText = document.getElementById('examRangeText');
        if (examRangeText) {
          examRangeText.textContent = `${this.examRange.start}장 ~ ${this.examRange.end}장`;
        }
      }
      if (stickyBottom) stickyBottom.style.display = 'none';
    } else {
      if (headerCard) headerCard.style.display = 'flex';
      if (metricsGrid) metricsGrid.style.display = 'grid';
      if (bannerCard) bannerCard.style.display = 'flex';
      if (examPrepArea) examPrepArea.style.display = 'none';
      if (examPrepBottom) examPrepBottom.style.display = 'none';
      if (stickyBottom) stickyBottom.style.display = 'block';
    }

    // Update Header Text Values
    const curChapterEl = document.getElementById('journeyCurChapter');
    if (curChapterEl) {
      curChapterEl.textContent = completedChapterCount;
    }
    const pctEl = document.getElementById('journeyProgressPercentModern');
    if (pctEl) {
      pctEl.textContent = `${progressPercent}%`;
    }

    // Render Segmented Notch Progress Bar
    const progressContainer = document.getElementById('segmentedProgress');
    if (progressContainer) {
      let pillsHtml = '';
      for (let i = 1; i <= journeyTotalChapters; i++) {
        const isFilled = i <= completedChapterCount;
        pillsHtml += `<div class="segmented-progress-pill ${isFilled ? 'filled' : ''}"></div>`;
      }
      progressContainer.innerHTML = pillsHtml;
    }

    // Render 3 Metric Cards Grid
    if (metricsGrid && !isExamTab) {
      // Metric Card 1: Weekly Goal (동적 구간 계산)
      const targetGoal = Math.min(22, Math.ceil((completedChapterCount + 1) / 5) * 5);
      const goalStart = Math.floor(completedChapterCount / 5) * 5;
      const goalTargetCount = targetGoal - goalStart;
      const goalCurrentCount = Math.min(goalTargetCount, completedChapterCount - goalStart);
      const goalPercent = goalTargetCount > 0 ? Math.round((goalCurrentCount / goalTargetCount) * 100) : 100;
      
      const goalValueText = completedChapterCount >= 22 ? '전체 완독' : `${targetGoal}장 완독`;
      const goalProgressText = `${goalCurrentCount} / ${goalTargetCount}`;
      
      // Metric Card 2: Streak (연속 암송)
      const streakCount = this.currentUser.consecutiveCheckIns || 0;
      const streakSubText = streakCount > 0 ? '연속 달성 중!' : '암송 시작하기';
      
      // Metric Card 3: Completion Reward (완주 보상)
      const rewardValueText = '5,000P + 뱃지';
      const rewardSubText = '모든 장 완주 시';

      metricsGrid.innerHTML = `
        <!-- Card 1: 이번 주 목표 -->
        <div class="journey-metric-card goal" onclick="app.openModal('modalJourneyInfo')">
          <div class="journey-metric-icon-badge">
            <span class="material-icons-round" style="font-size: 1.2rem;">track_changes</span>
          </div>
          <span class="journey-metric-label">이번 주 목표</span>
          <span class="journey-metric-value">${goalValueText}</span>
          <span class="journey-metric-sub">${goalProgressText}</span>
          <div class="journey-metric-progress-wrapper">
            <div class="journey-metric-progress-fill" style="width: ${goalPercent}%"></div>
          </div>
        </div>
        
        <!-- Card 2: 연속 암송 -->
        <div class="journey-metric-card streak" onclick="app.switchView('attendance')">
          <div class="journey-metric-icon-badge">
            <span class="material-icons-round" style="font-size: 1.2rem;">local_fire_department</span>
          </div>
          <span class="journey-metric-label">연속 암송</span>
          <span class="journey-metric-value">${streakCount}일 🔥</span>
          <span class="journey-metric-sub">${streakSubText}</span>
        </div>
        
        <!-- Card 3: 완주 보상 -->
        <div class="journey-metric-card reward" onclick="app.openModal('modalJourneyInfo')">
          <div class="journey-metric-icon-badge">
            <span class="material-icons-round" style="font-size: 1.2rem;">redeem</span>
          </div>
          <span class="journey-metric-label">완주 보상</span>
          <span class="journey-metric-value">${rewardValueText}</span>
          <span class="journey-metric-sub">${rewardSubText}</span>
        </div>
      `;
    }

    // Update Pill Tab Labels
    const tabAll = document.getElementById('journeyTabAll');
    if (tabAll) {
      tabAll.textContent = `전체 (22)`;
    }
    const tabCompleted = document.getElementById('journeyTabCompleted');
    if (tabCompleted) {
      tabCompleted.textContent = `완독 (${completedChapterCount})`;
    }

    // Render Chapters Grid / Timeline
    const chaptersGrid = document.getElementById('journeyChaptersGrid');
    if (chaptersGrid) {
      const chapterList = [];
      const searchQuery = document.getElementById('journeyChapterSearch')?.value.trim() || '';
      
      for (let ch = 1; ch <= journeyTotalChapters; ch++) {
        // Search filter: e.g. "7" or "7장"
        if (searchQuery) {
          const matchQuery = searchQuery.replace(/장$/, '').trim();
          if (ch.toString() !== matchQuery) continue;
        }

        const chVerses = bibleData.filter(v => v.chapter === ch);
        if (chVerses.length === 0) continue;
        const progress = this.getChapterProgress(ch);
        const firstIdx = progress.firstIndex;
        const lastIdx = progress.lastIndex;
        
        const isCompleted = progress.status === 'completed';
        const isOngoing = progress.status === 'ongoing';
        const isNotStarted = progress.status === 'not-started';
        
        // If "완독한 장" tab is active, filter out non-completed chapters
        if (this.journeyTab === 'completed' && !isCompleted) continue;
        
        chapterList.push({
          chapter: ch,
          isCompleted,
          isOngoing,
          isNotStarted,
          firstIdx,
          lastIdx,
          versesCount: chVerses.length,
          completedVerses: progress.completedCount,
          pct: progress.pct
        });
      }

      if (chapterList.length === 0) {
        chaptersGrid.innerHTML = `
          <div class="journey-empty-state" style="grid-column: 1 / -1; padding: 3rem 2rem; text-align: center; color: var(--text-muted); font-size: 0.9rem; width: 100%;">
            <span class="material-icons-round" style="font-size: 2.5rem; margin-bottom: 0.5rem; opacity: 0.5;">hourglass_empty</span>
            <p>${isExamTab ? '검색 결과에 해당하는 장이 없습니다.' : '완독한 장이 아직 없습니다.'}</p>
          </div>
        `;
      } else {
        if (isExamTab) {
          chaptersGrid.className = 'journey-chapters-grid exam-mode';
          chaptersGrid.innerHTML = chapterList.map(item => {
            const isHighlighted = item.chapter >= this.examRange.start && item.chapter <= this.examRange.end;
            const isSelected = this.activeJourneyChapter === item.chapter;
            let cardClass = '';
            
            if (isSelected) cardClass = 'exam-selected';
            else if (isHighlighted) cardClass = 'exam-highlight';
            else cardClass = 'exam-normal';
            
            let iconHtml = '';
            if (item.chapter === 6) {
              iconHtml = '<span class="material-icons-round" style="color: #f59e0b; font-size: 1.15rem;">flag</span>';
            } else if (item.chapter === 10) {
              iconHtml = '<span class="material-icons-round" style="color: #b8860b; font-size: 1.15rem;">military_tech</span>';
            } else if (isHighlighted || isSelected) {
              iconHtml = '<span class="material-icons-round" style="color: #b8860b; font-size: 1.15rem;">diamond</span>';
            } else {
              iconHtml = '<span class="material-icons-round" style="color: #cbd5e1; font-size: 1.15rem;">diamond</span>';
            }
            
            return `
              <div class="chapter-card-grid-item ${cardClass}" onclick="app.clickChapterCard(${item.chapter}, false)">
                ${item.chapter === 1 ? '<span class="exam-card-badge">추천</span>' : ''}
                <div class="exam-card-icon">
                  ${iconHtml}
                </div>
                <div class="exam-card-label">${item.chapter}장</div>
              </div>
            `;
          }).join('');
        } else {
          // Normal Tabs: Render Vertical Timeline
          chaptersGrid.className = 'journey-timeline-container';
          
          const timelineItemsHtml = chapterList.map(item => {
            // Classes
            const timelineCircleClass = item.isCompleted ? 'completed' : (item.isOngoing ? 'ongoing' : 'waiting');
            const timelineCardClass = item.isCompleted ? 'completed' : (item.isOngoing ? 'ongoing' : 'waiting');
            
            // Get first verse text of this chapter for subtitle snippet
            const firstVerseObj = bibleData.find(v => v.chapter === item.chapter);
            const snippet = firstVerseObj ? firstVerseObj.text : '';
            const subTitleText = snippet.length > 35 ? snippet.substring(0, 35) + '...' : snippet;
            
            // Milestone Rewards claimed checks (1, 5, 10, 15, 22)
            const milestones = [1, 5, 10, 15, 22];
            let rewardBadgeHtml = '';
            if (milestones.includes(item.chapter)) {
              const claimed = (this.currentUser.journeyRewardsClaimed || []).includes(item.chapter);
              const unlocked = completedChapterCount >= item.chapter;
              if (unlocked && !claimed) {
                rewardBadgeHtml = `
                  <div style="margin-top: 0.35rem;">
                    <button class="btn-timeline-reward-claim" onclick="event.stopPropagation(); app.claimJourneyReward(${item.chapter})">🎁 보상 받기</button>
                  </div>
                `;
              } else if (claimed) {
                rewardBadgeHtml = `
                  <div style="margin-top: 0.35rem;">
                    <span class="timeline-reward-claimed-badge">🎁 보상 완료</span>
                  </div>
                `;
              } else {
                const rewardsPoints = { 1: 200, 5: 500, 10: 1000, 15: 1500, 22: 5000 };
                rewardBadgeHtml = `
                  <div style="margin-top: 0.35rem; font-size: 0.65rem; color: #94a3b8; font-weight: 600;">
                    🎁 완독 시 +${rewardsPoints[item.chapter]}P
                  </div>
                `;
              }
            }

            // Side controls
            let cardSideHtml = '';
            if (item.isCompleted) {
              cardSideHtml = `
                <div class="timeline-card-side">
                  <span class="timeline-status-badge completed">🟢 완료</span>
                  <span class="material-icons-round" style="color: #10b981; font-size: 1.3rem;">check_circle</span>
                </div>
              `;
            } else if (item.isOngoing) {
              cardSideHtml = `
                <div class="timeline-card-side">
                  <span class="timeline-status-badge ongoing">🟡 진행중 ${item.pct}%</span>
                  <button class="btn-timeline-continue" onclick="event.stopPropagation(); app.clickChapterCard(${item.chapter}, false)">풀기</button>
                </div>
              `;
            } else {
              cardSideHtml = `
                <div class="timeline-card-side">
                  <span class="timeline-status-badge waiting">○ 미시작</span>
                  <button class="btn-timeline-continue" onclick="event.stopPropagation(); app.clickChapterCard(${item.chapter}, false)">시작하기</button>
                </div>
              `;
            }

            // Ongoing Progress Bar inside card
            let ongoingProgressBar = '';
            if (item.isOngoing) {
              ongoingProgressBar = `
                <div class="timeline-card-progress-bar-wrapper">
                  <div class="timeline-card-progress-bar-fill" style="width: ${item.pct}%"></div>
                </div>
              `;
            }

            return `
              <div class="timeline-item">
                <div class="timeline-left">
                  <div class="timeline-circle ${timelineCircleClass}">${item.chapter}</div>
                </div>
                <div class="timeline-right">
                  <div class="timeline-card ${timelineCardClass}" onclick="app.clickChapterCard(${item.chapter}, false)">
                    <div class="timeline-card-main">
                      <span class="timeline-card-title">요한계시록 ${item.chapter}장</span>
                      <span class="timeline-card-subtitle">${subTitleText}</span>
                      ${ongoingProgressBar}
                      ${rewardBadgeHtml}
                    </div>
                    ${cardSideHtml}
                  </div>
                </div>
              </div>
            `;
          }).join('');

          chaptersGrid.innerHTML = `<div class="journey-timeline-list">${timelineItemsHtml}</div>`;
        }
      }
    }

    // Render Sticky Bottom Button
    const bottomBtn = document.getElementById('journeyFloatingStartBtn');
    const bottomBtnText = document.getElementById('journeyFloatingStartText');
    if (bottomBtn && bottomBtnText) {
      if (curIdx >= bibleData.length) {
        bottomBtn.disabled = true;
        bottomBtnText.textContent = '요한계시록 완독 완료!';
        bottomBtn.style.opacity = '0.7';
      } else {
        const ongoingVerse = bibleData[curIdx];
        bottomBtn.disabled = false;
        bottomBtnText.textContent = `이어서 하기 (${ongoingVerse.chapter}장)`;
        bottomBtn.style.opacity = '1';
      }
    }
  }

  async claimJourneyReward(chapter) {
    if (!this.currentUser || this.currentUser.isTrial) return;
    const rewards = {
      1: { points: 200 },
      5: { points: 500 },
      10: { points: 1000 },
      15: { points: 1500 },
      22: { points: 5000, title: '요한계시록 마스터' }
    };
    const reward = rewards[chapter];
    if (!reward) return;
    const claimed = this.currentUser.journeyRewardsClaimed || [];
    if (claimed.includes(chapter)) return;
    if (this.getCompletedChapterCount(this.currentUser) < chapter) {
      alert('아직 완독 조건을 달성하지 않았습니다.');
      return;
    }
    const notification = this.createNotification({
      title: '성경여정 완료',
      type: 'journey_complete',
      message: reward.title
        ? `성경여정 ${chapter}장 보상 +${reward.points}P 및 '${reward.title}' 칭호가 지급되었습니다.`
        : `성경여정 ${chapter}장 완독 보상 +${reward.points}P가 지급되었습니다.`
    });
    const updateData = {
      journeyRewardsClaimed: firebase.firestore.FieldValue.arrayUnion(chapter),
      points: firebase.firestore.FieldValue.increment(reward.points),
      faithXP: firebase.firestore.FieldValue.increment(reward.points),
      notifications: firebase.firestore.FieldValue.arrayUnion(notification)
    };
    if (reward.title) {
      updateData.title = reward.title;
      updateData.badges = firebase.firestore.FieldValue.arrayUnion(reward.title);
    }
    await db.collection('users').doc(this.currentUser.id).update(updateData);
    this.showPointsFloater(reward.points, '성경여정 보상');
    this.showToast('성경여정 보상이 지급되었습니다.');
    this.renderJourneyView();
  }

  setJourneyTab(tab) {
    this.journeyTab = tab;
    document.getElementById('journeyTabAll').classList.toggle('active', tab === 'all');
    document.getElementById('journeyTabCompleted').classList.toggle('active', tab === 'completed');
    document.getElementById('journeyTabExam').classList.toggle('active', tab === 'exam');
    
    // Clear search input when switching tabs
    const searchInput = document.getElementById('journeyChapterSearch');
    if (searchInput) searchInput.value = '';
    
    this.renderJourneyView();
  }

  setChapterDetailTab(tab) {
    this.chapterDetailTab = tab;
    document.getElementById('chapterTabVerses').classList.toggle('active', tab === 'verses');
    document.getElementById('chapterTabSummary').classList.toggle('active', tab === 'summary');
    
    const versesContent = document.getElementById('chapterVersesContent');
    const summaryContent = document.getElementById('chapterSummaryContent');
    
    if (tab === 'verses') {
      versesContent.style.display = 'block';
      summaryContent.style.display = 'none';
    } else {
      versesContent.style.display = 'none';
      summaryContent.style.display = 'block';
    }
  }

  renderChapterDetail() {
    if (!this.currentUser || !window.BIBLE_DATA) return;
    
    const bibleData = window.BIBLE_DATA || [];
    const curIdx = this.currentUser.currentVerseIndex || 0;
    const chapter = this.activeJourneyChapter;
    
    // 1. Update Title (Old layout)
    const titleOld = document.getElementById('chapterDetailTitle');
    if (titleOld) {
      titleOld.textContent = `요한계시록 ${chapter}장`;
    }
    
    // Update Title (New layout)
    const titleNew = document.getElementById('chapterDetailTitleNew');
    if (titleNew) {
      titleNew.textContent = `${chapter}장`;
    }
    
    const titlePreview = document.getElementById('chapterPreviewTitleText');
    if (titlePreview) {
      titlePreview.textContent = `요한계시록 ${chapter}장`;
    }
    
    // 2. Load representative key verse
    const keyVerses = {
      1: { verse: 3, text: "이 예언의 말씀을 읽는 자와 듣는 자들과 그 가운데 기록한 것을 지키는 자들이 복이 있나니 때가 가까움이라" },
      2: { verse: 10, text: "네가 죽도록 충성하라 그리하면 내가 생명의 면류관을 네게 주리라" },
      3: { verse: 20, text: "볼지어다 내가 문 밖에 서서 두드리노니 누구든지 내 음성을 듣고 문을 열면 내가 그에게로 들어가 그로 더불어 먹고 그는 나로 더불어 먹으리라" },
      4: { verse: 11, text: "우리 주 하나님이여 영광과 존귀와 능력을 받으시는 것이 합당하오니 주께서 만물을 지으신지라 만물이 주의 뜻대로 있었고 또 지으심을 받았나이다 하더라" },
      5: { verse: 5, text: "장로 중에 한 사람이 내게 말하되 울지 말라 유대 지파의 사자 다윗의 뿌리가 이기었으니 그 책과 그 일곱 인을 떼시리라 하더라" },
      6: { verse: 1, text: "내가 보매 어린 양이 일곱 인 중에 하나를 떼시는 그 때에 내가 들으니 네 생물 중에 하나가 우뢰 소리 같이 말하되 오라 하기로" },
      7: { verse: 9, text: "이 일 후에 내가 보니 각 나라와 족속과 백성과 방언에서 아무도 능히 셀 수 없는 큰 무리가 흰 옷을 입고 손에 종려 가지를 들고 보좌와 어린 양 앞에 서서" },
      8: { verse: 1, text: "일곱째 인을 떼실 때에 하늘이 반시 동안쯤 고요하더니" },
      9: { verse: 1, text: "다섯째 천사가 나팔을 불매 내가 보니 하늘에서 땅에 떨어진 별 하나가 있는데 저가 무저갱의 열쇠를 받았더라" },
      10: { verse: 10, text: "내가 천사의 손에서 작은 책을 갖다 먹어버리니 내 입에는 꿀 같이 다나 먹은 후에 내 배에서는 쓰게 되더라" },
      11: { verse: 15, text: "일곱째 천사가 나팔을 불매 하늘에 큰 음성들이 나서 가로되 세상 나라가 우리 주와 그 그리스도의 나라가 되어 그가 세세토록 왕노릇 하시리로다 하니" },
      12: { verse: 1, text: "하늘에 큰 이적이 보이니 해를 입은 한 여자가 있는데 그 발 아래는 달이 있고 그 머리에는 열두 별의 면류관을 썼더라" },
      13: { verse: 18, text: "지혜가 여기 있으니 총명한 자는 그 짐승의 수를 세어 보라 그 수는 사람의 수니 육백 육십 육이니라" },
      14: { verse: 1, text: "또 내가 보니 보라 어린 양이 시온 산에 섰고 그와 함께 십 사만 사천이 섰는데 그 이마에 어린 양의 이름과 그 아버지의 이름을 쓴 것이 있도다" },
      15: { verse: 2, text: "또 내가 보니 불이 섞인 유리 바다 같은 것이 있고 짐승과 그의 우상과 그의 이름의 수를 이기고 벗어난 자들이 유리 바다 가에 서서 하나님의 거문고를 가지고" },
      16: { verse: 15, text: "보라 내가 도적 같이 오리니 누구든지 깨어 자기 옷을 지켜 벌거벗고 다니지 아니하며 자기의 부끄러움을 보이지 아니하는 자가 복이 있도다" },
      17: { verse: 14, text: "저희가 어린 양으로 더불어 싸우려니와 어린 양은 만주의 주시요 만왕의 왕이시므로 저희를 이기실 터이요 또 그와 함께 있는 자들 곧 부르심을 입고 빼내심을 얻고 진실한 자들은 이기리로다" },
      18: { verse: 4, text: "또 내가 들으니 하늘로서 다른 음성이 나서 가로되 내 백성아 거기서 나와 그의 죄에 참예하지 말고 그의 받을 재앙들을 받지 말라" },
      19: { verse: 9, text: "천사가 내게 말하기를 기록하라 어린 양의 혼인 잔치에 청함을 입은 자들이 복이 있도다 하고 또 내게 말하되 이것은 하나님의 참되신 말씀이라 하기로" },
      20: { verse: 6, text: "이 첫째 부활에 참예하는 자들은 복이 있고 거룩하도다 둘째 사망이 그들을 다스리는 권세가 없고 도리어 그들이 하나님과 그리스도의 제사장이 되어 천년 동안 그리스도로 더불어 왕노릇 하리라" },
      21: { verse: 4, text: "모든 눈물을 그 눈에서 씻기시매 다시 사망이 없고 애통하는 것이나 곡하는 것이나 아픈 것이 다시 있지 아니하리니 처음 것들이 다 지나갔음이러라" },
      22: { verse: 13, text: "나는 알파와 오메가요 처음과 나중이요 시작과 끝이라" }
    };
    
    const chapterVerses = bibleData.filter(v => v.chapter === chapter);
    const firstIndex = bibleData.findIndex(v => v.chapter === chapter);
    const lastIndex = firstIndex + chapterVerses.length - 1;
    
    let keyVerse = keyVerses[chapter];
    if (!keyVerse && chapterVerses.length > 0) {
      keyVerse = { verse: chapterVerses[0].verse, text: chapterVerses[0].text };
    }
    
    const previewText = document.getElementById('chapterPreviewText');
    if (previewText && keyVerse) {
      previewText.textContent = `"${keyVerse.text}"`;
    }
    
    const previewCitation = document.getElementById('chapterPreviewCitation');
    if (previewCitation && keyVerse) {
      previewCitation.textContent = `요한계시록 ${chapter}:${keyVerse.verse}`;
    }
    
    // 3. Bookmark status
    const isBookmarked = (this.currentUser.bookmarkedChapters || []).includes(chapter);
    const bookmarkIcon = document.getElementById('btnChapterBookmark');
    if (bookmarkIcon) {
      bookmarkIcon.textContent = isBookmarked ? 'bookmark' : 'bookmark_border';
    }
    
    // 4. Progress Stats
    const completedSet = this.getCompletedVerseIndexSet(this.currentUser);
    let completedCount = 0;
    let nextTargetVerse = null;
    chapterVerses.forEach((v, i) => {
      const idx = firstIndex + i;
      if (completedSet.has(idx)) {
        completedCount++;
      } else if (nextTargetVerse === null) {
        nextTargetVerse = v.verse;
      }
    });
    
    const pct = chapterVerses.length > 0 ? Math.round((completedCount / chapterVerses.length) * 100) : 0;
    
    const pctEl = document.getElementById('chapterDetailProgressPct');
    if (pctEl) {
      pctEl.textContent = `${pct}%`;
    }
    
    const circleFill = document.getElementById('chapterDetailCircleFill');
    if (circleFill) {
      // Circumference is 201.06
      const offset = 201.06 * (1 - pct / 100);
      circleFill.style.strokeDashoffset = offset;
    }
    
    const completedEl = document.getElementById('chapterDetailCompletedCount');
    if (completedEl) {
      completedEl.textContent = completedCount;
    }
    
    const totalEl = document.getElementById('chapterDetailTotalCount');
    if (totalEl) {
      totalEl.textContent = chapterVerses.length;
    }
    
    const nextTargetEl = document.getElementById('chapterDetailNextTargetText');
    if (nextTargetEl) {
      if (nextTargetVerse !== null) {
        nextTargetEl.textContent = `${nextTargetVerse}절 암송하기`;
      } else {
        nextTargetEl.textContent = '장 완독 완료!';
      }
    }
    
    // Update Old Layout stats too
    const statusText = completedCount >= chapterVerses.length ? '완료' : (completedCount > 0 ? '진행 중' : '미시작');
    const statusPill = document.getElementById('chapterStatusPill');
    if (statusPill) {
      statusPill.textContent = statusText;
      statusPill.className = 'chapter-status-pill ' + (completedCount >= chapterVerses.length ? 'completed' : (completedCount > 0 ? 'ongoing' : 'waiting'));
    }
    
    const oldProgress = document.getElementById('chapterProgressPercent');
    if (oldProgress) {
      oldProgress.innerHTML = `${pct}% <small>(${completedCount}/${chapterVerses.length}절)</small>`;
    }
    
    const oldProgressBar = document.getElementById('chapterProgressBar');
    if (oldProgressBar) {
      oldProgressBar.style.width = `${pct}%`;
    }
    
    const summaryTextEl = document.getElementById('chapterSummaryText');
    const summaryTitleEl = document.getElementById('chapterSummaryTitle');
    if (summaryTitleEl) summaryTitleEl.textContent = `${chapter}장 요약`;
    if (summaryTextEl) summaryTextEl.textContent = this.getChapterSummary(chapter);
    
    // Render verse list (old layout)
    const verseListEl = document.getElementById('chapterVerseList');
    if (verseListEl) {
      verseListEl.innerHTML = chapterVerses.map((v, i) => {
        const idx = firstIndex + i;
        const isCompleted = completedSet.has(idx);
        const isOngoing = !isCompleted && idx === curIdx;
        const isExamPractice = this.journeyTab === 'exam';
        const statusClass = isCompleted ? 'completed' : (isOngoing ? 'ongoing' : (isExamPractice ? 'practice' : 'ready'));
        
        let statusBadge = '';
        if (isCompleted) {
          statusBadge = '<span class="verse-badge completed">완료</span>';
        } else if (isOngoing) {
          statusBadge = '<span class="verse-badge ongoing">진행 중</span>';
        } else if (isExamPractice) {
          statusBadge = '<span class="verse-badge practice">연습</span>';
        } else {
          statusBadge = '<span class="verse-badge ready" style="background:#fafaf8; color:#94a3b8; border:1px solid #ebebe9; padding: 2px 6px; border-radius:4px; font-size: 0.75rem; font-weight:bold;">미시작</span>';
        }
        
        return `
          <button class="verse-list-row ${statusClass}" onclick="app.openVerseStudy(${idx})">
            <div class="verse-row-left">
              <span class="verse-num">${v.verse}절</span>
              <span class="verse-snippet">${this.escapeHtml(v.text.substring(0, 25))}...</span>
            </div>
            <div class="verse-row-right">
              ${statusBadge}
              <span class="material-icons-round verse-row-arrow">chevron_right</span>
            </div>
          </button>
        `;
      }).join('');
    }
  }

  clickChapterCard(chapter, isLocked) {
    
    if (this.requestNativeScreen('journeyChapterDetail', {
      title: `${chapter}장`,
      action: 'clickChapterCard',
      chapter: chapter
    })) {
      return;
    }
    
    this.activeJourneyChapter = chapter;
    this.chapterDetailTab = 'verses'; // default to verses tab
    this.switchView('journeyChapterDetail');
  }

  startOngoingChapter() {
    if (!this.currentUser || !window.BIBLE_DATA) return;
    const curIdx = Math.min(this.currentUser.currentVerseIndex || 0, window.BIBLE_DATA.length - 1);
    const ongoingVerse = window.BIBLE_DATA[curIdx];
    
    if (this.requestNativeScreen('journeyChapterDetail', {
      title: `${ongoingVerse.chapter}장`,
      action: 'clickChapterCard',
      chapter: ongoingVerse.chapter
    })) {
      return;
    }
    
    this.activeJourneyChapter = ongoingVerse.chapter;
    this.chapterDetailTab = 'verses';
    this.switchView('journeyChapterDetail');
  }

  goBackToChapter() {
    this.switchView('journeyChapterDetail');
  }

  goBackFromChapterDetail() {
    this.switchView('journey');
  }

  toggleChapterBookmark() {
    if (!this.currentUser) return;
    const chapter = this.activeJourneyChapter;
    const bookmarkedChapters = this.currentUser.bookmarkedChapters || [];
    const index = bookmarkedChapters.indexOf(chapter);
    let updateData = {};
    if (index >= 0) {
      updateData.bookmarkedChapters = firebase.firestore.FieldValue.arrayRemove(chapter);
      this.currentUser.bookmarkedChapters = bookmarkedChapters.filter(c => c !== chapter);
      this.showToast(`${chapter}장 북마크가 해제되었습니다.`);
    } else {
      updateData.bookmarkedChapters = firebase.firestore.FieldValue.arrayUnion(chapter);
      this.currentUser.bookmarkedChapters = [...bookmarkedChapters, chapter];
      this.showToast(`${chapter}장 북마크가 추가되었습니다.`);
    }
    
    // Update UI bookmark icon
    const bookmarkIcon = document.getElementById('btnChapterBookmark');
    if (bookmarkIcon) {
      const isBookmarked = (this.currentUser.bookmarkedChapters || []).includes(chapter);
      bookmarkIcon.textContent = isBookmarked ? 'bookmark' : 'bookmark_border';
    }

    if (!this.currentUser.isTrial) {
      db.collection('users').doc(this.currentUser.id).update(updateData);
    }
  }

  openChapterVersesModal() {
    if (!window.BIBLE_DATA) return;
    const bibleData = window.BIBLE_DATA || [];
    const chapter = this.activeJourneyChapter;
    const curIdx = this.currentUser.currentVerseIndex || 0;
    const completedSet = this.getCompletedVerseIndexSet(this.currentUser);
    
    const chapterVerses = bibleData.filter(v => v.chapter === chapter);
    const firstIndex = bibleData.findIndex(v => v.chapter === chapter);
    
    const modalTitle = document.getElementById('chapterVersesModalTitle');
    if (modalTitle) {
      modalTitle.textContent = `요한계시록 ${chapter}장 절 목록`;
    }
    
    const verseListEl = document.getElementById('modalChapterVerseList');
    if (verseListEl) {
      verseListEl.innerHTML = chapterVerses.map((v, i) => {
        const idx = firstIndex + i;
        const isCompleted = completedSet.has(idx);
        const isOngoing = !isCompleted && idx === curIdx;
        const isExamPractice = this.journeyTab === 'exam';
        
        let statusBadge = '';
        let rowClass = 'verse-modal-row';
        if (isCompleted) {
          statusBadge = '<span class="verse-badge completed" style="background:#e6f4ea; color:#137333; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; font-weight:bold;">완료</span>';
          rowClass += ' completed';
        } else if (isOngoing) {
          statusBadge = '<span class="verse-badge ongoing" style="background:#fdf8e6; color:#b8860b; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; font-weight:bold;">진행 중</span>';
          rowClass += ' ongoing';
        } else if (isExamPractice) {
          statusBadge = '<span class="verse-badge practice" style="background:#e0f2fe; color:#0369a1; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; font-weight:bold;">연습</span>';
          rowClass += ' practice';
        } else {
          statusBadge = '<span class="verse-badge ready" style="background:#fafaf8; color:#94a3b8; border:1px solid #ebebe9; padding:2px 6px; border-radius:4px; font-size: 0.75rem; font-weight:bold;">미시작</span>';
          rowClass += ' ready';
        }
        
        const onClickAttr = `onclick="app.closeModal('modalChapterVerses'); app.openVerseStudy(${idx});"`;
        const disabledAttr = '';
        
        return `
          <div class="${rowClass}" ${onClickAttr} ${disabledAttr} style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 0.5rem; border-bottom: 1px solid #f2e7d5; cursor: pointer;">
            <div style="text-align: left;">
              <strong style="font-size: 0.9rem; color: var(--text-primary);">${v.verse}절</strong>
              <span style="font-size: 0.8rem; color: var(--text-muted); margin-left: 0.5rem;">${this.escapeHtml(v.text.substring(0, 18))}...</span>
            </div>
            <div>
              ${statusBadge}
            </div>
          </div>
        `;
      }).join('');
    }
    
    this.openModal('modalChapterVerses');
  }

  startChapterTestFromDetail() {
    if (!this.currentUser || !window.BIBLE_DATA) return;
    
    if (this.requestNativeScreen('game', {
      title: '테스트 모드',
      action: 'startChapterTestFromDetail'
    })) {
      return;
    }
    
    const chapter = this.activeJourneyChapter;
    const bibleData = window.BIBLE_DATA || [];
    const chapterVerses = bibleData.filter(v => v.chapter === chapter);
    if (chapterVerses.length === 0) return;
    
    const randomVerse = chapterVerses[Math.floor(Math.random() * chapterVerses.length)];
    
    this.isTestMode = true;
    this.isJourneyQuiz = false;
    this.currentQuizVerse = randomVerse;
    
    this.switchView('game');
    this.initializeQuiz();
    this.showToast(`📖 요한계시록 ${chapter}장 ${randomVerse.verse}절 테스트 시작 (포인트 없음)`);
  }

  openExpectedProblemsModal() {
    if (!window.BIBLE_DATA) return;
    const bibleData = window.BIBLE_DATA || [];
    const chapter = this.activeJourneyChapter;
    const chapterVerses = bibleData.filter(v => v.chapter === chapter);
    if (chapterVerses.length === 0) return;
    
    // Pick up to 3 verses
    const selectedVerses = chapterVerses.slice(0, 3);
    
    const titleEl = document.getElementById('expectedProblemsModalTitle');
    if (titleEl) {
      titleEl.textContent = `요한계시록 ${chapter}장 예상 문제`;
    }
    
    const listEl = document.getElementById('expectedProblemsList');
    if (listEl) {
      const types = ['빈칸 채우기', '주관식', '객관식'];
      listEl.innerHTML = selectedVerses.map((v, i) => {
        const type = types[i % types.length];
        const verseIdx = bibleData.indexOf(v);
        
        return `
          <div class="menu-item-row" onclick="app.closeModal('modalExpectedProblems'); app.startExpectedProblemQuiz(${verseIdx})" style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1rem; background: #fdfcf7; border: 1px solid #f2e7d5; border-radius: 12px; cursor: pointer; transition: all 0.2s;">
            <div style="text-align: left;">
              <span style="font-size: 0.75rem; color: #b8860b; font-weight: bold; display: block; margin-bottom: 0.15rem;">${type}</span>
              <strong style="font-size: 0.85rem; color: var(--text-primary);">${v.verse}절 핵심 문제</strong>
              <span style="font-size: 0.75rem; color: var(--text-muted); display: block; margin-top: 0.1rem; max-width: 220px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${this.escapeHtml(v.text)}</span>
            </div>
            <span class="material-icons-round" style="color: #cbd5e1; font-size: 1.1rem;">play_arrow</span>
          </div>
        `;
      }).join('');
    }
    
    this.openModal('modalExpectedProblems');
  }

  startExpectedProblemQuiz(verseIdx) {
    if (!window.BIBLE_DATA) return;
    const v = window.BIBLE_DATA[verseIdx];
    if (!v) return;
    
    if (this.requestNativeScreen('game', {
      title: '예상 문제',
      action: 'startExpectedProblemQuiz',
      verseIndex: verseIdx
    })) {
      return;
    }
    
    this.isTestMode = true;
    this.isJourneyQuiz = false;
    this.currentQuizVerse = v;
    
    this.switchView('game');
    this.initializeQuiz();
    this.showToast(`📖 요한계시록 ${v.chapter}장 ${v.verse}절 예상 문제 시작 (포인트 없음)`);
  }

  openReviewHistoryModal() {
    const chapter = this.activeJourneyChapter;
    
    const titleEl = document.getElementById('reviewHistoryModalTitle');
    if (titleEl) {
      titleEl.textContent = `요한계시록 ${chapter}장 복습 기록`;
    }
    
    const dates = ['오늘', '어제', '2일 전', '3일 전', '5일 전'];
    const testDates = ['어제', '3일 전', '5일 전', '1주일 전', '기록 없음'];
    
    document.getElementById('historyLastStudyDate').textContent = dates[chapter % dates.length];
    document.getElementById('historyLastTestDate').textContent = testDates[chapter % testDates.length];
    document.getElementById('historyHighScore').textContent = `${80 + (chapter * 7) % 21}점 / 100점`;
    document.getElementById('historyAverageScore').textContent = `${75 + (chapter * 5) % 21}점`;
    document.getElementById('historyStudyCount').textContent = `${1 + (chapter * 3) % 9}회`;
    
    this.openModal('modalReviewHistory');
  }

  filterJourneyChapters() {
    this.renderJourneyView();
  }

  openVerseStudy(verseIndex) {
    if (!window.BIBLE_DATA) return;
    const bibleData = window.BIBLE_DATA || [];
    if (verseIndex < 0 || verseIndex >= bibleData.length) return;
    
    this.activeJourneyVerseIndex = verseIndex;
    
    // Auto-align study variables
    const v = bibleData[verseIndex];
    this.activeJourneyChapter = v.chapter;
    this.studyMode = this.studyMode || 'easy';
    this.studyVerses = bibleData.filter(val => val.chapter === v.chapter);
    this.studyCurrentIndex = this.studyVerses.findIndex(val => val.verse === v.verse);
    if (this.studyCurrentIndex === -1) this.studyCurrentIndex = 0;
    
    this.switchView('journeyVerseStudy');
  }

  renderVerseStudy() {
    if (this.studyMode) {
      this.renderStudyMode();
      return;
    }
    const bibleData = window.BIBLE_DATA || [];
    const curIdx = this.currentUser.currentVerseIndex || 0;
    const idx = this.activeJourneyVerseIndex;
    const v = bibleData[idx];
    if (!v) return;
    
    document.getElementById('verseStudyTitle').textContent = `요한계시록 ${v.chapter}장 ${v.verse}절`;
    
    const textEl = document.getElementById('verseStudyText');
    textEl.textContent = v.text;
    
    // Bookmark status
    const isBookmarked = (this.currentUser.bookmarks || []).includes(idx);
    const bookmarkIcon = document.getElementById('btnVerseBookmark');
    if (bookmarkIcon) {
      bookmarkIcon.textContent = isBookmarked ? 'bookmark' : 'bookmark_border';
    }
    
    // Font size styling
    const cardEl = document.getElementById('verseStudyCard');
    if (cardEl) {
      cardEl.className = `verse-study-card glass-panel text-size-${this.verseTextSize}`;
    }
    
    // Pagination buttons: 이전 절
    const prevBtn = document.getElementById('btnPrevVerse');
    const chapterFirstIndex = bibleData.findIndex(val => val.chapter === v.chapter);
    if (prevBtn) {
      if (idx > chapterFirstIndex) {
        prevBtn.disabled = false;
        prevBtn.style.opacity = '1';
      } else {
        prevBtn.disabled = true;
        prevBtn.style.opacity = '0.3';
      }
    }
    
    // Pagination buttons: 다음 절
    const nextBtn = document.getElementById('btnNextVerse');
    const chapterLastIndex = chapterFirstIndex + bibleData.filter(val => val.chapter === v.chapter).length - 1;
    if (nextBtn) {
      if (idx < chapterLastIndex) {
        nextBtn.disabled = false;
        nextBtn.style.opacity = '1';
      } else {
        nextBtn.disabled = true;
        nextBtn.style.opacity = '0.3';
      }
    }
  }

  navigateVerse(dir) {
    const nextIdx = this.activeJourneyVerseIndex + dir;
    const bibleData = window.BIBLE_DATA || [];
    if (nextIdx >= 0 && nextIdx < bibleData.length) {
      const v = bibleData[nextIdx];
      const currentChapter = bibleData[this.activeJourneyVerseIndex].chapter;
      if (v.chapter === currentChapter) {
        this.openVerseStudy(nextIdx);
      }
    }
  }

  toggleVerseBookmark() {
    if (!this.currentUser) return;
    const idx = this.activeJourneyVerseIndex;
    const bookmarks = this.currentUser.bookmarks || [];
    const indexInBookmarks = bookmarks.indexOf(idx);
    let updateData = {};
    if (indexInBookmarks >= 0) {
      updateData.bookmarks = firebase.firestore.FieldValue.arrayRemove(idx);
      this.currentUser.bookmarks = bookmarks.filter(b => b !== idx);
      this.showToast('북마크가 해제되었습니다.');
    } else {
      updateData.bookmarks = firebase.firestore.FieldValue.arrayUnion(idx);
      this.currentUser.bookmarks = [...bookmarks, idx];
      this.showToast('북마크에 추가되었습니다.');
    }
    if (!this.currentUser.isTrial) {
      db.collection('users').doc(this.currentUser.id).update(updateData).then(() => {
        this.renderVerseStudy();
      });
    } else {
      this.renderVerseStudy();
    }
  }

  changeVerseTextSize() {
    const sizes = ['normal', 'large', 'largest'];
    const currentIdx = sizes.indexOf(this.verseTextSize);
    const nextIdx = (currentIdx + 1) % sizes.length;
    this.verseTextSize = sizes[nextIdx];
    this.renderVerseStudy();
  }

  startJourneyQuizFromStudy() {
    if (!this.currentUser || !window.BIBLE_DATA) return;
    const idx = this.activeJourneyVerseIndex;
    this.isJourneyQuiz = true;
    this.currentQuizVerse = window.BIBLE_DATA[idx];
    
    // Automatically set difficulty
    if (this.currentQuizVerse.difficulty) {
      const diffMap = {
        'easy': 'easy',
        'normal': 'medium',
        'hard': 'hard'
      };
      this.setDifficulty(diffMap[this.currentQuizVerse.difficulty] || 'medium');
    } else {
      this.setDifficulty('medium');
    }
    
    this.switchView('game');
    this.initializeQuiz();
  }

  reviewVerseStudy() {
    const textEl = document.getElementById('verseStudyText');
    const v = window.BIBLE_DATA[this.activeJourneyVerseIndex];
    if (!v) return;
    
    let text = v.text;
    const keywords = v.keywords || [];
    keywords.forEach(keyword => {
      const regex = new RegExp(`(${keyword})`, 'g');
      text = text.replace(regex, `<span class="highlight-keyword">$1</span>`);
    });
    
    textEl.innerHTML = text;
    this.showToast('핵심 키워드가 하이라이트 되었습니다.');
  }

  renderJourneyResult() {
    const data = this.journeyResultData;
    if (!data) return;
    
    document.getElementById('journeyResultSubtitle').textContent = `요한계시록 ${data.chapter}장 ${data.verse}절`;
    document.getElementById('journeyResultPoints').textContent = `+${data.pointsAwarded} P`;
    
    const checkInRow = document.getElementById('journeyResultCheckInRow');
    if (data.checkInReward > 0) {
      checkInRow.style.display = 'flex';
      document.getElementById('journeyResultCheckInPoints').textContent = `+${data.checkInReward} P`;
    } else {
      checkInRow.style.display = 'none';
    }
    
    const chapterRow = document.getElementById('journeyResultChapterRow');
    if (data.completedChapter) {
      chapterRow.style.display = 'flex';
      const rewardsMap = { 1: 200, 5: 500, 10: 1000, 22: 3000 };
      const rPts = rewardsMap[data.completedChapter] || 200;
      document.getElementById('journeyResultChapterTitle').textContent = `${data.completedChapter}장 완독 보상 해제`;
      document.getElementById('journeyResultChapterPoints').textContent = `+${rPts} P`;
      
      const totalEarned = data.pointsAwarded + data.checkInReward;
      document.getElementById('journeyResultTotalPoints').textContent = `+${totalEarned} P (+${rPts}P 대기)`;
    } else {
      chapterRow.style.display = 'none';
      const totalEarned = data.pointsAwarded + data.checkInReward;
      document.getElementById('journeyResultTotalPoints').textContent = `+${totalEarned} P`;
    }
    
    // Configure Next Verse button
    const nextBtn = document.getElementById('btnResultNextVerse');
    const bibleData = window.BIBLE_DATA || [];
    const nextIdx = this.journeyTab === 'exam' ? (data.verseIndex + 1) : (data.isTrial ? this.currentUser.currentVerseIndex : data.nextVerseIndex);
    
    if (nextBtn) {
      if (nextIdx < bibleData.length) {
        nextBtn.style.display = 'inline-flex';
        const currentChapter = bibleData[data.verseIndex].chapter;
        const nextChapter = bibleData[nextIdx].chapter;
        if (nextChapter === currentChapter) {
          nextBtn.textContent = '다음 절 학습하기';
        } else {
          nextBtn.textContent = `${nextChapter}장 시작하기`;
        }
      } else {
        nextBtn.style.display = 'none';
      }
    }
  }

  actionResultNextVerse() {
    const data = this.journeyResultData;
    if (!data) return;
    const bibleData = window.BIBLE_DATA || [];
    const nextIdx = this.journeyTab === 'exam' ? (data.verseIndex + 1) : (data.isTrial ? this.currentUser.currentVerseIndex : data.nextVerseIndex);
    if (nextIdx < bibleData.length) {
      const v = bibleData[nextIdx];
      this.activeJourneyChapter = v.chapter;
      this.openVerseStudy(nextIdx);
    } else {
      this.showToast('요한계시록의 모든 구절을 암송 완료했습니다!');
      this.switchView('journey');
    }
  }

  actionResultToChapter() {
    this.switchView('journeyChapterDetail');
  }

  shareChapterProgress() {
    if (!this.currentUser) return;
    const chapter = this.activeJourneyChapter;
    const completedChapters = this.getCompletedChapterCount(this.currentUser);
    const text = `📖 요한계시록 ${chapter}장 학습 중! 나의 성경여정 전체 진행 현황: ${completedChapters}/22장 완독 완료. 함께 성경을 완독해요!`;
    
    if (navigator.share) {
      navigator.share({
        title: '성경여정 공유',
        text: text,
        url: window.location.href
      }).catch(err => {
        console.log('Error sharing:', err);
      });
    } else {
      navigator.clipboard.writeText(text).then(() => {
        this.showToast('공유 문구가 클립보드에 복사되었습니다.');
      }).catch(err => {
        alert(text);
      });
    }
  }

  getChapterSummary(chapter) {
    const summaries = {
      1: "예수 그리스도의 계시와 묵시의 전달 과정, 그리고 밧모 섬에서 환상을 본 요한의 소명과 일겁 촛대 사이의 인자 환상을 소개합니다.",
      2: "에베소(처음 사랑 회복), 서머나(죽도록 충성), 버가모(발람의 교훈 경계), 두아디라(이세벨 용납 책망) 교회를 향한 주님의 칭찬과 책망입니다.",
      3: "사데(살았으나 죽은 자), 빌라델비아(열린 문 축복), 라오디게아(미지근한 신앙 책망) 교회를 향한 경고와 승리자에 대한 약속입니다.",
      4: "하늘 영광의 보좌와 하나님의 현현, 보좌 주위의 이십사 장로들과 네 생물이 밤낮 쉬지 않고 하나님을 경배하는 하늘 예배의 광경입니다.",
      5: "하나님의 오른손에 있는 일곱 인으로 봉한 책과, 이를 떼기에 합당하신 유대 지파의 사자요 일찍 죽임을 당하신 어린 양의 등장과 찬양입니다.",
      6: "어린 양이 인을 떼실 때 나타나는 첫째부터 여섯째 인의 재앙(네 말 탄 자, 순교자의 호소, 우주적 흔들림 등)을 묘사합니다.",
      7: "사방의 바람을 잡은 네 천사와 이마에 인 맞은 십사만 사천 명의 영적 군대, 그리고 큰 환난에서 나오는 셀 수 없는 흰 옷 입은 무리입니다.",
      8: "일곱째 인을 떼실 때의 고요함, 일곱 천사의 나팔 준비, 그리고 첫째부터 넷째 나팔 소리와 함께 임하는 땅과 바다, 강, 천체의 재앙입니다.",
      9: "다섯째 나팔(무저갱의 황충 재앙)과 여섯째 나팔(유브라데 강에 결박된 네 천사와 마병대에 의한 인류 3분의 1의 죽음)의 화입니다.",
      10: "구름을 입은 힘센 천사의 출현과 손에 든 펴 놓인 작은 책, 그리고 그 책을 먹고 다시 예언해야 할 요한의 사명에 대한 환상입니다.",
      11: "성전 측량과 두 증인의 권세, 순교와 부활 승천, 그리고 일곱째 나팔 소리와 함께 울려 퍼지는 세상 나라의 영원한 주권 선포입니다.",
      12: "해를 옷 입은 여자(교회)와 철장으로 만국을 다스릴 아이(그리스도)의 탄생, 붉은 용(사단)의 핍박과 하늘의 전쟁을 다룹니다.",
      13: "바다에서 올라온 짐승(정치적 적그리스도)과 땅에서 올라온 짐승(거짓 선지자), 그리고 성도들을 핍박하고 강요하는 666 표입니다.",
      14: "시온 산에 선 어린 양과 십사만 사천 명의 찬양, 세 천사의 기별(심판과 바벨론 멸망), 그리고 땅의 곡식과 포도송이 수확 환상입니다.",
      15: "유리 바다 가에서 모세의 노래와 어린 양의 노래를 부르는 승리자들, 그리고 하늘의 증거 장막 성전에서 나온 일곱 대접을 가진 일곱 천사입니다.",
      16: "일곱 대접의 심판(독종, 피로 변한 바다와 강, 뜨거운 해, 어둠, 유브라데가 마름, 아마겟돈 소집, 그리고 큰 성 바벨론의 갈라짐)입니다.",
      17: "많은 물 위에 앉은 큰 음녀와 일곱 머리와 열 뿔을 가진 붉은 빛 짐승의 비밀, 그리고 음녀에 대한 심판의 의미를 해석해 줍니다.",
      18: "세상의 부귀와 영화를 누리던 큰 성 바벨론의 무참한 멸망과 심판, 그리고 성도들을 향해 '거기서 나오라'고 외치는 하늘의 음성입니다.",
      19: "어린 양의 혼인 기잔의 기쁨과 할렐루야 찬양, 그리고 백마 탄 백마를 타신 만왕의 왕 예수 그리스도의 재림과 심판의 전쟁입니다.",
      20: "사단의 천년 결박, 첫째 부활에 참여한 성도들의 천년 왕노릇, 천년 후 곡과 마곡의 전쟁, 그리고 백보좌 심판과 둘째 사망입니다.",
      21: "새 하늘과 새 땅, 하늘에서 내려오는 거룩한 성 새 예루살렘의 영광스럽고 아름다운 모습과 사망이나 슬픔이 없는 새 창조의 질서입니다.",
      22: "생명수의 강과 생명나무의 영원한 축복, 다시 예언된 주님의 속히 오심에 대한 약속, 그리고 '주 예수여 오시옵소서'라는 간절한 소망입니다."
    };
    return summaries[chapter] || "요한계시록 말씀 구절 학습 및 암송 여정입니다.";
  }

  renderJourneyRanking() {
    const rankList = document.getElementById('journeyRankingList');
    if (!rankList) return;
    let sourceUsers = [...this.users];
    if (this.currentRankingTab === 'friends') {
      const friendIds = this.getFriendIds();
      sourceUsers = sourceUsers.filter(user => friendIds.includes(user.id) || user.id === this.currentUser.id);
    }
    const xpGetter = this.currentRankingTab === 'weekly'
      ? (user) => this.getWeeklyFaithXp(user)
      : (user) => this.getRankingXp(user);
    const sortedUsers = sourceUsers
      .sort((a, b) => xpGetter(b) - xpGetter(a))
      .slice(0, 10);
    if (sortedUsers.length === 0) {
      rankList.innerHTML = '<div class="home-empty-state">아직 랭킹 데이터가 없습니다.</div>';
      return;
    }
    rankList.innerHTML = sortedUsers.map((user, index) => `
      <button class="app-list-item" onclick="app.openAllRankings()">
        <div class="rank-badge ${index === 0 ? 'rank-1' : index === 1 ? 'rank-2' : index === 2 ? 'rank-3' : ''}">${index + 1}</div>
        <div class="app-list-body">
          <strong>${this.escapeHtml(user.username || user.name || '사용자')}</strong>
          <span>${xpGetter(user).toLocaleString()} · ${this.getUserTitle(user)}</span>
        </div>
        <span class="material-icons-round app-list-arrow">chevron_right</span>
      </button>
    `).join('');
  }

  renderFriendsPanel() {
    const list = document.getElementById('friendsList');
    const feed = document.getElementById('friendActivityFeed');
    if (!list || !feed) return;
    const friends = this.getFriendUsers().slice(0, 8);
    if (friends.length === 0) {
      list.innerHTML = '<div class="home-empty-state">친구 목록이 없습니다.</div>';
    } else {
      list.innerHTML = friends.map(friend => {
        const verse = this.getCurrentUserVerse(friend);
        return `
          <div class="friend-item">
            <div class="friend-avatar ${this.isUserOnline(friend) ? 'online' : ''}">${this.escapeHtml((friend.name || 'U').charAt(0))}</div>
            <div class="friend-details">
              <span class="friend-name">${this.escapeHtml(friend.name || friend.username || '사용자')}</span>
              <span class="friend-progress">현재 ${verse.chapter}장 암송중</span>
            </div>
          </div>
        `;
      }).join('');
    }
    const activities = this.getFriendActivities(friends).slice(0, 10);
    if (activities.length === 0) {
      feed.innerHTML = '<div class="home-empty-state">최근 친구 활동이 없습니다.</div>';
    } else {
      feed.innerHTML = activities.map(activity => `
        <div class="activity-item">
          <span class="material-icons-round activity-icon">${activity.icon}</span>
          <div class="activity-content-col">
            <div class="activity-text">${this.escapeHtml(activity.text)}</div>
            <div class="activity-time">${this.escapeHtml(activity.time)}</div>
          </div>
        </div>
      `).join('');
    }
  }

  getCompletedChapterCount(user) {
    const bibleData = window.BIBLE_DATA || [];
    const completedSet = this.getCompletedVerseIndexSet(user);
    const completed = new Set();
    bibleData.forEach((verse, index) => {
      if (verse.chapter <= 22) {
        const chapterVerses = bibleData.filter(v => v.chapter === verse.chapter);
        const firstIndex = bibleData.findIndex(v => v.chapter === verse.chapter);
        const chapterCompleted = chapterVerses.length > 0 && chapterVerses.every((_, i) => completedSet.has(firstIndex + i));
        if (chapterCompleted) completed.add(verse.chapter);
      }
    });
    return completed.size;
  }

  getCompletedVerseIndexSet(user = this.currentUser) {
    const completed = new Set();
    const legacyCount = Math.max(0, Number(user?.currentVerseIndex || 0));
    for (let i = 0; i < legacyCount; i++) {
      completed.add(i);
    }
    (user?.completedVerseIndices || []).forEach(idx => {
      const n = Number(idx);
      if (Number.isInteger(n) && n >= 0) completed.add(n);
    });
    return completed;
  }

  getChapterProgress(chapter, user = this.currentUser) {
    const bibleData = window.BIBLE_DATA || [];
    const chapterVerses = bibleData.filter(v => v.chapter === chapter);
    const firstIndex = bibleData.findIndex(v => v.chapter === chapter);
    const completedSet = this.getCompletedVerseIndexSet(user);
    const completedCount = chapterVerses.reduce((count, _, i) => count + (completedSet.has(firstIndex + i) ? 1 : 0), 0);
    const totalCount = chapterVerses.length;
    const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
    const status = completedCount >= totalCount && totalCount > 0 ? 'completed' : (completedCount > 0 ? 'ongoing' : 'not-started');
    return { completedCount, totalCount, pct, status, firstIndex, lastIndex: firstIndex + totalCount - 1 };
  }

  getRankingXp(user) {
    return Number(user.faithXP ?? user.faithXp ?? user.points ?? 0);
  }

  getWeeklyFaithXp(user) {
    return Number(user.weeklyFaithXP ?? user.weeklyFaithXp ?? user.faithXPThisWeek ?? user.faithXpThisWeek ?? user.weeklyPoints ?? user.pointsThisWeek ?? 0);
  }

  getRankingScore(user, tab = this.currentRankingTab || 'all') {
    return tab === 'weekly' ? this.getWeeklyFaithXp(user) : this.getRankingXp(user);
  }

  getRankedUsers(tab = this.currentRankingTab || 'all') {
    const sortedUsers = [...this.users].sort((a, b) => this.getRankingScore(b, tab) - this.getRankingScore(a, tab));
    let currentRank = 1;
    for (let i = 0; i < sortedUsers.length; i++) {
      if (i > 0 && this.getRankingScore(sortedUsers[i], tab) < this.getRankingScore(sortedUsers[i - 1], tab)) {
        currentRank = i + 1;
      }
      sortedUsers[i].rank = currentRank;
    }
    return sortedUsers;
  }

  getUserDisplayName(user) {
    return user?.username || user?.name || user?.email || '사용자';
  }

  getUserInitial(user) {
    return this.getUserDisplayName(user).trim().charAt(0) || 'U';
  }

  canViewMissionExamRanking() {
    if (!this.currentUser || this.currentUser.isTrial) return false;
    const role = String(this.currentUser.role || 'user').trim().toLowerCase();
    return !['user', 'general', '일반'].includes(role);
  }

  startMissionExamRankingListener() {
    if (!this.canViewMissionExamRanking()) {
      this.stopMissionExamRankingListener();
      this.missionExamSubmissions = [];
      return;
    }
    if (this.missionExamListenerUnsubscribe) return;

    this.missionExamListenerUnsubscribe = db.collection('mission_exam_submissions').onSnapshot(snapshot => {
      this.missionExamSubmissions = [];
      snapshot.forEach(doc => {
        this.missionExamSubmissions.push({ id: doc.id, ...doc.data() });
      });

      const rankingView = document.getElementById('rankingView');
      if (rankingView && rankingView.classList.contains('active')) {
        this.renderLeaderboardWidget();
      }
    }, error => {
      console.error("Firestore mission_exam_submissions snapshot sync error:", error);
    });
  }

  stopMissionExamRankingListener() {
    if (this.missionExamListenerUnsubscribe) {
      this.missionExamListenerUnsubscribe();
      this.missionExamListenerUnsubscribe = null;
    }
  }

  getMissionExamRankedRows() {
    const rowsByKey = new Map();
    const pushRow = (row) => {
      if (!row) return;
      const applicantName = String(row.applicantName || row.name || row.username || '').trim();
      const region = String(row.region || '').trim();
      const score = Number(row.score ?? row.bestScore ?? row.lastScore ?? 0);
      if (!applicantName && score <= 0) return;

      const key = row.regionNameKey || `${region}_${applicantName}` || row.id || `row_${rowsByKey.size}`;
      const normalized = {
        ...row,
        applicantName: applicantName || '응시자',
        region,
        score,
        attemptCount: Number(row.attemptCount ?? row.attempts?.length ?? 0),
        updatedMillis: this.getMillisFromDateValue(row.updatedAt || row.lastAttemptDate || row.submittedAt),
        userId: row.lastUserId || row.userId || row.id
      };

      const prev = rowsByKey.get(key);
      if (
        !prev ||
        normalized.score > prev.score ||
        (normalized.score === prev.score && normalized.attemptCount > prev.attemptCount) ||
        (normalized.score === prev.score && normalized.attemptCount === prev.attemptCount && normalized.updatedMillis > prev.updatedMillis)
      ) {
        rowsByKey.set(key, normalized);
      }
    };

    (this.missionExamSubmissions || []).forEach(pushRow);
    (this.users || []).forEach(user => {
      if (user?.examSubmission) {
        pushRow({
          ...user.examSubmission,
          id: `legacy_${user.id}`,
          userId: user.id,
          applicantName: user.examSubmission.applicantName || user.examSubmission.name || user.username || user.name,
          region: user.examSubmission.region || user.region || ''
        });
      }
    });

    const sortedRows = [...rowsByKey.values()].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.attemptCount !== a.attemptCount) return b.attemptCount - a.attemptCount;
      return b.updatedMillis - a.updatedMillis;
    });

    let currentRank = 1;
    for (let i = 0; i < sortedRows.length; i++) {
      if (i > 0 && sortedRows[i].score < sortedRows[i - 1].score) {
        currentRank = i + 1;
      }
      sortedRows[i].rank = currentRank;
    }
    return sortedRows;
  }

  getMillisFromDateValue(value) {
    if (!value) return 0;
    if (typeof value.toMillis === 'function') return value.toMillis();
    if (typeof value.seconds === 'number') return value.seconds * 1000;
    if (typeof value === 'number') return value;
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }

  getMissionExamEventForRanking() {
    return (this.activeEvents || []).find(evt => evt.eventType === 'mission_exam' && this._eventTargetsCurrentUser(evt));
  }

  formatEventDateRange(eventItem) {
    if (!eventItem) return '';
    const start = eventItem.startDate ? this.formatDateKoreanShort(eventItem.startDate) : '';
    const end = eventItem.endDate ? this.formatDateKoreanShort(eventItem.endDate) : '';
    if (start && end) return `${start} ~ ${end}`;
    return start || end || '';
  }

  formatDateKoreanShort(dateStr) {
    if (!dateStr) return '';
    const parts = String(dateStr).split('-');
    if (parts.length !== 3) return dateStr;
    return `${parts[0]}.${parts[1]}.${parts[2]}`;
  }

  getUserTitle(user) {
    if (user.title) return user.title;
    if ((user.badges || []).includes('요한계시록 마스터') || this.getCompletedChapterCount(user) >= 22) return '요한계시록 마스터';
    const xp = this.getRankingXp(user);
    if (xp >= 12000) return '충성된 증인';
    if (xp >= 7000) return '말씀지기';
    if (xp >= 3000) return '서기관';
    return '제사장';
  }

  getFriendIds() {
    const friends = this.currentUser?.friends || this.currentUser?.friendIds || [];
    return Array.isArray(friends) ? friends : [];
  }

  getFriendUsers() {
    const friendIds = this.getFriendIds();
    if (friendIds.length === 0) {
      return this.users.filter(user => user.id !== this.currentUser?.id).slice(0, 5);
    }
    return this.users.filter(user => friendIds.includes(user.id));
  }

  getCurrentUserVerse(user) {
    const bibleData = window.BIBLE_DATA || [];
    return bibleData[user.currentVerseIndex || 0] || { chapter: 1, verse: 1 };
  }

  isUserOnline(user) {
    const lastActive = Number(user.lastActiveAt || user.lastLoginAt || 0);
    return Boolean(lastActive && Date.now() - lastActive < 1000 * 60 * 10);
  }

  getFriendActivities(friends) {
    const result = [];
    friends.forEach(friend => {
      const history = Array.isArray(friend.pointsHistory) ? friend.pointsHistory.slice(-4) : [];
      history.forEach(item => {
        const type = item.type || '';
        const icon = type === 'attendance' ? 'event_available' : type === 'event' ? 'campaign' : 'auto_stories';
        const action = type === 'attendance' ? '출석 달성' : type === 'event' ? '이벤트 참여' : '장 완독';
        result.push({
          icon,
          text: `${friend.name || friend.username || '친구'}님이 ${action}: ${item.title || ''}`,
          time: item.date || '최근'
        });
      });
    });
    return result.reverse();
  }

  jumpToChapter(chapter) {
    if (!window.BIBLE_DATA) return;
    const idx = window.BIBLE_DATA.findIndex(v => v.chapter === chapter);
    if (idx < 0) return;
    this.activeJourneyChapter = chapter;
    this.switchView('dashboard');
    this.renderDashboard();
  }

  getNoticeItems() {
    const noticeEvents = (this.activeEvents || [])
      .filter(evt => this._eventTargetsCurrentUser(evt))
      .filter(evt => evt.eventType === 'notice' || evt.category === 'notice')
      .map(evt => ({
        id: evt.id,
        title: evt.title || '공지사항',
        body: evt.description || '',
        date: evt.startDate || evt.createdAt || '진행 중'
      }));

    if (noticeEvents.length > 0) return noticeEvents;

    return [
      {
        id: 'default-attendance',
        title: '출석체크는 오늘의 말씀 상단에서 진행할 수 있습니다.',
        body: '매일 앱에 접속하면 홈 상단에서 출석 상태와 다음 보상까지 남은 일수를 확인할 수 있습니다.',
        date: '상시'
      },
      {
        id: 'default-points',
        title: '암송 챌린지 포인트 기준이 적용되었습니다.',
        body: '쉬움 100P, 보통 200P, 어려움 300P, 마스터 500P 기준으로 운영됩니다.',
        date: '운영 안내'
      },
      {
        id: 'default-exam',
        title: '사명자 시험은 관리자 이벤트 등록 시 홈에 노출됩니다.',
        body: '관리자가 사명자 시험 이벤트를 활성화하면 오늘의 말씀 홈과 이벤트 탭에서 응시할 수 있습니다.',
        date: '운영 안내'
      }
    ];
  }

  openEventFromHome(eventId) {
    const eventItem = (this.activeEvents || []).find(evt => evt.id === eventId);
    if (!eventItem) return;
    this.currentEvent = eventItem;
    this.currentEventDetail = eventItem;

    const eventTitle = eventItem.title || this.getEventTypeLabel(eventItem) || '이벤트 상세';

    if (this.requestNativeScreen('eventDetail', {
      title: eventTitle,
      action: 'openEvent',
      eventId: eventId
    })) {
      return;
    }
    this.switchView('eventDetail');
  }

  renderEventDetailView() {
    const container = document.getElementById('eventDetailContent');
    if (!container) return;
    const eventItem = this.currentEventDetail || this.currentEvent || (this.activeEvents || [])[0];
    if (!eventItem) {
      container.innerHTML = '<div class="home-empty-state">이벤트 정보를 찾을 수 없습니다.</div>';
      return;
    }
    this.currentEventDetail = eventItem;
    this.currentEvent = eventItem;

    const typeLabel = this.getEventTypeLabel(eventItem);
    const headerTitleEl = document.getElementById('eventDetailHeaderTitle');
    if (headerTitleEl) {
      headerTitleEl.textContent = eventItem.title || typeLabel || '이벤트 상세';
    }

    const status = this.getEventParticipationStatus(eventItem);
    const targetLabel = this.getEventTargetLabel(eventItem);
    const isMissionExam = eventItem.eventType === 'mission_exam';
    
    let buttonLabel = '';
    let onclickHandler = '';
    let guideHtml = '';
    let infoSectionHtml = '';

    if (isMissionExam) {
      buttonLabel = status === 'completed' ? '결과 보기' : '시험 시작하기';
      onclickHandler = 'app.startMissionExamFlow()';
      guideHtml = `
        <li>목적: ${this.escapeHtml(eventItem.purpose || '사명자 자격 점검 및 말씀 암송 검증')}</li>
        <li>참여 방법: 시작 버튼을 누르고 응시자 정보를 입력한 후 시험에 응시합니다.</li>
        <li>유의사항: 입력된 정보는 공식 결과 및 관리자 확인용으로 저장됩니다.</li>
        <li>지급 보상: +${Number(eventItem.rewardPoints || eventItem.examMaxPoints || 500).toLocaleString()}P</li>
        <li>합격 기준: 80점 이상 합격 시 특별 칭호 지급</li>
      `;
    } else {
      buttonLabel = status === 'completed' ? '이벤트 결과 보기' : status === 'in_progress' ? '이어하기' : '이벤트 시작하기';
      onclickHandler = 'app.startEventFromDetail()';
      guideHtml = `
        <li>목적: ${this.escapeHtml(eventItem.purpose || '대상자 참여 및 학습 점검')}</li>
        <li>참여 방법: 시작 버튼을 눌러 이벤트 암송/출석 미션을 완료합니다.</li>
        <li>유의사항: 이벤트 마감 시간까지 미션을 완수하셔야 포인트가 지급됩니다.</li>
        <li>지급 보상: +${Number(eventItem.rewardPoints || 500).toLocaleString()}P</li>
      `;
    }

    const bannerUrl = this.getEventBannerUrl(eventItem);
    const imageHtml = bannerUrl
      ? `<div class="event-detail-banner"><img src="${this.escapeHtml(bannerUrl)}" alt="이벤트 배너"></div>`
      : `<div class="event-detail-banner no-image"><span class="material-icons-round">${this.getEventIcon(eventItem)}</span></div>`;
    
    container.innerHTML = `
      ${imageHtml}
      <div class="event-detail-card glass-panel">
        <div class="event-detail-head">
          <div>
            <p class="home-section-eyebrow">${typeLabel}</p>
            <h2>${this.escapeHtml(eventItem.title || typeLabel)}</h2>
          </div>
          <span class="event-status-badge ${status}">${this.getEventStatusLabel(status)}</span>
        </div>
        <div class="event-detail-info-row">
          <span>기간: ${this.escapeHtml(eventItem.startDate || '-')} ~ ${this.escapeHtml(eventItem.endDate || '-')}</span>
          <span>대상: ${this.escapeHtml(targetLabel)}</span>
        </div>
        <div class="event-detail-section">
          <h3>이벤트 안내</h3>
          <div class="event-detail-content">${this.escapeHtml(eventItem.description || '이벤트 안내가 등록되지 않았습니다.')}</div>
          <ul class="event-guide-list">
            ${guideHtml}
          </ul>
        </div>
        <button class="btn-primary event-detail-start-btn" onclick="${onclickHandler}">${buttonLabel}</button>
      </div>
    `;
  }

  getEventParticipationStatus(eventItem) {
    const key = `simon_event_status_${eventItem.id}_${this.currentUser?.id || 'guest'}`;
    return localStorage.getItem(key) || 'available';
  }

  setEventParticipationStatus(eventItem, status) {
    const key = `simon_event_status_${eventItem.id}_${this.currentUser?.id || 'guest'}`;
    localStorage.setItem(key, status);
  }

  getEventStatusLabel(status) {
    if (status === 'completed') return '완료';
    if (status === 'in_progress') return '진행 중';
    return '참여 가능';
  }

  getEventTargetLabel(eventItem) {
    const groups = Array.isArray(eventItem.targetGroups)
      ? eventItem.targetGroups
      : (Array.isArray(eventItem.targetRoles) ? eventItem.targetRoles : []);
    const users = Array.isArray(eventItem.targetUsers) ? eventItem.targetUsers : [];
    if (users.length > 0) return `특정 회원 ${users.length}명`;
    if (groups.length === 0) return '전체';
    const roleLabels = {
      user: '일반',
      zone_leader: '구역장',
      team_leader: '팀장',
      department_head: '임과장',
      admin: '관리자',
      missionary: '사명자'
    };
    return groups.map(role => roleLabels[role] || role).join(', ');
  }

  getEventBannerUrl(eventItem) {
    if (!eventItem) return '';
    if (typeof eventItem.homeBanner === 'string') return eventItem.homeBanner;
    return eventItem.imageUrl || eventItem.bannerUrl || '';
  }

  async startEventFromDetail() {
    if (!this.currentUser || !this.currentEventDetail) return;
    this.currentEvent = this.currentEventDetail;
    this.setEventParticipationStatus(this.currentEventDetail, 'in_progress');
    try {
      await db.collection('event_participants').doc(`${this.currentEventDetail.id}_${this.currentUser.id}`).set({
        eventId: this.currentEventDetail.id,
        eventTitle: this.currentEventDetail.title || '',
        userId: this.currentUser.id,
        username: this.currentUser.username || '',
        name: this.currentUser.name || '',
        region: this.currentUser.examRegion || '',
        startedAt: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
        status: 'in_progress'
      }, { merge: true });
    } catch (err) {
      console.error('Event participant save error:', err);
    }
    
    if (this.currentEventDetail.eventType === 'special_challenge') {
      this.startChallenge();
      return;
    }
    this.startEventQuiz();
  }

  openNotice(noticeId) {
    if (this.requestNativeScreen('noticeDetail', {
      title: '공지사항 상세',
      action: 'openNotice',
      noticeId
    })) {
      return;
    }

    const notice = this.getNoticeItems().find(item => item.id === noticeId);
    if (!notice) return;
    
    this.noticePrevView = this.currentViewName || 'dashboard';
    
    const backBtn = document.getElementById('btnNoticeDetailBack');
    if (backBtn) {
      backBtn.setAttribute('onclick', `app.switchView('${this.noticePrevView}')`);
    }

    const titleEl = document.getElementById('noticeDetailTitle');
    const dateEl = document.getElementById('noticeDetailDate');
    const bodyEl = document.getElementById('noticeDetailBody');

    if (titleEl) titleEl.textContent = notice.title;
    if (dateEl) dateEl.textContent = notice.date;
    if (bodyEl) bodyEl.textContent = notice.body || notice.description || '';

    this.switchView('noticeDetail');
  }

  escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  renderChallengeCard() {
    const card = document.getElementById('challengeCard');
    if (!card) return;
    card.style.display = 'none';
    return;

    if (!this.hasActiveSpecialChallengeEvent()) {
      card.style.display = 'none';
      return;
    }

    if (!this.globalSettings || (!this.globalSettings.activeChallengeChapter && !this.globalSettings.challengeStartChapter)) {
      card.style.display = 'none';
      return;
    }

    const challengeVerses = this._getChallengeVersesFromSettings();
    if (challengeVerses.length === 0) {
      card.style.display = 'none';
      return;
    }
    const firstVerse = challengeVerses[0];
    const lastVerse = challengeVerses[challengeVerses.length - 1];
    const rangeLabel = firstVerse.chapter === lastVerse.chapter && firstVerse.verse === lastVerse.verse
      ? `요한계시록 ${firstVerse.chapter}장 ${firstVerse.verse}절`
      : `요한계시록 ${firstVerse.chapter}장 ${firstVerse.verse}절 ~ ${lastVerse.chapter}장 ${lastVerse.verse}절`;
    const chapter = firstVerse.chapter;
    const bonus = this.globalSettings.challengeBonusPoints || 50;

    // Set texts safely
    const titleEl = document.getElementById('challengeChapterTitle');
    if (titleEl) titleEl.textContent = `${rangeLabel} 암송 챌린지`;

    const bonusEl = document.getElementById('challengeBonusPointsDisplay');
    if (bonusEl) bonusEl.textContent = `+${bonus}P`;

    const textEl = document.getElementById('challengeProgressText');
    if (textEl) {
      textEl.innerHTML = `관리자가 지정한 특별 챌린지입니다. ${rangeLabel} 구간을 모두 암송 완료하면 <strong style="color: var(--accent-amber);">+${bonus}P</strong> 보너스를 드립니다!`;
    }

    // Calculate progress if user logged in
    if (this.currentUser) {
      const progress = this.currentUser.challengeProgress || {};
      const totalCount = challengeVerses.length;
      
      let completedCount = 0;
      if (progress.rangeKey === this._getChallengeRangeKey() || progress.chapter === chapter) {
        completedCount = progress.completedCount || 0;
      }

      const containerEl = document.getElementById('challengeProgressContainer');
      if (containerEl) containerEl.style.display = 'flex';
      
      const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
      
      const barEl = document.getElementById('challengeProgressBar');
      if (barEl) barEl.style.width = `${pct}%`;

      const labelEl = document.getElementById('challengeProgressLabel');
      if (labelEl) labelEl.textContent = `${completedCount} / ${totalCount}`;

      const btn = document.getElementById('btnStartChallenge');
      const badge = document.getElementById('challengeBadge');
      if (progress.claimed && (progress.rangeKey === this._getChallengeRangeKey() || progress.chapter === chapter)) {
        if (btn) {
          btn.innerHTML = '챌린지 완수 완료 <span class="material-icons-round">emoji_events</span>';
          btn.style.background = 'var(--sidebar-active)';
          btn.style.cursor = 'default';
          btn.setAttribute('onclick', '');
        }
        if (badge) {
          badge.textContent = '완료';
          badge.style.background = 'var(--accent-emerald)';
        }
      } else {
        if (btn) {
          btn.innerHTML = '챌린지 도전하기 <span class="material-icons-round">local_fire_department</span>';
          btn.style.background = 'linear-gradient(135deg, var(--accent-purple), var(--accent-blue))';
          btn.style.cursor = 'pointer';
          btn.setAttribute('onclick', 'app.startChallenge()');
        }
        if (badge) {
          badge.textContent = '진행 중';
          badge.style.background = 'var(--accent-purple)';
        }
      }
    } else {
      const containerEl = document.getElementById('challengeProgressContainer');
      if (containerEl) containerEl.style.display = 'none';
    }

    card.style.display = 'block';
  }

  startChallenge() {
    if (!this.currentUser) return;
    if (!this.globalSettings || (!this.globalSettings.activeChallengeChapter && !this.globalSettings.challengeStartChapter)) return;

    const challengeVerses = this._getChallengeVersesFromSettings();
    if (challengeVerses.length === 0) {
      alert("챌린지 구간의 말씀 데이터를 찾을 수 없습니다.");
      return;
    }
    const rangeKey = this._getChallengeRangeKey();

    const progress = this.currentUser.challengeProgress || {};
    if (progress.rangeKey !== rangeKey) {
      progress.chapter = challengeVerses[0].chapter;
      progress.rangeKey = rangeKey;
      progress.completedCount = 0;
      progress.claimed = false;
      
      // Save initialization to Firestore
      db.collection('users').doc(this.currentUser.id).update({
        challengeProgress: progress
      });
    }

    if (progress.claimed) {
      alert("이미 이번 스페셜 챌린지를 완수하셨습니다!");
      return;
    }

    // Combine all verses into one single challenge
    const combinedText = challengeVerses.map(v => v.text).join(' ');
    const firstVerse = challengeVerses[0];
    const lastVerse = challengeVerses[challengeVerses.length - 1];
    
    let displayChapter = firstVerse.chapter;
    let displayVerse = firstVerse.verse === lastVerse.verse 
      ? firstVerse.verse 
      : `${firstVerse.verse}~${lastVerse.verse}`;

    if (firstVerse.chapter !== lastVerse.chapter) {
      displayVerse = `${firstVerse.chapter}장 ${firstVerse.verse}절 ~ ${lastVerse.chapter}장 ${lastVerse.verse}절`;
    }
    
    this.isTestMode = false;
    this.challengeActive = true;
    
    this.currentQuizVerse = {
        chapter: displayChapter,
        verse: displayVerse,
        text: combinedText
    };

    // 스페셜 챌린지는 항상 마스터 난이도 고정
    this.setDifficulty('master');

    this.switchView('game');
    this.initializeQuiz();
  }

  _getVerseRange(startChapter, startVerse, endChapter, endVerse) {
    const sChapter = Number(startChapter) || 1;
    const sVerse = Number(startVerse) || 1;
    const eChapter = Number(endChapter) || 22;
    const eVerse = Number(endVerse) || 21;
    return (window.BIBLE_DATA || []).filter(v => {
      const afterStart = v.chapter > sChapter || (v.chapter === sChapter && v.verse >= sVerse);
      const beforeEnd = v.chapter < eChapter || (v.chapter === eChapter && v.verse <= eVerse);
      return afterStart && beforeEnd;
    });
  }

  _getChallengeVersesFromSettings() {
    if (!this.globalSettings) return [];
    if (this.globalSettings.challengeStartChapter && this.globalSettings.challengeEndChapter) {
      return this._getVerseRange(
        this.globalSettings.challengeStartChapter,
        this.globalSettings.challengeStartVerse || 1,
        this.globalSettings.challengeEndChapter,
        this.globalSettings.challengeEndVerse || 999
      );
    }
    const chapter = this.globalSettings.activeChallengeChapter;
    return (window.BIBLE_DATA || []).filter(v => v.chapter === chapter);
  }

  _getChallengeRangeKey() {
    const verses = this._getChallengeVersesFromSettings();
    if (verses.length === 0) return 'none';
    const first = verses[0];
    const last = verses[verses.length - 1];
    return `${first.chapter}:${first.verse}-${last.chapter}:${last.verse}`;
  }

  // 5.3.1 Attendance Calendar Widget logic
  changeCalendarMonth(offset) {
    let newMonth = this.currentCalendarMonth + offset;
    let newYear = this.currentCalendarYear;
    if (newMonth < 0) {
      newMonth = 11;
      newYear -= 1;
    } else if (newMonth > 11) {
      newMonth = 0;
      newYear += 1;
    }
    this.currentCalendarYear = newYear;
    this.currentCalendarMonth = newMonth;
    this.renderAttendanceWidget();
  }

  renderAttendanceWidget() {
    if (!this.currentUser) return;

    // 1. Update Title (e.g., "2026년 5월")
    const titleEl = document.getElementById('calendarTitle');
    if (titleEl) {
      titleEl.textContent = `${this.currentCalendarYear}년 ${this.currentCalendarMonth + 1}월`;
    }

    const grid = document.getElementById('calendarGrid');
    if (!grid) return;
    grid.innerHTML = '';

    // 2. Resolve Check-in History (with backfill/database healing for existing users)
    let history = [...(this.currentUser.checkInHistory || [])];
    
    // Backfill history from streak if lastCheckInDate is present
    if (this.currentUser.lastCheckInDate && this.currentUser.consecutiveCheckIns > 0) {
      const lastDate = new Date(this.currentUser.lastCheckInDate);
      const tempHistorySet = new Set(history);
      let needsDatabaseHealing = false;
      
      for (let i = 0; i < this.currentUser.consecutiveCheckIns; i++) {
        const d = new Date(lastDate);
        d.setDate(d.getDate() - i);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const dateStr = `${yyyy}-${mm}-${dd}`;
        
        if (!tempHistorySet.has(dateStr)) {
          history.push(dateStr);
          tempHistorySet.add(dateStr);
          needsDatabaseHealing = true;
        }
      }
      
      if (needsDatabaseHealing && this.currentUser.id && !this.currentUser.isTrial) {
        history.sort();
        // Update local object to reflect healed data immediately
        this.currentUser.checkInHistory = history;
        db.collection('users').doc(this.currentUser.id).update({
          checkInHistory: history
        }).catch(err => console.error("Database healing failed:", err));
      }
    }
    const checkInSet = new Set(history);

    // 3. Generate Calendar days
    const firstDay = new Date(this.currentCalendarYear, this.currentCalendarMonth, 1);
    const startDayOfWeek = firstDay.getDay();
    const totalDays = new Date(this.currentCalendarYear, this.currentCalendarMonth + 1, 0).getDate();
    const prevMonthTotalDays = new Date(this.currentCalendarYear, this.currentCalendarMonth, 0).getDate();
    const totalCells = (startDayOfWeek + totalDays > 35) ? 42 : 35;

    const todayStr = this.getRelativeDateStr(0);

    for (let i = 0; i < totalCells; i++) {
      const dayBox = document.createElement('div');
      dayBox.className = 'calendar-day';

      let cellYear = this.currentCalendarYear;
      let cellMonth = this.currentCalendarMonth;
      let cellDay = 0;
      let isOtherMonth = false;

      if (i < startDayOfWeek) {
        isOtherMonth = true;
        cellDay = prevMonthTotalDays - (startDayOfWeek - 1 - i);
        cellMonth = this.currentCalendarMonth - 1;
        if (cellMonth < 0) {
          cellMonth = 11;
          cellYear -= 1;
        }
      } else if (i >= startDayOfWeek + totalDays) {
        isOtherMonth = true;
        cellDay = i - (startDayOfWeek + totalDays) + 1;
        cellMonth = this.currentCalendarMonth + 1;
        if (cellMonth > 11) {
          cellMonth = 0;
          cellYear += 1;
        }
      } else {
        cellDay = i - startDayOfWeek + 1;
      }

      const yyyy = cellYear;
      const mm = String(cellMonth + 1).padStart(2, '0');
      const dd = String(cellDay).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;

      dayBox.textContent = cellDay;

      if (isOtherMonth) {
        dayBox.classList.add('other-month');
      } else {
        if (dateStr === todayStr) {
          dayBox.classList.add('today');
        }
        if (checkInSet.has(dateStr)) {
          dayBox.classList.add('checked');
        }
      }

      grid.appendChild(dayBox);
    }

    // 4. Streak Progress Bar
    const consecutive = this.currentUser.consecutiveCheckIns || 0;
    const streakTextEl = document.getElementById('streakText');
    if (streakTextEl) {
      streakTextEl.textContent = `현재 ${consecutive}일 연속 출석 중! 🔥`;
    }

    const cumulativeTextEl = document.getElementById('cumulativeText');
    if (cumulativeTextEl) {
      cumulativeTextEl.textContent = `총 누적 출석: ${history.length}일 📅`;
    }

    const streakProgressBar = document.getElementById('streakProgressBar');
    if (streakProgressBar) {
      const percentage = Math.min((consecutive / 30) * 100, 100);
      streakProgressBar.style.width = `${percentage}%`;
    }

    // Toggle active class on milestones
    const milestones = [5, 10, 15, 30];
    milestones.forEach(day => {
      const milestoneEl = document.getElementById(`milestone-${day}`);
      if (milestoneEl) {
        if (consecutive >= day) {
          milestoneEl.classList.add('active');
        } else {
          milestoneEl.classList.remove('active');
        }
      }
    });

    // 5. Button State Update
    const lastCheckDate = this.currentUser.lastCheckInDate;
    const btnAttendance = document.getElementById('btnAttendance');
    if (btnAttendance) {
      if (lastCheckDate === todayStr) {
        btnAttendance.disabled = true;
        btnAttendance.innerHTML = `<span class="material-icons-round">verified</span> 오늘의 출석 완료! (내일 만나요)`;
        btnAttendance.style.background = 'rgba(16, 185, 129, 0.08)';
        btnAttendance.style.borderColor = 'rgba(16, 185, 129, 0.2)';
        btnAttendance.style.color = 'var(--accent-emerald)';
      } else {
        btnAttendance.disabled = false;
        btnAttendance.innerHTML = `<span class="material-icons-round">done_all</span> 오늘의 출석체크 하기 (+10P)`;
        btnAttendance.style.background = 'var(--glass-bg)';
        btnAttendance.style.borderColor = 'var(--glass-border)';
        btnAttendance.style.color = 'var(--text-primary)';
      }
    }

    // 6. Update cumulative list
    this.renderAttendanceHistoryList();
  }

  toggleAttendanceHistory(forceState) {
    const section = document.getElementById('attendanceHistorySection');
    if (!section) return;

    if (forceState !== undefined) {
      section.style.display = forceState ? 'block' : 'none';
      return;
    }

    if (section.style.display === 'none') {
      section.style.display = 'block';
    } else {
      section.style.display = 'none';
    }
  }

  renderAttendanceHistoryList() {
    const listEl = document.getElementById('attendanceHistoryList');
    if (!listEl || !this.currentUser) return;

    listEl.innerHTML = '';

    // Sort chronological first to determine the cumulative order/index
    let history = [...(this.currentUser.checkInHistory || [])];
    history.sort();

    // Map to objects with chronological count
    const historyWithCount = history.map((dateStr, index) => {
      return {
        dateStr: dateStr,
        count: index + 1
      };
    });

    // Reverse to show newest first
    historyWithCount.reverse();

    if (historyWithCount.length === 0) {
      listEl.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); font-size: 0.8rem; padding: 1rem 0;">출석 기록이 없습니다.</div>`;
      return;
    }

    historyWithCount.forEach(item => {
      const formatted = this.formatDateKorean(item.dateStr);
      const itemEl = document.createElement('div');
      itemEl.className = 'attendance-history-item';
      itemEl.innerHTML = `<span class="material-icons-round icon">verified</span><span style="font-weight: 700; color: var(--accent-purple); margin-right: 4px;">${item.count}회차:</span>${formatted}`;
      listEl.appendChild(itemEl);
    });
  }

  formatDateKorean(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;

    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const date = parseInt(parts[2], 10);

    const d = new Date(year, month - 1, date);
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    const dayName = dayNames[d.getDay()];

    return `${year}년 ${month}월 ${date}일 (${dayName})`;
  }

  // 5.4.1 Leaderboard Logic
  renderLeaderboardWidget() {
    const list = document.getElementById('leaderboardList');
    if (!list) return;
    list.innerHTML = '';

    let tab = this.currentRankingTab || 'all';
    const canViewMissionExam = this.canViewMissionExamRanking();
    if (tab === 'mission_exam' && !canViewMissionExam) {
      tab = 'all';
      this.currentRankingTab = 'all';
    }
    const tabWrap = document.querySelector('#rankingView .ranking-tabs');
    const missionTab = document.getElementById('rankingTabMissionExam');
    if (tabWrap) tabWrap.classList.toggle('has-mission-tab', canViewMissionExam);
    if (missionTab) missionTab.style.display = canViewMissionExam ? '' : 'none';
    document.getElementById('rankingTabAll')?.classList.toggle('active', tab === 'all');
    document.getElementById('rankingTabWeekly')?.classList.toggle('active', tab === 'weekly');
    document.getElementById('rankingTabMissionExam')?.classList.toggle('active', tab === 'mission_exam');
    const labelEl = document.getElementById('userRankingLabel');
    if (labelEl) {
      const label = tab === 'mission_exam' ? '사명자 시험 나의 랭킹' : (tab === 'weekly' ? '이번 주 나의 랭킹' : '실시간 나의 랭킹');
      labelEl.innerHTML = `${label} <span class="material-icons-round">info</span>`;
    }
    const detailsLink = document.querySelector('#rankingView .rank-details-link span');
    if (detailsLink && tab !== 'mission_exam') {
      detailsLink.textContent = '전체 랭킹 확인하기';
    }

    if (tab === 'mission_exam') {
      this.renderMissionExamRankingWidget(list);
      return;
    }

    const sortedUsers = this.getRankedUsers(tab);
    if (sortedUsers.length === 0) {
      list.innerHTML = '<div class="home-empty-state">아직 랭킹 데이터가 없습니다.</div>';
      return;
    }
    const hasScoreData = sortedUsers.some(user => this.getRankingScore(user, tab) > 0);
    if (tab === 'weekly' && !hasScoreData) {
      const rankTextEl = document.getElementById('userRankingText');
      const rankPctEl = document.getElementById('userRankingPct');
      if (rankTextEl) rankTextEl.textContent = '-위';
      if (rankPctEl) rankPctEl.textContent = '이번 주 랭킹 데이터가 아직 없습니다.';
      list.innerHTML = `
        <div class="ranking-weekly-empty">
          <span class="material-icons-round">event_repeat</span>
          <strong>이번 주 랭킹 집계 전입니다.</strong>
          <p>주간 포인트가 쌓이면 이곳에 이번 주 Top 10이 표시됩니다.</p>
          <small>주간 랭킹은 주간 점수 필드 기준으로만 계산됩니다.</small>
        </div>
      `;
      return;
    }

    if (this.currentUser) {
      const myUser = sortedUsers.find(u => u.id === this.currentUser.id);
      const myRank = myUser ? myUser.rank : 1;
      const totalCount = sortedUsers.length;
      const rankPercentage = totalCount > 0 ? Math.round((myRank / totalCount) * 100) : 0;

      // Rank monitoring congratulatory notification
      if (this.currentUserPreviousRank !== undefined && this.currentUserPreviousRank !== null) {
        if (myRank < this.currentUserPreviousRank) {
          const oldRank = this.currentUserPreviousRank;
          this.currentUserPreviousRank = myRank;
          this.addNotification(`👑 축하합니다! 실시간 랭킹이 ${oldRank - myRank}등 상승하여 현재 ${myRank}위입니다!`);
        }
      }
      this.currentUserPreviousRank = myRank;

      // Update rank summary badge
      const rankTextEl = document.getElementById('userRankingText');
      if (rankTextEl) {
        if (this.currentUser.isTrial) {
          rankTextEl.textContent = `체험 모드 (랭킹 미등록)`;
        } else {
          rankTextEl.textContent = `${myRank}위`;
        }
      }
      const rankPctEl = document.getElementById('userRankingPct');
      if (rankPctEl) {
        if (this.currentUser.isTrial) {
          rankPctEl.textContent = `회원가입 후 랭킹에 도전해보세요!`;
        } else {
          rankPctEl.textContent = `전체 ${totalCount}명 중 상위 ${rankPercentage}%`;
        }
      }
    }

    const topThree = sortedUsers.slice(0, 3);
    const podiumOrder = [topThree[1], topThree[0], topThree[2]].filter(Boolean);
    const topThreeHtml = podiumOrder.map(user => {
      const rank = user.rank;
      const isMe = this.currentUser && user.id === this.currentUser.id;
      const score = this.getRankingScore(user, tab);
      return `
        <div class="ranking-podium-card rank-${rank} ${isMe ? 'me' : ''}">
          <span class="ranking-podium-medal" ${rank === 1 ? 'style="background:none; box-shadow:none; font-size:1.35rem; top:-0.8rem; right:0.4rem;"' : ''}>${rank === 1 ? '👑' : rank}</span>
          <div class="ranking-podium-avatar">${this.escapeHtml(this.getUserInitial(user))}</div>
          <strong>${this.escapeHtml(this.getUserDisplayName(user))}</strong>
          <b>${score.toLocaleString()}P</b>
        </div>
      `;
    }).join('');

    const topIds = new Set(topThree.map(user => user.id));
    const lowerUsers = sortedUsers
      .filter(user => !topIds.has(user.id))
      .slice(0, 7);

    const lowerRowsHtml = lowerUsers.map(user => this.renderRankingRow(user, tab)).join('');
    const myUser = this.currentUser ? sortedUsers.find(user => user.id === this.currentUser.id) : null;
    const shouldShowMyFixedRow = myUser && !sortedUsers.slice(0, 10).some(user => user.id === myUser.id);

    list.innerHTML = `
      ${tab === 'weekly' ? `
        <div class="ranking-weekly-note">
          <span class="material-icons-round">verified</span>
          <span>이번 주 활동 포인트 기준 랭킹입니다.</span>
        </div>
      ` : ''}
      <div class="ranking-podium">
        ${topThreeHtml}
      </div>
      <div class="ranking-list-card">
        ${lowerRowsHtml || '<div class="home-empty-state">추가 랭킹이 없습니다.</div>'}
      </div>
      ${shouldShowMyFixedRow ? `
        <div class="ranking-my-fixed">
          ${this.renderRankingRow(myUser, tab, true)}
        </div>
      ` : ''}
    `;

    if (myUser && sortedUsers.slice(0, 10).some(user => user.id === myUser.id)) {
      const row = list.querySelector(`.ranking-row[data-user-id="${myUser.id}"]`);
      if (row) row.classList.add('me');
    }

    // Re-render popup if it is open
    const modal = document.getElementById('modalAllRankings');
    if (modal && modal.classList.contains('active')) {
      const searchInput = document.getElementById('rankingSearchInput');
      const filterText = searchInput ? searchInput.value : '';
      this.renderAllRankingsPopupList(filterText);
    }
  }

  renderMissionExamRankingWidget(list) {
    const sortedRows = this.getMissionExamRankedRows();
    const rankTextEl = document.getElementById('userRankingText');
    const rankPctEl = document.getElementById('userRankingPct');
    const detailsLink = document.querySelector('#rankingView .rank-details-link span');
    if (detailsLink) detailsLink.textContent = '사명자 시험 랭킹 확인하기';

    const myRow = this.currentUser
      ? sortedRows.find(row => row.userId === this.currentUser.id || row.lastUserId === this.currentUser.id)
      : null;

    if (sortedRows.length === 0) {
      if (rankTextEl) rankTextEl.textContent = '-위';
      if (rankPctEl) rankPctEl.textContent = '사명자 시험 응시 데이터가 아직 없습니다.';
      list.innerHTML = `
        <div class="ranking-weekly-empty ranking-mission-empty">
          <span class="material-icons-round">assignment_turned_in</span>
          <strong>사명자 시험 랭킹 집계 전입니다.</strong>
          <p>응시 결과가 저장되면 이곳에 사명자 시험 Top 10이 표시됩니다.</p>
        </div>
      `;
      return;
    }

    if (myRow) {
      const totalCount = sortedRows.length;
      const rankPercentage = totalCount > 0 ? Math.round((myRow.rank / totalCount) * 100) : 0;
      if (rankTextEl) rankTextEl.textContent = `${myRow.rank}위`;
      if (rankPctEl) rankPctEl.textContent = `전체 ${totalCount}명 중 상위 ${rankPercentage}%`;
    } else {
      if (rankTextEl) rankTextEl.textContent = '-위';
      if (rankPctEl) rankPctEl.textContent = '사명자 시험 응시 내역이 없습니다.';
    }

    const eventItem = this.getMissionExamEventForRanking();
    const eventRange = this.formatEventDateRange(eventItem);
    const eventBannerHtml = eventItem ? `
      <div class="ranking-mission-banner">
        <span class="material-icons-round">verified</span>
        <div>
          <strong>${this.escapeHtml(eventItem.title || '사명자 시험')}</strong>
          <p>${eventRange ? this.escapeHtml(eventRange) : '진행 중인 사명자 시험'}</p>
        </div>
      </div>
    ` : '';

    const topThree = sortedRows.slice(0, 3);
    const podiumOrder = [topThree[1], topThree[0], topThree[2]].filter(Boolean);
    const topThreeHtml = podiumOrder.map(row => {
      const isMe = this.currentUser && (row.userId === this.currentUser.id || row.lastUserId === this.currentUser.id);
      return `
        <div class="ranking-podium-card rank-${row.rank} ${isMe ? 'me' : ''}">
          <span class="ranking-podium-medal" ${row.rank === 1 ? 'style="background:none; box-shadow:none; font-size:1.35rem; top:-0.8rem; right:0.4rem;"' : ''}>${row.rank === 1 ? '👑' : row.rank}</span>
          <div class="ranking-podium-avatar">${this.escapeHtml((row.applicantName || '응').charAt(0))}</div>
          <strong>${this.escapeHtml(row.applicantName || '응시자')}</strong>
          <b>${Number(row.score || 0).toLocaleString()}점</b>
        </div>
      `;
    }).join('');

    const topIds = new Set(topThree.map(row => row.id || row.regionNameKey));
    const lowerRows = sortedRows
      .filter(row => !topIds.has(row.id || row.regionNameKey))
      .slice(0, 7);
    const lowerRowsHtml = lowerRows.map(row => this.renderMissionExamRankingRow(row)).join('');
    const shouldShowMyFixedRow = myRow && !sortedRows.slice(0, 10).some(row => row === myRow);

    list.innerHTML = `
      ${eventBannerHtml}
      <div class="ranking-podium">
        ${topThreeHtml}
      </div>
      <div class="ranking-list-card">
        ${lowerRowsHtml || '<div class="home-empty-state">추가 랭킹이 없습니다.</div>'}
      </div>
      ${shouldShowMyFixedRow ? `
        <div class="ranking-my-fixed">
          ${this.renderMissionExamRankingRow(myRow, true)}
        </div>
      ` : ''}
    `;

    const modal = document.getElementById('modalAllRankings');
    if (modal && modal.classList.contains('active')) {
      const searchInput = document.getElementById('rankingSearchInput');
      const filterText = searchInput ? searchInput.value : '';
      this.renderAllRankingsPopupList(filterText);
    }
  }

  renderMissionExamRankingRow(row, fixed = false) {
    const isMe = this.currentUser && (row.userId === this.currentUser.id || row.lastUserId === this.currentUser.id);
    const rowId = row.id || row.regionNameKey || `${row.region || ''}_${row.applicantName || ''}`;
    return `
      <div class="ranking-row ${isMe ? 'me' : ''} ${fixed ? 'fixed' : ''}" data-exam-row-id="${this.escapeHtml(rowId)}">
        <span class="ranking-row-rank" ${row.rank === 1 ? 'style="font-size: 1.15rem;"' : ''}>${row.rank === 1 ? '👑' : row.rank}</span>
        <span class="ranking-row-avatar">${this.escapeHtml((row.applicantName || '응').charAt(0))}</span>
        <strong>
          ${isMe ? '나의 계정' : this.escapeHtml(row.applicantName || '응시자')}
          ${row.region ? `<small>${this.escapeHtml(row.region)}</small>` : ''}
        </strong>
        <b>${Number(row.score || 0).toLocaleString()}점</b>
      </div>
    `;
  }

  renderRankingRow(user, tab = this.currentRankingTab || 'all', fixed = false) {
    const rank = user.rank;
    const isMe = this.currentUser && user.id === this.currentUser.id;
    const score = this.getRankingScore(user, tab);
    return `
      <div class="ranking-row ${isMe ? 'me' : ''} ${fixed ? 'fixed' : ''}" data-user-id="${this.escapeHtml(user.id || '')}">
        <span class="ranking-row-rank" ${rank === 1 ? 'style="font-size: 1.15rem;"' : ''}>${rank === 1 ? '👑' : rank}</span>
        <span class="ranking-row-avatar">${this.escapeHtml(this.getUserInitial(user))}</span>
        <strong>${isMe ? '나의 계정' : this.escapeHtml(this.getUserDisplayName(user))}</strong>
        <b>${score.toLocaleString()}P</b>
      </div>
    `;
  }

  setRankingTab(tabName) {
    if (tabName === 'mission_exam') {
      this.currentRankingTab = this.canViewMissionExamRanking() ? 'mission_exam' : 'all';
    } else {
      this.currentRankingTab = tabName === 'weekly' ? 'weekly' : 'all';
    }
    this.renderLeaderboardWidget();
  }

  openRankingGuide() {
    const missionItem = document.getElementById('rankingGuideMissionItem');
    if (missionItem) {
      missionItem.style.display = this.canViewMissionExamRanking() ? '' : 'none';
    }
    this.openModal('modalRankingGuide');
  }

  // 5.4.2 Overall Rankings Popup (v1.2.0)
  openAllRankings() {
    this.openModal('modalAllRankings');
    const searchInput = document.getElementById('rankingSearchInput');
    if (searchInput) {
      searchInput.value = '';
    }
    this.renderAllRankingsPopupList();
  }

  renderAllRankingsPopupList(filterText = '') {
    const list = document.getElementById('allRankingsList');
    if (!list) return;
    list.innerHTML = '';
    const modalTitle = document.querySelector('#modalAllRankings .modal-title');

    if (this.currentRankingTab === 'mission_exam' && this.canViewMissionExamRanking()) {
      if (modalTitle) {
        modalTitle.innerHTML = '<span class="material-icons-round" style="color: #f59e0b;">assignment_turned_in</span>사명자 시험 랭킹';
      }
      this.renderMissionExamRankingsPopupList(list, filterText);
      return;
    }

    if (modalTitle) {
      modalTitle.innerHTML = '<span class="material-icons-round" style="color: #f59e0b;">military_tech</span>전체 랭킹';
    }

    // Sort all users by points descending
    const sortedUsers = [...this.users].sort((a, b) => this.getRankingXp(b) - this.getRankingXp(a));
    
    // Compute joint ranks
    let currentRank = 1;
    for (let i = 0; i < sortedUsers.length; i++) {
      if (i > 0 && this.getRankingXp(sortedUsers[i]) < this.getRankingXp(sortedUsers[i - 1])) {
        currentRank = i + 1;
      }
      sortedUsers[i].rank = currentRank;
    }

    // Filter users by search term
    const cleanFilter = filterText.trim().toLowerCase();
    const filteredUsers = sortedUsers.filter(user => 
      this.getUserDisplayName(user).toLowerCase().includes(cleanFilter)
    );

    // Update current user's summary inside popup if found
    if (this.currentUser) {
      const myUser = sortedUsers.find(u => u.id === this.currentUser.id);
      if (myUser) {
        const myRank = myUser.rank;
        const totalCount = sortedUsers.length;
        const rankPercentage = totalCount > 0 ? Math.round((myRank / totalCount) * 100) : 0;
        
        const popupMyRankText = document.getElementById('popupMyRankText');
        const popupMyPointsText = document.getElementById('popupMyPointsText');
        const popupMyPctText = document.getElementById('popupMyPctText');

        if (popupMyRankText) popupMyRankText.textContent = `${myRank} 위`;
        if (popupMyPointsText) popupMyPointsText.textContent = `${this.getRankingXp(myUser).toLocaleString()}`;
        if (popupMyPctText) popupMyPctText.textContent = `전체 중 상위 ${rankPercentage}%`;
      }
    }

    if (filteredUsers.length === 0) {
      const emptyItem = document.createElement('div');
      emptyItem.style.padding = '2rem';
      emptyItem.style.textAlign = 'center';
      emptyItem.style.color = 'var(--text-muted)';
      emptyItem.style.fontSize = '0.9rem';
      emptyItem.textContent = '검색 결과가 없습니다.';
      list.appendChild(emptyItem);
      return;
    }

    // Render list items
    filteredUsers.forEach(user => {
      const rank = user.rank;
      const isMe = this.currentUser && user.id === this.currentUser.id;
      
      const item = document.createElement('div');
      item.className = `all-ranking-item ${isMe ? 'me' : ''}`;
      
      let rankBadgeClass = 'rank-badge';
      if (rank === 1) rankBadgeClass += ' rank-1';
      else if (rank === 2) rankBadgeClass += ' rank-2';
      else if (rank === 3) rankBadgeClass += ' rank-3';

      const rankBadgeStyle = rank === 1 ? 'style="font-size: 1rem; background: linear-gradient(135deg, #ffd700, #ffa500); border: none; box-shadow: 0 0 6px rgba(255, 215, 0, 0.5);"' : '';

      item.innerHTML = `
        <div class="${rankBadgeClass}" ${rankBadgeStyle}>${rank === 1 ? '👑' : rank}</div>
        <div class="all-ranking-avatar">${this.escapeHtml(this.getUserInitial(user))}</div>
        <div class="all-ranking-name">${this.escapeHtml(this.getUserDisplayName(user))} ${isMe ? '<span style="color:var(--text-muted); font-size:0.75rem; font-weight:normal;">(나)</span>' : ''}</div>
        <div class="all-ranking-points">${this.getRankingXp(user).toLocaleString()}</div>
        ${!isMe && !this.hideBattleMode ? `
        <button class="btn-mini" onclick="app.requestOneOnOneBattle('${user.id}', '${user.name}')" style="margin-left: 0.75rem;" title="1대1 대결 신청">
          ⚔️
        </button>
        ` : ''}
      `;
      
      list.appendChild(item);
    });

    // Scroll current user into view inside popup list on open
    if (!filterText) {
      setTimeout(() => {
        const activeItem = list.querySelector('.all-ranking-item.me');
        if (activeItem) {
          activeItem.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      }, 100);
    }
  }

  renderMissionExamRankingsPopupList(list, filterText = '') {
    const sortedRows = this.getMissionExamRankedRows();
    const cleanFilter = filterText.trim().toLowerCase();
    const filteredRows = sortedRows.filter(row => {
      const haystack = `${row.applicantName || ''} ${row.region || ''}`.toLowerCase();
      return haystack.includes(cleanFilter);
    });
    const myRow = this.currentUser
      ? sortedRows.find(row => row.userId === this.currentUser.id || row.lastUserId === this.currentUser.id)
      : null;

    const popupMyRankText = document.getElementById('popupMyRankText');
    const popupMyPointsText = document.getElementById('popupMyPointsText');
    const popupMyPctText = document.getElementById('popupMyPctText');
    if (myRow) {
      const rankPercentage = sortedRows.length > 0 ? Math.round((myRow.rank / sortedRows.length) * 100) : 0;
      if (popupMyRankText) popupMyRankText.textContent = `${myRow.rank} 위`;
      if (popupMyPointsText) popupMyPointsText.textContent = `${Number(myRow.score || 0).toLocaleString()} 점`;
      if (popupMyPctText) popupMyPctText.textContent = `전체 중 상위 ${rankPercentage}%`;
    } else {
      if (popupMyRankText) popupMyRankText.textContent = '- 위';
      if (popupMyPointsText) popupMyPointsText.textContent = '- 점';
      if (popupMyPctText) popupMyPctText.textContent = '응시 내역 없음';
    }

    if (filteredRows.length === 0) {
      const emptyItem = document.createElement('div');
      emptyItem.style.padding = '2rem';
      emptyItem.style.textAlign = 'center';
      emptyItem.style.color = 'var(--text-muted)';
      emptyItem.style.fontSize = '0.9rem';
      emptyItem.textContent = '검색 결과가 없습니다.';
      list.appendChild(emptyItem);
      return;
    }

    filteredRows.forEach(row => {
      const isMe = this.currentUser && (row.userId === this.currentUser.id || row.lastUserId === this.currentUser.id);
      const item = document.createElement('div');
      item.className = `all-ranking-item ${isMe ? 'me' : ''}`;
      let rankBadgeClass = 'rank-badge';
      if (row.rank === 1) rankBadgeClass += ' rank-1';
      else if (row.rank === 2) rankBadgeClass += ' rank-2';
      else if (row.rank === 3) rankBadgeClass += ' rank-3';

      const rankBadgeStyle = row.rank === 1 ? 'style="font-size: 1rem; background: linear-gradient(135deg, #ffd700, #ffa500); border: none; box-shadow: 0 0 6px rgba(255, 215, 0, 0.5);"' : '';

      item.innerHTML = `
        <div class="${rankBadgeClass}" ${rankBadgeStyle}>${row.rank === 1 ? '👑' : row.rank}</div>
        <div class="all-ranking-avatar">${this.escapeHtml((row.applicantName || '응').charAt(0))}</div>
        <div class="all-ranking-name">
          ${this.escapeHtml(row.applicantName || '응시자')} ${isMe ? '<span style="color:var(--text-muted); font-size:0.75rem; font-weight:normal;">(나)</span>' : ''}
          ${row.region ? `<span style="display:block; color:var(--text-muted); font-size:0.72rem; font-weight:600;">${this.escapeHtml(row.region)}</span>` : ''}
        </div>
        <div class="all-ranking-points">${Number(row.score || 0).toLocaleString()}점</div>
      `;
      list.appendChild(item);
    });
  }

  filterAllRankings() {
    const searchInput = document.getElementById('rankingSearchInput');
    const filterText = searchInput ? searchInput.value : '';
    this.renderAllRankingsPopupList(filterText);
  }

  // 6. Points system
  addPoints(userId, amount) {
    const newNotification = this.createNotification({
      title: '포인트 지급',
      type: 'points',
      message: `🎁 관리자 보너스 +${amount}P`
    });
    const adminHistory = {
      id: 'hist_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      type: 'admin',
      title: '관리자 보너스 포인트',
      amount: amount,
      date: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
    };
    db.collection('users').doc(userId).update({
      points: firebase.firestore.FieldValue.increment(amount),
      faithXP: firebase.firestore.FieldValue.increment(amount),
      notifications: firebase.firestore.FieldValue.arrayUnion(newNotification),
      pointsHistory: firebase.firestore.FieldValue.arrayUnion(adminHistory)
    }).then(() => {
      db.collection('notifications').add({
        userId,
        title: newNotification.title,
        message: newNotification.message,
        type: newNotification.type,
        isRead: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }).catch(err => console.error("Error adding notification document:", err));
    }).catch(err => console.error("Error adding points:", err));
  }

  addNotification(message) {
    if (!this.currentUser) return;
    const newNotification = this.createNotification({
      title: '알림',
      type: 'notice',
      message
    });
    if (this.currentUser.isTrial) {
      if (!this.currentUser.notifications) this.currentUser.notifications = [];
      this.currentUser.notifications.push(newNotification);
      this.renderNotifications();
      return;
    }
    db.collection('users').doc(this.currentUser.id).update({
      notifications: firebase.firestore.FieldValue.arrayUnion(newNotification)
    }).then(() => {
      db.collection('notifications').add({
        userId: this.currentUser.id,
        title: newNotification.title,
        message: newNotification.message,
        type: newNotification.type,
        isRead: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }).catch(err => console.error("Error adding notification document:", err));
    }).catch(err => console.error("Error adding notification:", err));
  }

  hasActiveExamEvent() {
    if (!this.currentUser || this.currentUser.isTrial || !Array.isArray(this.activeEvents)) return false;
    return this.activeEvents.some(evt => evt.eventType === 'mission_exam' && this._eventTargetsCurrentUser(evt));
  }

  hasActiveSpecialChallengeEvent() {
    if (!this.currentUser || this.currentUser.isTrial || !Array.isArray(this.activeEvents)) return false;
    return this.activeEvents.some(evt => evt.eventType === 'special_challenge' && this._eventTargetsCurrentUser(evt));
  }

  updateExamEntryVisibility() {
    const visible = this.hasActiveExamEvent();
    const card = document.getElementById('examShortcutCard');
    if (card) card.style.display = 'none';
    const navTab = document.getElementById('navTabExam');
    if (navTab) navTab.style.display = visible ? '' : 'none';
  }

  _eventTargetsCurrentUser(eventItem) {
    if (!eventItem || !this.currentUser || this.currentUser.isTrial) return false;
    const targetUsers = Array.isArray(eventItem.targetUsers) ? eventItem.targetUsers : [];
    if (targetUsers.length > 0) {
      return targetUsers.includes(this.currentUser.id) ||
        targetUsers.includes(this.currentUser.username) ||
        targetUsers.includes(this.currentUser.email);
    }
    const targetGroups = Array.isArray(eventItem.targetGroups)
      ? eventItem.targetGroups
      : (Array.isArray(eventItem.targetRoles) ? eventItem.targetRoles : []);
    if (targetGroups.length === 0) return true;
    return targetGroups.includes(this.currentUser.role || 'user');
  }

  maybeShowEventAnnouncement() {
    const isDebug = window.location.search.includes('debug_popup=true');
    if (isDebug) {
      console.log("[DEBUG POPUP] maybeShowEventAnnouncement called.");
      console.log("[DEBUG POPUP] currentUser:", this.currentUser);
      console.log("[DEBUG POPUP] activeEvents:", this.activeEvents);
      // Clear event-related keys to force popup to show
      this.shownEventAnnouncementIds = [];
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('simon_event_seen_') || key.startsWith('simon_event_hide_')) {
          console.log(`[DEBUG POPUP] Clearing key from localStorage: ${key}`);
          localStorage.removeItem(key);
        }
      });
    }

    if (!this.currentUser || this.currentUser.isTrial || !Array.isArray(this.activeEvents)) {
      if (isDebug) {
        if (!this.currentUser) console.log("[DEBUG POPUP] Returned early: currentUser is null");
        else if (this.currentUser.isTrial) console.log("[DEBUG POPUP] Returned early: currentUser is a trial user");
        else if (!Array.isArray(this.activeEvents)) console.log("[DEBUG POPUP] Returned early: activeEvents is not an array");
      }
      return;
    }

    const today = this.getRelativeDateStr(0);
    const eventItem = this.activeEvents.find(evt => {
      const targetsUser = this._eventTargetsCurrentUser(evt);
      const todayHideKey = `simon_event_hide_today_${evt.id}_${this.getRelativeDateStr(0)}`;
      const isHiddenToday = localStorage.getItem(todayHideKey) === '1';
      
      const isSeen = this.shownEventAnnouncementIds.includes(evt.id);

      if (isDebug) {
        console.log(`[DEBUG POPUP] Checking event "${evt.title || 'No Title'}" (id: ${evt.id}):`);
        console.log(`  - Targets user: ${targetsUser}`);
        console.log(`  - popup configured: ${evt.popup}`);
        console.log(`  - isHiddenToday (${todayHideKey}): ${isHiddenToday}`);
        console.log(`  - isSeen (in-memory): ${isSeen}`);
      }

      if (!targetsUser) return false;
      if (evt.popup !== true) return false;
      if (isHiddenToday) return false;
      return !isSeen;
    });

    if (isDebug) {
      console.log("[DEBUG POPUP] Selected eventItem to show:", eventItem);
    }

    if (!eventItem) return;

    this.currentEvent = eventItem;
    if (!this.shownEventAnnouncementIds.includes(eventItem.id)) {
      this.shownEventAnnouncementIds.push(eventItem.id);
    }

    const modalEl = document.getElementById('modalEventAnnouncement');
    if (isDebug) {
      console.log("[DEBUG POPUP] modalEventAnnouncement element in DOM:", modalEl);
      if (modalEl) {
        console.log("[DEBUG POPUP] Before openModal - display style:", modalEl.style.display);
        console.log("[DEBUG POPUP] Before openModal - classes:", modalEl.className);
        console.log("[DEBUG POPUP] Before openModal - computed display:", window.getComputedStyle(modalEl).display);
        console.log("[DEBUG POPUP] Before openModal - computed opacity:", window.getComputedStyle(modalEl).opacity);
      }
    }
    if (!modalEl) {
      console.warn("[DEBUG POPUP] WARNING: modalEventAnnouncement element was NOT found in the DOM. This usually means the browser is loading a cached old version of index.html. Please clear your browser cache or force-reload the page (Ctrl+F5 / Cmd+Shift+R).");
    }

    const kickerEl = document.getElementById('eventAnnounceKicker');
    const titleEl = document.getElementById('eventAnnounceTitle');
    const descEl = document.getElementById('eventAnnounceDesc');
    const summaryEl = document.getElementById('eventAnnounceSummary');
    const rewardLineEl = document.getElementById('eventAnnounceRewardLine');
    const startEl = document.getElementById('eventAnnounceStartDate');
    const endEl = document.getElementById('eventAnnounceEndDate');
    const targetEl = document.getElementById('eventAnnounceTarget');
    const artEl = document.getElementById('eventAnnounceArt');
    const imageEl = document.getElementById('eventAnnounceImage');
    const fallbackIconEl = document.getElementById('eventAnnounceFallbackIcon');

    const reward = Number(eventItem.rewardPoints || eventItem.examMaxPoints || eventItem.challengeBonusPoints || 0);
    const shortDesc = eventItem.description || `${eventItem.title || this.getEventTypeLabel(eventItem)}에 참여해 주세요.`;
    if (kickerEl) kickerEl.textContent = this.getEventTypeLabel(eventItem);
    if (titleEl) titleEl.textContent = eventItem.title || '이벤트 안내';
    if (descEl) descEl.textContent = shortDesc;
    if (summaryEl) summaryEl.textContent = shortDesc;
    if (rewardLineEl) rewardLineEl.textContent = reward > 0 ? `+${reward.toLocaleString()}P 지급!` : '참여 보상 확인';
    if (startEl) startEl.textContent = eventItem.startDate || '진행 중';
    if (endEl) endEl.textContent = eventItem.endDate || '진행 중';
    if (targetEl) targetEl.textContent = this.getEventTargetLabel(eventItem);
    if (fallbackIconEl) fallbackIconEl.textContent = this.getEventIcon(eventItem);
    if (artEl && imageEl) {
      const bannerUrl = this.getEventBannerUrl(eventItem);
      if (bannerUrl) {
        imageEl.src = bannerUrl;
        artEl.classList.add('has-image');
      } else {
        imageEl.removeAttribute('src');
        artEl.classList.remove('has-image');
      }
    }

    this.openModal('modalEventAnnouncement');
    if (isDebug && modalEl) {
      console.log("[DEBUG POPUP] After openModal - display style:", modalEl.style.display);
      console.log("[DEBUG POPUP] After openModal - classes:", modalEl.className);
      console.log("[DEBUG POPUP] After openModal - computed display:", window.getComputedStyle(modalEl).display);
      console.log("[DEBUG POPUP] After openModal - computed opacity:", window.getComputedStyle(modalEl).opacity);
    }
  }

  clickEventAnnounceJoin() {
    if (!this.currentEvent) return;
    this.closeModal('modalEventAnnouncement');
    this.openEventFromHome(this.currentEvent.id);
  }

  hideCurrentEventForToday() {
    if (!this.currentEvent) return;
    localStorage.setItem(`simon_event_hide_today_${this.currentEvent.id}_${this.getRelativeDateStr(0)}`, '1');
    this.closeModal('modalEventAnnouncement');
  }

  async submitEventJoinForm() {
    if (!this.currentUser || !this.currentEvent) return;
    const regionInput = document.getElementById('eventJoinRegion');
    const nameInput = document.getElementById('eventJoinName');
    const region = regionInput ? regionInput.value.trim() : '';
    const name = nameInput ? nameInput.value.trim() : '';
    if (!region || !name) {
      alert('지역과 이름을 모두 입력해 주세요.');
      return;
    }

    try {
      await db.collection('event_participants').doc(`${this.currentEvent.id}_${this.currentUser.id}`).set({
        eventId: this.currentEvent.id,
        eventTitle: this.currentEvent.title || '',
        userId: this.currentUser.id,
        username: this.currentUser.username || '',
        name,
        region,
        startedAt: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
        status: 'started'
      }, { merge: true });
    } catch (err) {
      console.error('Event participant save error:', err);
    }

    this.closeModal('modalEventJoin');
    this.startEventQuiz();
  }

  _getEventQuestionBank() {
    return [
      { question: '요한계시록을 기록한 사도는 누구입니까?', answer: '요한' },
      { question: '요한계시록은 성경의 몇 번째 책입니까?', answer: '66' },
      { question: '요한이 계시를 받은 장소는 어디입니까?', answer: '밧모섬' },
      { question: '새 예루살렘에 대한 묘사는 몇 장에 나옵니까?', answer: '21' },
      { question: '요한계시록에서 짐승의 수는 무엇입니까?', answer: '666' },
      { question: '요한계시록 마지막 장은 몇 장입니까?', answer: '22' },
      { question: '일곱 교회 편지는 몇 장부터 몇 장에 나옵니까?', answer: '2-3' }
    ];
  }

  startEventQuiz() {
    if (!this.currentEvent) return;
    this.isEventQuizMode = true;
    this.eventQuestions = [...this._getEventQuestionBank()].sort(() => Math.random() - 0.5).slice(0, 5);
    this.currentEventQuestionIndex = 0;
    this.eventCorrectCount = 0;
    this.eventAnswers = [];
    this.switchView('game');
    this._renderEventQuizQuestion();
  }

  _renderEventQuizQuestion() {
    const idx = this.currentEventQuestionIndex;
    if (idx >= this.eventQuestions.length) {
      this._finishEventQuiz();
      return;
    }
    const q = this.eventQuestions[idx];
    const titleEl = document.getElementById('gameVerseTitle');
    const timerEl = document.getElementById('gameTimer');
    const card = document.getElementById('verseTestCard');
    const submitBtn = document.getElementById('btnSubmitQuiz');
    const hintBtn = document.getElementById('btnHint');
    const pointsEl = document.getElementById('gameEarnedPoints');
    if (titleEl) titleEl.textContent = `${this.currentEvent.title || '이벤트'} 문제 ${idx + 1}/${this.eventQuestions.length}`;
    if (timerEl) timerEl.textContent = '-';
    if (pointsEl) pointsEl.textContent = String(this.currentEvent.rewardPoints || 0);
    if (submitBtn) {
      submitBtn.textContent = '이벤트 정답 제출';
      submitBtn.setAttribute('onclick', 'app.submitEventQuizAnswer()');
    }
    if (hintBtn) {
      hintBtn.textContent = '모름';
      hintBtn.setAttribute('onclick', 'app.skipEventQuizAnswer()');
    }
    if (card) {
      card.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:1rem;text-align:left;">
          <div style="font-size:1rem;font-weight:800;color:var(--accent-purple);">Q${idx + 1}. ${q.question}</div>
          <input type="text" id="eventQuizAnswerInput" class="blank-input" style="width:100%;padding:0.75rem 1rem;border-radius:10px;" placeholder="정답을 입력하세요" autocomplete="off">
        </div>
      `;
    }
    const input = document.getElementById('eventQuizAnswerInput');
    if (input) {
      input.focus();
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.submitEventQuizAnswer();
        }
      });
    }
  }

  submitEventQuizAnswer() {
    const input = document.getElementById('eventQuizAnswerInput');
    if (!input) return;
    const q = this.eventQuestions[this.currentEventQuestionIndex];
    const userAnswer = input.value.trim();
    const isCorrect = userAnswer.replace(/\s+/g, '').toLowerCase() === q.answer.replace(/\s+/g, '').toLowerCase();
    if (isCorrect) this.eventCorrectCount++;
    this.eventAnswers.push({ question: q.question, correct: q.answer, userAnswer, isCorrect });
    this.currentEventQuestionIndex++;
    this._renderEventQuizQuestion();
  }

  skipEventQuizAnswer() {
    const q = this.eventQuestions[this.currentEventQuestionIndex];
    this.eventAnswers.push({ question: q.question, correct: q.answer, userAnswer: '(미입력)', isCorrect: false });
    this.currentEventQuestionIndex++;
    this._renderEventQuizQuestion();
  }

  async _finishEventQuiz() {
    const reward = this.currentEvent?.rewardPoints || 0;
    const score = Math.round((this.eventCorrectCount / this.eventQuestions.length) * 100);
    try {
      const participantRef = db.collection('event_participants').doc(`${this.currentEvent.id}_${this.currentUser.id}`);
      await participantRef.set({
        score,
        correctCount: this.eventCorrectCount,
        totalCount: this.eventQuestions.length,
        answers: this.eventAnswers,
        completedAt: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
        status: 'completed'
      }, { merge: true });
      this.setEventParticipationStatus(this.currentEvent, 'completed');

      const history = {
        id: 'hist_event_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        type: 'event',
        title: `이벤트 참여 완료 (${this.currentEvent.title || '이벤트'})`,
        amount: reward,
        date: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
      };
      await db.collection('users').doc(this.currentUser.id).update({
        points: firebase.firestore.FieldValue.increment(reward),
      faithXP: firebase.firestore.FieldValue.increment(reward),
        pointsHistory: firebase.firestore.FieldValue.arrayUnion(history)
      });
      this.currentUser.points = (this.currentUser.points || 0) + reward;
      this.showPointsFloater(reward, `이벤트 +${reward}P`);
    } catch (err) {
      console.error('Event quiz finish error:', err);
    }

    this.isEventQuizMode = false;
    this.showToast(`이벤트 완료! 점수 ${score}점, +${reward}P`);
    this.switchView('dashboard');
  }

  toggleNotifications(event) {
    if (event) event.stopPropagation();
    
    // Close theme switcher if open
    const switcher = document.getElementById('themeSwitcher');
    if (switcher) switcher.classList.remove('expanded');

    const dropdown = document.getElementById('notificationDropdown');
    if (!dropdown) return;
    dropdown.classList.toggle('active');
  }

  toggleThemeSwitcher(event) {
    if (event) event.stopPropagation();

    // Close notification dropdown if open
    const dropdown = document.getElementById('notificationDropdown');
    if (dropdown) dropdown.classList.remove('active');

    const switcher = document.getElementById('themeSwitcher');
    if (!switcher) return;
    switcher.classList.toggle('expanded');
  }

  clearNotifications(event) {
    if (event) event.stopPropagation();
    if (!this.currentUser) return;
    
    const notifications = this.currentUser.notifications || [];
    const updatedNotifications = notifications.map(n => ({ ...n, read: true, isRead: true }));
    
    if (this.currentUser.isTrial) {
      this.currentUser.notifications = updatedNotifications;
      this.renderNotifications();
      return;
    }
    
    db.collection('users').doc(this.currentUser.id).update({
      notifications: updatedNotifications
    }).then(() => {
      this.renderNotifications();
    }).catch(err => console.error("Error clearing notifications:", err));
  }

  renderNotifications() {
    if (!this.currentUser) return;
    
    const notifications = this.currentUser.notifications || [];
    const sortedNotifs = [...notifications].sort((a, b) => b.timestamp - a.timestamp);
    
    const unreadCount = sortedNotifs.filter(n => !(n.isRead ?? n.read)).length;
    
    // Header bell badge
    const badge = document.getElementById('notificationBadge');
    if (badge) {
      if (unreadCount > 0) {
        badge.textContent = unreadCount;
        badge.style.display = 'inline-flex';
      } else {
        badge.style.display = 'none';
      }
    }

    // Bottom Navigation Badge
    const bottomBadge = document.getElementById('bottomNavNotificationBadge');
    if (bottomBadge) {
      if (unreadCount > 0) {
        bottomBadge.textContent = unreadCount;
        bottomBadge.style.display = 'inline-flex';
      } else {
        bottomBadge.style.display = 'none';
      }
    }
    
    // 1. Header Dropdown list
    const list = document.getElementById('notificationList');
    if (list) {
      if (sortedNotifs.length === 0) {
        list.innerHTML = '<div class="notification-empty">새로운 알림이 없습니다.</div>';
      } else {
        list.innerHTML = '';
        sortedNotifs.forEach(n => {
          const item = document.createElement('div');
          const isRead = Boolean(n.isRead ?? n.read);
          item.className = `notification-item ${isRead ? 'read' : 'unread'}`;
          
          const timeStr = this.formatRelativeTime(n.timestamp);
          
          if (n.type === 'battle_invite' && !isRead) {
            item.innerHTML = `
              <div class="notification-content" style="display: flex; flex-direction: column; gap: 0.5rem; text-align: left;">
                <span>${n.message}</span>
                <div style="display: flex; gap: 0.4rem; margin-top: 0.25rem;">
                  <button class="btn-mini" onclick="app.acceptBattleInvite('${n.battleId}', '${n.id}')">수락</button>
                  <button class="btn-mini secondary" onclick="app.declineBattleInvite('${n.battleId}', '${n.id}')">거절</button>
                </div>
              </div>
              <div class="notification-time">${timeStr}</div>
            `;
          } else if (n.type === 'battle_accepted' && !isRead) {
            item.innerHTML = `
              <div class="notification-content" style="display: flex; flex-direction: column; gap: 0.5rem; text-align: left;">
                <span>${n.message}</span>
                <div style="display: flex; gap: 0.4rem; margin-top: 0.25rem;">
                  <button class="btn-mini" style="background: linear-gradient(135deg,#10b981,#047857); border-color: #10b981;" onclick="app.startBattleFromNotif('${n.battleId}', '${n.id}')">⚔️ 지금 시작!</button>
                </div>
              </div>
              <div class="notification-time">${timeStr}</div>
            `;
          } else {
            item.innerHTML = `
              <div class="notification-content">${n.message}</div>
              <div class="notification-time">${timeStr}</div>
            `;
          }
          list.appendChild(item);
        });
      }
    }

    // 2. Full Page Notification Center list
    const pageList = document.getElementById('notificationsPageList');
    if (pageList) {
      if (sortedNotifs.length === 0) {
        pageList.innerHTML = '<div class="notification-empty">새로운 알림이 없습니다.</div>';
      } else {
        pageList.innerHTML = '';
        sortedNotifs.forEach(n => {
          const item = document.createElement('div');
          const isRead = Boolean(n.isRead ?? n.read);
          item.className = `notification-item ${isRead ? 'read' : 'unread'}`;
          
          const timeStr = this.formatRelativeTime(n.timestamp);
          
          if (n.type === 'battle_invite' && !isRead) {
            item.innerHTML = `
              <div class="notification-content" style="display: flex; flex-direction: column; gap: 0.5rem; text-align: left;">
                <span>${n.message}</span>
                <div style="display: flex; gap: 0.4rem; margin-top: 0.25rem;">
                  <button class="btn-mini" onclick="app.acceptBattleInvite('${n.battleId}', '${n.id}')">수락</button>
                  <button class="btn-mini secondary" onclick="app.declineBattleInvite('${n.battleId}', '${n.id}')">거절</button>
                </div>
              </div>
              <div class="notification-time">${timeStr}</div>
            `;
          } else if (n.type === 'battle_accepted' && !isRead) {
            item.innerHTML = `
              <div class="notification-content" style="display: flex; flex-direction: column; gap: 0.5rem; text-align: left;">
                <span>${n.message}</span>
                <div style="display: flex; gap: 0.4rem; margin-top: 0.25rem;">
                  <button class="btn-mini" style="background: linear-gradient(135deg,#10b981,#047857); border-color: #10b981;" onclick="app.startBattleFromNotif('${n.battleId}', '${n.id}')">⚔️ 지금 시작!</button>
                </div>
              </div>
              <div class="notification-time">${timeStr}</div>
            `;
          } else {
            item.innerHTML = `
              <div class="notification-content">${n.message}</div>
              <div class="notification-time">${timeStr}</div>
            `;
          }
          pageList.appendChild(item);
        });
      }
    }
  }

  formatRelativeTime(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    if (diff < 60000) return '방금 전';
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}분 전`;
    const hours = Math.floor(diff / 3600000);
    if (hours < 24) return `${hours}시간 전`;
    const days = Math.floor(diff / 86400000);
    return `${days}일 전`;
  }

  // Point float popups on UI
  showPointsFloater(amount, message) {
    const container = document.getElementById('floatingPointContainer');
    const floater = document.createElement('div');
    floater.className = 'floating-point-item';
    
    // Position randomly near the center
    const x = window.innerWidth / 2 + (Math.random() - 0.5) * 150;
    const y = window.innerHeight / 2 - 100 + (Math.random() - 0.5) * 100;
    
    floater.style.left = `${x}px`;
    floater.style.top = `${y}px`;
    floater.textContent = `+${amount}P`;
    
    // If customized message is supplied
    if (message) {
      floater.innerHTML = `<span style="font-size:0.9rem; font-family:var(--font-kr); font-weight:normal; display:block; color:var(--text-secondary);">${message}</span>+${amount} P`;
    }

    container.appendChild(floater);
    
    // Remove element after animation completes
    setTimeout(() => {
      floater.remove();
    }, 1000);
  }

  // 7. Check-in Reward Logic
  calculateCheckInReward() {
    if (!this.currentUser) return null;

    const todayStr = this.getRelativeDateStr(0);
    const yesterdayStr = this.getRelativeDateStr(-1);
    const lastCheckDate = this.currentUser.lastCheckInDate;

    if (lastCheckDate === todayStr) {
      return null;
    }

    let isConsecutive = false;
    let newConsecutiveCount = 1;

    if (lastCheckDate === yesterdayStr) {
      isConsecutive = true;
      newConsecutiveCount = (this.currentUser.consecutiveCheckIns || 0) + 1;
    } else {
      newConsecutiveCount = 1;
    }

    let gotBonus = false;
    let bonusAmount = 0;
    if (newConsecutiveCount > 30) {
      newConsecutiveCount = 1;
    }
    
    if (newConsecutiveCount === 5) {
      gotBonus = true;
      bonusAmount = 150;
    } else if (newConsecutiveCount === 10) {
      gotBonus = true;
      bonusAmount = 200;
    } else if (newConsecutiveCount === 15) {
      gotBonus = true;
      bonusAmount = 250;
    } else if (newConsecutiveCount === 30) {
      gotBonus = true;
      bonusAmount = 300;
    }

    let pointsAwarded = 10;
    
    if (gotBonus) {
      pointsAwarded += bonusAmount;
    }

    return {
      pointsAwarded: pointsAwarded,
      consecutiveCheckIns: newConsecutiveCount,
      gotBonus: gotBonus,
      bonusAmount: bonusAmount
    };
  }

  checkIn() {
    if (!this.currentUser) return;
    if (this.currentUser.isTrial) {
      this.openModal('modalTrialRestrictAttendance');
      return;
    }

    const todayStr = this.getRelativeDateStr(0);
    const checkInResult = this.calculateCheckInReward();

    if (!checkInResult) {
      alert('오늘은 이미 출석체크를 완료하셨습니다.');
      return;
    }

    const { pointsAwarded, consecutiveCheckIns, gotBonus, bonusAmount } = checkInResult;
    let message = gotBonus ? `🎉 ${consecutiveCheckIns}일 연속 출석 달성! 보너스 ${bonusAmount}P 지급!` : "일일 출석 완료!";

    const notifMsg = gotBonus 
      ? `📅 ${consecutiveCheckIns}일 연속 출석 보너스! +${pointsAwarded}P`
      : `📅 일일 출석 완료! +${pointsAwarded}P`;
    const newNotification = this.createNotification({
      title: gotBonus ? '출석 보상' : '출석체크',
      type: 'attendance',
      message: notifMsg
    });

    const attendanceHistory = {
      id: 'hist_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      type: 'attendance',
      title: gotBonus ? `연속 출석 보너스 (${consecutiveCheckIns}일차)` : '일일 출석 체크',
      amount: pointsAwarded,
      date: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
    };

    db.collection('users').doc(this.currentUser.id).update({
      lastCheckInDate: todayStr,
      consecutiveCheckIns: consecutiveCheckIns,
      checkInHistory: firebase.firestore.FieldValue.arrayUnion(todayStr),
      points: firebase.firestore.FieldValue.increment(pointsAwarded),
      faithXP: firebase.firestore.FieldValue.increment(pointsAwarded),
      notifications: firebase.firestore.FieldValue.arrayUnion(newNotification),
      pointsHistory: firebase.firestore.FieldValue.arrayUnion(attendanceHistory)
    }).then(() => {
      this.showPointsFloater(pointsAwarded, message);
      this.playConfetti('checkin');

      const toastMsg = gotBonus 
        ? `🎉 ${consecutiveCheckIns}일 연속 출석 달성! 보너스로 총 ${pointsAwarded}P를 획득하셨습니다!`
        : `오늘의 출석 체크가 완료되었습니다 (+10P). 연속 출석: ${consecutiveCheckIns}일째`;
      this.showToast(toastMsg);

      if (!this.isMobileApp) {
        if (gotBonus) {
          alert(`축하합니다! ${consecutiveCheckIns}일 연속 출석 달성 보너스로 총 ${pointsAwarded}P를 획득하셨습니다!`);
        } else {
          alert(`오늘의 출석 체크가 완료되었습니다 (+10P). 연속 출석: ${consecutiveCheckIns}일째`);
        }
      }
    }).catch(err => {
      console.error("Check-in update failed:", err);
      alert("출석 체크 처리 중 오류가 발생했습니다.");
    });
  }

  populateTestVerseSelect() {
    const select = document.getElementById('testVerseSelect');
    if (!select) return;
    select.innerHTML = '';
    const bibleData = window.BIBLE_DATA;
    bibleData.forEach((verseData, index) => {
      const opt = document.createElement('option');
      opt.value = index;
      opt.textContent = `요한계시록 ${verseData.chapter}장 ${verseData.verse}절`;
      select.appendChild(opt);
    });
  }

  startTestMode() {
    if (!this.currentUser) return;

    if (this.requestNativeScreen('game', {
      title: '복습하기',
      action: 'startTestMode'
    })) {
      return;
    }

    const select = document.getElementById('testVerseSelect');
    if (!select) return;
    const selectedIdx = parseInt(select.value, 10);
    const bibleData = window.BIBLE_DATA;
    if (isNaN(selectedIdx) || selectedIdx < 0 || selectedIdx >= bibleData.length) {
      alert('올바른 성경 구절을 선택해주세요.');
      return;
    }
    this.isTestMode = true;
    this.currentQuizVerse = bibleData[selectedIdx];
    this.switchView('game');
    this.initializeQuiz();
  }

  // 8. Gamified Quiz Engine
  startMission() {
    if (!this.currentUser) return;

    if (this.requestNativeScreen('game', {
      title: '암송 챌린지',
      action: 'startMission'
    })) {
      return;
    }
    
    const bibleData = window.BIBLE_DATA;
    let curIdx = this.currentUser.currentVerseIndex;
    
    // Loop back to start if finished
    if (curIdx >= bibleData.length) {
      this.openModal('modalReviewConfirm');
      return;
    }

    this.currentQuizVerse = bibleData[curIdx];

    // Automatically sync game difficulty with the verse's custom difficulty if set
    if (this.currentQuizVerse && this.currentQuizVerse.difficulty) {
      const diffMap = {
        'easy': 'easy',
        'normal': 'medium',
        'hard': 'hard'
      };
      const targetDiff = diffMap[this.currentQuizVerse.difficulty] || 'medium';
      this.setDifficulty(targetDiff);
    }

    this.switchView('game');
    this.initializeQuiz();
  }

  setDifficulty(diff) {
    this.currentDifficulty = diff;
    
    // Toggle active classes on buttons
    document.getElementById('btnDiffEasy').classList.toggle('active', diff === 'easy');
    document.getElementById('btnDiffMedium').classList.toggle('active', diff === 'medium');
    document.getElementById('btnDiffHard').classList.toggle('active', diff === 'hard');
    const masterBtn = document.getElementById('btnDiffMaster');
    if (masterBtn) masterBtn.classList.toggle('active', diff === 'master');
    
    // 난이도별 기본 포인트 표기 (시간 차감 전 최대치)
    const pointsLabel = document.getElementById('gameEarnedPoints');
    if (pointsLabel) {
      if (diff === 'easy') pointsLabel.textContent = '100';
      else if (diff === 'medium' || diff === 'normal') pointsLabel.textContent = '200';
      else if (diff === 'hard') pointsLabel.textContent = '300';
      else if (diff === 'master') pointsLabel.textContent = '500';
    }

    if (this.gameActive) {
      this.initializeQuiz();
    }
  }

  /**
   * 구두점(.,?! 등)을 어절 끝에서 분리하는 헬퍼
   * "말씀이여," → { word: "말씀이여", punct: "," }
   */
  _splitWordPunct(token) {
    const m = token.match(/^(.*?)([.,!?;:。、]+)$/);
    if (m) return { word: m[1], punct: m[2] };
    return { word: token, punct: '' };
  }

  /**
   * 어절(띄어쓰기) 단위 랜덤 빈칸 생성
   * @param {string} text - 원문 텍스트
   * @param {number} ratio - 빈칸 비율 (0~1)
   * @returns {{ html: string, blanks: Array<{id,answer}> }}
   */
  _buildWordBlanks(text, ratio) {
    const tokens = text.split(' ');
    const blanks = [];
    let blankIdx = 0;

    // 빈칸으로 뽑을 어절 인덱스 무작위 선택
    const targetCount = Math.max(1, Math.round(tokens.length * ratio));
    const allIndices = tokens.map((_, i) => i).sort(() => Math.random() - 0.5);
    const blankIndices = new Set(allIndices.slice(0, targetCount));

    const parts = tokens.map((token, ti) => {
      const { word, punct } = this._splitWordPunct(token);
      if (blankIndices.has(ti) && word.length > 0) {
        const id = blankIdx++;
        const widthPx = Math.max(60, word.length * 22 + 16);
        blanks.push({ id, answer: word });
        return `<input type="text" class="blank-input" id="blank_${id}" data-idx="${id}" style="width:${widthPx}px" placeholder="?" autocomplete="off">${punct}`;
      }
      return `<span>${token}</span>`;
    });

    return { html: parts.join(' '), blanks };
  }

  initializeQuiz() {
    this.clearIntervals();
    
    this.gameActive = true;
    this.gameHearts = 3;
    this._quizDurationSeconds = this.currentDifficulty === 'master' ? 300 : 60;
    this.gameTimeRemaining = this._quizDurationSeconds;
    this.currentQuizBlanks = [];
    this.isCustomQuestionStage = false;
    this._quizElapsedSeconds = 0; // 시간 차감용
    this._submitConfirmed = false;
    this._quizStartedAt = Date.now();

    // Reset button states
    const btnSubmit = document.getElementById('btnSubmitQuiz');
    if (btnSubmit) {
      btnSubmit.textContent = "정답 확인 및 제출";
    }

    const btnHint = document.getElementById('btnHint');
    if (btnHint) {
      btnHint.textContent = "힌트 보기 (5초 소모)";
      btnHint.setAttribute('onclick', 'app.showHint()');
    }

    // Header Setup
    document.getElementById('gameVerseTitle').textContent = `요한계시록 ${this.currentQuizVerse.chapter}장 ${this.currentQuizVerse.verse}절 시험` + (this.isTestMode ? ' [테스트]' : '');
    const timerElInit = document.getElementById('gameTimer');
    if (timerElInit) {
      timerElInit.textContent = this.gameTimeRemaining;
      timerElInit.style.color = '';
      if (timerElInit.parentElement) {
        timerElInit.parentElement.classList.remove('warning');
      }
    }
    this.renderHearts();

    // HIDE OR SHOW DIFFICULTY AND GUIDE SECTIONS
    const diffSection = document.getElementById('gameDifficultySection');
    const guideSection = document.getElementById('gameGuideSection');
    
    if (this.challengeActive) {
      if (diffSection) diffSection.style.display = 'none';
      if (guideSection) guideSection.style.display = 'none';
    } else {
      if (diffSection) diffSection.style.display = 'block';
      if (guideSection) guideSection.style.display = 'block';
    }

    const pointsStatElem = document.querySelector('.game-stat-item.points');
    if (pointsStatElem) {
      pointsStatElem.style.display = this.isTestMode ? 'none' : 'flex';
    }
    
    // 난이도별 기본 포인트 & 빈칸 비율
    // 쉬움:30%(100P), 보통:50%(200P), 어려움:70%(300P), 마스터:100%(500P)
    let blankRatio = 0.3;
    let basePoints = 100;
    const diff = this.currentDifficulty;
    if (diff === 'easy') { blankRatio = 0.3; basePoints = 100; }
    else if (diff === 'medium' || diff === 'normal') { blankRatio = 0.5; basePoints = 200; }
    else if (diff === 'hard') { blankRatio = 0.7; basePoints = 300; }
    else if (diff === 'master') { blankRatio = 1.0; basePoints = 500; }
    this._quizBasePoints = basePoints;

    // 포인트 레이블 업데이트
    const pointsLabel = document.getElementById('gameEarnedPoints');
    if (pointsLabel) pointsLabel.textContent = String(basePoints);

    // 커스텀 키워드가 있으면 기존 keyword 방식 유지 (하위 호환)
    const verse = this.currentQuizVerse;
    let useWordMode = true;
    let customKeywords = [];

    if (diff === 'easy' && verse.easyKeywords && verse.easyKeywords.length > 0) {
      customKeywords = verse.easyKeywords; useWordMode = false;
    } else if ((diff === 'medium' || diff === 'normal') && verse.normalKeywords && verse.normalKeywords.length > 0) {
      customKeywords = verse.normalKeywords; useWordMode = false;
    } else if (diff === 'hard' && verse.hardKeywords && verse.hardKeywords.length > 0) {
      customKeywords = verse.hardKeywords; useWordMode = false;
    }

    const text = verse.text || '';
    let quizHtml = '';

    if (Array.isArray(verse.choices) && verse.choices.length > 0) {
      this.currentQuizBlanks = [{ id: 'choice', answer: verse.answer || verse.correctAnswer || verse.text }];
      quizHtml = `
        <div class="choice-question-wrap">
          <div class="choice-question-text">${this.escapeHtml(verse.question || `요한계시록 ${verse.chapter}장 ${verse.verse}절에 맞는 말씀을 선택하세요.`)}</div>
          <div class="choice-options">
            ${verse.choices.map((choice, index) => `
              <label class="choice-option">
                <input type="radio" name="choiceAnswer" value="${this.escapeHtml(choice)}">
                <span>${index + 1}. ${this.escapeHtml(choice)}</span>
              </label>
            `).join('')}
          </div>
        </div>
      `;
    } else if (useWordMode) {
      // 어절 단위 빈칸
      const result = this._buildWordBlanks(text, blankRatio);
      quizHtml = result.html;
      this.currentQuizBlanks = result.blanks;
    } else {
      // 기존 키워드 방식 (커스텀 설정 존재 시)
      let rawHtml = text;
      customKeywords.sort((a, b) => b.length - a.length);
      this.currentQuizBlanks = customKeywords.map((phrase, idx) => {
        rawHtml = rawHtml.replace(phrase, `__BLANK_${idx}__`);
        return { id: idx, answer: phrase };
      });
      this.currentQuizBlanks.forEach(item => {
        const widthPx = Math.max(60, item.answer.length * 22 + 16);
        rawHtml = rawHtml.replace(`__BLANK_${item.id}__`, `<input type="text" class="blank-input" id="blank_${item.id}" data-idx="${item.id}" style="width:${widthPx}px" placeholder="?" autocomplete="off">`);
      });
      quizHtml = rawHtml;
    }

    const card = document.getElementById('verseTestCard');
    if (card) card.innerHTML = quizHtml;

    // 타이머 시작 (5초당 10P 차감 로직)
    const timerElem = document.getElementById('gameTimer');
    this.gameTimerInterval = setInterval(() => {
      this.gameTimeRemaining--;
      this._quizElapsedSeconds = (this._quizElapsedSeconds || 0) + 1;
      timerElem.textContent = this.gameTimeRemaining;

      // 5초마다 포인트 차감 프리뷰 업데이트
      if (this._quizElapsedSeconds % 5 === 0) {
        const deducted = Math.floor(this._quizElapsedSeconds / 5) * 10;
        const current = Math.max(10, this._quizBasePoints - deducted);
        if (pointsLabel) pointsLabel.textContent = String(current);
      }
      
      if (this.gameTimeRemaining <= 10) {
        if (timerElem.parentElement) {
          timerElem.parentElement.classList.add('warning');
        }
      } else {
        if (timerElem.parentElement) {
          timerElem.parentElement.classList.remove('warning');
        }
      }

      if (this.gameTimeRemaining <= 0) {
        this.triggerQuizFail("시간이 초과되었습니다!");
      }
    }, 1000);

    this.renderQuizProgressMeta();

    // 첫 번째 빈칸 포커스
    const firstInput = document.getElementById('blank_0');
    if (firstInput) firstInput.focus();
  }

  renderQuizProgressMeta() {
    const titleEl = document.getElementById('gameVerseTitle');
    const progressContainer = document.getElementById('gameExamProgressContainer');
    const progressTextEl = document.getElementById('gameExamProgress');

    if (!titleEl || !this.currentQuizVerse) return;

    let progressText = "";
    if (this.isExamMode && this.examQuestions.length) {
      titleEl.textContent = `${this.currentExamQuestionIndex + 1} / ${this.examQuestions.length} 문제`;
      progressText = `${this.currentExamQuestionIndex + 1}/${this.examQuestions.length}`;
    } else if (this.challengeActive) {
      const total = this._getChallengeVersesFromSettings().length || 1;
      titleEl.textContent = `1 / ${total} 문제 · 스페셜 암송 챌린지`;
      progressText = `1/${total}`;
    } else {
      const bibleData = window.BIBLE_DATA || [];
      const current = Math.min((this.currentUser?.currentVerseIndex || 0) + 1, bibleData.length || 1);
      titleEl.textContent = `${current} / ${bibleData.length || 1} 문제 · 요한계시록 ${this.currentQuizVerse.chapter}장 ${this.currentQuizVerse.verse}절`;
      progressText = `${((current - 1) % 10) + 1}/10`;
    }

    if (progressContainer && progressTextEl) {
      if (progressText) {
        progressTextEl.textContent = progressText;
        progressContainer.style.display = 'flex';
      } else {
        progressContainer.style.display = 'none';
      }
    }
  }

  renderHearts() {
    const heartsStr = '❤'.repeat(this.gameHearts) + '🖤'.repeat(3 - this.gameHearts);
    document.getElementById('gameHearts').textContent = heartsStr;
  }

  showHint() {
    if (!this.gameActive) return;
    
    if (this.gameTimeRemaining <= 7) {
      alert('시간이 부족하여 힌트를 사용할 수 없습니다!');
      return;
    }

    // Deduct 5 seconds
    this.gameTimeRemaining -= 5;
    document.getElementById('gameTimer').textContent = this.gameTimeRemaining;

    // Find first empty input and reveal first character
    let revealed = false;
    for (let item of this.currentQuizBlanks) {
      const input = document.getElementById(`blank_${item.id}`);
      if (input && !input.value.trim()) {
        const fullAns = item.answer;
        const hintChar = fullAns.charAt(0);
        alert(`힌트: 해당 칸의 첫 글자는 "${hintChar}" 입니다! (시간 -5초)`);
        input.focus();
        revealed = true;
        break;
      }
    }

    if (!revealed) {
      alert('이미 모든 빈칸에 내용이 입력되어 있습니다.');
    }
  }

  // Answer Checker
  submitQuiz(skipConfirm = false) {
    if (!this.gameActive) return;

    if (this.isCustomQuestionStage) {
      this.submitCustomQuestion();
      return;
    }

    if (!skipConfirm && !this._submitConfirmed) {
      this.openModal('modalSubmitConfirm');
      return;
    }
    this._submitConfirmed = false;

    let allCorrect = true;
    let firstWrongInput = null;

    this.currentQuizBlanks.forEach(item => {
      if (item.id === 'choice') {
        const selected = document.querySelector('input[name="choiceAnswer"]:checked');
        const userVal = selected ? selected.value.trim().replace(/\s+/g, '') : '';
        const correctVal = item.answer.replace(/\s+/g, '');
        allCorrect = userVal === correctVal;
        return;
      }
      const input = document.getElementById(`blank_${item.id}`);
      if (!input) return;

      const userVal = input.value.trim().replace(/\s+/g, '');
      const correctVal = item.answer.replace(/\s+/g, '');

      if (userVal === correctVal) {
        input.classList.remove('wrong');
        input.classList.add('correct');
        input.disabled = true;
      } else {
        input.classList.remove('correct');
        input.classList.add('wrong');
        allCorrect = false;
        if (!firstWrongInput) {
          firstWrongInput = input;
        }
      }
    });

    if (allCorrect) {
      if (this.currentQuizVerse.customQuestion && this.currentQuizVerse.customAnswer) {
        this.startCustomQuestionStage();
      } else {
        this.triggerQuizSuccess(false);
      }
    } else {
      // Deduct one heart
      this.gameHearts--;
      this.renderHearts();
      
      if (firstWrongInput) {
        firstWrongInput.focus();
      }

      if (this.gameHearts <= 0) {
        this.triggerQuizFail("기회를 모두 소진하셨습니다!");
      } else {
        alert(`오답이 있습니다! 기회가 ${this.gameHearts}번 남았습니다.`);
      }
    }
  }

  confirmSubmitQuiz() {
    this.closeModal('modalSubmitConfirm');
    this._submitConfirmed = true;
    this.submitQuiz(true);
  }

  startCustomQuestionStage() {
    this.isCustomQuestionStage = true;
    
    // Play a nice success effect for the first stage
    this.playConfetti('checkin');

    const card = document.getElementById('verseTestCard');
    if (card) {
      card.innerHTML = `
        <div class="custom-quiz-container" style="display:flex; flex-direction:column; gap:1rem; padding: 1.5rem; background:rgba(184,134,11,0.05); border-radius:12px; border:1px solid var(--glass-border); text-align:center;">
          <div style="font-weight:700; color:var(--accent-amber); font-size:1.1rem; display:flex; align-items:center; justify-content:center; gap:0.5rem;">
            <span class="material-icons-round">help_outline</span>
            🎁 보너스 서술형 퀴즈 (+20P)
          </div>
          <div style="font-size:1.05rem; font-weight:600; color:var(--text-primary); line-height:1.5; margin:0.5rem 0;">
            ${this.currentQuizVerse.customQuestion}
          </div>
          <input type="text" id="customQuizInput" class="blank-input" style="width:100%; max-width:400px; margin:0 auto; padding:0.6rem; text-align:center; font-size:1rem;" placeholder="정답을 입력하세요..." autocomplete="off">
        </div>
      `;
    }

    // Update buttons
    const btnSubmit = document.getElementById('btnSubmitQuiz');
    if (btnSubmit) {
      btnSubmit.textContent = "보너스 정답 제출";
    }

    const btnHint = document.getElementById('btnHint');
    if (btnHint) {
      btnHint.textContent = "보너스 퀴즈 건너뛰기";
      btnHint.setAttribute('onclick', 'app.skipCustomQuestion()');
    }

    // Focus input
    setTimeout(() => {
      const input = document.getElementById('customQuizInput');
      if (input) {
        input.focus();
        // Allow Enter key to submit
        input.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            this.submitQuiz();
          }
        });
      }
    }, 100);
  }

  submitCustomQuestion() {
    const input = document.getElementById('customQuizInput');
    if (!input) return;

    const userVal = input.value.trim().toLowerCase().replace(/\s+/g, '');
    const correctVal = this.currentQuizVerse.customAnswer.trim().toLowerCase().replace(/\s+/g, '');

    if (userVal === correctVal) {
      input.classList.remove('wrong');
      input.classList.add('correct');
      input.disabled = true;
      this.playConfetti('quiz');
      
      // Delay success slightly for better transition feel
      setTimeout(() => {
        this.triggerQuizSuccess(true);
      }, 800);
    } else {
      input.classList.remove('correct');
      input.classList.add('wrong');
      
      // Deduct one heart for bonus question mismatch
      this.gameHearts--;
      this.renderHearts();
      input.focus();

      if (this.gameHearts <= 0) {
        this.triggerQuizFail("기회를 모두 소진하셨습니다!");
      } else {
        alert(`오답입니다! 기회가 ${this.gameHearts}번 남았습니다. 정답이 생각나지 않으면 건너뛰기를 누르실 수 있습니다.`);
      }
    }
  }

  skipCustomQuestion() {
    if (!this.gameActive) return;
    this.triggerQuizSuccess(false);
  }

  triggerQuizSuccess(hasCustomBonus = false) {
    if (this.currentBattleId) {
      this.clearIntervals();
      this.gameActive = false;
      this.playConfetti('quiz');
      this.battleCorrectAnswersCount++;
      const timeSpentOnVerse = (this._quizDurationSeconds || 60) - this.gameTimeRemaining;
      this.battleTotalTimeSpent += timeSpentOnVerse;
      this.showToast(`📖 ${this.currentQuizVerse.chapter}장 ${this.currentQuizVerse.verse}절 암송 성공!`);
      setTimeout(() => {
        this.nextBattleVerse();
      }, 1000);
      return;
    }

    this.clearIntervals();
    this.gameActive = false;

    const completedBeforeQuiz = this.isJourneyQuiz ? this.getCompletedVerseIndexSet(this.currentUser).has(this.activeJourneyVerseIndex) : false;
    const isLockedPractice = false;

    // 시간 차감 포인트 계산: 5초당 10P 차감, 최저 10P 보장
    const basePoints = this._quizBasePoints || 100;
    const elapsed = this._quizElapsedSeconds || 0;
    const deducted = Math.floor(elapsed / 5) * 10;
    let totalAward = Math.max(10, basePoints - deducted);
    if (hasCustomBonus) {
      totalAward += 20;
    }
    if (isLockedPractice || completedBeforeQuiz) {
      totalAward = 0;
    }

    // 체험모드 유저 예외처리 분기
    if (this.currentUser && this.currentUser.isTrial) {
      const bibleData = window.BIBLE_DATA || [];
      const currentVerseObj = this.currentQuizVerse;
      
      const isAdvancing = !completedBeforeQuiz && ((this.isJourneyQuiz && this.activeJourneyVerseIndex === this.currentUser.currentVerseIndex) || (!this.isJourneyQuiz));
      const nextVerseIndex = isAdvancing ? this.currentUser.currentVerseIndex + 1 : this.currentUser.currentVerseIndex;
      
      this.currentUser.currentVerseIndex = nextVerseIndex; // 체험 유저 진도 임시 진행
      if (this.isJourneyQuiz && !completedBeforeQuiz) {
        this.currentUser.completedVerseIndices = Array.from(new Set([...(this.currentUser.completedVerseIndices || []), this.activeJourneyVerseIndex]));
      }
      
      if (this.isJourneyQuiz) {
        const chapterVerses = bibleData.filter(val => val.chapter === currentVerseObj.chapter);
        const firstIndex = bibleData.findIndex(val => val.chapter === currentVerseObj.chapter);
        const lastIndex = firstIndex + chapterVerses.length - 1;
        const trialCompletedSet = this.getCompletedVerseIndexSet(this.currentUser);
        const trialCompletedBeforeSet = this.getCompletedVerseIndexSet({
          ...this.currentUser,
          completedVerseIndices: (this.currentUser.completedVerseIndices || []).filter(idx => idx !== this.activeJourneyVerseIndex)
        });
        const chapterWasCompletedBefore = chapterVerses.length > 0 && chapterVerses.every((_, i) => trialCompletedBeforeSet.has(firstIndex + i));
        const justCompletedChapter = !chapterWasCompletedBefore && chapterVerses.length > 0 && chapterVerses.every((_, i) => trialCompletedSet.has(firstIndex + i));
        
        this.journeyResultData = {
          chapter: currentVerseObj.chapter,
          verse: currentVerseObj.verse,
          verseIndex: this.activeJourneyVerseIndex,
          pointsAwarded: totalAward,
          checkInReward: 0,
          completedChapter: justCompletedChapter ? currentVerseObj.chapter : null,
          nextVerseIndex: nextVerseIndex,
          isTrial: true
        };
        this.playConfetti('quiz');
        this.switchView('journeyResult');
        this.showToast(isLockedPractice
          ? `📖 요한계시록 ${currentVerseObj.chapter}장 ${currentVerseObj.verse}절 암송 연습 성공! (체험모드)`
          : `📖 요한계시록 ${currentVerseObj.chapter}장 ${currentVerseObj.verse}절 암송 성공! (체험모드)`);
        return;
      }
      
      const pointsEl = document.getElementById('trialQuizCompletePoints');
      if (pointsEl) {
        pointsEl.textContent = `+${totalAward}P`;
      }
      this.playConfetti('quiz');
      this.openModal('modalTrialQuizComplete');
      this.showToast(isLockedPractice
        ? `📖 요한계시록 ${this.currentQuizVerse.chapter}장 ${this.currentQuizVerse.verse}절 암송 연습 성공! (체험모드)`
        : `📖 요한계시록 ${this.currentQuizVerse.chapter}장 ${this.currentQuizVerse.verse}절 암송 성공! (체험모드)`);
      return;
    }

    if (this.isTestMode) {
      const elapsed3 = this._quizElapsedSeconds || 0;
      const modalBody = document.getElementById('modalCompleteBody');
      modalBody.innerHTML = `
        요한계시록 ${this.currentQuizVerse.chapter}장 ${this.currentQuizVerse.verse}절 [테스트 모드] 시험을 완료했습니다!<br><br>
        기본 포인트: <strong>${basePoints} P</strong> (소요 ${elapsed3}초 → -${Math.floor(elapsed3/5)*10}P 차감)<br>
        획득 예상 포인트: <strong>+${totalAward} P (테스트 모드 - 미지급)</strong><br>
        ${hasCustomBonus ? `서술형 보너스: <strong>+20 P (테스트 모드 - 미지급)</strong><br>` : ''}
        <hr style="margin: 0.75rem 0; border:0; border-top:1px solid var(--glass-border);">
        <strong style="color:var(--accent-amber); font-size:1.1rem;">테스트 모드 완료 (포인트가 지급되지 않습니다)</strong>
      `;
      this.playConfetti('quiz');
      this.openModal('modalComplete');
      this.showToast(`📖 요한계시록 ${this.currentQuizVerse.chapter}장 ${this.currentQuizVerse.verse}절 암송 완료! (테스트 모드)`);
      return;
    }

    // Check if auto check-in is possible
    const todayStr = this.getRelativeDateStr(0);
    const checkInResult = this.calculateCheckInReward();
    
    let isAdvancing = false;
    let nextVerseIndex = this.currentUser.currentVerseIndex;
    if (this.isJourneyQuiz) {
      if (!completedBeforeQuiz && this.activeJourneyVerseIndex === this.currentUser.currentVerseIndex) {
        nextVerseIndex = this.currentUser.currentVerseIndex + 1;
        isAdvancing = true;
      }
    } else {
      nextVerseIndex = this.challengeActive ? this.currentUser.currentVerseIndex : (this.currentUser.currentVerseIndex + 1);
      isAdvancing = !this.challengeActive;
    }
    
    const bibleData = window.BIBLE_DATA || [];
    const currentVerseObj = this.currentQuizVerse;
    const chapterVerses = bibleData.filter(val => val.chapter === currentVerseObj.chapter);
    const firstIndex = bibleData.findIndex(val => val.chapter === currentVerseObj.chapter);
    const lastIndex = firstIndex + chapterVerses.length - 1;
    const completedSetBeforeQuiz = this.getCompletedVerseIndexSet(this.currentUser);
    const chapterWasCompletedBefore = chapterVerses.length > 0 && chapterVerses.every((_, i) => completedSetBeforeQuiz.has(firstIndex + i));
    const completedSetAfterQuiz = this.getCompletedVerseIndexSet({
      ...this.currentUser,
      currentVerseIndex: nextVerseIndex,
      completedVerseIndices: this.isJourneyQuiz && !completedBeforeQuiz
        ? [...(this.currentUser.completedVerseIndices || []), this.activeJourneyVerseIndex]
        : (this.currentUser.completedVerseIndices || [])
    });
    const justCompletedChapter = this.isJourneyQuiz
      ? !chapterWasCompletedBefore && chapterVerses.length > 0 && chapterVerses.every((_, i) => completedSetAfterQuiz.has(firstIndex + i))
      : isAdvancing && (nextVerseIndex > lastIndex);

    if (this.isJourneyQuiz) {
      this.journeyResultData = {
        chapter: currentVerseObj.chapter,
        verse: currentVerseObj.verse,
        verseIndex: this.activeJourneyVerseIndex,
        pointsAwarded: totalAward,
        checkInReward: checkInResult ? checkInResult.pointsAwarded : 0,
        completedChapter: justCompletedChapter ? currentVerseObj.chapter : null,
        nextVerseIndex: nextVerseIndex,
        isTrial: false,
        isPractice: isLockedPractice
      };
    }

    const totalEarned = totalAward + (checkInResult ? checkInResult.pointsAwarded : 0);
    const newNotification = this.createNotification({
      title: isLockedPractice ? '암송 연습 완료' : '포인트 지급',
      type: 'points',
      message: isLockedPractice 
        ? `📖 요한계시록 ${this.currentQuizVerse.chapter}장 ${this.currentQuizVerse.verse}절 암송 연습 성공!` 
        : `📖 요한계시록 ${this.currentQuizVerse.chapter}장 ${this.currentQuizVerse.verse}절 암송 성공! +${totalEarned}P 적립`
    });

    const quizHistory = {
      id: 'hist_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      type: 'challenge',
      title: isLockedPractice 
        ? `암송 연습 성공 (요한계시록 ${this.currentQuizVerse.chapter}장 ${this.currentQuizVerse.verse}절)` 
        : `암송 성공 (요한계시록 ${this.currentQuizVerse.chapter}장 ${this.currentQuizVerse.verse}절)`,
      amount: totalAward,
      date: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
    };

    let updateData = {
      points: firebase.firestore.FieldValue.increment(totalAward),
      faithXP: firebase.firestore.FieldValue.increment(totalAward),
      lastMissionDate: todayStr,
      currentVerseIndex: nextVerseIndex,
      notifications: firebase.firestore.FieldValue.arrayUnion(newNotification),
      pointsHistory: firebase.firestore.FieldValue.arrayUnion(quizHistory)
    };

    if (this.isJourneyQuiz && !completedBeforeQuiz) {
      updateData.completedVerseIndices = firebase.firestore.FieldValue.arrayUnion(this.activeJourneyVerseIndex);
    }

    let isChallengeCompletedThisTurn = false;
    let challengeBonusPointsValue = 0;

    if (this.challengeActive) {
      const progress = { ...(this.currentUser.challengeProgress || {}) };
      const challengeVersesForProgress = this._getChallengeVersesFromSettings();
      progress.completedCount = challengeVersesForProgress.length;
      const challengeRangeKey = this._getChallengeRangeKey();
      const firstChallengeVerse = challengeVersesForProgress[0] || { chapter: this.globalSettings.activeChallengeChapter || 1, verse: 1 };
      const lastChallengeVerse = challengeVersesForProgress[challengeVersesForProgress.length - 1] || firstChallengeVerse;
      const challengeRangeLabel = firstChallengeVerse.chapter === lastChallengeVerse.chapter && firstChallengeVerse.verse === lastChallengeVerse.verse
        ? `요한계시록 ${firstChallengeVerse.chapter}장 ${firstChallengeVerse.verse}절`
        : `요한계시록 ${firstChallengeVerse.chapter}장 ${firstChallengeVerse.verse}절 ~ ${lastChallengeVerse.chapter}장 ${lastChallengeVerse.verse}절`;
      progress.chapter = firstChallengeVerse.chapter;
      progress.rangeKey = challengeRangeKey;
      
      updateData.challengeProgress = progress;

      if (progress.completedCount >= challengeVersesForProgress.length && !progress.claimed) {
        progress.claimed = true;
        isChallengeCompletedThisTurn = true;
        challengeBonusPointsValue = this.globalSettings.challengeBonusPoints || 50;
        
        updateData.points = firebase.firestore.FieldValue.increment(totalAward + challengeBonusPointsValue);
        updateData.faithXP = firebase.firestore.FieldValue.increment(totalAward + challengeBonusPointsValue);
        
        const challengeBonusHistory = {
          id: 'hist_' + (Date.now() + 2) + '_' + Math.random().toString(36).substr(2, 5),
          type: 'challenge_bonus',
          title: `스페셜 챌린지 완수 보너스 (${challengeRangeLabel})`,
          amount: challengeBonusPointsValue,
          date: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
        };
        const challengeBonusNotification = this.createNotification({
          title: '성경여정 완료',
          type: 'journey_complete',
          message: `🔥 ${challengeRangeLabel} 챌린지 올클리어! 보너스 +${challengeBonusPointsValue}P 적립`
        });
        updateData.pointsHistory = firebase.firestore.FieldValue.arrayUnion(quizHistory, challengeBonusHistory);
        updateData.notifications = firebase.firestore.FieldValue.arrayUnion(newNotification, challengeBonusNotification);
      }
    }

    if (checkInResult) {
      updateData.lastCheckInDate = todayStr;
      updateData.consecutiveCheckIns = checkInResult.consecutiveCheckIns;
      updateData.checkInHistory = firebase.firestore.FieldValue.arrayUnion(todayStr);
      // Adjust points to prevent double increments if challenge complete also adjusted it
      if (isChallengeCompletedThisTurn) {
        updateData.points = firebase.firestore.FieldValue.increment(totalEarned + challengeBonusPointsValue);
        updateData.faithXP = firebase.firestore.FieldValue.increment(totalEarned + challengeBonusPointsValue);
      } else {
        updateData.points = firebase.firestore.FieldValue.increment(totalEarned);
        updateData.faithXP = firebase.firestore.FieldValue.increment(totalEarned);
      }
      
      const checkInHistoryObj = {
        id: 'hist_' + (Date.now() + 1) + '_' + Math.random().toString(36).substr(2, 5),
        type: 'attendance',
        title: checkInResult.gotBonus ? `연속 출석 보너스 (${checkInResult.consecutiveCheckIns}일차)` : '일일 출석 체크',
        amount: checkInResult.pointsAwarded,
        date: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
      };
      
      if (isChallengeCompletedThisTurn) {
        const progress = updateData.challengeProgress;
        const challengeBonusHistory = {
          id: 'hist_' + (Date.now() + 2) + '_' + Math.random().toString(36).substr(2, 5),
          type: 'challenge_bonus',
          title: `스페셜 챌린지 완수 보너스 (${progress.rangeKey || progress.chapter})`,
          amount: challengeBonusPointsValue,
          date: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
        };
        updateData.pointsHistory = firebase.firestore.FieldValue.arrayUnion(quizHistory, checkInHistoryObj, challengeBonusHistory);
      } else {
        updateData.pointsHistory = firebase.firestore.FieldValue.arrayUnion(quizHistory, checkInHistoryObj);
      }
    }

    db.collection('users').doc(this.currentUser.id).update(updateData).then(() => {
      if (this.isJourneyQuiz) {
        this.playConfetti('quiz');
        this.switchView('journeyResult');
        this.showToast(`📖 요한계시록 ${this.currentQuizVerse.chapter}장 ${this.currentQuizVerse.verse}절 암송 성공!`);
        return;
      }
      // Populate Success Modal
      const modalBody = document.getElementById('modalCompleteBody');
      const elapsed2 = this._quizElapsedSeconds || 0;
      let htmlContent = `
        요한계시록 ${this.currentQuizVerse.chapter}장 ${this.currentQuizVerse.verse}절 암송 시험을 완료했습니다!<br><br>
        기본 포인트: <strong>${basePoints} P</strong><br>
        소요 시간: <strong>${elapsed2}초</strong> (5초당 10P 차감)<br>
        획득 포인트: <strong style="color:var(--accent-amber);">+${totalAward} P</strong><br>
        ${hasCustomBonus ? `서술형 보너스: <strong>+20 P</strong><br>` : ''}
      `;

      if (checkInResult) {
        htmlContent += `
          출석 체크 보너스: <strong>+${checkInResult.pointsAwarded} P</strong> (연속 ${checkInResult.consecutiveCheckIns}일차)<br>
          <span style="font-size:0.8rem; color:var(--accent-emerald);">📅 오늘의 출석체크가 자동 완료되었습니다!</span><br>
        `;
      }

      if (isChallengeCompletedThisTurn) {
        htmlContent += `
          🔥 챌린지 완료 보너스: <strong style="color: var(--accent-purple);">+${challengeBonusPointsValue} P</strong><br>
          <span style="font-size:0.8rem; color:var(--accent-purple); font-weight: bold;">🎉 축하합니다! 스페셜 암송 챌린지를 완수했습니다!</span><br>
        `;
      }

      const finalTotalEarned = totalAward + (checkInResult ? checkInResult.pointsAwarded : 0) + (isChallengeCompletedThisTurn ? challengeBonusPointsValue : 0);
      htmlContent += `
        <hr style="margin: 0.75rem 0; border:0; border-top:1px solid var(--glass-border);">
        총 획득한 포인트: <strong style="color:var(--accent-amber); font-size:1.15rem;">+${finalTotalEarned} P</strong>
      `;
      modalBody.innerHTML = htmlContent;

      if (isLockedPractice) {
        this.showPointsFloater(0, "암송 연습 완료!");
      } else {
        this.showPointsFloater(totalAward, "암송 시험 통과!");
      }
      if (checkInResult) {
        setTimeout(() => {
          const checkInMsg = checkInResult.gotBonus ? `🎉 ${checkInResult.consecutiveCheckIns}일 연속 출석 보너스!` : "일일 출석 완료!";
          this.showPointsFloater(checkInResult.pointsAwarded, checkInMsg);
          // Redraw attendance widget to show the checkmark and filled bar instantly
          this.renderAttendanceWidget();
        }, 400);
      }
      if (isChallengeCompletedThisTurn) {
        setTimeout(() => {
          this.showPointsFloater(challengeBonusPointsValue, "챌린지 완료 보너스! 🏆");
        }, 800);
      }
      this.playConfetti('quiz');
      this.openModal('modalComplete');

      // Show toast on success
      let toastMsg = isLockedPractice 
        ? `📖 요한계시록 ${this.currentQuizVerse.chapter}장 ${this.currentQuizVerse.verse}절 암송 연습 성공!` 
        : `📖 요한계시록 ${this.currentQuizVerse.chapter}장 ${this.currentQuizVerse.verse}절 암송 성공! (+${totalAward}P)`;
      if (checkInResult) {
        toastMsg += ` & 오늘의 출석체크 자동 완료! (+${checkInResult.pointsAwarded}P)`;
      }
      if (isChallengeCompletedThisTurn) {
        toastMsg += ` & 챌린지 완료 보너스! (+${challengeBonusPointsValue}P)`;
      }
      this.showToast(toastMsg);
    }).catch(err => {
      console.error("Error updating quiz success:", err);
      alert("진도 업데이트 중 오류가 발생했습니다.");
    });
  }

  triggerQuizFail(reason) {
    if (this.currentBattleId) {
      this.clearIntervals();
      this.gameActive = false;
      this.battleTotalTimeSpent += 60;
      this.showToast(`❌ 암송 실패: ${reason}`);
      setTimeout(() => {
        this.nextBattleVerse();
      }, 1500);
      return;
    }

    this.clearIntervals();
    this.gameActive = false;

    const modalBody = document.getElementById('modalFailBody');
    modalBody.innerHTML = `
      ${reason}<br>
      말씀 카드를 조금 더 소리 내어 읽고 암송을 완성한 후에 재도전해보세요!
    `;
    this.openModal('modalFail');
  }

  exitGame() {
    this.clearIntervals();
    this.gameActive = false;
    this.isTestMode = false;
    this.challengeActive = false;
    if (this.isJourneyQuiz) {
      this.switchView('journeyChapterDetail');
    } else if (this.isExamMode) {
      this.isExamMode = false;
      this._restoreExamIntro();
      this.switchView('exam');
    } else {
      this.switchView('dashboard');
    }
  }

  // ============================================================
  // 사명자 시험 시스템
  // ============================================================

  _getExamVerses(eventItem) {
    const startChapter = eventItem?.examStartChapter || eventItem?.startChapter || this.globalSettings?.examStartChapter || 1;
    const startVerse = eventItem?.examStartVerse || eventItem?.startVerse || this.globalSettings?.examStartVerse || 1;
    const endChapter = eventItem?.examEndChapter || eventItem?.endChapter || this.globalSettings?.examEndChapter || 1;
    const endVerse = eventItem?.examEndVerse || eventItem?.endVerse || this.globalSettings?.examEndVerse || 20;
    return this._getVerseRange(startChapter, startVerse, endChapter, endVerse);
  }

  startMissionExamFlow() {
    if (!this.currentUser) {
      alert('로그인 후 사명자 시험에 응시할 수 있습니다.');
      this.switchView('auth');
      return;
    }
    
    // Set active event as currentEvent if not set
    if (!this.currentEvent && this.activeEvents) {
      this.currentEvent = this.activeEvents.find(evt => evt.eventType === 'mission_exam');
    }
    if (!this.currentEvent) {
      alert('현재 진행 중인 사명자 시험 이벤트가 없습니다.');
      return;
    }

    // Determine target verses
    this.examVerses = this._getExamVerses(this.currentEvent);
    if (this.examVerses.length === 0) {
      alert('시험 성구 범위가 비어 있습니다.');
      return;
    }

    // Check if user already has completed exam
    const submission = this.currentUser.examSubmission || null;
    const attemptCount = submission ? (submission.attemptCount || 0) : 0;
    
    if (attemptCount > 0) {
      this.examStep = 'retake';
    } else {
      const hasSavedInfo = (this.currentUser.examRegion || '').trim() && (this.currentUser.examApplicantName || '').trim();
      if (hasSavedInfo) {
        this.examStep = 'confirm_info';
        this.examRegion = this.currentUser.examRegion.trim();
        this.examName = this.currentUser.examApplicantName.trim();
      } else {
        this.examStep = 'info';
        this.examRegion = (this.currentUser.examRegion || '').trim();
        this.examName = (this.currentUser.examApplicantName || this.currentUser.name || '').trim();
      }
    }
    this.examAutoSave = true;
    
    this.switchView('exam');
  }

  renderExamView() {
    const container = document.getElementById('examViewDynamicContainer');
    if (!container) return;

    if (!this.currentUser) return;
    this.stopExamCharacterCountWatcher();

    if (this.examStep === 'info') {
      container.innerHTML = `
        <div class="page-header-bar" style="max-width:600px; margin: 1rem auto 0 auto; padding: 0 1rem; display: flex; align-items: center; justify-content: space-between;">
          <button class="btn-header-back" onclick="app.completeExamAndGoHome()" aria-label="뒤로가기">
            <span class="material-icons-round">arrow_back</span>
          </button>
          <h1 style="font-family: var(--font-kr); font-weight: 800; font-size: 1.25rem;">응시자 정보 입력</h1>
          <div style="width: 40px;"></div>
        </div>

        <div class="exam-card glass-panel" style="max-width:600px; margin: 1.5rem auto; padding: 2rem; font-family: var(--font-kr);">
          <p style="font-size: 0.95rem; color: var(--text-secondary); line-height: 1.6; margin-bottom: 1.5rem; text-align: center; font-weight: 500;">
            시험 결과 등록을 위해 최초 1회만 입력해주세요.
          </p>
          
          <div class="form-group" style="margin-bottom: 1.25rem;">
            <label for="examRegionInput" style="font-size: 0.9rem; font-weight: 700; color: var(--text-primary); display: block; margin-bottom: 0.5rem;">지역 (필수)</label>
            <input type="text" id="examRegionInput" class="input-field" placeholder="예) 서울 강동, 부산 해운대, 인천 부평" value="${this.escapeHtml(this.examRegion || '')}">
          </div>

          <div class="form-group" style="margin-bottom: 1.5rem;">
            <label for="examNameInput" style="font-size: 0.9rem; font-weight: 700; color: var(--text-primary); display: block; margin-bottom: 0.5rem;">이름 (필수)</label>
            <input type="text" id="examNameInput" class="input-field" placeholder="이름을 입력해주세요" value="${this.escapeHtml(this.examName || '')}">
          </div>

          <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 2rem;">
            <input type="checkbox" id="examAutoSaveCheckbox" ${this.examAutoSave !== false ? 'checked' : ''} style="width: 18px; height: 18px; accent-color: var(--accent-amber);">
            <label for="examAutoSaveCheckbox" style="font-size: 0.85rem; color: var(--text-secondary); font-weight: 600; cursor: pointer;">
              다음 시험부터 자동 사용 <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: normal;">(설정에서 변경 가능)</span>
            </label>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 0.75rem;">
            <button onclick="app.completeExamAndGoHome()" class="btn-secondary" style="height: 50px; border-radius: 10px; font-weight: 700;">취소</button>
            <button onclick="app.saveExamInfoAndStart()" class="btn-primary" style="height: 50px; border-radius: 10px; font-weight: 800; background: linear-gradient(135deg, var(--accent-amber), #b45309); border: none; color: white;">저장 후 시작</button>
          </div>
        </div>
      `;
    } else if (this.examStep === 'confirm_info') {
      container.innerHTML = `
        <div class="page-header-bar" style="max-width:600px; margin: 1rem auto 0 auto; padding: 0 1rem; display: flex; align-items: center; justify-content: space-between;">
          <button class="btn-header-back" onclick="app.completeExamAndGoHome()" aria-label="뒤로가기">
            <span class="material-icons-round">arrow_back</span>
          </button>
          <h1 style="font-family: var(--font-kr); font-weight: 800; font-size: 1.25rem;">응시자 정보 확인</h1>
          <div style="width: 40px;"></div>
        </div>

        <div class="exam-card glass-panel" style="max-width:600px; margin: 1.5rem auto; padding: 2rem; font-family: var(--font-kr); text-align: center;">
          <p style="font-size: 0.95rem; color: var(--text-secondary); line-height: 1.6; margin-bottom: 2rem; font-weight: 500;">
            저장된 응시자 정보로 시험을 시작합니다.
          </p>

          <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid var(--glass-border); border-radius: 12px; padding: 1.5rem; margin-bottom: 2.5rem; text-align: left;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; border-bottom: 1px solid rgba(255, 255, 255, 0.05); padding-bottom: 0.75rem;">
              <span style="font-size: 0.9rem; color: var(--text-muted); font-weight: 600;">지역</span>
              <span style="font-size: 1.05rem; color: var(--text-primary); font-weight: 700;">${this.escapeHtml(this.examRegion)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 0.9rem; color: var(--text-muted); font-weight: 600;">이름</span>
              <span style="font-size: 1.05rem; color: var(--text-primary); font-weight: 700;">${this.escapeHtml(this.examName)}</span>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 0.75rem;">
            <button onclick="app.editExamInfo()" class="btn-secondary" style="height: 50px; border-radius: 10px; font-weight: 700;">정보 수정</button>
            <button onclick="app.startMissionExamGameplay()" class="btn-primary" style="height: 50px; border-radius: 10px; font-weight: 800; background: linear-gradient(135deg, var(--accent-amber), #b45309); border: none; color: white;">시험 시작하기</button>
          </div>
        </div>
      `;
    } else if (this.examStep === 'test') {
      const currentVerse = this.examVerses[this.examCurrentIndex];
      container.innerHTML = `
        <div class="page-header-bar" style="max-width:860px; margin: 1rem auto 0 auto; padding: 0 1rem; display: flex; align-items: center; justify-content: space-between;">
          <button class="btn-header-back" onclick="app.confirmExitExam()" aria-label="뒤로가기">
            <span class="material-icons-round">arrow_back</span>
          </button>
          <h1 style="font-family: var(--font-kr); font-weight: 800; font-size: 1.25rem;">사명자 시험 - 전문 모드</h1>
          <div style="width: 40px;"></div>
        </div>

        <div class="exam-card glass-panel" style="max-width:860px; margin: 1.5rem auto 2rem auto; padding: 2rem; font-family: var(--font-kr);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;">
            <span style="font-size: 1.1rem; font-weight: 800; color: var(--accent-amber);">${this.examCurrentIndex + 1} / ${this.examVerses.length}절</span>
            <span style="display: flex; align-items: center; gap: 0.25rem; font-size: 0.85rem; font-weight: 700; color: #16a34a;">
              <span class="material-icons-round" style="font-size: 1.1rem;">check_circle</span> 저장됨
            </span>
          </div>

          <div style="height: 6px; background: var(--glass-border); border-radius: 999px; margin-bottom: 2rem; overflow: hidden;">
            <div style="height: 100%; width: ${((this.examCurrentIndex + 1) / this.examVerses.length) * 100}%; background: linear-gradient(90deg, var(--accent-amber), var(--accent-emerald)); transition: width 0.3s;"></div>
          </div>

          <div style="margin-bottom: 1.5rem;">
            <h2 style="font-size: 1.3rem; font-weight: 800; color: var(--text-primary); margin-bottom: 0.5rem;">
              요한계시록 ${currentVerse.chapter}장 ${currentVerse.verse}절
            </h2>
            <p style="font-size: 0.9rem; color: var(--text-secondary); font-weight: 600;">
              본문은 표시되지 않습니다. 암송한 내용을 입력해주세요.
            </p>
          </div>

          <!-- Word Guides Container -->
          ${this.getWordGuideHtml(currentVerse.text)}

          <!-- User Input Area -->
          <textarea id="examVerseAnswerTextarea" class="blank-input"
            style="width: 100%; min-height: 120px; padding: 1.25rem; font-size: 1.05rem; line-height: 1.65; border-radius: 12px; margin-bottom: 1rem; resize: vertical; font-family: var(--font-kr); background: rgba(0,0,0,0.15);"
            placeholder="여기에 암송한 구절을 입력하세요..." autocomplete="off"
            oninput="app.updateExamCharacterCount()" onkeyup="app.updateExamCharacterCount()" onchange="app.updateExamCharacterCount()" onblur="app.updateExamCharacterCount()">${this.escapeHtml(this.examAnswers[this.examCurrentIndex]?.userTypedText || '')}</textarea>

          <div class="exam-char-counter">
            <span>
              글자 수: <strong id="examCharCount">0</strong>자
            </span>
          </div>

          <div style="display: flex; gap: 0.75rem;">
            ${this.examCameFromReview ? `
              <button onclick="app.cancelEditAndReturnToReview()" class="btn-secondary" style="flex: 1; height: 50px; border-radius: 10px; font-weight: 700;">취소</button>
              <button onclick="app.saveAndReturnToReview()" class="btn-primary" style="flex: 2; height: 50px; border-radius: 10px; font-weight: 800; background: linear-gradient(135deg, var(--accent-amber), #b45309); border: none; color: white;">저장 후 검토하기</button>
            ` : `
              <button onclick="app.prevMissionExamVerse()" class="btn-secondary" style="flex: 1; height: 50px; border-radius: 10px; font-weight: 700; ${this.examCurrentIndex === 0 ? 'opacity: 0.4; pointer-events: none;' : ''}">이전 절</button>
              <button onclick="app.saveAndNextMissionExamVerse()" class="btn-primary" style="flex: 2; height: 50px; border-radius: 10px; font-weight: 800; background: linear-gradient(135deg, var(--accent-amber), #b45309); border: none; color: white;">
                ${this.examCurrentIndex === this.examVerses.length - 1 ? '저장 후 검토하기' : '저장 후 다음 절'}
              </button>
            `}
          </div>
        </div>
      `;
      this.bindExamAnswerInput();
      const textarea = document.getElementById('examVerseAnswerTextarea');
      if (textarea) {
        textarea.focus();
      }
    } else if (this.examStep === 'review') {
      const answeredCount = this.examAnswers.filter(a => (a?.userTypedText || '').trim().length > 0).length;
      container.innerHTML = `
        <div class="page-header-bar" style="max-width:600px; margin: 1rem auto 0 auto; padding: 0 1rem; display: flex; align-items: center; justify-content: space-between;">
          <button class="btn-header-back" onclick="app.goBackToTestVerse()" aria-label="뒤로가기">
            <span class="material-icons-round">arrow_back</span>
          </button>
          <h1 style="font-family: var(--font-kr); font-weight: 800; font-size: 1.25rem;">제출 전 전체 검토</h1>
          <div style="width: 40px;"></div>
        </div>

        <div class="exam-card glass-panel exam-review-card" style="max-width:640px; margin: 1.5rem auto; font-family: var(--font-kr);">
          <div class="exam-review-summary">
            <span>작성한 답안</span>
            <strong><em>${answeredCount}</em> / ${this.examVerses.length}절</strong>
          </div>

          <div class="exam-review-list">
            ${this.examVerses.map((v, idx) => {
              const answer = this.examAnswers[idx];
              const typed = (answer?.userTypedText || '').trim();
              const hasAnswer = typed.length > 0;
              const preview = hasAnswer ? typed : '아직 작성하지 않았습니다.';
              const charCount = Array.from(typed).length;
              
              return `
                <button onclick="app.jumpToExamVerse(${idx})" class="exam-review-answer ${hasAnswer ? 'done' : 'empty'}" type="button">
                  <span class="exam-review-answer-num">${idx + 1}</span>
                  <span class="exam-review-answer-body">
                    <strong>요한계시록 ${v.chapter}장 ${v.verse}절</strong>
                    <span>${this.escapeHtml(preview)}</span>
                  </span>
                  <span class="exam-review-answer-meta">
                    <em>${hasAnswer ? '작성 완료' : '미작성'}</em>
                    <small>${charCount}자</small>
                  </span>
                  <span class="material-icons-round exam-review-edit-icon">edit</span>
                </button>
              `;
            }).join('')}
          </div>

          <p class="exam-review-help">수정할 절을 누르면 해당 절만 다시 작성할 수 있습니다.</p>

          <div class="exam-review-actions">
            <button onclick="app.goBackToTestVerse()" class="btn-secondary" style="height: 50px; border-radius: 10px; font-weight: 700;">현재 절 수정</button>
            <button onclick="app.submitMissionExam()" class="btn-primary" style="height: 50px; border-radius: 10px; font-weight: 800; background: linear-gradient(135deg, var(--accent-amber), #b45309); border: none; color: white;">최종 제출하기</button>
          </div>
        </div>
      `;
    } else if (this.examStep === 'result') {
      const isPassed = this.examScore >= 80;
      container.innerHTML = `
        <div class="page-header-bar" style="max-width:600px; margin: 1rem auto 0 auto; padding: 0 1rem; display: flex; align-items: center; justify-content: space-between;">
          <button class="btn-header-back" onclick="app.completeExamAndGoHome()" aria-label="뒤로가기">
            <span class="material-icons-round">arrow_back</span>
          </button>
          <h1 style="font-family: var(--font-kr); font-weight: 800; font-size: 1.25rem;">시험 결과</h1>
          <div style="width: 40px;"></div>
        </div>

        <div class="exam-card glass-panel" style="max-width:600px; margin: 1.5rem auto 2rem auto; padding: 2rem; font-family: var(--font-kr); text-align: center;">
          
          <span class="material-icons-round" style="font-size: 5rem; color: var(--accent-amber); margin-bottom: 1rem; display: block; filter: drop-shadow(0 0 12px rgba(245,158,11,0.3));">
            ${isPassed ? 'emoji_events' : 'info'}
          </span>
          
          <h2 style="font-size: 1.6rem; font-weight: 800; color: ${isPassed ? '#22c55e' : '#f43f5e'}; margin-bottom: 0.5rem;">
            ${isPassed ? '합격!' : '불합격'}
          </h2>
          <p style="font-size: 0.95rem; color: var(--text-secondary); margin-bottom: 2rem; font-weight: 500;">
            ${isPassed ? '수고하셨습니다. 끝까지 완주하셨습니다.' : '아쉽습니다. 조금만 더 노력해 보세요!'}
          </p>

          <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--glass-border); border-radius: 12px; padding: 1.5rem; display: flex; justify-content: space-around; align-items: center; margin-bottom: 2rem;">
            <div>
              <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.25rem; font-weight: 600;">점수</div>
              <div style="font-size: 2.2rem; font-weight: 900; color: var(--accent-amber);">${this.examScore}점 <span style="font-size: 1.1rem; color: var(--text-muted); font-weight: normal;">/ 100점</span></div>
            </div>
            <div style="width: 1px; height: 50px; background: var(--glass-border);"></div>
            <div>
              <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.25rem; font-weight: 600;">정답률</div>
              <div style="font-size: 2.2rem; font-weight: 900; color: var(--accent-blue);">${this.examScore}%</div>
            </div>
          </div>

          <div style="background: rgba(0,0,0,0.1); border-radius: 12px; padding: 1.25rem; text-align: left; font-size: 0.85rem; line-height: 1.8; margin-bottom: 2rem;">
            <div style="display: flex; justify-content: space-between;"><span style="color: var(--text-muted); font-weight: 600;">제출일</span><strong style="color: var(--text-primary);">${this.escapeHtml(this.examSubmittedAt)}</strong></div>
            <div style="display: flex; justify-content: space-between;"><span style="color: var(--text-muted); font-weight: 600;">응시자</span><strong style="color: var(--text-primary);">${this.escapeHtml(this.examRegion)} / ${this.escapeHtml(this.examName)}</strong></div>
            <div style="display: flex; justify-content: space-between;"><span style="color: var(--text-muted); font-weight: 600;">획득 포인트</span><strong style="color: var(--accent-amber);">+${this.examEarnedPoints}P</strong></div>
          </div>

          <details style="text-align: left; margin-bottom: 2rem; background: rgba(255,255,255,0.02); border: 1px solid var(--glass-border); border-radius: 12px; padding: 1rem;">
            <summary style="cursor: pointer; font-weight: 700; color: var(--accent-purple); padding: 0.25rem 0; font-size: 0.95rem; display: flex; align-items: center; gap: 0.25rem;">
              <span class="material-icons-round" style="font-size: 1.15rem;">playlist_add_check</span> 결과 상세 보기
            </summary>
            <div style="margin-top: 1rem; max-height: 350px; overflow-y: auto; display: flex; flex-direction: column; gap: 0.75rem;">
              ${this.examAnswers.map((ans, idx) => `
                <div style="background: rgba(0,0,0,0.15); border-radius: 8px; padding: 0.85rem; border-left: 4px solid ${ans.accuracy >= 80 ? '#22c55e' : '#f43f5e'};">
                  <div style="font-weight: 700; font-size: 0.85rem; color: var(--text-primary); margin-bottom: 0.45rem; display: flex; justify-content: space-between;">
                    <span>${idx + 1}. 요한계시록 ${ans.verse.chapter}장 ${ans.verse.verse}절</span>
                    <span style="color: var(--accent-amber);">${ans.accuracy}% 일치</span>
                  </div>
                  <div style="font-size: 0.85rem; line-height: 1.5; margin-bottom: 0.45rem; color: var(--text-secondary);">
                    <strong>입력:</strong> ${this.escapeHtml(ans.userTypedText || '(미입력)')}
                  </div>
                  <div style="font-size: 0.85rem; line-height: 1.5; color: var(--text-muted);">
                    <strong>비교:</strong> ${ans.html}
                  </div>
                </div>
              `).join('')}
            </div>
          </details>

          <div style="display: flex; flex-direction: column; gap: 0.75rem;">
            <button onclick="app.triggerExamRetake()" class="btn-primary" style="height: 50px; border-radius: 10px; font-weight: 800; background: linear-gradient(135deg, var(--accent-amber), #b45309); border: none; color: white;">다시 시험 보기</button>
            <button onclick="app.completeExamAndGoHome()" class="btn-secondary" style="height: 50px; border-radius: 10px; font-weight: 700;">홈으로 이동</button>
          </div>
        </div>
      `;
    } else if (this.examStep === 'retake') {
      container.innerHTML = `
        <div class="page-header-bar" style="max-width:600px; margin: 1rem auto 0 auto; padding: 0 1rem; display: flex; align-items: center; justify-content: space-between;">
          <button onclick="app.cancelRetake()" class="btn-header-back" aria-label="뒤로가기">
            <span class="material-icons-round">arrow_back</span>
          </button>
          <h1 style="font-family: var(--font-kr); font-weight: 800; font-size: 1.25rem;">재응시 안내</h1>
          <div style="width: 40px;"></div>
        </div>

        <div class="exam-card glass-panel" style="max-width:600px; margin: 1.5rem auto 2rem auto; padding: 2.5rem 2rem; font-family: var(--font-kr); text-align: center;">
          
          <div style="width: 80px; height: 80px; border-radius: 50%; background: rgba(245, 158, 11, 0.15); display: flex; align-items: center; justify-content: center; margin: 0 auto 1.5rem auto;">
            <span class="material-icons-round" style="font-size: 3rem; color: var(--accent-amber); animation: spin 10s linear infinite;">autorenew</span>
          </div>

          <h2 style="font-size: 1.5rem; font-weight: 800; color: var(--text-primary); margin-bottom: 0.75rem;">
            언제든지 다시<br>도전할 수 있습니다!
          </h2>
          
          <p style="font-size: 0.95rem; color: var(--text-secondary); line-height: 1.6; margin-bottom: 2.5rem; word-break: keep-all; font-weight: 500; padding: 0 1rem;">
            이전 기록은 결과에 영향을 주지 않습니다.<br>
            더 좋은 점수에 도전해보세요.
          </p>

          <div style="display: flex; flex-direction: column; gap: 0.75rem;">
            <button onclick="app.confirmExamRetake()" class="btn-primary" style="height: 50px; border-radius: 10px; font-weight: 800; background: linear-gradient(135deg, var(--accent-amber), #b45309); border: none; color: white;">다시 시험 보기</button>
            <button onclick="app.cancelRetake()" class="btn-secondary" style="height: 50px; border-radius: 10px; font-weight: 700;">나중에 하기</button>
          </div>
        </div>
      `;
    }
  }

  getWordGuideHtml(correctText) {
    const words = correctText.trim().split(/\s+/).filter(Boolean);
    const guideHtml = words.map(word => {
      const cleanWord = word.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, "").trim();
      const length = cleanWord.length;
      if (length === 0) return '';
      let boxes = '';
      for (let i = 0; i < length; i++) {
        boxes += `<span class="char-box-guide"></span>`;
      }
      return `<div class="word-box-group">${boxes}</div>`;
    }).filter(Boolean).join(' ');
    return `<div class="exam-word-guides-container">${guideHtml}</div>`;
  }

  saveExamInfoAndStart() {
    const regionInput = document.getElementById('examRegionInput');
    const nameInput = document.getElementById('examNameInput');
    const autoSaveCheckbox = document.getElementById('examAutoSaveCheckbox');
    
    const region = regionInput ? regionInput.value.trim() : '';
    const name = nameInput ? nameInput.value.trim() : '';
    const autoSave = autoSaveCheckbox ? autoSaveCheckbox.checked : true;

    if (!region || !name) {
      alert('지역과 이름을 모두 입력해 주세요.');
      if (!region && regionInput) regionInput.focus();
      else if (!name && nameInput) nameInput.focus();
      return;
    }

    this.examRegion = region;
    this.examName = name;
    this.examAutoSave = autoSave;

    if (autoSave && !this.currentUser.isTrial) {
      this.currentUser.examRegion = region;
      this.currentUser.examApplicantName = name;
      db.collection('users').doc(this.currentUser.id).update({
        examRegion: region,
        examApplicantName: name
      }).catch(err => console.error('Error saving exam info to user profile:', err));
    }

    this.startMissionExamGameplay();
  }

  editExamInfo() {
    this.examStep = 'info';
    this.renderExamView();
  }

  startMissionExamGameplay() {
    this.examStep = 'test';
    this.examCurrentIndex = 0;
    this.isExamMode = true;
    
    // Initialize answers array with empty entries matching verses length
    this.examAnswers = Array.from({ length: this.examVerses.length }, (_, idx) => ({
      verse: this.examVerses[idx],
      userTypedText: '',
      accuracy: 0,
      html: ''
    }));

    this.renderExamView();
  }

  saveAndNextMissionExamVerse() {
    const typedText = this.getCurrentExamAnswerText().trim();
    
    // Grade the active verse and save
    const currentVerse = this.examVerses[this.examCurrentIndex];
    const comparison = this.compareTextWords(currentVerse.text, typedText);
    
    this.examAnswers[this.examCurrentIndex] = {
      verse: currentVerse,
      userTypedText: typedText,
      accuracy: comparison.accuracy,
      html: comparison.html
    };

    if (this.examCurrentIndex === this.examVerses.length - 1) {
      this.examStep = 'review';
    } else {
      this.examCurrentIndex++;
    }
    this.renderExamView();
  }

  prevMissionExamVerse() {
    if (this.examCurrentIndex > 0) {
      const typedText = this.getCurrentExamAnswerText().trim();
      
      // Save current progress before navigating back
      const currentVerse = this.examVerses[this.examCurrentIndex];
      const comparison = this.compareTextWords(currentVerse.text, typedText);
      this.examAnswers[this.examCurrentIndex] = {
        ...this.examAnswers[this.examCurrentIndex],
        userTypedText: typedText,
        accuracy: comparison.accuracy,
        html: comparison.html
      };

      this.examCurrentIndex--;
      this.renderExamView();
    }
  }

  jumpToExamVerse(idx) {
    if (idx >= 0 && idx < this.examVerses.length) {
      this.examStep = 'test';
      this.examCurrentIndex = idx;
      this.examCameFromReview = true;
      this.renderExamView();
    }
  }

  updateExamCharacterCount() {
    const charCountSpan = document.getElementById('examCharCount');
    const text = this.getCurrentExamAnswerText();
    if (this.examAnswers?.[this.examCurrentIndex]) {
      this.examAnswers[this.examCurrentIndex].userTypedText = text;
    }
    if (charCountSpan) {
      charCountSpan.textContent = Array.from(text.trim()).length;
    }
  }

  getCurrentExamAnswerText() {
    const textarea = document.getElementById('examVerseAnswerTextarea');
    if (!textarea) return this.examAnswers?.[this.examCurrentIndex]?.userTypedText || '';
    return textarea.value || textarea.textContent || '';
  }

  bindExamAnswerInput() {
    const textarea = document.getElementById('examVerseAnswerTextarea');
    if (!textarea) return;

    const sync = () => requestAnimationFrame(() => this.updateExamCharacterCount());
    ['beforeinput', 'input', 'keyup', 'change', 'compositionupdate', 'compositionend', 'paste', 'focus', 'blur'].forEach((eventName) => {
      textarea.addEventListener(eventName, sync);
    });

    this.updateExamCharacterCount();
    setTimeout(() => this.updateExamCharacterCount(), 0);
    setTimeout(() => this.updateExamCharacterCount(), 120);
    this.startExamCharacterCountWatcher();
  }

  startExamCharacterCountWatcher() {
    this.stopExamCharacterCountWatcher();
    this._examCharCountWatcher = setInterval(() => {
      const textarea = document.getElementById('examVerseAnswerTextarea');
      if (this.examStep !== 'test' || !textarea) {
        this.stopExamCharacterCountWatcher();
        return;
      }
      this.updateExamCharacterCount();
    }, 250);
  }

  stopExamCharacterCountWatcher() {
    if (this._examCharCountWatcher) {
      clearInterval(this._examCharCountWatcher);
      this._examCharCountWatcher = null;
    }
  }

  saveAndReturnToReview() {
    const typedText = this.getCurrentExamAnswerText().trim();
    
    // Grade the active verse and save
    const currentVerse = this.examVerses[this.examCurrentIndex];
    const comparison = this.compareTextWords(currentVerse.text, typedText);
    
    this.examAnswers[this.examCurrentIndex] = {
      verse: currentVerse,
      userTypedText: typedText,
      accuracy: comparison.accuracy,
      html: comparison.html
    };

    this.examStep = 'review';
    this.examCameFromReview = false;
    this.renderExamView();
  }

  cancelEditAndReturnToReview() {
    this.examStep = 'review';
    this.examCameFromReview = false;
    this.renderExamView();
  }

  goBackToTestVerse() {
    this.examStep = 'test';
    this.examCameFromReview = true;
    this.renderExamView();
  }

  confirmExitExam() {
    if (confirm('시험을 종료하시겠습니까? 현재까지 입력한 답안은 저장되지 않습니다.')) {
      this.completeExamAndGoHome();
    }
  }

  completeExamAndGoHome() {
    this.isExamMode = false;
    this.examStep = 'info';
    this.examCurrentIndex = 0;
    this.examVerses = [];
    this.examAnswers = [];
    this.examScore = null;
    this.examCameFromReview = false;
    this.switchView('dashboard');
  }

  restartExamFromResult() {
    this.startMissionExamFlow();
  }

  backToEventDetailFromResult() {
    this.isExamMode = false;
    this.examStep = 'info';
    this.examCurrentIndex = 0;
    this.examVerses = [];
    this.examAnswers = [];
    this.examScore = null;
    this.examCameFromReview = false;
    this.switchView('eventDetail');
  }

  triggerExamRetake() {
    this.examStep = 'retake';
    this.renderExamView();
  }

  confirmExamRetake() {
    const hasSavedInfo = (this.currentUser.examRegion || '').trim() && (this.currentUser.examApplicantName || '').trim();
    if (hasSavedInfo) {
      this.examStep = 'confirm_info';
      this.examRegion = this.currentUser.examRegion.trim();
      this.examName = this.currentUser.examApplicantName.trim();
    } else {
      this.examStep = 'info';
      this.examRegion = (this.currentUser.examRegion || '').trim();
      this.examName = (this.currentUser.examApplicantName || this.currentUser.name || '').trim();
    }
    this.renderExamView();
  }

  cancelRetake() {
    if (this.examScore !== undefined && this.examScore !== null) {
      this.examStep = 'result';
      this.renderExamView();
    } else {
      this.completeExamAndGoHome();
    }
  }

  _getMissionExamSubmissionKey(region, name) {
    const cleanRegion = String(region || '').trim().replace(/\s+/g, ' ');
    const cleanName = String(name || '').trim().replace(/\s+/g, ' ');
    if (!cleanRegion || !cleanName) return '';
    return `${cleanRegion}__${cleanName}`.toLowerCase().replace(/[\/#?\[\]]/g, '_');
  }

  async submitMissionExam() {
    // Check if any verse is unwritten
    const unwrittenCount = this.examAnswers.filter(a => (a?.userTypedText || '').trim().length === 0).length;
    if (unwrittenCount > 0) {
      if (!confirm(`아직 작성하지 않은 문항이 ${unwrittenCount}개 있습니다. 최종 제출하시겠습니까?`)) {
        return;
      }
    }

    const total = this.examAnswers.length;
    const totalAccuracySum = this.examAnswers.reduce((sum, a) => sum + (a?.accuracy || 0), 0);
    const score = Math.round(totalAccuracySum / total);
    const correct = this.examAnswers.filter(a => Number(a?.accuracy || 0) >= 80).length;
    
    const applicantRegion = this.examRegion.trim();
    const applicantName = this.examName.trim();
    const submittedAt = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
    const examDocKey = this._getMissionExamSubmissionKey(applicantRegion, applicantName);

    const maxExamPoints = Number(this.globalSettings?.examMaxPoints || 500);
    const pointMap = {
      100: maxExamPoints,
      90: Math.round(maxExamPoints * 0.9),
      80: Math.round(maxExamPoints * 0.8),
      70: Math.round(maxExamPoints * 0.7),
      60: Math.round(maxExamPoints * 0.6)
    };
    const getPoints = (s) => {
      for (const g of [100,90,80,70,60]) { if (s >= g) return pointMap[g]; }
      return 0;
    };
    const earnedPoints = getPoints(score);
    const isPassed = score >= 60;
    const rewardLabel = isPassed
      ? (score === 100 ? '만점 보상' : `${Math.floor(score / 10) * 10}점 구간 보상`)
      : '무지급';
    const eventTitle = this.currentEvent?.title || this.currentEventDetail?.title || '사명자 시험';
    const eventStartDate = this.currentEvent?.startDate || this.currentEventDetail?.startDate || '-';
    const eventEndDate = this.currentEvent?.endDate || this.currentEventDetail?.endDate || '-';
    const resultAnnouncement = this.currentEvent?.resultDate || this.currentEventDetail?.resultDate || '시험 완료 즉시 확인';

    const container = document.getElementById('examView');
    if (!container) return;

    let existingExamDoc = null;
    if (!this.currentUser.isTrial && examDocKey) {
      try {
        const examDoc = await db.collection('mission_exam_submissions').doc(examDocKey).get();
        existingExamDoc = examDoc.exists ? examDoc.data() : null;
      } catch (err) {
        console.error('사명자 시험 이름 기준 내역 조회 오류:', err);
      }
    }

    // 이전 최고 점수 확인: 지역+이름 기준 내역을 우선 사용하고, 없으면 현재 계정 내역을 사용합니다.
    const prevSubmission = existingExamDoc || this.currentUser.examSubmission || null;
    const prevBestScore = prevSubmission ? (prevSubmission.score || 0) : 0;
    const prevBestPoints = prevSubmission ? (prevSubmission.pointsEarned || 0) : 0;
    const prevAttemptCount = prevSubmission ? (prevSubmission.attemptCount || 0) : 0;

    const isNewBest = score > prevBestScore;
    const pointDiff = Math.max(0, earnedPoints - prevBestPoints);
    const relatedNotificationTitle = isPassed ? '시험 결과 발표' : '시험 결과 안내';
    const relatedNotificationMessage = `${eventTitle} 결과: ${score}점, ${correct}/${total} 정답, ${isPassed ? '합격' : '불합격'}${pointDiff > 0 ? `, +${pointDiff}P 지급` : ''}`;

    // 정답 요약 HTML
    const answerHtml = this.examAnswers.map((a, i) => `
      <div style="display:flex;gap:0.5rem;align-items:flex-start;padding:0.5rem 0;border-bottom:1px solid var(--glass-border);">
        <span style="font-size:1rem;">${Number(a?.accuracy || 0) >= 80 ? '✅' : '❌'}</span>
        <div style="flex:1;font-size:0.85rem;">
          <div style="font-weight:600;">${i+1}. 요한계시록 ${a.verse.chapter}장 ${a.verse.verse}절 · ${a.accuracy}% 일치</div>
          <div style="color:var(--text-secondary);">내 답: ${this.escapeHtml(a.userTypedText || '(미입력)')}</div>
          <div style="color:var(--accent-emerald);">정답: ${this.escapeHtml(a.verse.text || '')}</div>
        </div>
      </div>
    `).join('');

    container.innerHTML = `
      <div class="page-header-bar" style="max-width:600px;margin:1rem auto 0 auto;padding:0 1rem;">
        <button class="btn-header-back" onclick="app.switchView('events')" aria-label="뒤로가기">
          <span class="material-icons-round">arrow_back</span>
        </button>
        <h1>시험 결과</h1>
        <div style="width: 40px;"></div>
      </div>
      <div class="exam-result-card glass-panel" style="max-width:600px;margin:1rem auto 2rem auto;padding:2rem;">
        <div style="text-align:center;margin-bottom:1.5rem;">
          <span class="material-icons-round" style="font-size:3rem;color:${score>=60?'var(--accent-amber)':'var(--accent-rose)'};">
            ${score>=60?'emoji_events':'sentiment_dissatisfied'}
          </span>
          <h2 style="font-size:1.5rem;font-weight:700;margin:0.5rem 0;">시험 완료!</h2>
          <div style="font-size:2.5rem;font-weight:800;color:var(--accent-amber);">${score}점</div>
          <div style="color:var(--text-secondary);">${correct} / ${total} 정답</div>
        </div>

        <div class="exam-point-summary glass-panel" style="padding:1rem;border-radius:12px;margin-bottom:1.5rem;text-align:center;">
          ${earnedPoints > 0 ? `
            <div style="font-size:1rem;color:var(--text-secondary);">획득 포인트</div>
            <div style="font-size:2rem;font-weight:800;color:var(--accent-amber);">+${earnedPoints}P</div>
            ${isNewBest ? `
              <div style="font-size:0.9rem;color:var(--accent-emerald);margin-top:0.25rem;">
                🎉 최고점 갱신! 차액 +${pointDiff}P 추가 지급
              </div>
            ` : `
              <div style="font-size:0.85rem;color:var(--text-secondary);margin-top:0.25rem;">
                최고점 미갱신 - 포인트 추가 지급 없음
              </div>
            `}
          ` : `
            <div style="color:var(--text-secondary);">60점 미만 - 포인트 지급 없음</div>
          `}
        </div>

        <div class="exam-result-detail-grid">
          <div><span>지역</span><strong>${this.escapeHtml(applicantRegion || '-')}</strong></div>
          <div><span>이름</span><strong>${this.escapeHtml(applicantName || '-')}</strong></div>
          <div><span>응시 일시</span><strong>${this.escapeHtml(submittedAt)}</strong></div>
          <div><span>점수</span><strong>${score}점</strong></div>
          <div><span>정답 수</span><strong>${correct} / ${total}</strong></div>
          <div><span>획득 포인트</span><strong>+${pointDiff}P</strong></div>
          <div><span>지급 보상</span><strong>${this.escapeHtml(rewardLabel)} (${earnedPoints}P)</strong></div>
          <div><span>합격 여부</span><strong class="${isPassed ? 'pass' : 'fail'}">${isPassed ? '합격' : '불합격'}</strong></div>
        </div>

        <div class="exam-related-alerts">
          <h3>관련 알림</h3>
          <div class="exam-alert-row"><span class="material-icons-round">play_circle</span><div><strong>이벤트 시작</strong><p>${this.escapeHtml(eventStartDate)}</p></div></div>
          <div class="exam-alert-row"><span class="material-icons-round">event</span><div><strong>이벤트 종료 예정</strong><p>${this.escapeHtml(eventEndDate)}</p></div></div>
          <div class="exam-alert-row"><span class="material-icons-round">campaign</span><div><strong>결과 발표</strong><p>${this.escapeHtml(resultAnnouncement)} · 알림센터에서 확인 가능</p></div></div>
        </div>

        <details style="margin-bottom:1.5rem;">
          <summary style="cursor:pointer;font-weight:700;color:var(--accent-purple);margin-bottom:0.5rem;">📋 답안 확인</summary>
          <div style="max-height:300px;overflow-y:auto;padding:0.5rem 0;">${answerHtml}</div>
        </details>

        <div class="exam-result-actions">
          <button onclick="app.restartExamFromResult()" class="btn-primary">시험 다시 시작</button>
          <button onclick="app.backToEventDetailFromResult()" class="btn-game secondary">이벤트 상세</button>
          <button onclick="app.completeExamAndGoHome()" class="btn-game secondary">홈으로</button>
        </div>
      </div>
    `;

    // Firestore 업데이트
    if (!this.currentUser.isTrial) {
      try {
        const newAttemptCount = prevAttemptCount + 1;
        const attemptRecord = {
          id: 'attempt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
          score,
          correctCount: correct,
          totalCount: total,
          submittedAt,
          region: applicantRegion,
          applicantName,
          userId: this.currentUser.id,
          userEmail: this.currentUser.email || '',
          answers: this.examAnswers
        };
        const previousAttempts = Array.isArray(prevSubmission?.attempts) ? prevSubmission.attempts : [];
        const newSubmission = {
          region: applicantRegion,
          applicantName,
          regionNameKey: examDocKey,
          score: Math.max(score, prevBestScore),
          pointsEarned: Math.max(earnedPoints, prevBestPoints),
          attemptCount: newAttemptCount,
          lastAttemptDate: submittedAt,
          lastScore: score,
          lastCorrectCount: correct,
          lastTotalCount: total,
          lastEarnedPoints: pointDiff,
          lastRewardLabel: rewardLabel,
          lastPassed: isPassed,
          lastNotificationTitle: relatedNotificationTitle,
          lastNotificationMessage: relatedNotificationMessage,
          eventTitle,
          eventStartDate,
          eventEndDate,
          resultAnnouncement,
          lastUserId: this.currentUser.id,
          lastUserEmail: this.currentUser.email || '',
          updatedAt: Date.now(),
          attempts: [...previousAttempts, attemptRecord].slice(-30)
        };

        const relatedNotification = this.createNotification({
          title: relatedNotificationTitle,
          type: 'exam_result',
          message: relatedNotificationMessage
        });
        const updateData = {
          examSubmission: newSubmission,
          notifications: firebase.firestore.FieldValue.arrayUnion(relatedNotification)
        };
        updateData.examRegion = applicantRegion;
        updateData.examApplicantName = applicantName;

        if (isNewBest && pointDiff > 0) {
          const examHistory = {
            id: 'hist_' + Date.now() + '_' + Math.random().toString(36).substr(2,5),
            type: 'exam',
            title: `사명자 시험 최고점 갱신 (${score}점)`,
            amount: pointDiff,
            date: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
          };
          updateData.points = firebase.firestore.FieldValue.increment(pointDiff);
          updateData.faithXP = firebase.firestore.FieldValue.increment(pointDiff);
          updateData.pointsHistory = firebase.firestore.FieldValue.arrayUnion(examHistory);
          this.showPointsFloater(pointDiff, `사명자 시험 +${pointDiff}P`);
          this.playConfetti('quiz');
        }

        await db.collection('users').doc(this.currentUser.id).update(updateData);
        await db.collection('notifications').add({
          userId: this.currentUser.id,
          title: relatedNotification.title,
          message: relatedNotification.message,
          type: relatedNotification.type,
          isRead: false,
          eventId: this.currentEvent?.id || this.currentEventDetail?.id || null,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(err => console.error('시험 결과 알림 저장 오류:', err));

        if (examDocKey) {
          try {
            await db.collection('mission_exam_submissions').doc(examDocKey).set({
              ...newSubmission,
              createdAt: existingExamDoc?.createdAt || Date.now()
            }, { merge: true });
          } catch (aggregateErr) {
            console.error('사명자 시험 이름 기준 내역 저장 오류:', aggregateErr);
          }
        }

        this.currentUser.examSubmission = newSubmission;
        if (isNewBest && pointDiff > 0) {
          this.currentUser.points = (this.currentUser.points || 0) + pointDiff;
        }
        this.showToast(`✅ 사명자 시험 완료! 점수: ${score}점 ${isNewBest && pointDiff>0 ? `(+${pointDiff}P 지급)` : ''}`);
      } catch(err) {
        console.error('시험 저장 오류:', err);
      }
    }
  }

  // ============================================================

  clearIntervals() {
    if (this.gameTimerInterval) {
      clearInterval(this.gameTimerInterval);
      this.gameTimerInterval = null;
    }
  }

  // 9. Modal Management
  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      if (modalId === 'modalFindId') {
        document.getElementById('findIdName').value = '';
        document.getElementById('findIdEmail').value = '';
        const resultEl = document.getElementById('findIdResult');
        resultEl.style.display = 'none';
        resultEl.innerHTML = '';
      } else if (modalId === 'modalFindPassword') {
        document.getElementById('findPwUsername').value = '';
        document.getElementById('findPwName').value = '';
        document.getElementById('findPwEmail').value = '';
        const resultEl = document.getElementById('findPwResult');
        resultEl.style.display = 'none';
        resultEl.innerHTML = '';
      }
      modal.style.display = 'flex';
      // Trigger CSS reflow
      modal.offsetHeight;
      modal.classList.add('active');
      document.body.classList.add('modal-open');
      
      if (modalId === 'modalEventAnnouncement') {
        document.body.classList.add('hide-bottom-nav');
        this.postNativeBottomNavHidden(true);
        setTimeout(() => this.postNativeBottomNavHidden(true), 80);
      }
      
      this.syncNativeRouteChromeForModal(modalId, true);
    }
  }

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('active');
      setTimeout(() => {
        modal.style.display = 'none';
        const hasActiveModal = Array.from(document.querySelectorAll('.modal-overlay')).some(el => el.classList.contains('active'));
        document.body.classList.toggle('modal-open', hasActiveModal);
        
        if (modalId === 'modalEventAnnouncement') {
          const shouldHide = ['game', 'exam', 'auth', 'journeyChapterDetail', 'journeyVerseSelect', 'journeyVerseStudy', 'journeyResult', 'eventDetail', 'noticeDetail'].includes(this.currentViewName);
          document.body.classList.toggle('hide-bottom-nav', shouldHide);
          this.postNativeBottomNavHidden(shouldHide);
        }
        
        this.syncNativeRouteChromeForModal(modalId, false);
      }, 300);
    }
  }

  postNativeBottomNavHidden(hidden) {
    if (!this.isMobileApp || !window.MobileAppChannel) return;
    window.MobileAppChannel.postMessage(JSON.stringify({
      event: 'hide_bottom_nav',
      hidden
    }));
  }

  syncNativeRouteChromeForModal(modalId, hidden) {
    if (!this.isMobileApp || !window.MobileAppChannel) return;
    
    if (modalId === 'modalEventAnnouncement') {
      let actualHidden = hidden;
      if (!hidden) {
        const shouldHide = ['game', 'exam', 'auth', 'journeyChapterDetail', 'journeyVerseSelect', 'journeyVerseStudy', 'journeyResult', 'eventDetail', 'noticeDetail'].includes(this.currentViewName);
        actualHidden = shouldHide;
      }
      window.MobileAppChannel.postMessage(JSON.stringify({
        event: 'hide_bottom_nav',
        hidden: actualHidden
      }));
      return;
    }
    
    if (!document.body.classList.contains('native-route-active')) return;
    if (!['modalChapterVerses'].includes(modalId)) return;
    window.MobileAppChannel.postMessage(JSON.stringify({
      event: 'native_route_chrome',
      hidden
    }));
  }

  findUserUsername() {
    const nameVal = document.getElementById('findIdName').value.trim();
    const emailVal = document.getElementById('findIdEmail').value.trim();
    const resultEl = document.getElementById('findIdResult');

    if (!nameVal || !emailVal) {
      alert('이름과 이메일 주소를 모두 입력해주세요.');
      return;
    }

    // Search in local users cache
    let matchedUser = this.users.find(u => 
      u.name && u.name.trim() === nameVal && 
      u.email && u.email.trim().toLowerCase() === emailVal.toLowerCase()
    );

    let foundUsername = null;
    if (matchedUser) {
      foundUsername = matchedUser.username;
    } else {
      // Search in SEED_USERS
      for (const [key, val] of Object.entries(SEED_USERS)) {
        if (val.name && val.name.trim() === nameVal && 
            val.email && val.email.trim().toLowerCase() === emailVal.toLowerCase()) {
          foundUsername = key;
          break;
        }
      }
    }

    resultEl.style.display = 'block';
    if (foundUsername) {
      resultEl.style.color = 'var(--text-primary)';
      resultEl.style.backgroundColor = 'rgba(139, 92, 246, 0.1)';
      resultEl.style.borderColor = 'rgba(139, 92, 246, 0.3)';
      resultEl.innerHTML = `입력하신 정보와 일치하는 아이디는<br><strong style="font-size: 1.15rem; color: var(--accent-purple);">${foundUsername}</strong> 입니다.`;
    } else {
      resultEl.style.color = 'var(--accent-rose)';
      resultEl.style.backgroundColor = 'rgba(244, 63, 94, 0.1)';
      resultEl.style.borderColor = 'rgba(244, 63, 94, 0.3)';
      resultEl.innerHTML = `입력하신 정보와 일치하는 아이디를 찾을 수 없습니다.`;
    }
  }

  findUserPassword() {
    const usernameVal = document.getElementById('findPwUsername').value.trim();
    const nameVal = document.getElementById('findPwName').value.trim();
    const emailVal = document.getElementById('findPwEmail').value.trim();
    const resultEl = document.getElementById('findPwResult');

    if (!usernameVal || !nameVal || !emailVal) {
      alert('아이디, 이름, 이메일 주소를 모두 입력해주세요.');
      return;
    }

    resultEl.style.display = 'block';
    resultEl.style.color = 'var(--text-primary)';
    resultEl.style.backgroundColor = 'rgba(139, 92, 246, 0.1)';
    resultEl.style.borderColor = 'rgba(139, 92, 246, 0.3)';
    resultEl.innerHTML = `정보를 확인하고 있습니다. 잠시만 기다려주세요...`;

    // Submit password reset request to Firestore
    db.collection('password_resets').add({
      username: usernameVal,
      name: nameVal,
      email: emailVal.toLowerCase(),
      status: 'pending',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    })
    .then(docRef => {
      // Listen to status changes on the request document
      const unsubscribe = docRef.onSnapshot(doc => {
        if (!doc.exists) return;
        const data = doc.data();
        
        if (data.status === 'email_updated') {
          unsubscribe();
          // Now that Auth email is updated to real email, trigger sendPasswordResetEmail client-side!
          auth.sendPasswordResetEmail(emailVal.toLowerCase())
            .then(() => {
              resultEl.style.color = 'var(--accent-emerald)';
              resultEl.style.backgroundColor = 'rgba(16, 185, 129, 0.1)';
              resultEl.style.borderColor = 'rgba(16, 185, 129, 0.3)';
              resultEl.innerHTML = `비밀번호 재설정 이메일이 발송되었습니다.<br><strong style="color: var(--accent-emerald);">${emailVal}</strong> 이메일 수신함을 확인해주세요.`;
              docRef.update({ status: 'sent' }).catch(console.error);
            })
            .catch(authErr => {
              console.error("Auth sendPasswordResetEmail error:", authErr);
              resultEl.style.color = 'var(--accent-rose)';
              resultEl.style.backgroundColor = 'rgba(244, 63, 94, 0.1)';
              resultEl.style.borderColor = 'rgba(244, 63, 94, 0.3)';
              resultEl.innerHTML = `이메일 발송에 실패했습니다: ${authErr.message}`;
              docRef.update({ status: 'failed', error: authErr.message }).catch(console.error);
            });
        } else if (data.status === 'failed') {
          unsubscribe();
          resultEl.style.color = 'var(--accent-rose)';
          resultEl.style.backgroundColor = 'rgba(244, 63, 94, 0.1)';
          resultEl.style.borderColor = 'rgba(244, 63, 94, 0.3)';
          resultEl.innerHTML = data.error || '입력하신 정보와 일치하는 계정을 찾을 수 없습니다.';
        }
      });
    })
    .catch(err => {
      console.error("Password reset request error:", err);
      resultEl.style.color = 'var(--accent-rose)';
      resultEl.style.backgroundColor = 'rgba(244, 63, 94, 0.1)';
      resultEl.style.borderColor = 'rgba(244, 63, 94, 0.3)';
      resultEl.innerHTML = `요청 처리 중 오류가 발생했습니다.<br>잠시 후 다시 시도해주세요.`;
    });
  }

  confirmResetAndReview() {
    if (!this.currentUser) return;
    this.closeModal('modalReviewConfirm');
    if (this.currentUser.isTrial) {
      this.currentUser.currentVerseIndex = 0;
      this.currentUser.lastMissionDate = null;
      const bibleData = window.BIBLE_DATA;
      this.currentQuizVerse = bibleData[0];
      this.switchView('game');
      this.initializeQuiz();
      return;
    }
    db.collection('users').doc(this.currentUser.id).update({
      currentVerseIndex: 0,
      lastMissionDate: null
    }).then(() => {
      this.currentUser.currentVerseIndex = 0;
      this.currentUser.lastMissionDate = null;
      const bibleData = window.BIBLE_DATA;
      this.currentQuizVerse = bibleData[0];
      this.switchView('game');
      this.initializeQuiz();
    }).catch(err => {
      console.error(err);
      alert('오류가 발생했습니다. 다시 시도해주세요.');
    });
  }
  withdrawAccount() {
    const user = firebase.auth().currentUser;
    if (!user) {
      alert('로그인 상태가 아닙니다.');
      return;
    }

    this.closeModal('modalWithdraw');

    // Delete Firestore document first
    db.collection('users').doc(user.uid).delete()
      .then(() => {
        // Then delete Firebase Auth user
        return user.delete();
      })
      .then(() => {
        alert('회원 탈퇴가 완료되었습니다. 이용해 주셔서 감사합니다.');
        this.logout();
      })
      .catch(err => {
        console.error("Error during withdrawal:", err);
        if (err.code === 'auth/requires-recent-login') {
          alert('보안을 위해 최근 로그인 기록이 필요합니다. 다시 로그인하신 후 탈퇴를 진행해주세요.');
        } else {
          alert('회원 탈퇴 처리 중 오류가 발생했습니다. 고객센터로 문의해주세요.');
        }
        this.logout();
      });
  }

  handleDirectPathRouting() {
    const path = decodeURIComponent(window.location.pathname);
    if (path === '/privacy' || path === '/Terms_of_Use' || path === '/Terms of Use' || path.startsWith('/Delete_account') || path.startsWith('/Delete accoun') || path === '/Delete account' || path === '/points_policy' || path === '/points policy') {
      // Hide normal app elements
      document.body.classList.add('single-path-route');
      
      // Wait for DOM content to be fully loaded
      const applyRouting = () => {
        const header = document.querySelector('header');
        if (header) header.style.display = 'none';
        const main = document.querySelector('main');
        if (main) main.style.display = 'none';
        const footer = document.querySelector('footer');
        if (footer) footer.style.display = 'none';
        
        const singleView = document.getElementById('singlePathView');
        if (singleView) {
          singleView.style.display = 'flex';
          const iconEl = document.getElementById('singlePathIcon');
          const titleEl = document.getElementById('singlePathTitle');
          const bodyEl = document.getElementById('singlePathBody');
          
          if (path === '/privacy') {
            if (iconEl) iconEl.textContent = 'security';
            if (titleEl) titleEl.textContent = '개인정보처리방침';
            const privacyModalContent = document.querySelector('#modalPrivacy .terms-content');
            if (bodyEl && privacyModalContent) {
              bodyEl.innerHTML = privacyModalContent.innerHTML;
            }
          } else if (path === '/Terms_of_Use' || path === '/Terms of Use') {
            if (iconEl) iconEl.textContent = 'gavel';
            if (titleEl) titleEl.textContent = '이용약관';
            const termsModalContent = document.querySelector('#modalTerms .terms-content');
            if (bodyEl && termsModalContent) {
              bodyEl.innerHTML = termsModalContent.innerHTML;
            }
          } else if (path === '/points_policy' || path === '/points policy') {
            if (iconEl) iconEl.textContent = 'monetization_on';
            if (titleEl) titleEl.textContent = '포인트 정책';
            const pointsModalContent = document.querySelector('#modalPoints .terms-content');
            if (bodyEl && pointsModalContent) {
              bodyEl.innerHTML = pointsModalContent.innerHTML;
            }
          } else {
            // Delete account path
            if (iconEl) iconEl.textContent = 'person_remove';
            if (titleEl) titleEl.textContent = '회원 탈퇴';
            
            if (bodyEl) {
              bodyEl.innerHTML = `
                <div class="withdrawal-wrapper" style="text-align: center;">
                  <p style="font-weight: bold; color: var(--text-primary); margin-top: 0;">회원 탈퇴 시 아래 정보가 삭제되거나 소멸됩니다.</p>
                  <ul style="text-align: left; display: inline-block; padding-left: 1.2rem; margin: 0.5rem 0; color: var(--text-secondary); line-height: 1.6;">
                    <li>계정 정보</li>
                    <li>이름</li>
                    <li>이메일 주소</li>
                    <li>아이디</li>
                    <li>성경 문구 답안 작성 내역</li>
                    <li>학습 진행도</li>
                    <li>출석 기록</li>
                    <li>포인트 적립 및 사용 내역</li>
                  </ul>
                  <p style="color: #ef4444; font-weight: bold; margin-top: 1rem;">탈퇴 후 삭제된 정보와 소멸된 포인트는 복구할 수 없습니다.</p>
                  <p style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.4; margin-top: 0.5rem;">비밀번호는 Simon Edu가 별도 데이터베이스에 저장하지 않으며, Firebase Authentication을 통해 인증 처리됩니다.</p>
                  <div id="withdrawalAuthArea" style="margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px dashed var(--glass-border);">
                    <p style="color: var(--text-muted); margin-bottom: 1rem;">상태를 조회하는 중입니다...</p>
                  </div>
                </div>
              `;
              
              firebase.auth().onAuthStateChanged(user => {
                const authArea = document.getElementById('withdrawalAuthArea');
                if (!authArea) return;
                
                if (user) {
                  authArea.innerHTML = `
                    <p style="font-weight: bold; color: var(--text-primary); margin-bottom: 1rem;">정말 회원 탈퇴를 진행하시겠습니까?</p>
                    <div style="display: flex; gap: 0.75rem; justify-content: center;">
                      <button class="btn-primary" style="background: var(--accent-rose); border: none; padding: 0.6rem 1.5rem; border-radius: 8px; font-weight: bold; color: white; cursor: pointer;" onclick="app.withdrawAccount()">탈퇴 진행하기</button>
                    </div>
                  `;
                } else {
                  authArea.innerHTML = `
                    <p style="color: var(--text-muted); margin-bottom: 1rem;">회원 탈퇴를 진행하려면 로그인이 필요합니다.</p>
                    <button class="btn-primary" style="background: var(--accent-purple); border: none; padding: 0.6rem 1.5rem; border-radius: 8px; font-weight: bold; color: white; cursor: pointer;" onclick="window.location.href='/'">로그인하러 가기</button>
                  `;
                }
              });
            }
          }
        }
      };
      
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applyRouting);
      } else {
        applyRouting();
      }
    }
  }

  // 10. Administrator Panel Dashboard Logic
  renderAdmin() {
    if (!this.currentUser || this.currentUser.role !== 'admin') {
      alert('관리자 권한이 없습니다.');
      this.switchView('dashboard');
      return;
    }

    // Gather Stats
    const totalUsers = this.users.length;
    
    let totalPoints = 0;
    let totalClearedVerses = 0;
    this.users.forEach(u => {
      totalPoints += u.points;
      totalClearedVerses += u.currentVerseIndex;
    });

    const avgPoints = totalUsers > 0 ? Math.round(totalPoints / totalUsers) : 0;
    const avgCleared = totalUsers > 0 ? (totalClearedVerses / totalUsers).toFixed(1) : "0.0";

    // Set stat fields
    const statUsers = document.getElementById('adminStatUsers');
    if (statUsers) statUsers.textContent = totalUsers;
    const statAvgPoints = document.getElementById('adminStatAvgPoints');
    if (statAvgPoints) statAvgPoints.textContent = avgPoints.toLocaleString();
    const statTotalCleared = document.getElementById('adminStatTotalCleared');
    if (statTotalCleared) statTotalCleared.textContent = `${avgCleared} 절`;

    // Render User Management Table
    const tableBody = document.getElementById('adminUserTableBody');
    if (tableBody) {
      tableBody.innerHTML = '';

      this.users.forEach(u => {
        const tr = document.createElement('tr');
        
        const lastCheck = u.lastCheckInDate ? u.lastCheckInDate : '출석 없음';
        const maxVerse = window.BIBLE_DATA.length;
        const progressStr = u.currentVerseIndex >= maxVerse ? '완독 완료' : `${u.currentVerseIndex + 1}절 진행 중`;

        tr.innerHTML = `
          <td style="font-family:var(--font-en); font-weight:600; color:var(--accent-purple);">${u.username || u.id}</td>
          <td style="font-weight:700;">${u.name}</td>
          <td>${u.email}</td>
          <td><span class="btn-admin-action edit" style="cursor:default; background:${u.role === 'admin'?'rgba(147, 51, 234, 0.15)':'rgba(255,255,255,0.05)'}; color:${u.role==='admin'?'var(--accent-purple)':'var(--text-secondary)'}">${u.role.toUpperCase()}</span></td>
          <td style="font-family:var(--font-en); font-weight:700; color:var(--accent-amber);">${u.points.toLocaleString()} P</td>
          <td>🔥 ${u.consecutiveCheckIns}일 (${lastCheck})</td>
          <td>${progressStr}</td>
          <td class="actions">
            <button class="btn-admin-action edit" onclick="app.adminGivePoints('${u.id}')">보너스 100P</button>
            <button class="btn-admin-action reset" onclick="app.adminResetProgress('${u.id}')">진도 리셋</button>
            ${u.id !== this.currentUser.id ? `<button class="btn-admin-action reset" style="background:rgba(244,63,94,0.1); border-color:rgba(244,63,94,0.2)" onclick="app.adminDeleteUser('${u.id}')">삭제</button>` : ''}
          </td>
        `;

        tableBody.appendChild(tr);
      });
    }
  }

  // Admin Action Methods
  adminGivePoints(userId) {
    this.addPoints(userId, 100);
    this.showPointsFloater(100, "관리자 보너스 지급!");
    this.renderAdmin();
  }

  adminResetProgress(userId) {
    const user = this.users.find(u => u.id === userId);
    if (user) {
      if (confirm(`정말 ${user.name}님의 말씀 암송 진도를 1절부터 초기화하시겠습니까?`)) {
        db.collection('users').doc(userId).update({
          currentVerseIndex: 0
        }).catch(err => console.error(err));
      }
    }
  }

  adminDeleteUser(userId) {
    const user = this.users.find(u => u.id === userId);
    if (user) {
      if (confirm(`정말 사용자 "${user.name}" 계정을 플랫폼에서 삭제하시겠습니까?`)) {
        db.collection('users').doc(userId).delete()
          .catch(err => console.error(err));
      }
    }
  }

  // 11. Debug Simulation / Cheat Engine Controls
  // Simulate days passing
  demoFastForwardDays(days) {
    if (!this.currentUser) return;
    
    let lastCheckInDate = this.currentUser.lastCheckInDate;
    let lastMissionDate = this.currentUser.lastMissionDate;
    
    if (lastCheckInDate) {
      const dateObj = new Date(lastCheckInDate);
      dateObj.setDate(dateObj.getDate() - days);
      lastCheckInDate = dateObj.toISOString().split('T')[0];
    }
    if (lastMissionDate) {
      const dateObj = new Date(lastMissionDate);
      dateObj.setDate(dateObj.getDate() - days);
      lastMissionDate = dateObj.toISOString().split('T')[0];
    }

    if (this.currentUser.isTrial) {
      this.currentUser.lastCheckInDate = lastCheckInDate;
      this.currentUser.lastMissionDate = lastMissionDate;
      alert(`시간을 ${days}일 앞으로 이동시켰습니다! (출석 체크 및 일일 암송 미션이 리셋되어, 다음 절 말씀을 바로 암송하고 출석을 이어나갈 수 있습니다.)`);
      return;
    }

    db.collection('users').doc(this.currentUser.id).update({
      lastCheckInDate: lastCheckInDate,
      lastMissionDate: lastMissionDate
    }).then(() => {
      alert(`시간을 ${days}일 앞으로 이동시켰습니다! (출석 체크 및 일일 암송 미션이 리셋되어, 다음 절 말씀을 바로 암송하고 출석을 이어나갈 수 있습니다.)`);
    }).catch(err => console.error(err));
  }

  demoResetAttendance() {
    if (!this.currentUser) return;
    
    const todayStr = this.getRelativeDateStr(0);
    if (this.currentUser.isTrial) {
      this.currentUser.lastCheckInDate = null;
      if (this.currentUser.checkInHistory) {
        this.currentUser.checkInHistory = this.currentUser.checkInHistory.filter(d => d !== todayStr);
      }
      alert('오늘의 출석 체크 기록이 리셋되었습니다. 대시보드에서 출석을 진행해 보세요!');
      return;
    }
    db.collection('users').doc(this.currentUser.id).update({
      lastCheckInDate: null,
      checkInHistory: firebase.firestore.FieldValue.arrayRemove(todayStr)
    }).then(() => {
      alert('오늘의 출석 체크 기록이 리셋되었습니다. 대시보드에서 출석을 진행해 보세요!');
    }).catch(err => console.error(err));
  }

  demoAddPointsToMe(pts) {
    if (!this.currentUser) return;
    
    const newNotification = {
      id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      message: `🎁 시뮬레이터 치트 작동! +${pts}P`,
      timestamp: Date.now(),
      read: false
    };

    const cheatHistory = {
      id: 'hist_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      type: 'admin',
      title: '시뮬레이터 치트 보상',
      amount: pts,
      date: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
    };

    if (this.currentUser.isTrial) {
      this.currentUser.points += pts;
      if (!this.currentUser.notifications) this.currentUser.notifications = [];
      this.currentUser.notifications.push(newNotification);
      if (!this.currentUser.pointsHistory) this.currentUser.pointsHistory = [];
      this.currentUser.pointsHistory.push(cheatHistory);
      this.showPointsFloater(pts, "시뮬레이터 치트 작동!");
      const navPoints = document.getElementById('navPoints');
      if (navPoints) navPoints.textContent = this.currentUser.points;
      return;
    }

    db.collection('users').doc(this.currentUser.id).update({
      points: firebase.firestore.FieldValue.increment(pts),
      notifications: firebase.firestore.FieldValue.arrayUnion(newNotification),
      pointsHistory: firebase.firestore.FieldValue.arrayUnion(cheatHistory)
    }).then(() => {
      this.showPointsFloater(pts, "시뮬레이터 치트 작동!");
    }).catch(err => console.error(err));
  }

  demoNextVerse() {
    if (!this.currentUser) return;

    const nextIdx = this.currentUser.currentVerseIndex + 1;
    if (nextIdx <= window.BIBLE_DATA.length) {
      if (this.currentUser.isTrial) {
        this.currentUser.currentVerseIndex = nextIdx;
        alert(`치트: 다음 절이 성공적으로 해금되었습니다. (현재 ${nextIdx + 1}절 진행 중)`);
        this.renderDashboard();
        return;
      }
      db.collection('users').doc(this.currentUser.id).update({
        currentVerseIndex: nextIdx
      }).then(() => {
        alert(`치트: 다음 절이 성공적으로 해금되었습니다. (현재 ${nextIdx + 1}절 진행 중)`);
      }).catch(err => console.error(err));
    } else {
      alert('이미 요한계시록 마지막 절까지 완료 상태입니다.');
    }
  }

  demoResetAllUsers() {
    if (confirm('정말로 본인 계정의 데이터와 암송 진행도를 초기 가입 상태로 되돌리시겠습니까?')) {
      if (this.currentUser.isTrial) {
        this.currentUser.points = 0;
        this.currentUser.consecutiveCheckIns = 0;
        this.currentUser.lastCheckInDate = null;
        this.currentUser.checkInHistory = [];
        this.currentUser.currentVerseIndex = 0;
        this.currentUser.lastMissionDate = null;
        alert('사용자 정보와 포인트가 초기 상태로 재설정되었습니다.');
        this.renderDashboard();
        return;
      }
      db.collection('users').doc(this.currentUser.id).update({
        points: 0,
        consecutiveCheckIns: 0,
        lastCheckInDate: null,
        checkInHistory: [],
        currentVerseIndex: 0,
        lastMissionDate: null
      }).then(() => {
        alert('사용자 정보와 포인트가 초기 상태로 재설정되었습니다.');
      }).catch(err => console.error(err));
    }
  }

  renderSettings() {
    if (!this.currentUser) return;

    // 1. Fill in profile card info
    const avatar = document.getElementById('settingsAvatar');
    if (avatar) avatar.textContent = this.currentUser.name ? this.currentUser.name.charAt(0) : 'U';
    
    const username = document.getElementById('settingsUsername');
    if (username) username.textContent = this.currentUser.name || '사용자';
    
    const email = document.getElementById('settingsUserEmail');
    if (email) email.textContent = this.currentUser.email || '';
    
    const points = document.getElementById('settingsPoints');
    if (points) points.textContent = this.currentUser.points || 0;

    // 2. Set toggle states from Firestore fields (default to true for pushEnabled if undefined, false for marketingPushEnabled)
    const pushEnabled = this.currentUser.pushEnabled !== false; // defaults to true if not explicitly false
    const marketingPushEnabled = !!this.currentUser.marketingPushEnabled; // defaults to false

    const togglePush = document.getElementById('togglePush');
    const toggleMarketingPush = document.getElementById('toggleMarketingPush');
    const rowMarketingPush = document.getElementById('rowMarketingPush');

    // Skip overwriting toggle states if a toggle action is currently in progress
    // (prevents Firestore snapshot listener from reverting the user's click)
    if (!this._settingsToggleBusy) {
      if (togglePush) {
        togglePush.checked = pushEnabled;
      }
      
      if (toggleMarketingPush) {
        toggleMarketingPush.checked = marketingPushEnabled;
        toggleMarketingPush.disabled = !pushEnabled;
      }
      
      if (rowMarketingPush) {
        rowMarketingPush.style.opacity = pushEnabled ? '1' : '0.5';
      }
    }

    // 3. Request native app to check permission
    if (this.isMobileApp && window.MobileAppChannel) {
      window.MobileAppChannel.postMessage(JSON.stringify({
        event: 'check_device_permission'
      }));
    } else {
      // On web/desktop, hide warning banner since we don't support native permission
      const warningBanner = document.getElementById('settingsWarningBanner');
      if (warningBanner) warningBanner.style.display = 'none';
    }


  }

  updateDevicePermissionStatus(isGranted) {
    const warningBanner = document.getElementById('settingsWarningBanner');
    const togglePush = document.getElementById('togglePush');

    if (warningBanner) {
      warningBanner.style.display = isGranted ? 'none' : 'flex';
    }

    if (isGranted && togglePush && !togglePush.checked) {
      togglePush.checked = true;
      
      if (this.currentUser && this.currentUser.isTrial) {
        this.currentUser.pushEnabled = true;
        const toggleMarketingPush = document.getElementById('toggleMarketingPush');
        const rowMarketingPush = document.getElementById('rowMarketingPush');
        if (toggleMarketingPush) toggleMarketingPush.disabled = false;
        if (rowMarketingPush) rowMarketingPush.style.opacity = '1';
        return;
      }

      // Trigger the update in Firestore
      db.collection('users').doc(this.currentUser.id).update({
        pushEnabled: true
      }).catch(err => console.error("Error updating pushEnabled:", err));
      
      // Enable sub-toggle
      const toggleMarketingPush = document.getElementById('toggleMarketingPush');
      const rowMarketingPush = document.getElementById('rowMarketingPush');
      if (toggleMarketingPush) toggleMarketingPush.disabled = false;
      if (rowMarketingPush) rowMarketingPush.style.opacity = '1';
    }
  }

  scrollToNotificationSettings() {
    const card = document.querySelector('.settings-notifications-card');
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  togglePushSetting() {
    if (!this.currentUser) return;
    
    const togglePush = document.getElementById('togglePush');
    if (!togglePush) return;
    
    const isChecked = togglePush.checked;
    
    // Set busy flag to prevent renderSettings from overwriting toggle state
    this._settingsToggleBusy = true;

    if (isChecked) {
      // User is turning Push ON. 
      // If we are on mobile app, also request device permission
      if (this.isMobileApp && window.MobileAppChannel) {
        const warningBanner = document.getElementById('settingsWarningBanner');
        if (warningBanner && warningBanner.style.display !== 'none') {
          // Send request permission message
          window.MobileAppChannel.postMessage(JSON.stringify({
            event: 'request_device_permission'
          }));
        }
      }
      
      if (this.currentUser.isTrial) {
        this.currentUser.pushEnabled = true;
        const toggleMarketingPush = document.getElementById('toggleMarketingPush');
        const rowMarketingPush = document.getElementById('rowMarketingPush');
        if (toggleMarketingPush) toggleMarketingPush.disabled = false;
        if (rowMarketingPush) rowMarketingPush.style.opacity = '1';
        this._settingsToggleBusy = false;
        return;
      }

      // Update firestore regardless of device permission status
      db.collection('users').doc(this.currentUser.id).update({
        pushEnabled: true
      }).then(() => {
        // Enable sub-toggle UI
        const toggleMarketingPush = document.getElementById('toggleMarketingPush');
        const rowMarketingPush = document.getElementById('rowMarketingPush');
        if (toggleMarketingPush) toggleMarketingPush.disabled = false;
        if (rowMarketingPush) rowMarketingPush.style.opacity = '1';
      }).catch(err => console.error("Error updating pushEnabled:", err))
        .finally(() => { this._settingsToggleBusy = false; });
      
    } else {
      // User is turning Push OFF.
      if (this.currentUser.isTrial) {
        this.currentUser.pushEnabled = false;
        this.currentUser.marketingPushEnabled = false;
        const toggleMarketingPush = document.getElementById('toggleMarketingPush');
        const rowMarketingPush = document.getElementById('rowMarketingPush');
        if (toggleMarketingPush) {
          toggleMarketingPush.checked = false;
          toggleMarketingPush.disabled = true;
        }
        if (rowMarketingPush) {
          rowMarketingPush.style.opacity = '0.5';
        }
        this._settingsToggleBusy = false;
        return;
      }

      db.collection('users').doc(this.currentUser.id).update({
        pushEnabled: false,
        marketingPushEnabled: false
      }).then(() => {
        // Update UI locally
        const toggleMarketingPush = document.getElementById('toggleMarketingPush');
        const rowMarketingPush = document.getElementById('rowMarketingPush');
        if (toggleMarketingPush) {
          toggleMarketingPush.checked = false;
          toggleMarketingPush.disabled = true;
        }
        if (rowMarketingPush) {
          rowMarketingPush.style.opacity = '0.5';
        }
      }).catch(err => console.error("Error updating pushEnabled:", err))
        .finally(() => { this._settingsToggleBusy = false; });
    }
  }

  toggleMarketingPushSetting() {
    if (!this.currentUser) return;
    
    const toggleMarketingPush = document.getElementById('toggleMarketingPush');
    if (!toggleMarketingPush) return;
    
    const isChecked = toggleMarketingPush.checked;
    
    // Set busy flag to prevent renderSettings from overwriting toggle state
    this._settingsToggleBusy = true;
    
    if (isChecked) {
      // User toggled it ON. We must show the consent modal `#modalMarketingConsent`.
      const modal = document.getElementById('modalMarketingConsent');
      if (modal) {
        modal.classList.add('active');
        modal.style.display = 'flex';
      }
      // Busy flag will be cleared by acceptMarketingConsent callback
    } else {
      // User toggled it OFF. Update Firestore.
      if (this.currentUser.isTrial) {
        this.currentUser.marketingPushEnabled = false;
        this.currentUser.marketingAgreedDate = null;
        this._settingsToggleBusy = false;
        return;
      }

      db.collection('users').doc(this.currentUser.id).update({
        marketingPushEnabled: false,
        marketingAgreedDate: null
      }).catch(err => console.error("Error updating marketingPushEnabled:", err))
        .finally(() => { this._settingsToggleBusy = false; });
    }
  }

  acceptMarketingConsent(agreed) {
    const modal = document.getElementById('modalMarketingConsent');
    if (modal) {
      modal.classList.remove('active');
      modal.style.display = 'none';
    }

    const toggleMarketingPush = document.getElementById('toggleMarketingPush');

    if (agreed) {
      if (!this.currentUser) { this._settingsToggleBusy = false; return; }
      const todayStr = new Date().toISOString();
      
      if (this.currentUser.isTrial) {
        this.currentUser.marketingPushEnabled = true;
        this.currentUser.marketingAgreedDate = todayStr;
        alert("마케팅 정보 수신에 동의하셨습니다. (동의 일시: " + new Date(todayStr).toLocaleString() + ")");
        this._settingsToggleBusy = false;
        return;
      }

      db.collection('users').doc(this.currentUser.id).update({
        marketingPushEnabled: true,
        marketingAgreedDate: todayStr
      }).then(() => {
        alert("마케팅 정보 수신에 동의하셨습니다. (동의 일시: " + new Date(todayStr).toLocaleString() + ")");
      }).catch(err => console.error("Error updating marketingPushEnabled:", err))
        .finally(() => { this._settingsToggleBusy = false; });
    } else {
      if (toggleMarketingPush) {
        toggleMarketingPush.checked = false;
      }
      if (this.currentUser) {
        if (this.currentUser.isTrial) {
          this.currentUser.marketingPushEnabled = false;
          this.currentUser.marketingAgreedDate = null;
          this._settingsToggleBusy = false;
          return;
        }

        db.collection('users').doc(this.currentUser.id).update({
          marketingPushEnabled: false,
          marketingAgreedDate: null
        }).catch(err => console.error("Error reverting marketingPushEnabled:", err))
          .finally(() => { this._settingsToggleBusy = false; });
      } else {
        this._settingsToggleBusy = false;
      }
    }
  }

  updatePushToken(token) {
    if (!this.currentUser) return;
    if (this.currentUser.pushToken === token) return; // avoid duplicate updates
    
    this.currentUser.pushToken = token;
    if (this.currentUser.isTrial) return;
    
    db.collection('users').doc(this.currentUser.id).update({
      pushToken: token
    }).then(() => {
      console.log("Push token successfully updated in Firestore:", token);
    }).catch(err => {
      console.error("Error updating push token in Firestore:", err);
    });
  }

  updateDevicePlatform(os) {
    if (!this.currentUser) return;
    if (this.currentUser.os === os) return; // avoid duplicate updates
    
    this.currentUser.os = os;
    if (this.currentUser.isTrial) return;
    
    db.collection('users').doc(this.currentUser.id).update({
      os: os
    }).then(() => {
      console.log("Device platform successfully updated in Firestore:", os);
    }).catch(err => {
      console.error("Error updating device platform in Firestore:", err);
    });
  }

  // --- Crew & Battle Arena Arena Logic ---

  createCrew(fromModal = false) {
    if (!this.currentUser) {
      alert("로그인이 필요합니다.");
      return;
    }
    if (this.currentUser.isTrial) {
      alert("체험 모드에서는 크루를 창설할 수 없습니다.");
      return;
    }
    
    const inputId = fromModal ? 'inputCrewNameModal' : 'inputCrewNameInline';
    const input = document.getElementById(inputId);
    if (!input) return;
    
    const crewName = input.value.trim();
    if (crewName.length < 2) {
      alert("크루 이름은 최소 2글자 이상이어야 합니다.");
      return;
    }
    
    // Check if crew name already exists
    const nameExists = this.crews && this.crews.some(c => c.name.toLowerCase() === crewName.toLowerCase());
    if (nameExists) {
      alert("이미 존재하는 크루 이름입니다. 다른 이름을 입력해주세요.");
      return;
    }
    
    // Create crew document
    db.collection('crews').add({
      name: crewName,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      leaderId: this.currentUser.id,
      leaderName: this.currentUser.name,
      points: 0,
      memberCount: 1
    }).then(docRef => {
      // Update user with crew information
      db.collection('users').doc(this.currentUser.id).update({
        crewId: docRef.id,
        crewName: crewName
      }).then(() => {
        this.currentUser.crewId = docRef.id;
        this.currentUser.crewName = crewName;
        input.value = '';
        if (fromModal) {
          this.closeModal('modalCreateCrew');
        }
        this.showToast(`👥 [${crewName}] 크루가 성공적으로 창설되었습니다!`);
        this.renderCrewHub();
      });
    }).catch(err => {
      console.error("Error creating crew:", err);
      alert("크루 창설에 실패했습니다.");
    });
  }

  joinCrew(crewId, crewName) {
    if (!this.currentUser) {
      alert("로그인이 필요합니다.");
      return;
    }
    if (this.currentUser.isTrial) {
      alert("체험 모드에서는 크루에 가입할 수 없습니다.");
      return;
    }
    if (this.currentUser.crewId) {
      alert("이미 가입된 크루가 있습니다. 먼저 탈퇴해야 합니다.");
      return;
    }
    
    // Update user
    db.collection('users').doc(this.currentUser.id).update({
      crewId: crewId,
      crewName: crewName
    }).then(() => {
      // Increment crew count
      db.collection('crews').doc(crewId).update({
        memberCount: firebase.firestore.FieldValue.increment(1)
      });
      
      this.currentUser.crewId = crewId;
      this.currentUser.crewName = crewName;
      this.showToast(`👥 [${crewName}] 크루에 가입했습니다!`);
      this.renderCrewHub();
    }).catch(err => {
      console.error("Error joining crew:", err);
      alert("크루 가입에 실패했습니다.");
    });
  }

  leaveCrew() {
    if (!this.currentUser || !this.currentUser.crewId) return;
    
    const crewId = this.currentUser.crewId;
    const crewName = this.currentUser.crewName;
    
    if (!confirm(`정말로 [${crewName}] 크루를 탈퇴하시겠습니까?`)) return;
    
    // Update user
    db.collection('users').doc(this.currentUser.id).update({
      crewId: null,
      crewName: null
    }).then(() => {
      // Decrement crew count
      db.collection('crews').doc(crewId).get().then(doc => {
        if (doc.exists) {
          const crew = doc.data();
          if (crew.memberCount <= 1) {
            // Delete crew if no members left
            db.collection('crews').doc(crewId).delete();
          } else {
            db.collection('crews').doc(crewId).update({
              memberCount: firebase.firestore.FieldValue.increment(-1)
            });
          }
        }
      });
      
      this.currentUser.crewId = null;
      this.currentUser.crewName = null;
      this.showToast(`👥 [${crewName}] 크루를 탈퇴했습니다.`);
      this.renderCrewHub();
    }).catch(err => {
      console.error("Error leaving crew:", err);
      alert("크루 탈퇴에 실패했습니다.");
    });
  }

  requestOneOnOneBattle(targetUserId, targetUserName) {
    if (confirm(`${targetUserName}님에게 1대1 말씀 암송 대결을 신청하시겠습니까? (참가비 10P)`)) {
      this.createBattleRoom('one_on_one', targetUserId);
    }
  }

  createBattleRoom(type, targetUserId = null) {
    if (!this.currentUser) {
      alert("로그인이 필요합니다.");
      return;
    }
    if (this.currentUser.isTrial) {
      alert("체험 모드에서는 대결을 이용하실 수 없습니다.");
      return;
    }
    
    if (type === 'team') {
      if (!this.currentUser.crewId) {
        alert("크루 대항전을 시작하려면 먼저 크루에 가입하거나 창설해야 합니다.");
        return;
      }
      
      const titleInput = document.getElementById('inputBattleTitle');
      const title = titleInput ? titleInput.value.trim() : '';
      if (title.length < 2) {
        alert("대결 방 제목을 2글자 이상 입력하세요.");
        return;
      }
      
      const chapterSelect = document.getElementById('selectBattleChapter');
      const chapter = chapterSelect ? parseInt(chapterSelect.value) : 1;
      
      const feeInput = document.getElementById('inputBattleEntryFee');
      const entryFee = feeInput ? parseInt(feeInput.value) : 10;
      if (isNaN(entryFee) || entryFee < 0) {
        alert("올바른 참가비를 입력하세요.");
        return;
      }
      
      if (this.currentUser.points < entryFee) {
        alert(`포인트가 부족합니다. (필요: ${entryFee}P / 보유: ${this.currentUser.points}P)`);
        return;
      }
      
      const chapterVerses = window.BIBLE_DATA.filter(v => v.chapter === chapter);
      if (chapterVerses.length === 0) {
        alert("해당 장에 등록된 말씀 데이터가 없습니다.");
        return;
      }
      
      const shuffled = [...chapterVerses].sort(() => 0.5 - Math.random());
      const selectedVerses = shuffled.slice(0, 5).map(v => ({ chapter: v.chapter, verse: v.verse }));
      
      const battleData = {
        title: title,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        creatorId: this.currentUser.id,
        creatorName: this.currentUser.name,
        creatorCrewId: this.currentUser.crewId,
        creatorCrewName: this.currentUser.crewName,
        type: 'team',
        chapter: chapter,
        entryFee: entryFee,
        prizePool: entryFee,
        status: 'waiting',
        verses: selectedVerses,
        participants: [
          {
            userId: this.currentUser.id,
            username: this.currentUser.name,
            crewId: this.currentUser.crewId,
            crewName: this.currentUser.crewName,
            score: 0,
            timeSpent: 999,
            completed: false,
            started: false
          }
        ]
      };
      
      db.collection('users').doc(this.currentUser.id).update({
        points: firebase.firestore.FieldValue.increment(-entryFee)
      }).then(() => {
        db.collection('battles').add(battleData).then(() => {
          if (titleInput) titleInput.value = '';
          this.showToast(`⚔️ 크루 대항전 방 [${title}]이 개설되었습니다!`);
          this.renderCrewHub();
        });
      }).catch(err => {
        console.error("Error creating team battle room:", err);
        alert("방 개설에 실패했습니다.");
      });
      
    } else if (type === 'one_on_one') {
      if (!targetUserId) return;
      
      const targetUser = this.users.find(u => u.id === targetUserId);
      if (!targetUser) {
        alert("상대방 정보를 찾을 수 없습니다.");
        return;
      }
      
      const entryFee = 10;
      
      if (this.currentUser.points < entryFee) {
        alert(`포인트가 부족합니다. (필요: ${entryFee}P / 보유: ${this.currentUser.points}P)`);
        return;
      }
      
      const creatorChapter = Math.max(1, Math.min(22, Math.floor(Math.random() * 22) + 1));
      
      const chapterVerses = window.BIBLE_DATA.filter(v => v.chapter === creatorChapter);
      const shuffled = [...chapterVerses].sort(() => 0.5 - Math.random());
      const selectedVerses = shuffled.slice(0, 5).map(v => ({ chapter: v.chapter, verse: v.verse }));
      
      const battleData = {
        title: `${this.currentUser.name} vs ${targetUser.name} 대결`,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        creatorId: this.currentUser.id,
        creatorName: this.currentUser.name,
        creatorCrewId: this.currentUser.crewId || null,
        creatorCrewName: this.currentUser.crewName || null,
        type: 'one_on_one',
        chapter: creatorChapter,
        entryFee: entryFee,
        prizePool: entryFee,
        status: 'waiting',
        targetUserId: targetUserId,
        verses: selectedVerses,
        participants: [
          {
            userId: this.currentUser.id,
            username: this.currentUser.name,
            crewId: this.currentUser.crewId || null,
            crewName: this.currentUser.crewName || null,
            score: 0,
            timeSpent: 999,
            completed: false,
            started: false
          }
        ]
      };
      
      db.collection('users').doc(this.currentUser.id).update({
        points: firebase.firestore.FieldValue.increment(-entryFee)
      }).then(() => {
        db.collection('battles').add(battleData).then(docRef => {
          const newNotification = {
            id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            type: 'battle_invite',
            battleId: docRef.id,
            message: `⚔️ ${this.currentUser.name}님이 1대1 말씀 대결(참가비 10P)을 신청했습니다!`,
            timestamp: Date.now(),
            read: false
          };
          
          db.collection('users').doc(targetUserId).update({
            notifications: firebase.firestore.FieldValue.arrayUnion(newNotification)
          }).then(() => {
            this.showToast(`⚔️ ${targetUser.name}님에게 1대1 대결 신청을 보냈습니다.`);
            this.closeModal('modalAllRankings');
          });
        });
      }).catch(err => {
        console.error("Error creating 1-on-1 battle:", err);
        alert("대결 신청에 실패했습니다.");
      });
    }
  }

  joinBattleRoom(battleId) {
    if (!this.currentUser) {
      alert("로그인이 필요합니다.");
      return;
    }
    if (this.currentUser.isTrial) {
      alert("체험 모드에서는 대결을 이용하실 수 없습니다.");
      return;
    }
    
    db.collection('battles').doc(battleId).get().then(doc => {
      if (!doc.exists) return;
      const battle = doc.data();
      
      if (battle.status !== 'waiting') {
        alert("이미 대결이 시작되었거나 종료되었습니다.");
        return;
      }
      
      if (battle.type === 'team' && !this.currentUser.crewId) {
        alert("크루 대항전에 참여하려면 먼저 크루에 가입해야 합니다.");
        return;
      }
      
      const isAlreadyIn = battle.participants.some(p => p.userId === this.currentUser.id);
      if (isAlreadyIn) {
        alert("이미 대결 방에 참가되어 있습니다.");
        return;
      }
      
      const newParticipant = {
        userId: this.currentUser.id,
        username: this.currentUser.name,
        crewId: this.currentUser.crewId || null,
        crewName: this.currentUser.crewName || null,
        score: 0,
        timeSpent: 999,
        completed: false,
        started: false
      };
      
      db.collection('battles').doc(battleId).update({
        participants: firebase.firestore.FieldValue.arrayUnion(newParticipant)
      }).then(() => {
        this.showToast(`⚔️ 대결 방에 참가하셨습니다!`);
        this.renderCrewHub();
      });
    });
  }

  startBattleIndividual(battleId) {
    if (!this.currentUser) return;
    
    db.collection('battles').doc(battleId).get().then(doc => {
      if (!doc.exists) return;
      const battle = doc.data();
      
      const pIndex = battle.participants.findIndex(p => p.userId === this.currentUser.id);
      if (pIndex === -1) {
        alert("참가자가 아닙니다.");
        return;
      }
      
      const myParticipant = battle.participants[pIndex];
      if (myParticipant.started) {
        // 이미 started 상태면 그냥 게임 진입 (재시작 방지)
        this.startBattleRun(battleId);
        return;
      }

      // 1대1 대결이고 이미 active 상태 (상대방이 수락하여 참가비 이미 차감됨)
      // → 참가비 재차감 없이 바로 started=true 후 게임 진입
      if (battle.status === 'active' && battle.type === 'one_on_one') {
        const updatedParticipants = battle.participants.map((p, idx) => {
          if (idx === pIndex) return { ...p, started: true };
          return p;
        });
        db.collection('battles').doc(battleId).update({
          participants: updatedParticipants
        }).then(() => {
          this.startBattleRun(battleId);
        });
        return;
      }
      
      // 대기 중인 방: 참가비 차감 후 시작
      if (this.currentUser.points < battle.entryFee) {
        alert(`포인트가 부족합니다. (참가비: ${battle.entryFee}P / 보유: ${this.currentUser.points}P)`);
        return;
      }
      
      db.collection('users').doc(this.currentUser.id).update({
        points: firebase.firestore.FieldValue.increment(-battle.entryFee)
      }).then(() => {
        const updatedParticipants = battle.participants.map(p => {
          if (p.userId === this.currentUser.id) {
            return { ...p, started: true };
          }
          return p;
        });
        
        db.collection('battles').doc(battleId).update({
          participants: updatedParticipants,
          status: 'active',
          prizePool: firebase.firestore.FieldValue.increment(battle.entryFee)
        }).then(() => {
          this.startBattleRun(battleId);
        });
      });
    });
  }

  startBattleRun(battleId) {
    db.collection('battles').doc(battleId).get().then(doc => {
      if (!doc.exists) return;
      const battle = doc.data();
      
      this.currentBattleId = battleId;
      this.currentBattleVerses = battle.verses || [];
      this.currentBattleVerseIndex = 0;
      this.battleCorrectAnswersCount = 0;
      this.battleTotalTimeSpent = 0;
      this.battleStartTime = Date.now();
      
      if (this.currentBattleVerses.length === 0) {
        alert("대결에 등록된 말씀 구절이 없습니다.");
        this.currentBattleId = null;
        return;
      }
      
      const firstVerseMeta = this.currentBattleVerses[0];
      const matched = window.BIBLE_DATA.find(v => v.chapter === firstVerseMeta.chapter && v.verse === firstVerseMeta.verse);
      if (matched) {
        this.currentQuizVerse = matched;
        this.switchView('game');
        this.initializeQuiz();
      } else {
        alert("말씀 구절을 로드하는데 실패했습니다.");
        this.currentBattleId = null;
      }
    });
  }

  nextBattleVerse() {
    this.currentBattleVerseIndex++;
    if (this.currentBattleVerseIndex < this.currentBattleVerses.length) {
      const targetVerseMeta = this.currentBattleVerses[this.currentBattleVerseIndex];
      const matched = window.BIBLE_DATA.find(v => v.chapter === targetVerseMeta.chapter && v.verse === targetVerseMeta.verse);
      if (matched) {
        this.currentQuizVerse = matched;
        this.initializeQuiz();
      } else {
        console.error("Verse match not found in BIBLE_DATA:", targetVerseMeta);
        this.finishMyBattleRun();
      }
    } else {
      this.finishMyBattleRun();
    }
  }

  finishMyBattleRun() {
    this.clearIntervals();
    this.gameActive = false;
    
    const battleId = this.currentBattleId;
    this.currentBattleId = null;
    
    this.showToast(`🏆 대결 종료! 결과를 기록 중입니다...`);
    
    db.collection('battles').doc(battleId).get().then(doc => {
      if (!doc.exists) {
        this.switchView('crew');
        return;
      }
      
      const battle = doc.data();
      const updatedParticipants = battle.participants.map(p => {
        if (p.userId === this.currentUser.id) {
          return {
            ...p,
            completed: true,
            score: this.battleCorrectAnswersCount,
            timeSpent: this.battleTotalTimeSpent
          };
        }
        return p;
      });
      
      const allCompleted = updatedParticipants.every(p => p.completed);
      const newStatus = allCompleted ? 'completed' : battle.status;
      
      db.collection('battles').doc(battleId).update({
        participants: updatedParticipants,
        status: newStatus
      }).then(() => {
        this.switchView('crew');
        
        if (allCompleted) {
          this.resolveBattle(battleId);
        } else {
          alert(`대결이 종료되었습니다!\n나의 기록: 맞춘 개수 ${this.battleCorrectAnswersCount}개 / 소요 시간 ${this.battleTotalTimeSpent}초\n\n다른 참가자들이 완료하면 최종 정산됩니다.`);
        }
      }).catch(err => {
        console.error("Error updating battle completion:", err);
        this.switchView('crew');
      });
    });
  }

  resolveBattle(battleId) {
    db.collection('battles').doc(battleId).get().then(doc => {
      if (!doc.exists) return;
      const battle = doc.data();
      
      if (battle.status !== 'completed') return;
      if (battle.resolved) return;
      
      const participants = battle.participants || [];
      if (participants.length === 0) return;
      
      let winnerText = '';
      let winnerUserIds = [];
      let winnerCrewId = null;
      let winnerCrewName = '';
      
      if (battle.type === 'one_on_one') {
        const sorted = [...participants].sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return a.timeSpent - b.timeSpent;
        });
        
        const p1 = sorted[0];
        const p2 = sorted[1];
        
        if (p1.score === p2.score && p1.timeSpent === p2.timeSpent) {
          winnerText = `🤝 ${p1.username}님과 ${p2.username}님이 동점으로 비겼습니다! 참가비가 환불되었습니다.`;
          winnerUserIds = [p1.userId, p2.userId];
          
          const refundAmount = Math.floor(battle.prizePool / 2);
          winnerUserIds.forEach(uid => {
            db.collection('users').doc(uid).update({
              points: firebase.firestore.FieldValue.increment(refundAmount)
            });
            this.addSystemNotification(uid, `🤝 1대1 대결 비김 알림: ${refundAmount}P가 반환되었습니다.`);
          });
        } else {
          winnerText = `🏆 1대1 대결 승리! ${p1.username}님이 ${p2.username}님을 이기고 ${battle.prizePool}P를 획득하셨습니다!`;
          winnerUserIds = [p1.userId];
          
          db.collection('users').doc(p1.userId).update({
            points: firebase.firestore.FieldValue.increment(battle.prizePool)
          });
          this.addSystemNotification(p1.userId, `🎉 1대1 대결 승리! +${battle.prizePool}P가 지급되었습니다.`);
          this.addSystemNotification(p2.userId, `😢 1대1 대결 아쉬운 패배! 다음 기회에 도전하세요.`);
        }
      } else {
        const crewGroups = {};
        participants.forEach(p => {
          if (!p.crewId) return;
          if (!crewGroups[p.crewId]) {
            crewGroups[p.crewId] = {
              crewId: p.crewId,
              crewName: p.crewName,
              totalScore: 0,
              totalTime: 0,
              count: 0,
              members: []
            };
          }
          crewGroups[p.crewId].totalScore += p.score;
          crewGroups[p.crewId].totalTime += p.timeSpent;
          crewGroups[p.crewId].count += 1;
          crewGroups[p.crewId].members.push(p);
        });
        
        const groupsArray = Object.values(crewGroups);
        if (groupsArray.length === 0) {
          winnerText = "참여한 크루가 없어 대결이 무효 처리되었습니다.";
        } else if (groupsArray.length === 1) {
          const winningCrew = groupsArray[0];
          winnerText = `🎉 단독 크루 참가! [${winningCrew.crewName}] 크루가 상금 ${battle.prizePool}P를 획득했습니다.`;
          winnerCrewId = winningCrew.crewId;
          winnerCrewName = winningCrew.crewName;
          
          const share = Math.floor(battle.prizePool / winningCrew.members.length);
          winningCrew.members.forEach(m => {
            db.collection('users').doc(m.userId).update({
              points: firebase.firestore.FieldValue.increment(share)
            });
            this.addSystemNotification(m.userId, `🎉 크루 대항전 승리! +${share}P가 지급되었습니다.`);
          });
          
          db.collection('crews').doc(winningCrew.crewId).update({
            points: firebase.firestore.FieldValue.increment(battle.prizePool)
          });
        } else {
          groupsArray.forEach(g => {
            g.avgScore = g.totalScore / g.count;
            g.avgTime = g.totalTime / g.count;
          });
          
          groupsArray.sort((a, b) => {
            if (b.avgScore !== a.avgScore) return b.avgScore - a.avgScore;
            return a.avgTime - b.avgTime;
          });
          
          const team1 = groupsArray[0];
          const team2 = groupsArray[1];
          
          if (team1.avgScore === team2.avgScore && team1.avgTime === team2.avgTime) {
            winnerText = `🤝 [${team1.crewName}]와 [${team2.crewName}] 크루가 동점으로 비겼습니다! 상금이 분배되었습니다.`;
            
            const splitPrize = Math.floor(battle.prizePool / 2);
            [team1, team2].forEach(team => {
              const share = Math.floor(splitPrize / team.members.length);
              team.members.forEach(m => {
                db.collection('users').doc(m.userId).update({
                  points: firebase.firestore.FieldValue.increment(share)
                });
                this.addSystemNotification(m.userId, `🤝 크루 대항전 무승부! +${share}P가 지급되었습니다.`);
              });
              db.collection('crews').doc(team.crewId).update({
                points: firebase.firestore.FieldValue.increment(splitPrize)
              });
            });
          } else {
            winnerText = `🏆 크루 대항전 승리! [${team1.crewName}] 크루가 [${team2.crewName}] 크루를 꺾고 최종 우승했습니다!`;
            winnerCrewId = team1.crewId;
            winnerCrewName = team1.crewName;
            
            const share = Math.floor(battle.prizePool / team1.members.length);
            team1.members.forEach(m => {
              db.collection('users').doc(m.userId).update({
                points: firebase.firestore.FieldValue.increment(share)
              });
              this.addSystemNotification(m.userId, `🎉 크루 대항전 승리! +${share}P가 지급되었습니다.`);
            });
            
            team2.members.forEach(m => {
              this.addSystemNotification(m.userId, `😢 크루 대항전 패배! 다음 대결에서 복수하세요.`);
            });
            
            db.collection('crews').doc(team1.crewId).update({
              points: firebase.firestore.FieldValue.increment(battle.prizePool)
            });
          }
        }
      }
      
      db.collection('battles').doc(battleId).update({
        resolved: true,
        resolutionText: winnerText,
        winnerCrewId: winnerCrewId,
        winnerCrewName: winnerCrewName
      }).then(() => {
        const isCurrentParticipant = participants.some(p => p.userId === this.currentUser.id);
        if (isCurrentParticipant) {
          alert(`📢 대결 최종 정산 완료!\n\n${winnerText}`);
        }
      });
    });
  }

  addSystemNotification(userId, message) {
    const newNotification = {
      id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      type: 'system',
      message: message,
      timestamp: Date.now(),
      read: false
    };
    db.collection('users').doc(userId).update({
      notifications: firebase.firestore.FieldValue.arrayUnion(newNotification)
    }).catch(err => console.error("Error adding system notification:", err));
  }

  acceptBattleInvite(battleId, notificationId) {
    if (!this.currentUser) return;
    
    const notifications = this.currentUser.notifications || [];
    const updatedNotifications = notifications.map(n => {
      if (n.id === notificationId) {
        return { ...n, read: true };
      }
      return n;
    });
    
    db.collection('users').doc(this.currentUser.id).update({
      notifications: updatedNotifications
    }).then(() => {
      this.renderNotifications();
      
      db.collection('battles').doc(battleId).get().then(doc => {
        if (!doc.exists) {
          alert("존재하지 않거나 만료된 대결입니다.");
          return;
        }
        
        const battle = doc.data();
        if (battle.status !== 'waiting') {
          alert("이미 진행 중이거나 완료된 대결입니다.");
          return;
        }
        
        if (this.currentUser.points < battle.entryFee) {
          alert(`포인트가 부족합니다. (참가비: ${battle.entryFee}P / 보유: ${this.currentUser.points}P)`);
          return;
        }
        
        db.collection('users').doc(this.currentUser.id).update({
          points: firebase.firestore.FieldValue.increment(-battle.entryFee)
        }).then(() => {
          const newParticipant = {
            userId: this.currentUser.id,
            username: this.currentUser.name,
            crewId: this.currentUser.crewId || null,
            crewName: this.currentUser.crewName || null,
            score: 0,
            timeSpent: 999,
            completed: false,
            started: true   // 수락자는 즉시 started
          };
          
          const updatedParticipants = [...battle.participants, newParticipant];
          
          db.collection('battles').doc(battleId).update({
            participants: updatedParticipants,
            status: 'active',
            prizePool: firebase.firestore.FieldValue.increment(battle.entryFee)
          }).then(() => {
            const dropdown = document.getElementById('notificationDropdown');
            if (dropdown) dropdown.classList.remove('active');

            // ✅ 신청자(creator)에게 대결 수락 알림 push → 신청자도 게임 시작하도록
            const creatorNotif = {
              id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
              type: 'battle_accepted',
              battleId: battleId,
              message: `⚔️ ${this.currentUser.name}님이 1대1 대결을 수락했습니다! 지금 바로 대결을 시작하세요!`,
              timestamp: Date.now(),
              read: false
            };
            db.collection('users').doc(battle.creatorId).update({
              notifications: firebase.firestore.FieldValue.arrayUnion(creatorNotif)
            });
            
            // 수락자 → 즉시 게임 시작
            this.startBattleRun(battleId);
          });
        });
      });
    });
  }

  declineBattleInvite(battleId, notificationId) {
    if (!this.currentUser) return;
    
    const notifications = this.currentUser.notifications || [];
    const updatedNotifications = notifications.map(n => {
      if (n.id === notificationId) {
        return { ...n, read: true };
      }
      return n;
    });
    
    db.collection('users').doc(this.currentUser.id).update({
      notifications: updatedNotifications
    }).then(() => {
      this.renderNotifications();
      
      db.collection('battles').doc(battleId).get().then(doc => {
        if (!doc.exists) return;
        const battle = doc.data();
        
        if (battle.status === 'waiting') {
          db.collection('users').doc(battle.creatorId).update({
            points: firebase.firestore.FieldValue.increment(battle.entryFee)
          });
          
          db.collection('battles').doc(battleId).delete();
          
          this.addSystemNotification(battle.creatorId, `😢 1대1 대결 거절 알림: ${this.currentUser.name}님이 대결 신청을 거절하여 참가비가 환불되었습니다.`);
        }
      });
      
      const dropdown = document.getElementById('notificationDropdown');
      if (dropdown) dropdown.classList.remove('active');
      this.showToast("대결 신청을 거절하셨습니다.");
    });
  }

  // 신청자가 수락 알림에서 "지금 시작!" 버튼을 눌렀을 때
  startBattleFromNotif(battleId, notificationId) {
    if (!this.currentUser) return;

    // 알림을 읽음 처리
    const notifications = this.currentUser.notifications || [];
    const updatedNotifications = notifications.map(n => {
      if (n.id === notificationId) return { ...n, read: true };
      return n;
    });
    db.collection('users').doc(this.currentUser.id).update({
      notifications: updatedNotifications
    });

    const dropdown = document.getElementById('notificationDropdown');
    if (dropdown) dropdown.classList.remove('active');

    // 배틀 문서 가져와서 본인 participant started=true 로 업데이트 후 게임 진입
    db.collection('battles').doc(battleId).get().then(doc => {
      if (!doc.exists) {
        alert('대결 방이 존재하지 않습니다.');
        return;
      }
      const battle = doc.data();

      if (battle.status !== 'active') {
        alert('아직 상대방이 수락하지 않았습니다.');
        return;
      }

      const pIndex = battle.participants.findIndex(p => p.userId === this.currentUser.id);
      if (pIndex === -1) {
        alert('참가자가 아닙니다.');
        return;
      }

      if (battle.participants[pIndex].started) {
        // 이미 started 처리된 경우 그냥 게임 진입
        this.startBattleRun(battleId);
        return;
      }

      // started를 true로 업데이트
      const updatedParticipants = battle.participants.map((p, idx) => {
        if (idx === pIndex) return { ...p, started: true };
        return p;
      });

      db.collection('battles').doc(battleId).update({
        participants: updatedParticipants
      }).then(() => {
        this.startBattleRun(battleId);
      });
    });
  }

  renderCrewHub() {
    if (!this.currentUser) return;

    const noCrewSection = document.getElementById('crewNoCrewSection');
    const hubSection = document.getElementById('crewHubSection');
    const fab = document.getElementById('fabCreateCrew');

    if (!noCrewSection || !hubSection) return;

    if (!this.currentUser.crewId) {
      noCrewSection.style.display = 'block';
      hubSection.style.display = 'none';
      if (fab) fab.style.display = 'flex';

      const list = document.getElementById('joinableCrewsList');
      if (list) {
        if (!this.crews || this.crews.length === 0) {
          list.innerHTML = '<div style="text-align:center; padding:1.5rem; color:var(--text-muted); font-size:0.85rem;">현재 창설된 크루가 없습니다. 첫 크루를 개설해 보세요!</div>';
        } else {
          list.innerHTML = '';
          this.crews.forEach(crew => {
            const item = document.createElement('div');
            item.className = 'crew-list-item';
            item.innerHTML = `
              <div class="crew-info-col">
                <span class="crew-name-label">${crew.name}</span>
                <span class="crew-meta-label">크루장: ${crew.leaderName} | 멤버: ${crew.memberCount}명 | 포인트: ${crew.points.toLocaleString()}P</span>
              </div>
              <button class="btn-mini" onclick="app.joinCrew('${crew.id}', '${crew.name}')">가입</button>
            `;
            list.appendChild(item);
          });
        }
      }
    } else {
      noCrewSection.style.display = 'none';
      hubSection.style.display = 'block';
      if (fab) fab.style.display = 'none';

      const myCrew = this.crews ? this.crews.find(c => c.id === this.currentUser.crewId) : null;
      if (myCrew) {
        if (this.currentUser.crewName !== myCrew.name) {
          db.collection('users').doc(this.currentUser.id).update({
            crewName: myCrew.name
          });
          this.currentUser.crewName = myCrew.name;
        }
        
        document.getElementById('myCrewName').textContent = myCrew.name;
        document.getElementById('myCrewDetails').textContent = 
          `크루장: ${myCrew.leaderName} | 크루원: ${myCrew.memberCount}명 | 누적 포인트: ${myCrew.points.toLocaleString()}P`;
      }

      const select = document.getElementById('selectBattleChapter');
      if (select && select.innerHTML === '') {
        let options = '';
        for (let i = 1; i <= 22; i++) {
          options += `<option value="${i}">요한계시록 ${i}장</option>`;
        }
        select.innerHTML = options;
      }

      const battleList = document.getElementById('battleRoomsList');
      if (battleList) {
        const visibleBattles = (this.battles || []).filter(battle => {
          return battle.type === 'team' || battle.creatorId === this.currentUser.id || battle.targetUserId === this.currentUser.id;
        });

        if (visibleBattles.length === 0) {
          battleList.innerHTML = '<div style="text-align:center; padding:1.5rem; color:var(--text-muted); font-size:0.85rem;">진행 중인 대결 매치가 없습니다.</div>';
        } else {
          const sortedBattles = [...visibleBattles].sort((a, b) => {
            const statusOrder = { 'waiting': 0, 'active': 1, 'completed': 2 };
            if (statusOrder[a.status] !== statusOrder[b.status]) {
              return statusOrder[a.status] - statusOrder[b.status];
            }
            const timeA = a.createdAt ? a.createdAt.toMillis() : 0;
            const timeB = b.createdAt ? b.createdAt.toMillis() : 0;
            return timeB - timeA;
          });

          battleList.innerHTML = '';
          sortedBattles.forEach(battle => {
            const isParticipant = battle.participants.some(p => p.userId === this.currentUser.id);
            const myParticipant = battle.participants.find(p => p.userId === this.currentUser.id);
            
            let badgeText = '대기 중';
            if (battle.status === 'active') badgeText = '진행 중';
            else if (battle.status === 'completed') badgeText = '완료';

            const card = document.createElement('div');
            card.className = 'battle-card';
            
            let html = `
              <div class="battle-card-header">
                <h4 class="battle-card-title">${battle.title}</h4>
                <span class="battle-badge ${battle.status}">${badgeText}</span>
              </div>
              <div class="battle-info-row">
                <span>목표: 요한계시록 ${battle.chapter}장</span>
                <span>참가비: ${battle.entryFee}P | 상금: ${battle.prizePool}P</span>
              </div>
              <div class="battle-participants">
                <div style="font-weight:bold; font-size:0.75rem; color:var(--accent-purple); margin-bottom:0.2rem;">참가 현황</div>
            `;

            battle.participants.forEach(p => {
              let pStatus = '대기 중';
              let pClass = 'pending';
              if (p.completed) {
                pStatus = `완료 (${p.score}/5개, ${p.timeSpent}초)`;
                pClass = 'completed';
              } else if (p.started) {
                pStatus = '암송 중';
                pClass = 'pending';
              }

              html += `
                <div class="participant-row">
                  <span class="name">${p.username} ${p.crewName ? `[${p.crewName}]` : ''}</span>
                  <span class="score ${pClass}">${pStatus}</span>
                </div>
              `;
            });

            html += `</div>`;

            if (battle.status === 'completed' && battle.resolutionText) {
              html += `
                <div style="margin-top:0.5rem; padding:0.6rem; border-radius:8px; background:rgba(245,158,11,0.1); border:1px solid rgba(245,158,11,0.2); font-size:0.8rem; line-height:1.4; color:var(--accent-amber); font-weight:bold; text-align:center;">
                  ${battle.resolutionText}
                </div>
              `;
            }

            let actionBtnHtml = '';
            if (battle.status === 'waiting') {
              if (!isParticipant) {
                actionBtnHtml = `<button class="btn-primary" style="margin: 0.5rem 0 0 0; width:100%; height:36px; font-size:0.85rem;" onclick="app.joinBattleRoom('${battle.id}')">대결 참여하기</button>`;
              } else if (!myParticipant.started) {
                actionBtnHtml = `<button class="btn-primary" style="margin: 0.5rem 0 0 0; width:100%; height:36px; font-size:0.85rem; background:linear-gradient(135deg, var(--accent-emerald), #047857);" onclick="app.startBattleIndividual('${battle.id}')">내 대결 시작하기</button>`;
              }
            } else if (battle.status === 'active' && isParticipant && !myParticipant.started) {
              actionBtnHtml = `<button class="btn-primary" style="margin: 0.5rem 0 0 0; width:100%; height:36px; font-size:0.85rem; background:linear-gradient(135deg, var(--accent-emerald), #047857);" onclick="app.startBattleIndividual('${battle.id}')">내 대결 시작하기</button>`;
            }

            if (battle.status === 'completed' && !battle.resolved) {
              this.resolveBattle(battle.id);
            }

            html += actionBtnHtml;
            card.innerHTML = html;
            battleList.appendChild(card);
          });
        }
      }
    }
  }

  updateDevicePlatform(os) {
    if (!this.currentUser) return;
    if (this.currentUser.os === os) return; // avoid duplicate updates
    
    this.currentUser.os = os;
    if (this.currentUser.isTrial) return;
    
    db.collection('users').doc(this.currentUser.id).update({
      os: os
    }).then(() => {
      console.log("Device platform successfully updated in Firestore:", os);
    }).catch(err => {
      console.error("Error updating device platform in Firestore:", err);
    });
  }

  hasActiveModal() {
    const modals = document.querySelectorAll('.modal-overlay.active, .modal-overlay[style*="display: block"]');
    return modals.length > 0;
  }
  
  closeActiveModal() {
    const modals = document.querySelectorAll('.modal-overlay.active, .modal-overlay[style*="display: block"]');
    modals.forEach(modal => {
      modal.classList.remove('active');
      modal.style.display = 'none';
    });
  }

  handleBackNavigation() {
    // 1. If any modal is active, close it
    if (this.hasActiveModal()) {
      this.closeActiveModal();
      return 'modal_closed';
    }

    // 2. Check the current view
    const view = this.currentViewName || 'dashboard';

    // 3. Detail Views: Back Navigation
    if (view === 'journeyVerseStudy') {
      if (this.studyMode === 'exam') {
        this.switchView('journeyChapterDetail');
      } else {
        this.switchView('journeyVerseSelect');
      }
      return 'navigated';
    } else if (view === 'journeyVerseSelect') {
      this.switchView('journeyChapterDetail');
      return 'navigated';
    } else if (view === 'journeyChapterDetail') {
      this.switchView('journey');
      return 'navigated';
    } else if (view === 'journeyResult') {
      this.switchView('journeyChapterDetail');
      return 'navigated';
    } else if (view === 'eventDetail') {
      this.switchView('events');
      return 'navigated';
    } else if (view === 'events') {
      this.switchView(this.eventsPrevView || 'dashboard');
      return 'navigated';
    } else if (view === 'notices') {
      this.switchView(this.noticesPrevView || 'dashboard');
      return 'navigated';
    } else if (view === 'exam' && !this.isExamMode) {
      this.switchView('events');
      return 'navigated';
    } else if (view === 'noticeDetail') {
      this.switchView(this.noticePrevView || 'dashboard');
      return 'navigated';
    }
    
    // 4. Exam / Game Quiz screens: Exit Confirmation Popup
    if (view === 'game' || (view === 'exam' && this.isExamMode)) {
      this.openModal('modalExitConfirm');
      return 'confirmation_opened';
    }
    
    // 5. If it's a tab screen or anything else, let Flutter handle it (e.g. exit toast)
    return 'tab_screen';
  }

  // Interactive Chapter Study Methods
  openVerseSelect(mode) {
    if (!window.BIBLE_DATA) return;
    this.studyMode = mode;
    this.studyVerses = window.BIBLE_DATA.filter(v => v.chapter === this.activeJourneyChapter);
    
    // Choose first uncompleted verse as default
    const completedSet = this.getCompletedVerseIndexSet(this.currentUser);
    const firstIndex = window.BIBLE_DATA.findIndex(v => v.chapter === this.activeJourneyChapter);
    
    let startIdx = 0;
    for (let i = 0; i < this.studyVerses.length; i++) {
      if (!completedSet.has(firstIndex + i)) {
        startIdx = i;
        break;
      }
    }
    this.studyCurrentIndex = startIdx;
    
    this.switchView('journeyVerseSelect');
  }

  renderVerseSelect() {
    if (!window.BIBLE_DATA) return;
    const mode = this.studyMode;
    const chapter = this.activeJourneyChapter;
    
    const headerTitle = document.getElementById('verseSelectHeaderTitle');
    const modeDesc = document.getElementById('verseSelectModeDesc');
    const btnStart = document.getElementById('btnVerseSelectStart');
    
    const modeNames = {
      'easy': '쉬움 모드',
      'hard': '어려움 모드',
      'expert': '전문 모드'
    };
    
    const modeDescs = {
      'easy': '말씀을 보면서 학습해요.',
      'hard': '핵심 단어를 빈칸에 채워요.',
      'expert': '말씀을 가리고 직접 암송해요.'
    };
    
    const modeColors = {
      'easy': '#16a34a',
      'hard': '#d97706',
      'expert': '#dc2626'
    };
    
    if (headerTitle) headerTitle.textContent = modeNames[mode] || '';
    if (modeDesc) {
      modeDesc.textContent = modeDescs[mode] || '';
      modeDesc.style.color = modeColors[mode] || '#16a34a';
    }
    
    // Render verse grid numbers
    const gridEl = document.getElementById('verseSelectGrid');
    if (gridEl) {
      gridEl.innerHTML = this.studyVerses.map((v, i) => {
        const isActive = i === this.studyCurrentIndex ? `active ${mode}` : '';
        return `
          <button class="verse-select-btn ${isActive}" onclick="app.selectVerseInGrid(${i})">
            ${v.verse}
          </button>
        `;
      }).join('');
    }
    
    // Selection Summary
    const refEl = document.getElementById('verseSelectSelectedRef');
    const selectedVerse = this.studyVerses[this.studyCurrentIndex];
    if (refEl && selectedVerse) {
      refEl.textContent = `요한계시록 ${chapter}장 ${selectedVerse.verse}절`;
    }
    
    // CTA Button
    if (btnStart) {
      btnStart.style.backgroundColor = modeColors[mode] || '#16a34a';
    }
  }

  selectVerseInGrid(idx) {
    if (idx < 0 || idx >= this.studyVerses.length) return;
    this.studyCurrentIndex = idx;
    this.renderVerseSelect();
  }

  startStudyFromSelectedVerse() {
    const firstIndex = window.BIBLE_DATA.findIndex(v => v.chapter === this.activeJourneyChapter);
    this.activeJourneyVerseIndex = firstIndex + this.studyCurrentIndex;
    
    this.studyAnswered = false;
    this.studySelectedOptionIndex = null;
    this.studyShowExplanation = false;
    this.studyDictationAccuracy = 0;
    
    if (this.studyMode === 'hard') {
      this.generateHardModeOptions();
    }
    
    this.switchView('journeyVerseStudy');
  }

  startStudyMode(mode) {
    if (!window.BIBLE_DATA) return;
    this.studyMode = mode;
    this.studyVerses = window.BIBLE_DATA.filter(v => v.chapter === this.activeJourneyChapter);
    
    const completedSet = this.getCompletedVerseIndexSet(this.currentUser);
    const firstIndex = window.BIBLE_DATA.findIndex(v => v.chapter === this.activeJourneyChapter);
    
    let startIdx = 0;
    for (let i = 0; i < this.studyVerses.length; i++) {
      if (!completedSet.has(firstIndex + i)) {
        startIdx = i;
        break;
      }
    }
    this.studyCurrentIndex = startIdx;
    
    this.studyAnswered = false;
    this.studySelectedOptionIndex = null;
    this.studyShowExplanation = false;
    this.studyDictationAccuracy = 0;
    
    if (mode === 'exam') {
      this.studyExamCorrectCount = 0;
      this.studyExamCurrentIndex = 0;
      this.generateStudyExamQuestions();
    } else {
      this.activeJourneyVerseIndex = firstIndex + this.studyCurrentIndex;
      if (mode === 'hard') {
        this.generateHardModeOptions();
      }
    }
    
    this.switchView('journeyVerseStudy');
  }

  generateHardModeOptions() {
    const v = this.studyVerses[this.studyCurrentIndex];
    if (!v) return;
    
    let correctKeyword = "";
    if (v.keywords && v.keywords.length > 0) {
      correctKeyword = v.keywords[0];
    } else {
      const words = v.text.split(/[\s,.\r\n\t]+/).filter(w => w.length >= 2);
      correctKeyword = words[0] || "지키는 자";
    }
    
    const distractors = this.generateDistractors(correctKeyword, 3);
    const options = [correctKeyword, ...distractors];
    
    const shuffledOptions = options.map((opt, idx) => ({ text: opt, isCorrect: idx === 0 }));
    shuffledOptions.sort(() => 0.5 - Math.random());
    
    this.studyCurrentOptions = shuffledOptions;
    this.studyCorrectOptionIndex = shuffledOptions.findIndex(o => o.isCorrect);
    this.studySelectedOptionIndex = null;
    this.studyAnswered = false;
  }

  generateDistractors(correctAnswer, count = 3) {
    const bibleData = window.BIBLE_DATA || [];
    const allKeywords = [];
    bibleData.forEach(v => {
      if (v.keywords) {
        v.keywords.forEach(kw => {
          if (kw && kw.trim()) allKeywords.push(kw.trim());
        });
      }
    });
    
    const filtered = Array.from(new Set(allKeywords)).filter(kw => kw !== correctAnswer && kw.length > 0);
    const shuffled = filtered.sort(() => 0.5 - Math.random());
    const result = shuffled.slice(0, count);
    
    const fallbacks = ["예언의 말씀", "지키는 자", "보좌 앞에", "어린 양", "흰 옷", "하늘과 땅", "일곱 천사", "성령", "새 예루살렘", "구원"];
    while (result.length < count) {
      const fb = fallbacks[Math.floor(Math.random() * fallbacks.length)];
      if (fb !== correctAnswer && !result.includes(fb)) {
        result.push(fb);
      }
    }
    return result;
  }

  generateStudyExamQuestions() {
    const chapter = this.activeJourneyChapter;
    const chapterVerses = window.BIBLE_DATA.filter(v => v.chapter === chapter);
    const questions = [];
    
    if (chapter === 1) {
      const v1_3 = chapterVerses.find(v => v.verse === 3);
      if (v1_3) {
        questions.push({
          questionText: `요한계시록 1장 3절\n"이 예언의 말씀을 읽는 자와 듣는 자들과 그 가운데 기록한 것을 지키는 자들이 복이 있나니 때가 가까움이라"\n\n본문에서 복이 있다고 한 사람은 누구입니까?`,
          options: ["읽는 자, 듣는 자들, 지키는 자들", "목회자와 전도사", "이단과 서기관", "바리새인과 사두개인"],
          correctIndex: 0,
          explanation: "요한계시록 1장 3절에 기록된 바와 같이, 예언의 말씀을 읽는 자, 듣는 자들, 그리고 그 가운데 기록한 것을 지키는 자들이 복이 있습니다.",
          chapter: 1,
          verse: 3
        });
      }
    }
    
    const shuffledVerses = [...chapterVerses].sort(() => 0.5 - Math.random());
    for (let i = 0; i < shuffledVerses.length; i++) {
      const v = shuffledVerses[i];
      if (chapter === 1 && v.verse === 3) continue;
      
      let correctKeyword = "";
      if (v.keywords && v.keywords.length > 0) {
        correctKeyword = v.keywords[0];
      } else {
        const words = v.text.split(/[\s,.\r\n\t]+/).filter(w => w.length >= 2);
        correctKeyword = words[0];
      }
      
      if (!correctKeyword) continue;
      
      const escapedKeyword = correctKeyword.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const textWithBlank = v.text.replace(new RegExp(escapedKeyword, 'g'), ' (       ) ');
      
      const distractors = this.generateDistractors(correctKeyword, 3);
      const opts = [correctKeyword, ...distractors];
      const shuffledOpts = opts.map((opt, idx) => ({ text: opt, isCorrect: idx === 0 }));
      shuffledOpts.sort(() => 0.5 - Math.random());
      
      const correctIdx = shuffledOpts.findIndex(o => o.isCorrect);
      
      questions.push({
        questionText: `[구절 빈칸 채우기] 요한계시록 ${v.chapter}장 ${v.verse}절\n\n"${textWithBlank}"\n\n위 말씀의 빈칸에 들어갈 알맞은 단어는?`,
        options: shuffledOpts.map(o => o.text),
        correctIndex: correctIdx,
        explanation: `정답은 "${correctKeyword}"입니다.\n\n[요한계시록 ${v.chapter}장 ${v.verse}절 본문]\n${v.text}`,
        chapter: v.chapter,
        verse: v.verse
      });
      
      if (questions.length >= 10) break;
    }
    
    let idx = 0;
    while (questions.length < 10 && chapterVerses.length > 0) {
      const v = chapterVerses[idx % chapterVerses.length];
      idx++;
      
      let keyword = "";
      if (v.keywords && v.keywords.length > 0) {
        keyword = v.keywords[questions.length % v.keywords.length] || v.keywords[0];
      } else {
        continue;
      }
      
      const escapedKeyword = keyword.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const textWithBlank = v.text.replace(new RegExp(escapedKeyword, 'g'), ' (       ) ');
      const distractors = this.generateDistractors(keyword, 3);
      const opts = [keyword, ...distractors];
      const shuffledOpts = opts.map((opt, idx) => ({ text: opt, isCorrect: idx === 0 }));
      shuffledOpts.sort(() => 0.5 - Math.random());
      
      const correctIdx = shuffledOpts.findIndex(o => o.isCorrect);
      
      questions.push({
        questionText: `[구절 빈칸 채우기] 요한계시록 ${v.chapter}장 ${v.verse}절\n\n"${textWithBlank}"\n\n위 말씀의 빈칸에 들어갈 알맞은 단어는?`,
        options: shuffledOpts.map(o => o.text),
        correctIndex: correctIdx,
        explanation: `정답은 "${keyword}"입니다.\n\n[요한계시록 ${v.chapter}장 ${v.verse}절 본문]\n${v.text}`,
        chapter: v.chapter,
        verse: v.verse
      });
    }
    
    if (chapter === 1 && questions.length > 0) {
      const first = questions[0];
      const rest = questions.slice(1).sort(() => 0.5 - Math.random());
      this.studyExamQuestions = [first, ...rest];
    } else {
      this.studyExamQuestions = questions.sort(() => 0.5 - Math.random());
    }
  }

  renderStudyMode() {
    if (!window.BIBLE_DATA) return;
    
    const mode = this.studyMode;
    const chapter = this.activeJourneyChapter;
    
    const headerTitle = document.getElementById('studyModeHeaderTitle');
    const headerProgress = document.getElementById('studyModeHeaderProgress');
    const infoBanner = document.getElementById('studyModeInfoBanner');
    const bannerIcon = document.getElementById('studyModeBannerIcon');
    const bannerDesc = document.getElementById('studyModeBannerDesc');
    
    const modeNames = {
      'easy': '쉬움 모드',
      'hard': '어려움 모드',
      'expert': '전문 모드',
      'exam': '예상 문제'
    };
    
    const modeIcons = {
      'easy': 'sentiment_satisfied_alt',
      'hard': 'sentiment_neutral',
      'expert': 'sentiment_very_dissatisfied',
      'exam': 'quiz'
    };
    
    const modeDescs = {
      'easy': '말씀을 보면서 학습해요.',
      'hard': '핵심 단어를 빈칸에 채워요.',
      'expert': '말씀을 가리고 직접 암송해요.',
      'exam': '사명자 시험 대비 문제를 풀어요.'
    };
    
    if (headerTitle) {
      if (mode === 'exam') {
        headerTitle.textContent = modeNames[mode] || '';
      } else {
        const v = this.studyVerses[this.studyCurrentIndex];
        headerTitle.textContent = v ? `${modeNames[mode]} - ${v.verse}절` : (modeNames[mode] || '');
      }
    }
    if (infoBanner) {
      infoBanner.className = `mode-info-banner ${mode}`;
    }
    if (bannerIcon) bannerIcon.textContent = modeIcons[mode] || '';
    if (bannerDesc) bannerDesc.textContent = modeDescs[mode] || '';
    
    const progressBarFill = document.getElementById('studyProgressBarFill');
    const progressBarText = document.getElementById('studyProgressBarText');
    
    let currentNum = 0;
    let totalNum = 0;
    let progressPct = 0;
    
    if (mode === 'exam') {
      currentNum = this.studyExamCurrentIndex + 1;
      totalNum = 10;
      progressPct = (currentNum / totalNum) * 100;
      if (headerProgress) headerProgress.textContent = `${currentNum}/${totalNum}문제`;
      if (progressBarText) progressBarText.textContent = `${currentNum} / ${totalNum}문제`;
    } else {
      currentNum = this.studyCurrentIndex + 1;
      totalNum = this.studyVerses.length;
      progressPct = (currentNum / totalNum) * 100;
      if (headerProgress) headerProgress.textContent = `${currentNum}/${totalNum}절`;
      if (progressBarText) progressBarText.textContent = `${currentNum} / ${totalNum}절`;
    }
    
    if (progressBarFill) {
      progressBarFill.style.width = `${progressPct}%`;
      const colorMap = {
        'easy': '#16a34a',
        'hard': '#d97706',
        'expert': '#dc2626',
        'exam': '#7c3aed'
      };
      progressBarFill.style.backgroundColor = colorMap[mode] || '#16a34a';
    }
    
    const cardEl = document.getElementById('studyVerseCard');
    const refEl = document.getElementById('studyVerseRef');
    const textEl = document.getElementById('studyVerseText');
    
    if (cardEl) {
      cardEl.className = `verse-study-card glass-panel text-size-${this.verseTextSize}`;
    }
    
    const controlsEl = document.getElementById('studyModeControls');
    
    if (mode === 'exam') {
      const q = this.studyExamQuestions[this.studyExamCurrentIndex];
      if (!q) return;
      
      if (refEl) refEl.textContent = `요한계시록 ${q.chapter}장 ${q.verse}절 예상 문제`;
      if (textEl) textEl.innerHTML = q.questionText.replace(/\n/g, '<br>');
      
      let optionsHtml = '';
      if (this.studyAnswered) {
        optionsHtml = q.options.map((opt, idx) => {
          let extraClass = '';
          if (idx === q.correctIndex) extraClass = 'correct';
          else if (idx === this.studySelectedOptionIndex) extraClass = 'incorrect';
          
          return `
            <button class="study-option-row exam ${extraClass}" disabled>
              <span class="option-num">${idx + 1}</span>
              <span class="option-text">${this.escapeHtml(opt)}</span>
            </button>
          `;
        }).join('');
      } else {
        optionsHtml = q.options.map((opt, idx) => {
          const selectedClass = idx === this.studySelectedOptionIndex ? 'selected' : '';
          return `
            <button class="study-option-row exam ${selectedClass}" onclick="app.selectStudyOption(${idx})">
              <span class="option-num">${idx + 1}</span>
              <span class="option-text">${this.escapeHtml(opt)}</span>
            </button>
          `;
        }).join('');
      }
      
      const isLast = this.studyExamCurrentIndex === 9;
      const btnText = this.studyAnswered ? (isLast ? "결과 보기" : "다음 문제") : "정답 확인";
      const btnClick = this.studyAnswered ? (isLast ? "app.showStudyExamResult()" : "app.nextStudyVerse()") : "app.checkStudyAnswer()";
      const btnDisabled = !this.studyAnswered && this.studySelectedOptionIndex === null ? 'disabled' : '';
      
      let explanationHtml = '';
      if (this.studyAnswered) {
        explanationHtml = `
          <div class="explanation-card glass-panel animate-fade-in" style="padding: 1.25rem; border-radius: 14px; background: #faf5ff; border: 1px solid #e9d5ff; margin-top: 1rem; text-align: left; box-shadow: 0 4px 12px rgba(107, 33, 168, 0.03);">
            <h5 style="color: #6b21a8; font-size: 0.88rem; font-weight: bold; margin: 0 0 0.5rem 0; display: flex; align-items: center; gap: 0.25rem;">
              <span class="material-icons-round" style="font-size: 1.1rem;">info</span> 해설
            </h5>
            <p style="font-size: 0.82rem; color: #581c87; line-height: 1.5; margin: 0; white-space: pre-line; word-break: keep-all;">${this.escapeHtml(q.explanation)}</p>
          </div>
        `;
      }
      
      controlsEl.innerHTML = `
        <div class="study-options-container" style="display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 1.5rem;">
          ${optionsHtml}
        </div>
        ${explanationHtml}
        <div class="study-action-row" style="display: flex; gap: 0.75rem; margin-top: 1.25rem;">
          <button class="btn-study-primary exam" id="btnStudyAction" onclick="${btnClick}" ${btnDisabled}>${btnText}</button>
        </div>
      `;
      
    } else {
      const v = this.studyVerses[this.studyCurrentIndex];
      if (!v) return;
      
      const firstIndex = window.BIBLE_DATA.findIndex(val => val.chapter === chapter);
      this.activeJourneyVerseIndex = firstIndex + this.studyCurrentIndex;
      
      if (refEl) refEl.textContent = `요한계시록 ${v.chapter}장 ${v.verse}절`;
      
      const completedSet = this.getCompletedVerseIndexSet(this.currentUser);
      const isCompleted = completedSet.has(this.activeJourneyVerseIndex);
      
      if (mode === 'easy') {
        if (textEl) textEl.textContent = v.text;
        
        const isBookmarked = (this.currentUser.bookmarks || []).includes(this.activeJourneyVerseIndex);
        const bookmarkIcon = isBookmarked ? 'bookmark' : 'bookmark_border';
        const bookmarkColor = isBookmarked ? '#d97706' : '#94a3b8';
        const completedBtnText = isCompleted ? '✓ 암송 완료됨' : '✓ 암송 완료';
        const completedBtnDisabled = isCompleted ? 'disabled style="background: #e6f4ea; color: #137333; border: 1px solid #c2e7c9;"' : '';
        
        controlsEl.innerHTML = `
          <div style="display: flex; gap: 0.75rem; align-items: center; margin-bottom: 1.25rem;">
            <button onclick="app.toggleStudyBookmark()" style="background: white; border: 1px solid #e2e8f0; border-radius: 12px; height: 50px; width: 50px; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; box-shadow: 0 2px 6px rgba(0,0,0,0.02);">
              <span class="material-icons-round" style="color: ${bookmarkColor}; font-size: 1.4rem;">${bookmarkIcon}</span>
            </button>
            
            <button onclick="app.speakText(window.BIBLE_DATA[${this.activeJourneyVerseIndex}].text)" style="flex: 1; background: white; border: 1px solid #e2e8f0; border-radius: 12px; height: 50px; display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem; color: var(--text-primary); font-weight: 700; font-size: 0.92rem; cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,0.02);">
              <span class="material-icons-round" style="color: #16a34a; font-size: 1.25rem;">volume_up</span>
              본문 듣기
            </button>
            
            <button onclick="app.markVerseAsCompleted()" ${completedBtnDisabled} style="flex: 1.2; background: #16a34a; border: none; border-radius: 12px; height: 50px; display: inline-flex; align-items: center; justify-content: center; gap: 0.3rem; color: white; font-weight: 800; font-size: 0.95rem; cursor: pointer; box-shadow: 0 4px 10px rgba(22, 163, 74, 0.2);">
              ${completedBtnText}
            </button>
          </div>
          
          <div style="display: flex; gap: 0.75rem; margin-top: 1rem;">
            <button class="btn-study-secondary" id="btnPrevVerse" onclick="app.prevStudyVerse()" ${this.studyCurrentIndex === 0 ? 'disabled style="opacity:0.3;"' : ''}>이전 절</button>
            <button class="btn-study-secondary" id="btnNextVerse" onclick="app.nextStudyVerse()" ${this.studyCurrentIndex === this.studyVerses.length - 1 ? 'disabled style="opacity:0.3;"' : ''}>다음 절</button>
          </div>
        `;
        
      } else if (mode === 'hard') {
        let correctKeyword = "";
        if (v.keywords && v.keywords.length > 0) {
          correctKeyword = v.keywords[0];
        } else {
          const words = v.text.split(/[\s,.\r\n\t]+/).filter(w => w.length >= 2);
          correctKeyword = words[0] || "지키는 자";
        }
        
        const escapedKeyword = correctKeyword.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const textWithBlank = v.text.replace(new RegExp(escapedKeyword, 'g'), ' (       ) ');
        if (textEl) textEl.textContent = textWithBlank;
        
        let optionsHtml = '';
        if (this.studyAnswered) {
          optionsHtml = this.studyCurrentOptions.map((opt, idx) => {
            let extraClass = '';
            if (idx === this.studyCorrectOptionIndex) extraClass = 'correct';
            else if (idx === this.studySelectedOptionIndex) extraClass = 'incorrect';
            
            return `
              <button class="study-option-row hard ${extraClass}" disabled>
                <span class="option-num">${idx + 1}</span>
                <span class="option-text">${this.escapeHtml(opt.text)}</span>
              </button>
            `;
          }).join('');
        } else {
          optionsHtml = this.studyCurrentOptions.map((opt, idx) => {
            const selectedClass = idx === this.studySelectedOptionIndex ? 'selected' : '';
            return `
              <button class="study-option-row hard ${selectedClass}" onclick="app.selectStudyOption(${idx})">
                <span class="option-num">${idx + 1}</span>
                <span class="option-text">${this.escapeHtml(opt.text)}</span>
              </button>
            `;
          }).join('');
        }
        
        const btnText = this.studyAnswered ? "다음 절" : "정답 확인";
        const btnClick = this.studyAnswered ? "app.nextStudyVerse()" : "app.checkStudyAnswer()";
        const btnDisabled = !this.studyAnswered && this.studySelectedOptionIndex === null ? 'disabled' : '';
        
        controlsEl.innerHTML = `
          <div class="study-options-container" style="display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 1.5rem;">
            ${optionsHtml}
          </div>
          <div class="study-action-row" style="display: flex; gap: 0.75rem; margin-top: 1rem;">
            <button class="btn-study-primary hard" id="btnStudyAction" onclick="${btnClick}" ${btnDisabled}>${btnText}</button>
          </div>
        `;
        
      } else if (mode === 'expert') {
        const underlines = v.text.split(/\s+/).map(w => '_'.repeat(Math.max(2, w.length))).join(' ');
        if (textEl) textEl.textContent = underlines;
        
        if (this.studyAnswered) {
          const actualText = v.text;
          const userText = document.getElementById('expertRecitationInput')?.value || '';
          const comparison = this.compareTextWords(actualText, userText);
          
          controlsEl.innerHTML = `
            <div class="dictation-diff-box glass-panel animate-fade-in" style="padding: 1.25rem; border-radius: 14px; background: #fafafa; border: 1px solid #e2e8f0; text-align: left; line-height: 1.8; margin-bottom: 1.25rem;">
              <h5 style="font-size: 0.85rem; font-weight: 800; color: var(--text-secondary); margin: 0 0 0.75rem 0; display: flex; justify-content: space-between; align-items: center;">
                <span>암송 일치율</span>
                <span style="font-size: 1.15rem; font-weight: 900; color: ${comparison.accuracy >= 90 ? '#16a34a' : (comparison.accuracy >= 70 ? '#d97706' : '#dc2626')};">${comparison.accuracy}%</span>
              </h5>
              <div style="font-size: 0.95rem; font-weight: 600; color: var(--text-primary); word-break: keep-all;">
                ${comparison.html}
              </div>
            </div>
            
            <div class="study-action-row" style="display: flex; gap: 0.75rem; margin-top: 1rem;">
              <button class="btn-study-primary expert" id="btnStudyAction" onclick="app.nextStudyVerse()">다음 절</button>
            </div>
          `;
        } else {
          controlsEl.innerHTML = `
            <div style="margin-bottom: 1.25rem;">
              <textarea id="expertRecitationInput" placeholder="이곳에 구절을 타이핑하여 암송해 보세요." style="width: 100%; height: 100px; padding: 0.88rem 1rem; border-radius: 14px; border: 1px solid #cbd5e1; outline: none; font-size: 0.95rem; line-height: 1.6; resize: none; font-weight: 500; font-family: inherit; box-shadow: inset 0 2px 4px rgba(0,0,0,0.01); transition: border-color 0.2s ease;" oninput="document.getElementById('btnStudyAction').disabled = this.value.trim().length === 0;"></textarea>
            </div>
            
            <div class="study-action-row" style="display: flex; gap: 0.75rem; margin-top: 1rem;">
              <button class="btn-study-primary expert" id="btnStudyAction" onclick="app.checkStudyAnswer()" disabled>정답 확인</button>
            </div>
          `;
        }
      }
    }
  }

  selectStudyOption(idx) {
    if (this.studyAnswered) return;
    this.studySelectedOptionIndex = idx;
    
    const container = document.querySelector('.study-options-container');
    if (container) {
      const options = container.querySelectorAll('.study-option-row');
      options.forEach((opt, index) => {
        opt.classList.toggle('selected', index === idx);
      });
    }
    
    const btnAction = document.getElementById('btnStudyAction');
    if (btnAction) {
      btnAction.disabled = false;
    }
  }

  checkStudyAnswer() {
    if (this.studyMode === 'hard') {
      this.studyAnswered = true;
      const correctIdx = this.studyCorrectOptionIndex;
      const selectedIdx = this.studySelectedOptionIndex;
      
      const container = document.querySelector('.study-options-container');
      if (container) {
        const options = container.querySelectorAll('.study-option-row');
        options.forEach((opt, index) => {
          if (index === correctIdx) {
            opt.classList.add('correct');
          } else if (index === selectedIdx) {
            opt.classList.add('incorrect');
          }
          opt.disabled = true;
        });
      }
      
      if (selectedIdx === correctIdx) {
        this.markVerseAsCompleted(true);
        this.showToast('정답입니다! 👏');
      } else {
        this.showToast('오답입니다. 😢');
      }
      
      const btnAction = document.getElementById('btnStudyAction');
      if (btnAction) {
        btnAction.textContent = "다음 절";
        btnAction.disabled = false;
        btnAction.setAttribute('onclick', 'app.nextStudyVerse()');
      }
      
    } else if (this.studyMode === 'expert') {
      const v = this.studyVerses[this.studyCurrentIndex];
      if (!v) return;
      
      const userText = document.getElementById('expertRecitationInput')?.value || '';
      const comparison = this.compareTextWords(v.text, userText);
      this.studyDictationAccuracy = comparison.accuracy;
      this.studyAnswered = true;
      
      if (comparison.accuracy >= 80) {
        this.markVerseAsCompleted(true);
        this.showToast('암송 완료! 👏');
      } else {
        this.showToast(`일치율 ${comparison.accuracy}%로 암송 기준(80%)에 미달했습니다.`);
      }
      
      this.renderStudyMode();
      
    } else if (this.studyMode === 'exam') {
      this.studyAnswered = true;
      const q = this.studyExamQuestions[this.studyExamCurrentIndex];
      const correctIdx = q.correctIndex;
      const selectedIdx = this.studySelectedOptionIndex;
      
      const container = document.querySelector('.study-options-container');
      if (container) {
        const options = container.querySelectorAll('.study-option-row');
        options.forEach((opt, index) => {
          if (index === correctIdx) {
            opt.classList.add('correct');
          } else if (index === selectedIdx) {
            opt.classList.add('incorrect');
          }
          opt.disabled = true;
        });
      }
      
      if (selectedIdx === correctIdx) {
        if (!this.studyExamCorrectCount) this.studyExamCorrectCount = 0;
        this.studyExamCorrectCount++;
        this.showToast('정답입니다! 👏');
      } else {
        this.showToast('오답입니다. 😢');
      }
      
      this.renderStudyMode();
    }
  }

  nextStudyVerse() {
    if (this.studyMode === 'exam') {
      if (this.studyExamCurrentIndex >= 9) {
        this.showStudyExamResult();
        return;
      }
      this.studyExamCurrentIndex++;
      this.studySelectedOptionIndex = null;
      this.studyAnswered = false;
      this.studyShowExplanation = false;
      this.renderStudyMode();
    } else {
      if (this.studyCurrentIndex >= this.studyVerses.length - 1) {
        this.showToast('🎉 해당 장의 모든 구절 학습을 완료했습니다!');
        this.switchView('journeyChapterDetail');
        return;
      }
      this.studyCurrentIndex++;
      this.studySelectedOptionIndex = null;
      this.studyAnswered = false;
      
      const firstIndex = window.BIBLE_DATA.findIndex(v => v.chapter === this.activeJourneyChapter);
      this.activeJourneyVerseIndex = firstIndex + this.studyCurrentIndex;
      
      if (this.studyMode === 'hard') {
        this.generateHardModeOptions();
      }
      this.renderStudyMode();
    }
  }

  prevStudyVerse() {
    if (this.studyMode === 'exam') {
      if (this.studyExamCurrentIndex > 0) {
        this.studyExamCurrentIndex--;
        this.studySelectedOptionIndex = null;
        this.studyAnswered = false;
        this.studyShowExplanation = false;
        this.renderStudyMode();
      }
    } else {
      if (this.studyCurrentIndex > 0) {
        this.studyCurrentIndex--;
        this.studySelectedOptionIndex = null;
        this.studyAnswered = false;
        
        const firstIndex = window.BIBLE_DATA.findIndex(v => v.chapter === this.activeJourneyChapter);
        this.activeJourneyVerseIndex = firstIndex + this.studyCurrentIndex;
        
        if (this.studyMode === 'hard') {
          this.generateHardModeOptions();
        }
        this.renderStudyMode();
      }
    }
  }

  toggleStudyBookmark() {
    if (!this.currentUser) return;
    const idx = this.activeJourneyVerseIndex;
    const bookmarks = this.currentUser.bookmarks || [];
    const indexInBookmarks = bookmarks.indexOf(idx);
    let updateData = {};
    if (indexInBookmarks >= 0) {
      updateData.bookmarks = firebase.firestore.FieldValue.arrayRemove(idx);
      this.currentUser.bookmarks = bookmarks.filter(b => b !== idx);
      this.showToast('북마크가 해제되었습니다.');
    } else {
      updateData.bookmarks = firebase.firestore.FieldValue.arrayUnion(idx);
      this.currentUser.bookmarks = [...bookmarks, idx];
      this.showToast('북마크에 추가되었습니다.');
    }
    
    if (!this.currentUser.isTrial) {
      db.collection('users').doc(this.currentUser.id).update(updateData).then(() => {
        this.renderStudyMode();
      });
    } else {
      this.renderStudyMode();
    }
  }

  markVerseAsCompleted(silent = false) {
    if (!this.currentUser) return;
    const idx = this.activeJourneyVerseIndex;
    const completedSet = this.getCompletedVerseIndexSet(this.currentUser);
    if (completedSet.has(idx)) {
      if (!silent) this.showToast('이미 완료된 구절입니다.');
      return;
    }
    
    this.currentUser.completedVerseIndices = Array.from(new Set([...(this.currentUser.completedVerseIndices || []), idx]));
    
    let updateData = {
      completedVerseIndices: firebase.firestore.FieldValue.arrayUnion(idx)
    };
    
    if (!silent) {
      this.showToast('✓ 암송이 완료되었습니다!');
    }
    
    if (!this.currentUser.isTrial) {
      db.collection('users').doc(this.currentUser.id).update(updateData).then(() => {
        this.renderStudyMode();
        this.renderChapterDetail();
      });
    } else {
      this.renderStudyMode();
      this.renderChapterDetail();
    }
  }

  speakText(text) {
    if (!window.speechSynthesis) {
      this.showToast('이 기기에서는 음성 합성을 지원하지 않습니다.');
      return;
    }
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ko-KR';
    utterance.rate = 1.0;
    
    const voices = window.speechSynthesis.getVoices();
    const koVoice = voices.find(v => v.lang.startsWith('ko'));
    if (koVoice) utterance.voice = koVoice;
    
    window.speechSynthesis.speak(utterance);
  }

  showStudyExamResult() {
    const controlsEl = document.getElementById('studyModeControls');
    if (!controlsEl) return;
    
    const refEl = document.getElementById('studyVerseRef');
    if (refEl) refEl.textContent = `요한계시록 ${this.activeJourneyChapter}장 예상 문제 완료`;
    
    const textEl = document.getElementById('studyVerseText');
    if (textEl) textEl.textContent = '수고하셨습니다! 모든 예상 문제를 풀었습니다.';
    
    controlsEl.innerHTML = `
      <div class="result-celebration-container animate-fade-in" style="text-align: center; padding: 2rem 1.25rem;">
        <div class="celebration-trophy" style="margin-bottom: 1.5rem;">
          <span class="material-icons-round" style="font-size: 4.5rem; color: #fbbf24;">military_tech</span>
        </div>
        <h3 style="font-size: 1.35rem; font-weight: 800; color: var(--text-primary); margin: 0 0 0.5rem 0;">예상 문제 완료!</h3>
        <div style="font-size: 2rem; font-weight: 900; color: #7c3aed; margin-bottom: 1.25rem;">
          ${this.studyExamCorrectCount * 10}점 <span style="font-size: 1rem; color: var(--text-muted); font-weight: normal;">/ 100점</span>
        </div>
        <div class="result-reward-card glass-panel" style="padding: 1.25rem; border-radius: 18px; background: white; border: 1px solid #e2e8f0; margin-bottom: 1.5rem; text-align: left; box-shadow: 0 4px 12px rgba(0,0,0,0.02);">
          <div class="reward-row" style="display: flex; justify-content: space-between; font-size: 0.9rem; margin-bottom: 0.5rem;">
            <span class="reward-label" style="color: var(--text-secondary); font-weight: 600;">맞힌 문제</span>
            <span class="reward-value" style="font-weight: 800; color: var(--text-primary);">${this.studyExamCorrectCount} / 10문제</span>
          </div>
          <div class="reward-row" style="display: flex; justify-content: space-between; font-size: 0.9rem;">
            <span class="reward-label" style="color: var(--text-secondary); font-weight: 600;">학습 성과</span>
            <span class="reward-value" style="font-weight: 800; color: #16a34a;">${this.studyExamCorrectCount >= 8 ? '훌륭합니다!' : (this.studyExamCorrectCount >= 5 ? '잘하셨습니다!' : '조금 더 노력해봐요!')}</span>
          </div>
        </div>
        <div style="display: flex; flex-direction: column; gap: 0.75rem;">
          <button class="btn-study-primary exam" onclick="app.startStudyMode('exam')" style="width: 100%;">다시 풀기</button>
          <button class="btn-study-secondary" onclick="app.goBackToChapter()" style="width: 100%;">장 목록으로 이동</button>
        </div>
      </div>
    `;
  }

  compareTextWords(actualText, userText) {
    const cleanActual = actualText.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, "").replace(/\s+/g, " ").trim();
    const cleanUser = userText.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, "").replace(/\s+/g, " ").trim();
    
    const actualWords = cleanActual.split(" ").filter(w => w.length > 0);
    const userWords = cleanUser.split(" ").filter(w => w.length > 0);
    
    const distance = this.levenshteinDistance(cleanActual, cleanUser);
    const maxLength = Math.max(cleanActual.length, cleanUser.length);
    const accuracy = maxLength > 0 ? Math.round(((maxLength - distance) / maxLength) * 100) : 0;
    
    const diffHtmls = [];
    const originalWords = actualText.split(/\s+/).filter(w => w.length > 0);
    
    for (let i = 0; i < originalWords.length; i++) {
      const origWord = originalWords[i];
      const cleanOrig = origWord.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, "").trim();
      
      if (i < userWords.length) {
        const userW = userWords[i];
        if (cleanOrig === userW) {
          diffHtmls.push(`<span style="color: #16a34a; font-weight: bold; margin-right: 0.25rem;">${this.escapeHtml(origWord)}</span>`);
        } else {
          diffHtmls.push(`<span style="color: #dc2626; font-weight: bold; text-decoration: line-through; margin-right: 0.25rem;">${this.escapeHtml(origWord)}</span>`);
        }
      } else {
        diffHtmls.push(`<span style="color: #94a3b8; margin-right: 0.25rem;">${this.escapeHtml(origWord)}</span>`);
      }
    }
    
    return { accuracy, html: diffHtmls.join(" ") };
  }

  levenshteinDistance(a, b) {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    return matrix[b.length][a.length];
  }
}

// Instantiate and bind to window
window.app = new SimonEduApp();

// Global Deep Link Handler for hybrid mobile app
window.handleDeepLink = function(urlOrPath) {
  console.log("handleDeepLink received url/path:", urlOrPath);
  if (!urlOrPath) return;

  // Extract path portion, supporting both simonedu://<path> and http(s)://<domain>/<path>
  let path = urlOrPath;
  if (path.includes('://')) {
    const parts = path.split('://');
    path = parts[1] || '';
  }
  
  // Strip query parameters
  path = path.split('?')[0];
  // Clean leading/trailing slashes
  path = path.replace(/^\/+|\/+$/g, '');

  console.log("Parsed deep link path:", path);

  if (!window.app) {
    console.error("SimonEduApp instance not ready yet.");
    return;
  }

  // Handle routing
  if (path === 'admin') {
    window.app.switchView('dashboard');
  } else if (path === 'dashboard') {
    if (window.app.currentUser) {
      window.app.switchView('dashboard');
    } else {
      window.app.switchView('auth');
    }
  } else if (path === 'attendance') {
    if (window.app.currentUser) {
      window.app.switchView('dashboard');
    } else {
      window.app.switchView('auth');
    }
  } else if (path === 'events' || path === 'event') {
    if (window.app.currentUser) {
      window.app.switchView('events');
    } else {
      window.app.switchView('auth');
    }
  } else if (path === 'notices' || path === 'notice') {
    if (window.app.currentUser) {
      window.app.switchView('notices');
    } else {
      window.app.switchView('auth');
    }
  } else if (path === 'journey') {
    if (window.app.currentUser) {
      window.app.switchView('journey');
    } else {
      window.app.switchView('auth');
    }
  } else if (path === 'ranking') {
    if (window.app.currentUser) {
      window.app.switchView('ranking');
    } else {
      window.app.switchView('auth');
    }
  } else if (path === 'crew') {
    if (window.app.currentUser) {
      window.app.switchView('crew');
    } else {
      window.app.switchView('auth');
    }
  } else if (path === 'settings') {
    if (window.app.currentUser) {
      window.app.switchView('settings');
    } else {
      window.app.switchView('auth');
    }
  } else if (path === 'quiz' || path === 'mission') {
    if (window.app.currentUser) {
      window.app.startMission();
    } else {
      window.app.switchView('auth');
    }
  } else {
    if (window.app.currentUser) {
      window.app.switchView('dashboard');
    } else {
      window.app.switchView('auth');
    }
  }
};

// Auto Session restored check on page load
window.addEventListener('DOMContentLoaded', () => {
  // Managed by auth.onAuthStateChanged listener in constructor
});
