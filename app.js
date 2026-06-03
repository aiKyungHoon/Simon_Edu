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
    return typeof window.MobileAppChannel !== 'undefined' || typeof window.Vibration !== 'undefined';
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


      // Re-render settings panel if active
      const settingsView = document.getElementById('settingsView');
      if (settingsView && settingsView.classList.contains('active')) {
        this.renderSettings();
      }
    }, error => {
      console.error("Firestore snapshot sync error:", error);
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
      bg: '#fdf8e6',
      g1: 'rgba(253, 224, 71, 0.22)',
      g2: 'rgba(217, 119, 6, 0.12)',
      glass: 'rgba(255, 255, 255, 0.72)',
      glassHover: 'rgba(255, 255, 255, 0.88)',
      glassBorder: 'rgba(184, 134, 11, 0.2)',
      textPrimary: '#3d341c',
      textSecondary: '#6b5c37',
      textMuted: '#96855b',
      glassBorderFocus: 'rgba(184, 134, 11, 0.6)',
      accentPurple: '#b8860b',
      accentPurpleGlow: 'rgba(184, 134, 11, 0.12)',
      accentBlue: '#926f15',
      headerBg: 'rgba(253, 248, 230, 0.8)',
      stampBg: 'rgba(184, 134, 11, 0.06)',
      leaderboardItemBg: 'rgba(255, 255, 255, 0.75)',
      footerBg: 'rgba(253, 248, 230, 0.95)'
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
    if (this.currentUser && this.currentUser.isTrial) {
      if (viewName === 'ranking') {
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
      if (['dashboard', 'attendance', 'ranking'].includes(viewName)) {
        gridContainer.style.display = '';
      } else {
        gridContainer.style.display = 'none';
      }
    }

    if (!this.isMobileApp && ['dashboard', 'attendance', 'ranking'].includes(viewName)) {
      // Hide auth and game views on desktop web
      ['auth', 'game'].forEach(v => {
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
    } else if (viewName === 'settings') {
      this.renderSettings();
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



    if (this.isMobileApp) {
      document.body.classList.add('mobile-app');
    }

    const desktopNav = document.getElementById('desktopNav');
    if (desktopNav) {
      desktopNav.style.display = 'none';
    }

    this.renderNotifications();
    if (!document.body.classList.contains('single-path-route')) {
      this.switchView('dashboard');
    }
  }

  // 5. Dashboard View Setup
  renderDashboard() {
    if (!this.currentUser) return;

    this.populateTestVerseSelect();

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

    const startBtn = document.querySelector('.btn-start-mission');
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

    // 5.4 Render Leaderboard
    this.renderLeaderboardWidget();
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
    const sortedUsers = [...this.users].sort((a, b) => b.points - a.points);
    
    // Compute joint ranks (standard competition ranking: 1-2-2-4)
    let currentRank = 1;
    for (let i = 0; i < sortedUsers.length; i++) {
      if (i > 0 && sortedUsers[i].points < sortedUsers[i - 1].points) {
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
          <div class="leaderboard-name">${user.name} ${isMe ? '<span style="color:#d8b4fe; font-size:0.75rem;">(나)</span>' : ''}</div>
          <div class="leaderboard-points">${user.points.toLocaleString()} P</div>
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
    const sortedUsers = [...this.users].sort((a, b) => b.points - a.points);
    
    // Compute joint ranks
    let currentRank = 1;
    for (let i = 0; i < sortedUsers.length; i++) {
      if (i > 0 && sortedUsers[i].points < sortedUsers[i - 1].points) {
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
        if (popupMyPointsText) popupMyPointsText.textContent = `${myUser.points.toLocaleString()} P`;
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
        <div class="all-ranking-name">${user.name} ${isMe ? '<span style="color:var(--text-muted); font-size:0.75rem; font-weight:normal;">(나)</span>' : ''}</div>
        <div class="all-ranking-points">${user.points.toLocaleString()} P</div>
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
    const newNotification = {
      id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      message: `🎁 관리자 보너스 +${amount}P`,
      timestamp: Date.now(),
      read: false
    };
    const adminHistory = {
      id: 'hist_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      type: 'admin',
      title: '관리자 보너스 포인트',
      amount: amount,
      date: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
    };
    db.collection('users').doc(userId).update({
      points: firebase.firestore.FieldValue.increment(amount),
      notifications: firebase.firestore.FieldValue.arrayUnion(newNotification),
      pointsHistory: firebase.firestore.FieldValue.arrayUnion(adminHistory)
    }).catch(err => console.error("Error adding points:", err));
  }

  addNotification(message) {
    if (!this.currentUser) return;
    const newNotification = {
      id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      message: message,
      timestamp: Date.now(),
      read: false
    };
    if (this.currentUser.isTrial) {
      if (!this.currentUser.notifications) this.currentUser.notifications = [];
      this.currentUser.notifications.push(newNotification);
      this.renderNotifications();
      return;
    }
    db.collection('users').doc(this.currentUser.id).update({
      notifications: firebase.firestore.FieldValue.arrayUnion(newNotification)
    }).catch(err => console.error("Error adding notification:", err));
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
    const updatedNotifications = notifications.map(n => ({ ...n, read: true }));
    
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
    
    const unreadCount = sortedNotifs.filter(n => !n.read).length;
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
      item.className = `notification-item ${n.read ? 'read' : 'unread'}`;
      
      const timeStr = this.formatRelativeTime(n.timestamp);
      
      item.innerHTML = `
        <div class="notification-content">${n.message}</div>
        <div class="notification-time">${timeStr}</div>
      `;
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
    const newNotification = {
      id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      message: notifMsg,
      timestamp: Date.now(),
      read: false
    };

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
    this.switchView('game');
    this.initializeQuiz();
  }

  setDifficulty(diff) {
    this.currentDifficulty = diff;
    
    // Toggle active classes on buttons
    document.getElementById('btnDiffEasy').classList.toggle('active', diff === 'easy');
    document.getElementById('btnDiffMedium').classList.toggle('active', diff === 'medium');
    document.getElementById('btnDiffHard').classList.toggle('active', diff === 'hard');
    
    // Change game points label depending on difficulty
    const pointsLabel = document.getElementById('gameEarnedPoints');
    if (diff === 'easy') pointsLabel.textContent = '80';
    else if (diff === 'medium') pointsLabel.textContent = '100';
    else if (diff === 'hard') pointsLabel.textContent = '130';

    if (this.gameActive) {
      this.initializeQuiz();
    }
  }

  initializeQuiz() {
    this.clearIntervals();
    
    this.gameActive = true;
    this.gameHearts = 3;
    this.gameTimeRemaining = 60;
    this.currentQuizBlanks = [];

    // Header Setup
    document.getElementById('gameVerseTitle').textContent = `요한계시록 ${this.currentQuizVerse.chapter}장 ${this.currentQuizVerse.verse}절 시험` + (this.isTestMode ? ' [테스트]' : '');
    document.getElementById('gameTimer').textContent = this.gameTimeRemaining;
    this.renderHearts();

    const pointsStatElem = document.querySelector('.game-stat-item.points');
    if (pointsStatElem) {
      pointsStatElem.style.display = this.isTestMode ? 'none' : 'flex';
    }
    
    // Build Blank Interface
    const text = this.currentQuizVerse.text;
    const keywords = this.currentQuizVerse.keywords;
    
    // Determine how many keywords to turn into blanks based on difficulty
    let blanksCount = 1;
    if (this.currentDifficulty === 'easy') {
      blanksCount = Math.max(1, Math.min(2, Math.round(keywords.length * 0.3)));
    } else if (this.currentDifficulty === 'medium') {
      blanksCount = Math.max(2, Math.min(3, Math.round(keywords.length * 0.6)));
    } else { // Hard
      blanksCount = keywords.length; // Hide all available key phrases
    }

    // Select random keywords to hide
    const shuffledKeywords = [...keywords].sort(() => 0.5 - Math.random());
    const selectedBlanks = shuffledKeywords.slice(0, blanksCount);
    
    // Replace text elements with blank input fields
    let quizHtml = text;
    
    // Sort selectedBlanks by length descending so longer phrases match first
    selectedBlanks.sort((a, b) => b.length - a.length);
    
    this.currentQuizBlanks = selectedBlanks.map((phrase, idx) => {
      // Find matching phrase and replace with input tag
      const placeholder = `__BLANK_${idx}__`;
      quizHtml = quizHtml.replace(phrase, placeholder);
      return {
        id: idx,
        answer: phrase
      };
    });

    // Hydrate HTML with inputs
    this.currentQuizBlanks.forEach(item => {
      // Width calculation: approx 15px per Korean character
      const widthPx = Math.max(50, item.answer.length * 20 + 20);
      const inputTag = `<input type="text" class="blank-input" id="blank_${item.id}" data-idx="${item.id}" style="width: ${widthPx}px" placeholder="?" autocomplete="off">`;
      quizHtml = quizHtml.replace(`__BLANK_${item.id}__`, inputTag);
    });

    const card = document.getElementById('verseTestCard');
    card.innerHTML = quizHtml;

    // Start countdown timer
    const timerElem = document.getElementById('gameTimer');
    this.gameTimerInterval = setInterval(() => {
      this.gameTimeRemaining--;
      timerElem.textContent = this.gameTimeRemaining;
      
      // Flash red when timer goes low
      if (this.gameTimeRemaining <= 10) {
        timerElem.style.color = 'var(--accent-rose)';
        timerElem.parentElement.style.animation = 'pulse-glow 1s infinite';
      } else {
        timerElem.style.color = 'var(--accent-rose)';
        timerElem.parentElement.style.animation = 'none';
      }

      if (this.gameTimeRemaining <= 0) {
        this.triggerQuizFail("시간이 초과되었습니다!");
      }
    }, 1000);

    // Focus first input automatically
    const firstInput = document.getElementById('blank_0');
    if (firstInput) firstInput.focus();
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
  submitQuiz() {
    if (!this.gameActive) return;

    let allCorrect = true;
    let firstWrongInput = null;

    this.currentQuizBlanks.forEach(item => {
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
      this.triggerQuizSuccess();
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

  triggerQuizSuccess() {
    this.clearIntervals();
    this.gameActive = false;

    // Calculate score
    let basePoints = 100;
    if (this.currentDifficulty === 'easy') basePoints = 80;
    else if (this.currentDifficulty === 'medium') basePoints = 100;
    else if (this.currentDifficulty === 'hard') basePoints = 130;

    // Time bonus: 2P per second remaining
    const timeBonus = this.gameTimeRemaining * 2;
    const totalAward = basePoints + timeBonus;

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
      const modalBody = document.getElementById('modalCompleteBody');
      modalBody.innerHTML = `
        요한계시록 ${this.currentQuizVerse.chapter}장 ${this.currentQuizVerse.verse}절 [테스트 모드] 시험을 완료했습니다!<br><br>
        기본 포인트: <strong>+${basePoints} P (테스트 모드 - 미지급)</strong><br>
        남은 시간 보너스 (${this.gameTimeRemaining}s): <strong>+${timeBonus} P (테스트 모드 - 미지급)</strong><br>
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
    const nextVerseIndex = this.currentUser.currentVerseIndex + 1;

    const totalEarned = totalAward + (checkInResult ? checkInResult.pointsAwarded : 0);
    const newNotification = {
      id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      message: `📖 요한계시록 ${this.currentQuizVerse.chapter}장 ${this.currentQuizVerse.verse}절 암송 성공! +${totalEarned}P 적립`,
      timestamp: Date.now(),
      read: false
    };

    const quizHistory = {
      id: 'hist_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      type: 'challenge',
      title: `암송 성공 (요한계시록 ${this.currentQuizVerse.chapter}장 ${this.currentQuizVerse.verse}절)`,
      amount: totalAward,
      date: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
    };

    let updateData = {
      points: firebase.firestore.FieldValue.increment(totalAward),
      lastMissionDate: todayStr,
      currentVerseIndex: nextVerseIndex,
      notifications: firebase.firestore.FieldValue.arrayUnion(newNotification),
      pointsHistory: firebase.firestore.FieldValue.arrayUnion(quizHistory)
    };

    if (checkInResult) {
      updateData.lastCheckInDate = todayStr;
      updateData.consecutiveCheckIns = checkInResult.consecutiveCheckIns;
      updateData.checkInHistory = firebase.firestore.FieldValue.arrayUnion(todayStr);
      updateData.points = firebase.firestore.FieldValue.increment(totalEarned);
      
      const checkInHistoryObj = {
        id: 'hist_' + (Date.now() + 1) + '_' + Math.random().toString(36).substr(2, 5),
        type: 'attendance',
        title: checkInResult.gotBonus ? `연속 출석 보너스 (${checkInResult.consecutiveCheckIns}일차)` : '일일 출석 체크',
        amount: checkInResult.pointsAwarded,
        date: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
      };
      updateData.pointsHistory = firebase.firestore.FieldValue.arrayUnion(quizHistory, checkInHistoryObj);
    }

    db.collection('users').doc(this.currentUser.id).update(updateData).then(() => {
      // Populate Success Modal
      const modalBody = document.getElementById('modalCompleteBody');
      let htmlContent = `
        요한계시록 ${this.currentQuizVerse.chapter}장 ${this.currentQuizVerse.verse}절 암송 시험을 완료했습니다!<br><br>
        기본 포인트: <strong>+${basePoints} P</strong><br>
        남은 시간 보너스 (${this.gameTimeRemaining}s): <strong>+${timeBonus} P</strong><br>
      `;

      if (checkInResult) {
        htmlContent += `
          출석 체크 보너스: <strong>+${checkInResult.pointsAwarded} P</strong> (연속 ${checkInResult.consecutiveCheckIns}일차)<br>
          <span style="font-size:0.8rem; color:var(--accent-emerald);">📅 오늘의 출석체크가 자동 완료되었습니다!</span><br>
        `;
      }

      const totalEarned = totalAward + (checkInResult ? checkInResult.pointsAwarded : 0);
      htmlContent += `
        <hr style="margin: 0.75rem 0; border:0; border-top:1px solid var(--glass-border);">
        총 획득한 포인트: <strong style="color:var(--accent-amber); font-size:1.15rem;">+${totalEarned} P</strong>
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
      this.playConfetti('quiz');
      this.openModal('modalComplete');

      // Show toast on success
      let toastMsg = `📖 요한계시록 ${this.currentQuizVerse.chapter}장 ${this.currentQuizVerse.verse}절 암송 성공! (+${totalAward}P)`;
      if (checkInResult) {
        toastMsg += ` & 오늘의 출석체크 자동 완료! (+${checkInResult.pointsAwarded}P)`;
      }
      this.showToast(toastMsg);
    }).catch(err => {
      console.error("Error updating quiz success:", err);
      alert("진도 업데이트 중 오류가 발생했습니다.");
    });
  }

  triggerQuizFail(reason) {
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
    this.switchView('dashboard');
  }

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
    window.location.href = 'https://simon-edu-bible-game-admin.web.app';
    return;
  } else if (path === 'dashboard') {
    if (window.app.currentUser) {
      window.app.switchView('dashboard');
    } else {
      window.app.switchView('auth');
    }
  } else if (path === 'attendance') {
    if (window.app.currentUser) {
      window.app.switchView('attendance');
    } else {
      window.app.switchView('auth');
    }
  } else if (path === 'ranking') {
    if (window.app.currentUser) {
      window.app.switchView('ranking');
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
