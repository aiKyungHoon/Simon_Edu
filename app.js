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
    this.activeEvents = [];
    this.currentRankingTab = 'all';
    this.currentEventDetail = null;

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
      const today = new Date().toISOString().split('T')[0];
      snapshot.forEach(doc => {
        const eventData = { id: doc.id, ...doc.data() };
        const startsOk = !eventData.startDate || eventData.startDate <= today;
        const endsOk = !eventData.endDate || eventData.endDate >= today;
        if (eventData.active !== false && startsOk && endsOk) {
          this.activeEvents.push(eventData);
        }
      });
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
      authFooterText.innerHTML = `아직 계정이 없으신가요? <a href="#" onclick="app.setAuthTab('signup'); return false;">회원가입</a>`;
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

      const virtualEmail = `${usernameId.toLowerCase()}@simon.edu`;

      auth.createUserWithEmailAndPassword(virtualEmail, password)
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
      const virtualEmail = `${usernameId.toLowerCase()}@simon.edu`;

      auth.signInWithEmailAndPassword(virtualEmail, password)
        .then(() => {
          // Success handled by Auth state listener
        })
        .catch(err => {
          if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
            const seedInfo = SEED_USERS[usernameId.toLowerCase()];
            if (seedInfo && password === seedInfo.password) {
              auth.createUserWithEmailAndPassword(virtualEmail, password)
                .then(userCredential => {
                  const seedData = this.getSeedUserData(usernameId);
                  seedData.id = userCredential.user.uid;
                  return db.collection('users').doc(seedData.id).set(seedData);
                })
                .catch(signUpErr => {
                  console.error("Seed user migration failure:", signUpErr);
                  alert('아이디 또는 비밀번호가 일치하지 않습니다.');
                });
              return;
            }
          }
          console.error(err);
          alert('아이디 또는 비밀번호가 일치하지 않습니다.');
        });
    }
  }

  logout() {
    if (this.currentUser && this.currentUser.isTrial) {
      this.currentUser = null;
      this.isTrialMode = false;
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
    if (this.hideBattleMode && viewName === 'crew') {
      viewName = 'dashboard';
    }
    if (viewName === 'exam' && !this.hasActiveExamEvent()) {
      alert('현재 진행 중인 사명자 시험 이벤트가 없습니다.');
      viewName = 'dashboard';
    }

    const singleDashboardViews = ['game', 'exam', 'settings', 'events', 'eventDetail', 'journey'];
    document.body.classList.toggle('single-dashboard-view', singleDashboardViews.includes(viewName));
    document.body.classList.toggle('hide-bottom-nav', ['game', 'exam', 'auth'].includes(viewName));

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
      if (['dashboard', 'attendance', 'ranking', 'crew', 'events', 'eventDetail', 'journey', 'game', 'exam', 'settings'].includes(viewName)) {
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
    } else if (viewName === 'journey') {
      this.renderJourneyView();
    } else if (viewName === 'admin') {
      this.switchView('dashboard');
    } else if (viewName === 'settings') {
      this.renderSettings();
    } else if (viewName === 'exam') {
      this.renderExamView();
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
      ranking: 'bottomNavJourney',
      events: 'bottomNavEvents',
      eventDetail: 'bottomNavEvents',
      journey: 'bottomNavJourney',
      settings: 'bottomNavSettings'
    };
    const active = document.getElementById(map[viewName] || 'bottomNavDashboard');
    if (active) active.classList.add('active');
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
    
    // Calculate and update Progress Ring
    const progressPercent = Math.min(Math.round((curIdx / bibleData.length) * 100), 100);
    const progressPct = document.getElementById('progressPct');
    if (progressPct) progressPct.textContent = `${progressPercent}%`;
    
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
      if (titleEl) titleEl.textContent = `요한계시록 ${currentVerse.chapter}장 ${currentVerse.verse}절`;
      
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
    this.renderJourneyView();
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
      statusEl.innerHTML = doneToday
        ? `<span class="material-icons-round">verified</span> 오늘 출석 완료`
        : `<span class="material-icons-round">event_available</span> 오늘 출석 전`;
    }

    const streakEl = document.getElementById('homeAttendanceStreak');
    if (streakEl) {
      streakEl.textContent = `연속 출석 ${consecutive}일 · ${remainText}`;
    }

    const btn = document.getElementById('btnHomeAttendance');
    if (btn) {
      btn.disabled = doneToday;
      btn.classList.toggle('completed', doneToday);
      btn.textContent = doneToday ? '오늘 출석 완료' : '출석 보상 받기';
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
    if (events.length === 0) {
      list.innerHTML = '<div class="home-empty-state">진행 중인 이벤트가 없습니다.</div>';
      return;
    }

    list.innerHTML = events.slice(0, 3).map(evt => {
      const bannerUrl = this.getEventBannerUrl(evt);
      const bgStyle = bannerUrl
        ? `background-image: linear-gradient(0deg, rgba(20,20,20,0.72), rgba(20,20,20,0.18)), url('${this.escapeHtml(bannerUrl)}');`
        : '';
      return `
        <button class="event-banner-card ${bannerUrl ? 'has-image' : ''}" style="${bgStyle}" onclick="app.openEventFromHome('${evt.id}')">
          <div class="event-banner-overlay">
            <span class="material-icons-round">${this.getEventIcon(evt)}</span>
            <div>
              <div class="event-banner-title">${this.escapeHtml(evt.title || this.getEventTypeLabel(evt))}</div>
              <div class="event-banner-meta">${this.getEventTypeLabel(evt)} · ${this.escapeHtml(evt.endDate || '진행 중')}</div>
            </div>
          </div>
        </button>
      `;
    }).join('');
  }

  renderHomeNoticeList() {
    const list = document.getElementById('homeNoticeList');
    if (!list) return;
    const notices = this.getNoticeItems().slice(0, 3);
    if (notices.length === 0) {
      list.innerHTML = '<div class="home-empty-state">등록된 공지사항이 없습니다.</div>';
      return;
    }
    list.innerHTML = notices.map(notice => `
      <button class="notice-item-compact" onclick="app.openNotice('${notice.id}')">
        <div class="notice-item-title-col">
          <span class="material-icons-round" style="font-size:1rem;color:var(--accent-amber);">notifications</span>
          <span class="notice-item-compact-title">${this.escapeHtml(notice.title)}</span>
        </div>
        <span class="notice-item-compact-date">${this.escapeHtml(notice.date)}</span>
      </button>
    `).join('');
  }

  renderEventsView() {
    this.renderHomeEventsAndNotices();
    const eventsList = document.getElementById('eventsPageList');
    const noticesList = document.getElementById('noticesPageList');

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

    if (noticesList) {
      const notices = this.getNoticeItems();
      noticesList.innerHTML = notices.map(notice => `
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
  }

  renderJourneyView() {
    if (!this.currentUser || !window.BIBLE_DATA) return;

    const bibleData = window.BIBLE_DATA || [];
    const curIdx = Math.min(this.currentUser.currentVerseIndex || 0, bibleData.length);
    const journeyTotalChapters = 21;
    const completedChapterCount = this.getCompletedChapterCount(this.currentUser);
    const progressPercent = Math.min(Math.round((completedChapterCount / journeyTotalChapters) * 100), 100);
    const chapters = [...new Set(bibleData.map(v => v.chapter))].filter(chapter => chapter <= journeyTotalChapters);
    const currentVerse = bibleData[curIdx] || bibleData[bibleData.length - 1] || { chapter: 1 };
    const currentChapter = Math.min(currentVerse.chapter || 1, journeyTotalChapters);

    const textEl = document.getElementById('journeyProgressText');
    if (textEl) {
      textEl.textContent = `현재 요한계시록 ${currentChapter}장 진행 중`;
    }
    const countEl = document.getElementById('journeyChapterCount');
    if (countEl) {
      countEl.textContent = `${currentChapter} / ${journeyTotalChapters}장`;
    }
    const pctEl = document.getElementById('journeyProgressPercent');
    if (pctEl) {
      pctEl.textContent = `진행률 ${progressPercent}%`;
    }

    const barEl = document.getElementById('journeyProgressBar');
    if (barEl) barEl.style.width = `${progressPercent}%`;

    const grid = document.getElementById('journeyChapterGrid');
    if (!grid) return;

    grid.innerHTML = chapters.map(chapter => {
      const chapterVerses = bibleData.filter(v => v.chapter === chapter);
      const firstIndex = bibleData.findIndex(v => v.chapter === chapter);
      const lastIndex = firstIndex + chapterVerses.length - 1;
      const isCompleted = curIdx > lastIndex;
      const isOngoing = !isCompleted && curIdx >= firstIndex;
      const statusClass = isCompleted ? 'completed' : (isOngoing ? 'ongoing' : 'locked');
      const icon = isCompleted ? 'check_circle' : (isOngoing ? 'play_circle' : 'lock');
      const label = isCompleted ? '완료' : (isOngoing ? '진행 중' : '대기');
      return `
        <button class="chapter-status-card ${statusClass}" ${isOngoing || isCompleted ? `onclick="app.jumpToChapter(${chapter})"` : 'disabled'}>
          <span class="material-icons-round status-icon">${icon}</span>
          <strong>${chapter}장</strong>
          <span>${label}</span>
        </button>
      `;
    }).join('');

    this.renderJourneyRewards(completedChapterCount);
    this.renderJourneyRanking();
    this.renderFriendsPanel();
  }

  renderJourneyRewards(completedChapterCount) {
    const list = document.getElementById('journeyRewardList');
    if (!list) return;
    const rewards = [
      { chapter: 1, points: 200 },
      { chapter: 5, points: 500 },
      { chapter: 10, points: 1000 },
      { chapter: 21, points: 3000, title: '요한계시록 마스터' }
    ];
    list.innerHTML = rewards.map(reward => {
      const claimed = (this.currentUser.journeyRewardsClaimed || []).includes(reward.chapter);
      const unlocked = completedChapterCount >= reward.chapter;
      const label = reward.title ? `${reward.title} 칭호 지급` : `${reward.chapter}장 완독`;
      return `
        <div class="journey-reward-item ${unlocked ? 'unlocked' : ''}">
          <div class="journey-reward-info">
            <span class="journey-reward-title">${label}</span>
            <span class="journey-reward-points">+${reward.points.toLocaleString()}P</span>
          </div>
          <button class="btn-reward-claim ${claimed ? 'claimed' : ''}" ${unlocked && !claimed ? `onclick="app.claimJourneyReward(${reward.chapter})"` : 'disabled'}>
            ${claimed ? '수령 완료' : (unlocked ? '보상 받기' : '잠김')}
          </button>
        </div>
      `;
    }).join('');
  }

  async claimJourneyReward(chapter) {
    if (!this.currentUser || this.currentUser.isTrial) return;
    const rewards = {
      1: { points: 200 },
      5: { points: 500 },
      10: { points: 1000 },
      21: { points: 3000, title: '요한계시록 마스터' }
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
          <span>${xpGetter(user).toLocaleString()} Faith XP · ${this.getUserTitle(user)}</span>
        </div>
        <span class="material-icons-round app-list-arrow">chevron_right</span>
      </button>
    `).join('');
  }

  setRankingTab(tabName) {
    this.currentRankingTab = tabName;
    document.querySelectorAll('.ranking-tab').forEach(tab => tab.classList.remove('active'));
    const tabId = `rankTab${tabName.charAt(0).toUpperCase()}${tabName.slice(1)}`;
    const target = document.getElementById(tabId);
    if (target) target.classList.add('active');
    this.renderJourneyRanking();
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
    const curIdx = user.currentVerseIndex || 0;
    const completed = new Set();
    bibleData.forEach((verse, index) => {
      if (verse.chapter <= 21 && index < curIdx) completed.add(verse.chapter);
    });
    return completed.size;
  }

  getRankingXp(user) {
    return Number(user.faithXP ?? user.faithXp ?? user.points ?? 0);
  }

  getWeeklyFaithXp(user) {
    return Number(user.weeklyFaithXP ?? user.weeklyFaithXp ?? user.faithXPThisWeek ?? user.faithXpThisWeek ?? user.faithXP ?? user.faithXp ?? user.points ?? 0);
  }

  getUserTitle(user) {
    if (user.title) return user.title;
    if ((user.badges || []).includes('요한계시록 마스터') || this.getCompletedChapterCount(user) >= 21) return '요한계시록 마스터';
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
    if ((this.currentUser.currentVerseIndex || 0) < idx) {
      alert('아직 도달하지 않은 장입니다.');
      return;
    }
    this.currentUser.currentVerseIndex = idx;
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
    const status = this.getEventParticipationStatus(eventItem);
    const typeLabel = this.getEventTypeLabel(eventItem);
    const targetLabel = this.getEventTargetLabel(eventItem);
    const buttonLabel = status === 'completed' ? '결과 보기' : status === 'in_progress' ? '이어하기' : '정보 입력 후 시험 시작하기';
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
            <li>목적: ${this.escapeHtml(eventItem.purpose || '대상자 참여 및 학습 점검')}</li>
            <li>참여 방법: 정보를 입력한 후 시작 버튼을 눌러 진행합니다.</li>
            <li>유의사항: 입력된 정보는 결과 및 관리자 확인용으로 저장됩니다.</li>
            <li>지급 보상: +${Number(eventItem.rewardPoints || eventItem.examMaxPoints || 500).toLocaleString()}P</li>
            <li>합격 시 특별 칭호 지급 가능</li>
          </ul>
        </div>
        <div class="examinee-info-section">
          <h3>응시자 정보 입력</h3>
          <p>시험 시작 전 필수 입력 항목입니다.</p>
          <div class="event-form-grid">
            <div class="form-group" style="margin:0;">
              <label for="eventDetailRegion">지역 (필수)</label>
              <input type="text" id="eventDetailRegion" class="input-field" placeholder="예: 서울 강남교회" value="${this.escapeHtml(this.currentUser?.examRegion || '')}">
            </div>
            <div class="form-group" style="margin:0;">
              <label for="eventDetailName">이름 (필수)</label>
              <input type="text" id="eventDetailName" class="input-field" placeholder="예: 홍길동" value="${this.escapeHtml(this.currentUser?.examApplicantName || this.currentUser?.name || '')}">
            </div>
          </div>
        </div>
        <button class="btn-primary event-detail-start-btn" onclick="app.startEventFromDetail()">${buttonLabel}</button>
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
    const regionInput = document.getElementById('eventDetailRegion');
    const nameInput = document.getElementById('eventDetailName');
    const region = regionInput ? regionInput.value.trim() : '';
    const name = nameInput ? nameInput.value.trim() : '';
    if (!region || !name) {
      alert('지역과 이름을 모두 입력해 주세요.');
      return;
    }
    this.currentEvent = this.currentEventDetail;
    this.currentUser.examRegion = region;
    this.currentUser.examApplicantName = name;
    this.setEventParticipationStatus(this.currentEventDetail, 'in_progress');
    try {
      await db.collection('event_participants').doc(`${this.currentEventDetail.id}_${this.currentUser.id}`).set({
        eventId: this.currentEventDetail.id,
        eventTitle: this.currentEventDetail.title || '',
        userId: this.currentUser.id,
        username: this.currentUser.username || '',
        name,
        region,
        startedAt: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
        status: 'in_progress'
      }, { merge: true });
    } catch (err) {
      console.error('Event participant save error:', err);
    }
    if (this.currentEventDetail.eventType === 'mission_exam') {
      this.switchView('exam');
      setTimeout(() => {
        const regionEl = document.getElementById('examInlineRegion');
        const nameEl = document.getElementById('examInlineName');
        if (regionEl) regionEl.value = region;
        if (nameEl) nameEl.value = name;
      }, 80);
      return;
    }
    if (this.currentEventDetail.eventType === 'special_challenge') {
      this.startChallenge();
      return;
    }
    this.startEventQuiz();
  }

  openNotice(noticeId) {
    const notice = this.getNoticeItems().find(item => item.id === noticeId);
    if (!notice) return;
    alert(`${notice.title}\n\n${notice.body || ''}`);
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

    // Sort all users by points descending
    const sortedUsers = [...this.users].sort((a, b) => this.getRankingXp(b) - this.getRankingXp(a));
    
    // Compute joint ranks (standard competition ranking: 1-2-2-4)
    let currentRank = 1;
    for (let i = 0; i < sortedUsers.length; i++) {
      if (i > 0 && this.getRankingXp(sortedUsers[i]) < this.getRankingXp(sortedUsers[i - 1])) {
        currentRank = i + 1;
      }
      sortedUsers[i].rank = currentRank;
    }

    // Find current user's rank
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
          rankTextEl.textContent = `현재 ${myRank}위입니다!`;
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

      // Render Top 10 users
      sortedUsers.slice(0, 10).forEach((user) => {
        const rank = user.rank;
        const isMe = user.id === this.currentUser.id;
        
        const item = document.createElement('div');
        item.className = `leaderboard-item ${isMe ? 'me' : ''}`;

        // Rank Badge styling
        let rankBadgeClass = 'rank-badge';
        if (rank === 1) rankBadgeClass += ' rank-1';
        else if (rank === 2) rankBadgeClass += ' rank-2';
        else if (rank === 3) rankBadgeClass += ' rank-3';

        item.innerHTML = `
          <div class="${rankBadgeClass}">${rank}</div>
          <div class="leaderboard-avatar">${user.name.charAt(0)}</div>
          <div class="leaderboard-name">${user.username || user.name} ${isMe ? '<span style="color:#d8b4fe; font-size:0.75rem;">(나)</span>' : ''}<span class="rank-item-badge">${this.getUserTitle(user)}</span></div>
          <div class="leaderboard-points">${this.getRankingXp(user).toLocaleString()} Faith XP</div>
          ${!isMe && !this.hideBattleMode ? `
          <button class="btn-mini" onclick="app.requestOneOnOneBattle('${user.id}', '${user.name}')" style="margin-left: 0.75rem;" title="1대1 대결 신청">
            ⚔️
          </button>
          ` : ''}
        `;
        
        list.appendChild(item);
      });
    }

    // Re-render popup if it is open
    const modal = document.getElementById('modalAllRankings');
    if (modal && modal.classList.contains('active')) {
      const searchInput = document.getElementById('rankingSearchInput');
      const filterText = searchInput ? searchInput.value : '';
      this.renderAllRankingsPopupList(filterText);
    }
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
      user.name.toLowerCase().includes(cleanFilter)
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
        if (popupMyPointsText) popupMyPointsText.textContent = `${this.getRankingXp(myUser).toLocaleString()} Faith XP`;
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

      item.innerHTML = `
        <div class="${rankBadgeClass}">${rank}</div>
        <div class="all-ranking-avatar">${user.name.charAt(0)}</div>
        <div class="all-ranking-name">${user.username || user.name} ${isMe ? '<span style="color:var(--text-muted); font-size:0.75rem; font-weight:normal;">(나)</span>' : ''}<span class="rank-item-badge">${this.getUserTitle(user)}</span></div>
        <div class="all-ranking-points">${this.getRankingXp(user).toLocaleString()} Faith XP</div>
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
    if (card) card.style.display = visible ? 'block' : 'none';
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
    if (!this.currentUser || this.currentUser.isTrial || !Array.isArray(this.activeEvents)) return;
    const eventItem = this.activeEvents.find(evt => {
      if (!this._eventTargetsCurrentUser(evt)) return false;
      if (evt.popup !== true && evt.popup !== undefined) return false;
      const todayHideKey = `simon_event_hide_today_${evt.id}_${this.getRelativeDateStr(0)}`;
      if (localStorage.getItem(todayHideKey) === '1') return false;
      return localStorage.getItem(`simon_event_seen_${evt.id}`) !== '1';
    });
    if (!eventItem) return;

    this.currentEvent = eventItem;
    localStorage.setItem(`simon_event_seen_${eventItem.id}`, '1');

    const titleEl = document.getElementById('eventAnnounceTitle');
    const descEl = document.getElementById('eventAnnounceDesc');
    const pointsEl = document.getElementById('eventAnnouncePoints');
    const endEl = document.getElementById('eventAnnounceEndDate');
    const imageContainer = document.getElementById('eventAnnounceImageContainer');
    const imageEl = document.getElementById('eventAnnounceImage');

    if (titleEl) titleEl.textContent = eventItem.title || '이벤트 안내';
    if (descEl) descEl.textContent = eventItem.description || '';
    if (pointsEl) pointsEl.textContent = eventItem.rewardPoints || 0;
    if (endEl) endEl.textContent = eventItem.endDate || '-';
    if (imageContainer && imageEl) {
      const bannerUrl = this.getEventBannerUrl(eventItem);
      if (bannerUrl) {
        imageEl.src = bannerUrl;
        imageContainer.style.display = 'block';
      } else {
        imageContainer.style.display = 'none';
      }
    }

    this.openModal('modalEventAnnouncement');
  }

  clickEventAnnounceJoin() {
    if (!this.currentEvent) return;
    this.closeModal('modalEventAnnouncement');
    this.currentEventDetail = this.currentEvent;
    this.switchView('eventDetail');
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
    const badge = document.getElementById('notificationBadge');
    if (badge) {
      if (unreadCount > 0) {
        badge.textContent = unreadCount;
        badge.style.display = 'inline-flex';
      } else {
        badge.style.display = 'none';
      }
    }
    
    const list = document.getElementById('notificationList');
    if (!list) return;
    
    if (sortedNotifs.length === 0) {
      list.innerHTML = '<div class="notification-empty">새로운 알림이 없습니다.</div>';
      return;
    }
    
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
        // 신청자에게 수락 알림 + 즉시 시작 버튼
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
    document.getElementById('gameTimer').textContent = this.gameTimeRemaining;
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
        timerElem.style.color = 'var(--accent-rose)';
        if (timerElem.parentElement) timerElem.parentElement.style.animation = 'pulse-glow 1s infinite';
      } else {
        timerElem.style.color = '';
        if (timerElem.parentElement) timerElem.parentElement.style.animation = 'none';
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
    if (!titleEl || !this.currentQuizVerse) return;
    if (this.isExamMode && this.examQuestions.length) {
      titleEl.textContent = `${this.currentExamQuestionIndex + 1} / ${this.examQuestions.length} 문제`;
      return;
    }
    if (this.challengeActive) {
      const total = this._getChallengeVersesFromSettings().length || 1;
      titleEl.textContent = `1 / ${total} 문제 · 스페셜 암송 챌린지`;
      return;
    }
    const bibleData = window.BIBLE_DATA || [];
    const current = Math.min((this.currentUser?.currentVerseIndex || 0) + 1, bibleData.length || 1);
    titleEl.textContent = `${current} / ${bibleData.length || 1} 문제 · 요한계시록 ${this.currentQuizVerse.chapter}장 ${this.currentQuizVerse.verse}절`;
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

    // 시간 차감 포인트 계산: 5초당 10P 차감, 최저 10P 보장
    const basePoints = this._quizBasePoints || 100;
    const elapsed = this._quizElapsedSeconds || 0;
    const deducted = Math.floor(elapsed / 5) * 10;
    let totalAward = Math.max(10, basePoints - deducted);
    if (hasCustomBonus) {
      totalAward += 20;
    }

    // 체험모드 유저 예외처리 분기
    if (this.currentUser && this.currentUser.isTrial) {
      const nextVerseIndex = this.currentUser.currentVerseIndex + 1;
      this.currentUser.currentVerseIndex = nextVerseIndex; // 체험 유저 진도 임시 진행
      
      const pointsEl = document.getElementById('trialQuizCompletePoints');
      if (pointsEl) {
        pointsEl.textContent = `+${totalAward}P`;
      }
      this.playConfetti('quiz');
      this.openModal('modalTrialQuizComplete');
      this.showToast(`📖 요한계시록 ${this.currentQuizVerse.chapter}장 ${this.currentQuizVerse.verse}절 암송 성공! (체험모드)`);
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
    const nextVerseIndex = this.challengeActive ? this.currentUser.currentVerseIndex : (this.currentUser.currentVerseIndex + 1);

    const totalEarned = totalAward + (checkInResult ? checkInResult.pointsAwarded : 0);
    const newNotification = this.createNotification({
      title: '포인트 지급',
      type: 'points',
      message: `📖 요한계시록 ${this.currentQuizVerse.chapter}장 ${this.currentQuizVerse.verse}절 암송 성공! +${totalEarned}P 적립`
    });

    const quizHistory = {
      id: 'hist_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      type: 'challenge',
      title: `암송 성공 (요한계시록 ${this.currentQuizVerse.chapter}장 ${this.currentQuizVerse.verse}절)`,
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

      this.showPointsFloater(totalAward, "암송 시험 통과!");
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
      let toastMsg = `📖 요한계시록 ${this.currentQuizVerse.chapter}장 ${this.currentQuizVerse.verse}절 암송 성공! (+${totalAward}P)`;
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
    this.switchView('dashboard');
  }

  // ============================================================
  // 사명자 시험 시스템
  // ============================================================

  // 사명자 시험용 문제 데이터 (관리자 설정 범위에서 랜덤 출제)
  _getExamQuestionBank() {
    const settings = this.globalSettings || {};
    const verses = this._getVerseRange(
      settings.examStartChapter || 1,
      settings.examStartVerse || 1,
      settings.examEndChapter || 22,
      settings.examEndVerse || 21
    );
    if (verses.length === 0) return [];
    
    // Combine all verses into a single question
    const combinedText = verses.map(v => v.text).join(' ');
    const blanked = combinedText.split(' ').filter(Boolean).map(() => '____').join(' ');
    const reference = verses.length > 1 
      ? `요한계시록 ${verses[0].chapter}장 ${verses[0].verse}절 ~ ${verses[verses.length-1].chapter}장 ${verses[verses.length-1].verse}절`
      : `요한계시록 ${verses[0].chapter}장 ${verses[0].verse}절`;
      
    return [{
      id: `exam_combined`,
      reference,
      question: `${reference} 전체 말씀을 암송해 입력하세요.`,
      blanked,
      answer: combinedText
    }];
  }

  openExamJoinForm() {
    if (!this.currentUser) {
      alert('로그인 후 사명자 시험에 응시할 수 있습니다.');
      this.switchView('auth');
      return;
    }
    const nameInput = document.getElementById('examJoinName');
    const regionInput = document.getElementById('examJoinRegion');
    const inlineNameInput = document.getElementById('examInlineName');
    const inlineRegionInput = document.getElementById('examInlineRegion');
    if (nameInput) nameInput.value = this.currentUser.name || '';
    if (regionInput) regionInput.value = this.currentUser.examRegion || '';
    if (inlineNameInput) inlineNameInput.value = this.currentUser.examApplicantName || this.currentUser.name || '';
    if (inlineRegionInput) inlineRegionInput.value = this.currentUser.examRegion || '';
    this.openModal('modalExamJoin');
  }

  submitExamJoinForm() {
    const regionInput = document.getElementById('examInlineRegion') || document.getElementById('examJoinRegion');
    const nameInput = document.getElementById('examInlineName') || document.getElementById('examJoinName');
    const region = regionInput ? regionInput.value.trim() : '';
    const name = nameInput ? nameInput.value.trim() : '';
    if (!region || !name) {
      alert('지역과 이름을 모두 입력해 주세요.');
      if (!region && regionInput) regionInput.focus();
      else if (!name && nameInput) nameInput.focus();
      return;
    }
    this.currentExamApplicant = { region, name };
    this.closeModal('modalExamJoin');
    this.startExam();
  }

  renderExamView() {
    const container = document.getElementById('examView');
    if (!container) return;

    if (!this.currentUser) return;

    // \uc81c\ucd9c \uc774\ub825 \uac00\uc838\uc640\uc11c \uc2dc\ud5d8 \ubdf0 \uc5c5\ub370\uc774\ud2b8
    const submission = this.currentUser.examSubmission || null;
    const bestScore = submission ? (submission.score || 0) : 0;
    const attemptCount = submission ? (submission.attemptCount || 0) : 0;

    const scoreEl = document.getElementById('examHighestScore');
    const attemptsEl = document.getElementById('examAttemptsCount');
    if (scoreEl) scoreEl.textContent = bestScore;
    if (attemptsEl) attemptsEl.textContent = attemptCount;
    const inlineNameInput = document.getElementById('examInlineName');
    const inlineRegionInput = document.getElementById('examInlineRegion');
    if (inlineNameInput && !inlineNameInput.value) inlineNameInput.value = this.currentUser.examApplicantName || this.currentUser.name || '';
    if (inlineRegionInput && !inlineRegionInput.value) inlineRegionInput.value = this.currentUser.examRegion || '';
    this.bindExamJoinButton();
  }

  bindExamJoinButton() {
    const btn = document.getElementById('btnOpenExamJoin');
    if (!btn || btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    btn.removeAttribute('onclick');
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      this.submitExamJoinForm();
    });
  }

  startExam() {
    if (!this.currentUser) return;
    const container = document.getElementById('examView');
    // \uc6d0\ubcf8 \ub9c8\ud06c\uc5c5 \uc800\uc7a5 (\uc2dc\ud5d8 \ud6c4 \ubcf5\uc6d0\uc6a9)
    if (container && !this._examIntroHtml) {
      this._examIntroHtml = container.innerHTML;
    }
    const bank = this._getExamQuestionBank();
    if (bank.length === 0) {
      alert('관리자가 설정한 사명자 시험 성구 범위에 문제가 있습니다.');
      return;
    }
    this.currentDifficulty = 'master';
    this.isExamMode = true;
    // \ub79c\ub364 10\ubb38\ud56d \uc120\ud0dd
    const shuffled = [...bank].sort(() => Math.random() - 0.5);
    this.examQuestions = shuffled.slice(0, Math.min(10, shuffled.length));
    this.currentExamQuestionIndex = 0;
    this.examCorrectCount = 0;
    this.examAnswers = [];

    this._renderExamQuestion();
  }

  _restoreExamIntro() {
    const container = document.getElementById('examView');
    if (!container) return;
    if (this._examIntroHtml) {
      container.innerHTML = this._examIntroHtml;
      this._examIntroHtml = null; // \ub2e4\uc74c\uc5d0 \ub2e4\uc2dc \uc800\uc7a5\ud558\ub3c4\ub85d \ub9ac\uc14b
    }
    this.renderExamView(); // \uc810\uc218\ub4f1 \ub370\uc774\ud130 \uc5c5\ub370\uc774\ud2b8
    this.bindExamJoinButton();
  }

  _renderExamQuestion() {
    const container = document.getElementById('examView');
    if (!container) return;

    const idx = this.currentExamQuestionIndex;
    const total = this.examQuestions.length;

    if (idx >= total) {
      this._finishExam();
      return;
    }

    const q = this.examQuestions[idx];
    const pct = Math.round(((idx + 1) / total) * 100);

    container.innerHTML = `
      <div class="exam-question-card glass-panel" style="max-width:860px;margin:2rem auto;padding:2rem;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;margin-bottom:1rem;">
          <span style="font-size:1.15rem;font-weight:800;color:var(--accent-amber);">${idx+1} / ${total} 문제</span>
          <span style="font-size:0.85rem;font-weight:700;color:var(--text-secondary);">사명자 시험 · 마스터</span>
        </div>
        <div style="height:7px;background:var(--glass-border);border-radius:999px;margin-bottom:1.75rem;overflow:hidden;">
          <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,var(--accent-amber),var(--accent-emerald));transition:width 0.3s;"></div>
        </div>

        <div style="margin-bottom:1.25rem;">
          <div style="font-size:1.05rem;font-weight:800;color:var(--text-primary);margin-bottom:0.45rem;">
            Q. ${q.reference}
          </div>
          <div style="font-size:0.85rem;color:var(--text-secondary);font-weight:600;">
            마스터 전문 암송: 아래 빈칸 전체에 해당하는 말씀을 입력하세요.
          </div>
        </div>

        <div style="font-size:1.25rem;font-weight:800;line-height:1.75;margin-bottom:1.25rem;color:var(--text-primary);word-break:keep-all;">
          ${q.blanked}
        </div>

        <textarea id="examAnswerInput" class="blank-input"
          style="width:100%;min-height:120px;padding:1rem 1.1rem;font-size:1rem;line-height:1.65;border-radius:12px;margin-bottom:1rem;resize:vertical;font-family:var(--font-kr);"
          placeholder="전체 말씀을 입력하세요..." autocomplete="off"></textarea>

        <div style="display:flex;gap:0.75rem;">
          <button onclick="app.submitExamAnswer()" class="btn-primary"
            style="flex:1;padding:0.9rem;font-size:0.95rem;font-weight:800;border-radius:12px;background:linear-gradient(135deg,var(--accent-amber),var(--accent-emerald));color:#fff;border:none;cursor:pointer;">
            제출
          </button>
          <button onclick="app.skipExamAnswer()" class="btn-secondary"
            style="padding:0.9rem 1.25rem;font-size:0.9rem;font-weight:700;border-radius:12px;background:var(--glass-bg);border:1px solid var(--glass-border);cursor:pointer;color:var(--text-secondary);">
            모름
          </button>
        </div>
      </div>
    `;

    const input = document.getElementById('examAnswerInput');
    if (input) {
      input.focus();
      input.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
          e.preventDefault();
          this.submitExamAnswer();
        }
      });
    }
  }

  _normalizeExamAnswer(value) {
    return String(value || '')
      .replace(/\s+/g, '')
      .replace(/[.,!?;:'"“”‘’(){}\[\]<>·…~\-_/\\]/g, '')
      .toLowerCase();
  }

  submitExamAnswer() {
    const input = document.getElementById('examAnswerInput');
    if (!input) return;
    const q = this.examQuestions[this.currentExamQuestionIndex];
    const userVal = input.value.trim();
    const correctVal = q.answer.trim();
    const isCorrect = this._normalizeExamAnswer(userVal) === this._normalizeExamAnswer(correctVal);

    this.examAnswers.push({ question: q.question, correct: correctVal, userAnswer: userVal, isCorrect });
    if (isCorrect) this.examCorrectCount++;

    this.currentExamQuestionIndex++;
    this._renderExamQuestion();
  }

  skipExamAnswer() {
    const q = this.examQuestions[this.currentExamQuestionIndex];
    this.examAnswers.push({ question: q.question, correct: q.answer, userAnswer: '(미입력)', isCorrect: false });
    this.currentExamQuestionIndex++;
    this._renderExamQuestion();
  }

  async _finishExam() {
    const total = this.examQuestions.length;
    const correct = this.examCorrectCount;
    const score = Math.round((correct / total) * 100);
    const applicantRegion = (this.currentExamApplicant?.region || '').trim();
    const applicantName = (this.currentExamApplicant?.name || this.currentUser.name || '').trim();
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

    // 정답 요약 HTML
    const answerHtml = this.examAnswers.map((a, i) => `
      <div style="display:flex;gap:0.5rem;align-items:flex-start;padding:0.5rem 0;border-bottom:1px solid var(--glass-border);">
        <span style="font-size:1rem;">${a.isCorrect ? '✅' : '❌'}</span>
        <div style="flex:1;font-size:0.85rem;">
          <div style="font-weight:600;">${i+1}. ${a.question}</div>
          <div style="color:var(--text-secondary);">내 답: ${a.userAnswer || '(미입력)'}</div>
          ${!a.isCorrect ? `<div style="color:var(--accent-emerald);">정답: ${a.correct}</div>` : ''}
        </div>
      </div>
    `).join('');

    container.innerHTML = `
      <div class="exam-result-card glass-panel" style="max-width:600px;margin:2rem auto;padding:2rem;">
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

        <details style="margin-bottom:1.5rem;">
          <summary style="cursor:pointer;font-weight:700;color:var(--accent-purple);margin-bottom:0.5rem;">📋 답안 확인</summary>
          <div style="max-height:300px;overflow-y:auto;padding:0.5rem 0;">${answerHtml}</div>
        </details>

        <button onclick="app.completeExamAndGoHome()" class="btn-primary"
          style="width:100%;padding:0.8rem;font-size:0.95rem;font-weight:700;border-radius:10px;background:linear-gradient(135deg,var(--accent-purple),var(--accent-blue));color:#fff;border:none;cursor:pointer;">
          처음으로 돌아가기
        </button>
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
          lastUserId: this.currentUser.id,
          lastUserEmail: this.currentUser.email || '',
          updatedAt: Date.now(),
          attempts: [...previousAttempts, attemptRecord].slice(-30)
        };

        const updateData = { examSubmission: newSubmission };
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
          updateData.pointsHistory = firebase.firestore.FieldValue.arrayUnion(examHistory);
          this.showPointsFloater(pointDiff, `사명자 시험 +${pointDiff}P`);
          this.playConfetti('quiz');
        }

        await db.collection('users').doc(this.currentUser.id).update(updateData);

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

  _getMissionExamSubmissionKey(region, name) {
    const cleanRegion = String(region || '').trim().replace(/\s+/g, ' ');
    const cleanName = String(name || '').trim().replace(/\s+/g, ' ');
    if (!cleanRegion || !cleanName) return '';
    return `${cleanRegion}__${cleanName}`.toLowerCase().replace(/[\/#?\[\]]/g, '_');
  }

  completeExamAndGoHome() {
    const container = document.getElementById('examView');
    if (container && this._examIntroHtml) {
      container.innerHTML = this._examIntroHtml;
      this._examIntroHtml = null;
    }
    this.isExamMode = false;
    this.examQuestions = [];
    this.examAnswers = [];
    this.currentExamQuestionIndex = 0;
    this.examCorrectCount = 0;
    this.currentExamApplicant = null;
    this.switchView('dashboard');
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
      modal.style.display = 'flex';
      // Trigger CSS reflow
      modal.offsetHeight;
      modal.classList.add('active');
    }
  }

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('active');
      setTimeout(() => {
        modal.style.display = 'none';
      }, 300);
    }
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
  } else if (path === 'events' || path === 'event' || path === 'notices') {
    if (window.app.currentUser) {
      window.app.switchView('events');
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
