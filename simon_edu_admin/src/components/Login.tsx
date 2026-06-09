import React, { useState } from 'react';
import { signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { canOpenAdmin } from '../roles';

interface LoginProps {
  onLoginSuccess: (email: string) => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const inputId = username.trim().toLowerCase();
    let virtualEmail = inputId;
    if (!virtualEmail.includes('@')) {
      virtualEmail = `${inputId}@simon.edu`;
    }

    try {
      let user;
      try {
        // 1. Try to sign in with Firebase Auth
        const userCredential = await signInWithEmailAndPassword(auth, virtualEmail, password);
        user = userCredential.user;
      } catch (authErr: any) {
        // If user not found, check if it's the admin seed credentials
        if (
          (authErr.code === 'auth/user-not-found' || authErr.code === 'auth/invalid-credential') &&
          inputId === 'admin' &&
          password === 'admin123'
        ) {
          console.log("Seeding admin account dynamically...");
          const userCredential = await createUserWithEmailAndPassword(auth, virtualEmail, password);
          user = userCredential.user;

          // Initialize admin user document in Firestore
          await setDoc(doc(db, 'users', user.uid), {
            id: user.uid,
            username: 'admin',
            name: '관리자 (Simon)',
            email: 'admin@simon.edu',
            role: 'admin',
            points: 2450,
            consecutiveCheckIns: 4,
            lastCheckInDate: new Date().toISOString().split('T')[0],
            lastMissionDate: new Date().toISOString().split('T')[0],
            currentVerseIndex: 14,
            checkInHistory: [],
            pointsHistory: [
              {
                id: 'hist_seed_' + Date.now(),
                type: 'signup',
                title: '회원가입 축하금',
                amount: 100,
                date: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
              }
            ]
          });
        } else {
          // Re-throw if not seed admin credentials
          throw authErr;
        }
      }

      // 2. Query user doc in Firestore to check admin role
      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);

      if (userDoc.exists()) {
        const userData = userDoc.data();
        if (canOpenAdmin(userData.role)) {
          // Success
          onLoginSuccess(user.email || 'Admin');
        } else {
          // Not an admin
          setError('관리자 페이지 로그인 권한이 없습니다. 임과장 또는 관리자 계정으로 로그인해주세요.');
          await signOut(auth);
        }
      } else {
        setError('사용자 정보를 찾을 수 없습니다.');
        await signOut(auth);
      }
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
        setError('아이디 또는 비밀번호가 올바르지 않습니다.');
      } else {
        setError('로그인 도중 오류가 발생했습니다: ' + (err.message || err));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="glass-panel login-card">
        <div className="login-header">
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <span className="material-icons-round" style={{ fontSize: '2.5rem', color: 'var(--accent-purple)' }}>
              menu_book
            </span>
            <h1 className="logo-text" style={{ margin: 0, fontSize: '2.25rem' }}>
              Simon<span>Edu</span>
            </h1>
          </div>
          <p>관리자 시스템 로그인</p>
        </div>

        <div style={{
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid var(--glass-border)',
          borderRadius: '8px',
          padding: '0.65rem',
          fontSize: '0.8rem',
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          color: 'var(--text-secondary)'
        }}>
          <span className="material-icons-round" style={{ fontSize: '1rem', color: 'var(--accent-purple)' }}>info</span>
          <span>테스트 계정: admin / admin123</span>
        </div>

        <form onSubmit={handleSubmit}>
          {error && (
            <div style={{
              background: 'rgba(244, 63, 94, 0.15)',
              border: '1px solid rgba(244, 63, 94, 0.3)',
              color: 'var(--accent-rose)',
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              fontSize: '0.85rem',
              marginBottom: '1.25rem',
              textAlign: 'center'
            }}>
              {error}
            </div>
          )}

          <div className="form-group" style={{ marginBottom: '1.25rem' }}>
            <label htmlFor="username">관리자 아이디</label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                id="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                style={{ paddingLeft: '2.5rem' }}
              />
              <span className="material-icons-round" style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
                fontSize: '1.2rem'
              }}>
                person
              </span>
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: '2rem' }}>
            <label htmlFor="password">비밀번호</label>
            <div style={{ position: 'relative' }}>
              <input
                type="password"
                id="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{ paddingLeft: '2.5rem' }}
              />
              <span className="material-icons-round" style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
                fontSize: '1.2rem'
              }}>
                lock
              </span>
            </div>
          </div>

          <button
            type="submit"
            className="btn-primary"
            disabled={loading}
            style={{ width: '100%', justifyContent: 'center', padding: '0.8rem' }}
          >
            {loading ? '로그인 중...' : '관리자 로그인'}
          </button>
        </form>
      </div>
    </div>
  );
}
