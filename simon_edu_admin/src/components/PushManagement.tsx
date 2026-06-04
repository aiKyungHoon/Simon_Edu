import React, { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, addDoc, query, orderBy, limit, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

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
  pushToken?: string;
  fcmToken?: string;
  lastActive?: any;
  os?: string;
}

interface PushManagementProps {
  users: User[];
  adminEmail: string;
}

interface PushHistoryItem {
  id: string;
  title: string;
  body: string;
  target: 'all' | 'user';
  targetUid?: string | null;
  targetName?: string | null;
  targetEmail?: string | null;
  fcmToken?: string | null;
  status: 'pending' | 'success' | 'failed';
  createdAt: any;
  sentAt?: any;
  error?: string | null;
}

export default function PushManagement({ users, adminEmail }: PushManagementProps) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [targetType, setTargetType] = useState<'all' | 'user'>('all');
  const [targetUser, setTargetUser] = useState<User | null>(null);
  
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<PushHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // Search state for users directory
  const [directorySearchQuery, setDirectorySearchQuery] = useState('');
  
  // Search state for targeting dropdown
  const [selectSearchQuery, setSelectSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Toast/Feedback state for copying fcmToken
  const [copiedTokenUserId, setCopiedTokenUserId] = useState<string | null>(null);

  // Click outside listener for dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Subscribe to real-time push queue history
  useEffect(() => {
    const q = query(
      collection(db, 'push_queue'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const historyList: PushHistoryItem[] = [];
      snapshot.forEach((doc) => {
        historyList.push({ id: doc.id, ...doc.data() } as PushHistoryItem);
      });
      setHistory(historyList);
      setLoadingHistory(false);
    }, (error) => {
      console.error("Error reading push queue:", error);
      setLoadingHistory(false);
    });

    return () => unsubscribe();
  }, []);

  // Format Firestore Timestamps
  const formatTimestamp = (ts: any) => {
    if (!ts) return '-';
    try {
      if (typeof ts.toDate === 'function') {
        return ts.toDate().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
      }
      if (ts.seconds) {
        return new Date(ts.seconds * 1000).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
      }
      // If it is already a date string
      const date = new Date(ts);
      if (!isNaN(date.getTime())) {
        return date.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
      }
    } catch (e) {
      console.error(e);
    }
    return String(ts);
  };

  // Copy token helper
  const copyToClipboard = (token: string, userId: string) => {
    navigator.clipboard.writeText(token).then(() => {
      setCopiedTokenUserId(userId);
      setTimeout(() => setCopiedTokenUserId(null), 2000);
    }).catch(err => {
      console.error('Failed to copy token: ', err);
      alert('토큰을 복사하는 중 오류가 발생했습니다.');
    });
  };

  // Submit Queue Push
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      alert("알림 제목을 입력해 주세요.");
      return;
    }
    if (!body.trim()) {
      alert("알림 본문 내용을 입력해 주세요.");
      return;
    }
    if (targetType === 'user' && !targetUser) {
      alert("개별 발송 대상을 선택해 주세요.");
      return;
    }

    setSending(true);

    try {
      const payload: any = {
        title: title.trim(),
        body: body.trim(),
        target: targetType,
        status: 'pending',
        createdAt: serverTimestamp(),
        sentAt: null,
        error: null
      };

      if (targetType === 'user' && targetUser) {
        payload.targetUid = targetUser.id;
        payload.targetName = targetUser.name || targetUser.username;
        payload.targetEmail = targetUser.email;
        payload.fcmToken = targetUser.pushToken || targetUser.fcmToken || null;
      } else {
        payload.targetUid = null;
        payload.targetName = "전체 사용자";
        payload.targetEmail = null;
        payload.fcmToken = null;
      }

      // Add to push_queue
      await addDoc(collection(db, 'push_queue'), payload);

      // Audit logs
      const details = targetType === 'all' 
        ? `전체 대상 푸시 발송 요청 등록: "${title.trim()}"`
        : `개별 대상 [${targetUser?.name || targetUser?.username}] 푸시 발송 요청 등록: "${title.trim()}"`;

      await addDoc(collection(db, 'logs'), {
        adminEmail,
        type: 'push_notification_dispatch',
        details,
        targetUserId: targetType === 'user' ? targetUser?.id : 'all',
        targetUserName: targetType === 'user' ? (targetUser?.name || targetUser?.username) : '전체 사용자',
        timestamp: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
        rawTimestamp: Date.now()
      });

      alert("푸시 알림 발송 요청이 정상 등록되었습니다.\n(백엔드 데몬이 백그라운드에서 실시간 처리합니다)");
      setTitle('');
      setBody('');
      setTargetUser(null);
      setSelectSearchQuery('');
    } catch (err: any) {
      console.error("Error creating push queue document:", err);
      alert(`발송 요청 중 오류가 발생했습니다: ${err.message}`);
    } finally {
      setSending(false);
    }
  };

  // Populate form helper (resending)
  const handleResend = (item: PushHistoryItem) => {
    setTitle(item.title);
    setBody(item.body);
    setTargetType(item.target);
    if (item.target === 'user' && item.targetUid) {
      const foundUser = users.find(u => u.id === item.targetUid);
      if (foundUser) {
        setTargetUser(foundUser);
        setSelectSearchQuery(foundUser.name || foundUser.username);
      }
    } else {
      setTargetUser(null);
      setSelectSearchQuery('');
    }
    alert("알림 양식이 복사되었습니다.");
  };

  // Filter users for the Directory Table
  const filteredDirectoryUsers = users.filter(u => {
    const nameMatch = u.name?.toLowerCase().includes(directorySearchQuery.toLowerCase());
    const usernameMatch = u.username.toLowerCase().includes(directorySearchQuery.toLowerCase());
    const emailMatch = u.email.toLowerCase().includes(directorySearchQuery.toLowerCase());
    return nameMatch || usernameMatch || emailMatch;
  });

  // Filter users for Dropdown Selector
  const filteredDropdownUsers = users.filter(u => {
    const nameMatch = u.name?.toLowerCase().includes(selectSearchQuery.toLowerCase());
    const usernameMatch = u.username.toLowerCase().includes(selectSearchQuery.toLowerCase());
    const emailMatch = u.email.toLowerCase().includes(selectSearchQuery.toLowerCase());
    return nameMatch || usernameMatch || emailMatch;
  });

  return (
    <div className="view-container">
      {/* 2-Column Responsive Layout */}
      <div className="push-layout-grid">
        
        {/* Left Column: Form and FCM Directory */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Dispatch Form Card */}
          <div className="glass-panel">
            <div className="card-header-row" style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.8rem', marginBottom: '1.25rem' }}>
              <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem', fontWeight: 700 }}>
                <span className="material-icons-round" style={{ color: 'var(--accent-purple)' }}>send</span>
                푸시 알림 신규 발송
              </h2>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              
              {/* Target Selector */}
              <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>수신 대상 구분</label>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      setTargetType('all');
                      setTargetUser(null);
                    }}
                    style={{
                      flex: 1,
                      justifyContent: 'center',
                      background: targetType === 'all' ? 'var(--sidebar-active)' : 'var(--glass-bg)',
                      borderColor: targetType === 'all' ? 'var(--accent-purple)' : 'var(--glass-border)',
                      fontWeight: targetType === 'all' ? '700' : '500'
                    }}
                  >
                    <span className="material-icons-round" style={{ fontSize: '1.1rem' }}>groups</span>
                    전체 발송 (Broadcast)
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      setTargetType('user');
                    }}
                    style={{
                      flex: 1,
                      justifyContent: 'center',
                      background: targetType === 'user' ? 'var(--sidebar-active)' : 'var(--glass-bg)',
                      borderColor: targetType === 'user' ? 'var(--accent-purple)' : 'var(--glass-border)',
                      fontWeight: targetType === 'user' ? '700' : '500'
                    }}
                  >
                    <span className="material-icons-round" style={{ fontSize: '1.1rem' }}>person</span>
                    개별 지정 발송
                  </button>
                </div>
              </div>

              {/* User Selection Dropdown (Only for single user targeting) */}
              {targetType === 'user' && (
                <div className="form-group" style={{ position: 'relative', marginBottom: '0.75rem' }} ref={dropdownRef}>
                  <label htmlFor="userSelect">개별 수신자 검색 및 선택</label>
                  <div className="search-input-wrapper" style={{ maxWidth: '100%', marginTop: '0.25rem' }}>
                    <span className="material-icons-round">search</span>
                    <input
                      type="text"
                      className="input-field"
                      id="userSelect"
                      placeholder="이름, 아이디 또는 이메일 검색..."
                      value={selectSearchQuery}
                      onChange={(e) => {
                        setSelectSearchQuery(e.target.value);
                        setShowDropdown(true);
                      }}
                      onFocus={() => setShowDropdown(true)}
                      style={{ paddingLeft: '2.5rem' }}
                    />
                  </div>

                  {/* Dropdown Box */}
                  {showDropdown && (
                    <div className="custom-scroll" style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      background: 'rgba(255, 255, 255, 0.98)',
                      backdropFilter: 'blur(15px)',
                      border: '1px solid var(--glass-border)',
                      borderRadius: '8px',
                      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
                      maxHeight: '220px',
                      overflowY: 'auto',
                      zIndex: 100,
                      marginTop: '0.25rem'
                    }}>
                      {filteredDropdownUsers.length === 0 ? (
                        <div style={{ padding: '0.8rem', color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center' }}>
                          일치하는 사용자가 없습니다.
                        </div>
                      ) : (
                        filteredDropdownUsers.map(u => (
                          <div
                            key={u.id}
                            onClick={() => {
                              setTargetUser(u);
                              setSelectSearchQuery(u.name || u.username);
                              setShowDropdown(false);
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '0.6rem 0.8rem',
                              borderBottom: '1px solid rgba(184, 134, 11, 0.08)',
                              cursor: 'pointer',
                              transition: 'background 0.2s',
                              fontSize: '0.85rem'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(184, 134, 11, 0.08)'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                          >
                            <div>
                              <strong style={{ color: 'var(--text-primary)' }}>{u.name || '이름없음'}</strong>
                              <span style={{ color: 'var(--text-muted)', marginLeft: '0.4rem', fontSize: '0.75rem' }}>@{u.username}</span>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>{u.email}</div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                              {u.os && (
                                <span className="badge" style={{ 
                                  fontSize: '0.65rem', 
                                  padding: '0.15rem 0.35rem',
                                  background: u.os.toLowerCase() === 'ios' ? 'rgba(0, 122, 255, 0.1)' : 'rgba(52, 199, 89, 0.1)',
                                  color: u.os.toLowerCase() === 'ios' ? '#007AFF' : '#34C759',
                                  border: `1px solid ${u.os.toLowerCase() === 'ios' ? 'rgba(0, 122, 255, 0.2)' : 'rgba(52, 199, 89, 0.2)'}`
                                }}>
                                  {u.os}
                                </span>
                              )}
                              {(u.pushToken || u.fcmToken) ? (
                                <span className="badge active" style={{ fontSize: '0.65rem', padding: '0.15rem 0.35rem' }}>🟢 토큰있음</span>
                              ) : (
                                <span className="badge suspended" style={{ fontSize: '0.65rem', padding: '0.15rem 0.35rem' }}>⚠️ 미등록</span>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {/* Selected User Display */}
                  {targetUser && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.6rem 0.8rem',
                      background: 'rgba(184, 134, 11, 0.06)',
                      border: '1px solid var(--glass-border)',
                      borderRadius: '8px',
                      marginTop: '0.5rem'
                    }}>
                      <div style={{ fontSize: '0.85rem' }}>
                        <span style={{ fontWeight: 700, color: 'var(--accent-purple)' }}>[지정됨] </span>
                        <strong>{targetUser.name || targetUser.username}</strong>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginLeft: '0.4rem' }}>({targetUser.email})</span>
                        {targetUser.os && (
                          <span className="badge" style={{ 
                            fontSize: '0.65rem', 
                            padding: '0.1rem 0.3rem',
                            marginLeft: '0.4rem',
                            verticalAlign: 'middle',
                            background: targetUser.os.toLowerCase() === 'ios' ? 'rgba(0, 122, 255, 0.1)' : 'rgba(52, 199, 89, 0.1)',
                            color: targetUser.os.toLowerCase() === 'ios' ? '#007AFF' : '#34C759',
                            border: `1px solid ${targetUser.os.toLowerCase() === 'ios' ? 'rgba(0, 122, 255, 0.2)' : 'rgba(52, 199, 89, 0.2)'}`
                          }}>
                            {targetUser.os}
                          </span>
                        )}
                        {!(targetUser.pushToken || targetUser.fcmToken) && (
                          <div style={{ color: 'var(--accent-rose)', fontSize: '0.75rem', marginTop: '0.15rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                            <span className="material-icons-round" style={{ fontSize: '0.9rem' }}>warning</span>
                            이 사용자는 FCM 토큰이 등록되어 있지 않아 알림이 전달되지 않습니다.
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setTargetUser(null);
                          setSelectSearchQuery('');
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--accent-rose)',
                          display: 'flex',
                          alignItems: 'center'
                        }}
                      >
                        <span className="material-icons-round" style={{ fontSize: '1.25rem' }}>cancel</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Title input */}
              <div className="form-group">
                <label htmlFor="pushTitle">알림 제목</label>
                <input
                  type="text"
                  id="pushTitle"
                  placeholder="예: 오늘 말씀 암송 챌린지를 완료하셨나요? 🔔"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>

              {/* Body textarea */}
              <div className="form-group">
                <label htmlFor="pushBody">알림 본문 내용</label>
                <textarea
                  id="pushBody"
                  placeholder="사용자들에게 보여질 푸시 알림의 본문 메시지를 입력해 주세요."
                  rows={4}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  style={{ resize: 'none', lineHeight: '1.4' }}
                  required
                />
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                className="btn-primary"
                disabled={sending}
                style={{ width: '100%', justifyContent: 'center', padding: '0.75rem', marginTop: '0.5rem' }}
              >
                {sending ? (
                  <>
                    <span className="material-icons-round" style={{ animation: 'spin 1.5s linear infinite', fontSize: '1.1rem' }}>sync</span>
                    발송 등록 중...
                  </>
                ) : (
                  <>
                    <span className="material-icons-round" style={{ fontSize: '1.1rem' }}>send</span>
                    알림 발송 요청 (Queue 등록)
                  </>
                )}
              </button>
            </form>
          </div>

          {/* FCM Token Directory Card */}
          <div className="glass-panel">
            <div className="card-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.8rem', marginBottom: '1rem' }}>
              <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem', fontWeight: 700 }}>
                <span className="material-icons-round" style={{ color: 'var(--accent-purple)' }}>people</span>
                FCM 토큰 레지스트리
              </h2>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>총 {users.length}명</span>
            </div>

            {/* Registry Search */}
            <div className="search-input-wrapper" style={{ maxWidth: '100%', marginBottom: '1rem' }}>
              <span className="material-icons-round">search</span>
              <input
                type="text"
                className="input-field"
                placeholder="사용자명, 이메일, 아이디 검색..."
                value={directorySearchQuery}
                onChange={(e) => setDirectorySearchQuery(e.target.value)}
                style={{ paddingLeft: '2.5rem' }}
              />
            </div>

            {/* List Wrapper with Scrollbar */}
            <div className="custom-scroll" style={{ maxHeight: '350px', overflowY: 'auto', border: '1px solid var(--glass-border)', borderRadius: '8px' }}>
              {filteredDirectoryUsers.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  등록된 사용자가 없습니다.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {filteredDirectoryUsers.map((user) => (
                    <div
                      key={user.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.75rem 1rem',
                        borderBottom: '1px solid rgba(184, 134, 11, 0.08)',
                        background: 'rgba(255,255,255,0.2)'
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1, paddingRight: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                            {user.name || '이름 없음'}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            @{user.username}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.1rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {user.email}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                          마지막 활동: {formatTimestamp(user.lastActive)}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {user.os && (
                          <span className="badge" style={{ 
                            fontSize: '0.7rem', 
                            padding: '0.2rem 0.4rem',
                            background: user.os.toLowerCase() === 'ios' ? 'rgba(0, 122, 255, 0.1)' : 'rgba(52, 199, 89, 0.1)',
                            color: user.os.toLowerCase() === 'ios' ? '#007AFF' : '#34C759',
                            border: `1px solid ${user.os.toLowerCase() === 'ios' ? 'rgba(0, 122, 255, 0.2)' : 'rgba(52, 199, 89, 0.2)'}`
                          }}>
                            {user.os}
                          </span>
                        )}
                        {(user.pushToken || user.fcmToken) ? (
                          <>
                            <span className="badge active" style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem' }}>
                              등록됨
                            </span>
                            <button
                              type="button"
                              className="btn-icon-action"
                              onClick={() => copyToClipboard((user.pushToken || user.fcmToken)!, user.id)}
                              style={{ width: '28px', height: '28px', background: 'rgba(184,134,11,0.06)' }}
                              title="FCM 토큰 복사"
                            >
                              <span className="material-icons-round" style={{ fontSize: '1rem', color: copiedTokenUserId === user.id ? 'var(--accent-emerald)' : 'var(--text-secondary)' }}>
                                {copiedTokenUserId === user.id ? 'check' : 'content_copy'}
                              </span>
                            </button>
                          </>
                        ) : (
                          <span className="badge suspended" style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem', background: 'rgba(0,0,0,0.05)', color: 'var(--text-muted)' }}>
                            미등록
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Real-time History List */}
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="card-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.8rem', marginBottom: '1.25rem' }}>
            <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem', fontWeight: 700 }}>
              <span className="material-icons-round" style={{ color: 'var(--accent-purple)' }}>history</span>
              실시간 푸시 발송 이력 (최근 50건)
            </h2>
            {loadingHistory && (
              <span className="material-icons-round" style={{ animation: 'spin 1.5s linear infinite', fontSize: '1.1rem', color: 'var(--text-muted)' }}>sync</span>
            )}
          </div>

          {/* History List */}
          <div className="custom-scroll" style={{ flex: 1, overflowY: 'auto', maxHeight: '720px' }}>
            {history.length === 0 && !loadingHistory ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                <span className="material-icons-round" style={{ fontSize: '2.5rem', color: 'var(--text-muted)', marginBottom: '0.5rem', display: 'block' }}>notifications_off</span>
                최근 발송된 푸시 알림 이력이 없습니다.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {history.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      border: '1px solid var(--glass-border)',
                      borderRadius: '10px',
                      padding: '1rem',
                      background: 'rgba(255, 255, 255, 0.45)',
                      transition: 'border-color 0.2s',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.5rem'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.borderColor = 'rgba(184, 134, 11, 0.4)'}
                    onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--glass-border)'}
                  >
                    {/* Item Top info */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                      <div>
                        {/* Target Badge */}
                        {item.target === 'all' ? (
                          <span className="badge admin" style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem', marginRight: '0.4rem' }}>
                            👥 전체 발송
                          </span>
                        ) : (
                          <span className="badge user" style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem', marginRight: '0.4rem', background: 'rgba(146, 111, 21, 0.1)', color: 'var(--accent-blue)' }}>
                            👤 개별 ({item.targetName || '알수없음'})
                          </span>
                        )}
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {formatTimestamp(item.createdAt)}
                        </span>
                      </div>

                      {/* Status Badge */}
                      <div>
                        {item.status === 'pending' && (
                          <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.15)', color: 'var(--accent-amber)', fontSize: '0.7rem' }}>
                            대기 중
                          </span>
                        )}
                        {item.status === 'success' && (
                          <span className="badge active" style={{ fontSize: '0.7rem' }}>
                            발송 완료
                          </span>
                        )}
                        {item.status === 'failed' && (
                          <span className="badge suspended" style={{ fontSize: '0.7rem' }}>
                            발송 실패
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Content Preview */}
                    <div style={{ background: 'rgba(255,255,255,0.3)', padding: '0.6rem 0.8rem', borderRadius: '6px', border: '1px solid rgba(184,134,11,0.05)' }}>
                      <h4 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.2rem' }}>
                        {item.title}
                      </h4>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.4', whiteSpace: 'pre-line' }}>
                        {item.body}
                      </p>
                    </div>

                    {/* Detailed info / Error log / Resend option */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.25rem', fontSize: '0.75rem' }}>
                      <div style={{ minWidth: 0, flex: 1, color: 'var(--text-muted)' }}>
                        {item.target === 'user' && item.targetEmail && (
                          <div style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                            수신 이메일: {item.targetEmail}
                          </div>
                        )}
                        {item.status === 'failed' && item.error && (
                          <div style={{ color: 'var(--accent-rose)', marginTop: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.15rem' }}>
                            <span className="material-icons-round" style={{ fontSize: '0.85rem' }}>error_outline</span>
                            에러: {item.error}
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        className="btn-action edit"
                        onClick={() => handleResend(item)}
                        style={{
                          padding: '0.2rem 0.5rem',
                          fontSize: '0.7rem',
                          background: 'rgba(184, 134, 11, 0.08)',
                          color: 'var(--accent-purple)',
                          border: '1px solid rgba(184,134,11,0.15)'
                        }}
                      >
                        양식 복사
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
