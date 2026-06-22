import { useState } from 'react';
import { doc, updateDoc, deleteDoc, arrayUnion, addDoc, collection } from 'firebase/firestore';
import { db } from '../firebase';
import BIBLE_DATA_RAW from '../assets/bible_data.json';
import { ROLE_OPTIONS, getRoleLabel } from '../roles';

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
  os?: string;
  pointsHistory?: Array<{
    id: string;
    type: string;
    title: string;
    amount: number;
    date: string;
  }>;
}

interface MembersProps {
  users: User[];
  adminEmail: string;
}

export default function Members({ users, adminEmail }: MembersProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  
  // Point action states
  const [pointAmount, setPointAmount] = useState<number>(0);
  const [pointReason, setPointReason] = useState('');
  const [pointAction, setPointAction] = useState<'pay' | 'deduct'>('pay');
  const [submittingPoints, setSubmittingPoints] = useState(false);

  // Helper: Bible verse formatting
  const getVerseText = (index: number) => {
    if (index >= BIBLE_DATA_RAW.length) return '요한계시록 완주 완료 🎉';
    const verse = BIBLE_DATA_RAW[index];
    return verse ? `요한계시록 ${verse.chapter}장 ${verse.verse}절` : `미시작 (0%)`;
  };

  // Helper: Audit Logger
  const logAdminAction = async (actionType: string, details: string, targetId: string, targetName: string) => {
    try {
      await addDoc(collection(db, 'logs'), {
        adminEmail,
        type: actionType,
        details,
        targetUserId: targetId,
        targetUserName: targetName,
        timestamp: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
        rawTimestamp: Date.now()
      });
    } catch (e) {
      console.error("Failed to write audit log:", e);
    }
  };

  // Search & Filter
  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.name && u.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase());
      
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    const userStatus = u.status || 'active';
    const matchesStatus = statusFilter === 'all' || userStatus === statusFilter;
    
    return matchesSearch && matchesRole && matchesStatus;
  });

  // Action: Pay / Deduct Points
  const handlePointsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || pointAmount <= 0 || !pointReason) return;
    setSubmittingPoints(true);

    const actualAmount = pointAction === 'pay' ? pointAmount : -pointAmount;
    const historyItem = {
      id: 'hist_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      type: 'admin',
      title: `[관리자 조정] ${pointReason}`,
      amount: actualAmount,
      date: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
    };

    try {
      const userRef = doc(db, 'users', selectedUser.id);
      
      // Calculate new points with lower bound of 0
      const newPoints = Math.max(0, (selectedUser.points || 0) + actualAmount);

      await updateDoc(userRef, {
        points: newPoints,
        pointsHistory: arrayUnion(historyItem)
      });

      // Write Log
      await logAdminAction(
        pointAction === 'pay' ? 'points_award' : 'points_deduct',
        `포인트 ${pointAction === 'pay' ? '지급' : '차감'}: ${pointAmount}P (사유: ${pointReason})`,
        selectedUser.id,
        selectedUser.name || selectedUser.username
      );

      // Update local state in view
      const updatedUser = {
        ...selectedUser,
        points: newPoints,
        pointsHistory: [...(selectedUser.pointsHistory || []), historyItem]
      };
      setSelectedUser(updatedUser);
      alert(`포인트가 성공적으로 ${pointAction === 'pay' ? '지급' : '차감'}되었습니다.`);
      
      // Reset inputs
      setPointAmount(0);
      setPointReason('');
    } catch (err: any) {
      console.error(err);
      alert('포인트 지급 실패: ' + err.message);
    } finally {
      setSubmittingPoints(false);
    }
  };

  // Action: Change Role
  const handleChangeRole = async (user: User, newRole: string) => {
    if (user.role === newRole) return;
    if (!window.confirm(`${user.name || user.username} 님의 권한을 ${getRoleLabel(newRole)}(으)로 변경하시겠습니까?`)) {
      return;
    }

    try {
      const userRef = doc(db, 'users', user.id);
      await updateDoc(userRef, { role: newRole });

      await logAdminAction(
        'role_change',
        `권한 변경: ${user.role} -> ${newRole}`,
        user.id,
        user.name || user.username
      );

      if (selectedUser?.id === user.id) {
        setSelectedUser({ ...selectedUser, role: newRole });
      }
      alert('권한이 변경되었습니다.');
    } catch (err: any) {
      console.error(err);
      alert('권한 변경 실패: ' + err.message);
    }
  };

  // Action: Suspend / Unsuspend
  const handleToggleSuspend = async (user: User) => {
    const currentStatus = user.status || 'active';
    const newStatus = currentStatus === 'suspended' ? 'active' : 'suspended';
    
    if (!window.confirm(`${user.name || user.username} 님의 계정을 ${newStatus === 'suspended' ? '정지' : '정지 해제'}하시겠습니까?`)) {
      return;
    }

    try {
      const userRef = doc(db, 'users', user.id);
      await updateDoc(userRef, { status: newStatus });

      await logAdminAction(
        newStatus === 'suspended' ? 'account_suspend' : 'account_unsuspend',
        `계정 상태 변경: ${currentStatus} -> ${newStatus}`,
        user.id,
        user.name || user.username
      );

      if (selectedUser?.id === user.id) {
        setSelectedUser({ ...selectedUser, status: newStatus });
      }
      alert(`계정이 ${newStatus === 'suspended' ? '정지' : '활성화'} 처리되었습니다.`);
    } catch (err: any) {
      console.error(err);
      alert('상태 변경 실패: ' + err.message);
    }
  };

  // Action: Delete User
  const handleDeleteUser = async (user: User) => {
    if (!window.confirm(`경고: ${user.name || user.username} 님의 계정을 완전히 삭제하시겠습니까? 이 작업은 되돌릴 수 없으며, 모든 포인트 및 학습 기록이 영구 삭제됩니다.`)) {
      return;
    }

    try {
      const userRef = doc(db, 'users', user.id);
      await deleteDoc(userRef);

      await logAdminAction(
        'account_delete',
        '계정 영구 삭제',
        user.id,
        user.name || user.username
      );

      if (selectedUser?.id === user.id) {
        setSelectedUser(null);
      }
      alert('계정이 삭제되었습니다.');
    } catch (err: any) {
      console.error(err);
      alert('계정 삭제 실패: ' + err.message);
    }
  };

  const downloadCSV = () => {
    const headers = ['아이디', '이름', '이메일', '역할', '포인트', '연속출석일수', '마지막출석일', '현재말씀인덱스', '현재말씀성구', '상태'];
    const rows = filteredUsers.map(u => [
      u.username,
      u.name || '',
      u.email,
      getRoleLabel(u.role),
      u.points,
      u.consecutiveCheckIns,
      u.lastCheckInDate || '출석 없음',
      u.currentVerseIndex,
      getVerseText(u.currentVerseIndex),
      u.status || 'active'
    ]);
    
    // UTF-8 BOM to display Korean characters properly in Excel
    const csvContent = "\uFEFF" + [headers, ...rows]
      .map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
      .join('\n');
      
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `simon_edu_members_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="view-container">
      {/* FILTER BAR */}
      <div className="glass-panel" style={{ marginBottom: '1.5rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="search-input-wrapper">
          <span className="material-icons-round">search</span>
          <input
            type="text"
            className="input-field"
            placeholder="아이디, 이름, 이메일 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>권한:</span>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              style={{
                background: 'rgba(255, 255, 255, 0.65)',
                border: '1px solid var(--glass-border)',
                color: 'var(--text-primary)',
                padding: '0.4rem 0.8rem',
                borderRadius: '6px'
              }}
            >
              <option value="all">전체</option>
              {ROLE_OPTIONS.map((role) => (
                <option key={role.value} value={role.value}>{role.label}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>상태:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                background: 'rgba(255, 255, 255, 0.65)',
                border: '1px solid var(--glass-border)',
                color: 'var(--text-primary)',
                padding: '0.4rem 0.8rem',
                borderRadius: '6px'
              }}
            >
              <option value="all">전체</option>
              <option value="active">정상</option>
              <option value="suspended">정지됨</option>
            </select>
          </div>

          <button
            onClick={downloadCSV}
            className="btn-primary"
            style={{
              width: 'auto',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.4rem 1rem',
              fontSize: '0.85rem',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            <span className="material-icons-round" style={{ fontSize: '1.1rem' }}>download</span>
            CSV 내보내기
          </button>
        </div>
      </div>

      {/* MEMBERS TABLE */}
      <div className="glass-panel desktop-only-view">
        <div className="table-container" style={{ margin: 0 }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>사용자명(ID)</th>
                <th>이름</th>
                <th>이메일</th>
                <th>보유 포인트</th>
                <th>현재 말씀 위치</th>
                <th>연속 출석일</th>
                <th>권한 / 상태</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    일치하는 사용자가 없습니다.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => {
                  const status = user.status || 'active';
                  return (
                    <tr key={user.id}>
                      <td data-label="사용자명(ID)" style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{user.username}</td>
                      <td data-label="이름">{user.name || '-'}</td>
                      <td data-label="이메일">{user.email}</td>
                      <td data-label="보유 포인트" style={{ fontFamily: 'var(--font-en)', fontWeight: 'bold' }}>{user.points.toLocaleString()}P</td>
                      <td data-label="현재 말씀 위치" style={{ fontSize: '0.8rem' }}>{getVerseText(user.currentVerseIndex)}</td>
                      <td data-label="연속 출석일" style={{ fontFamily: 'var(--font-en)' }}>{user.consecutiveCheckIns}일</td>
                      <td data-label="권한 / 상태">
                        <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                          {user.os && (
                            <span className="badge" style={{ 
                              background: user.os.toLowerCase() === 'ios' ? 'rgba(0, 122, 255, 0.1)' : 'rgba(52, 199, 89, 0.1)',
                              color: user.os.toLowerCase() === 'ios' ? '#007AFF' : '#34C759',
                              border: `1px solid ${user.os.toLowerCase() === 'ios' ? 'rgba(0, 122, 255, 0.2)' : 'rgba(52, 199, 89, 0.2)'}`,
                              fontSize: '0.7rem',
                              padding: '0.15rem 0.35rem'
                            }}>
                              {user.os}
                            </span>
                          )}
                          <span className={`badge ${user.role}`}>
                            {getRoleLabel(user.role)}
                          </span>
                          <span className={`badge ${status}`}>
                            {status === 'suspended' ? '정지됨' : '정상'}
                          </span>
                        </div>
                      </td>
                      <td data-label="관리">
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <button
                            onClick={() => setSelectedUser(user)}
                            className="btn-action edit"
                          >
                            상세 정보
                          </button>
                          <select
                            value={user.role || 'user'}
                            onChange={(e) => handleChangeRole(user, e.target.value)}
                            className="btn-action reset"
                            style={{ cursor: 'pointer' }}
                          >
                            {ROLE_OPTIONS.map((role) => (
                              <option key={role.value} value={role.value}>{role.label}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => handleToggleSuspend(user)}
                            className="btn-action danger"
                            style={{
                              background: status === 'suspended' ? 'rgba(52, 211, 153, 0.15)' : 'rgba(244, 63, 94, 0.15)',
                              color: status === 'suspended' ? 'var(--accent-emerald)' : 'var(--accent-rose)'
                            }}
                          >
                            {status === 'suspended' ? '정지 해제' : '계정 정지'}
                          </button>
                          <button
                            onClick={() => handleDeleteUser(user)}
                            className="btn-icon-action"
                            style={{ color: 'var(--accent-rose)' }}
                            title="계정 삭제"
                          >
                            <span className="material-icons-round" style={{ fontSize: '1.1rem' }}>delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MEMBERS MOBILE CARDS */}
      <div className="mobile-only-view">
        {filteredUsers.length === 0 ? (
          <div className="glass-panel" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
            일치하는 사용자가 없습니다.
          </div>
        ) : (
          filteredUsers.map((user) => {
            const status = user.status || 'active';
            const displayName = user.name || user.username;
            const avatarChar = displayName.charAt(0).toUpperCase();
            return (
              <div className="mobile-user-card" key={user.id}>
                <div className="mobile-user-header">
                  <div className="mobile-user-info">
                    <div className="mobile-user-avatar">{avatarChar}</div>
                    <div className="mobile-user-name-group">
                      <span className="mobile-user-title">{displayName}</span>
                      <span className="mobile-user-subtitle">@{user.username}</span>
                    </div>
                  </div>
                  <div className="mobile-user-badges">
                    {user.os && (
                      <span className="badge" style={{ 
                        background: user.os.toLowerCase() === 'ios' ? 'rgba(0, 122, 255, 0.1)' : 'rgba(52, 199, 89, 0.1)',
                        color: user.os.toLowerCase() === 'ios' ? '#007AFF' : '#34C759',
                        border: `1px solid ${user.os.toLowerCase() === 'ios' ? 'rgba(0, 122, 255, 0.2)' : 'rgba(52, 199, 89, 0.2)'}`,
                        fontSize: '0.7rem',
                        padding: '0.15rem 0.35rem',
                        marginRight: '0.15rem'
                      }}>
                        {user.os}
                      </span>
                    )}
                    <span className={`badge ${user.role}`}>
                      {getRoleLabel(user.role)}
                    </span>
                    <span className={`badge ${status}`}>
                      {status === 'suspended' ? '정지됨' : '정상'}
                    </span>
                  </div>
                </div>

                <div className="mobile-user-grid">
                  <div className="mobile-user-grid-item full-width">
                    <span className="mobile-user-grid-lbl">이메일</span>
                    <span className="mobile-user-grid-val">{user.email}</span>
                  </div>
                  <div className="mobile-user-grid-item">
                    <span className="mobile-user-grid-lbl">보유 포인트</span>
                    <span className="mobile-user-grid-val" style={{ color: 'var(--accent-purple)', fontWeight: 'bold' }}>
                      {user.points.toLocaleString()} P
                    </span>
                  </div>
                  <div className="mobile-user-grid-item">
                    <span className="mobile-user-grid-lbl">연속 출석일</span>
                    <span className="mobile-user-grid-val">{user.consecutiveCheckIns}일</span>
                  </div>
                  <div className="mobile-user-grid-item full-width">
                    <span className="mobile-user-grid-lbl">현재 말씀 위치</span>
                    <span className="mobile-user-grid-val" style={{ fontSize: '0.8rem' }}>
                      {getVerseText(user.currentVerseIndex)}
                    </span>
                  </div>
                </div>

                <div className="mobile-user-actions">
                  <button
                    onClick={() => setSelectedUser(user)}
                    className="btn-action edit"
                  >
                    상세 정보
                  </button>
                  <select
                    value={user.role || 'user'}
                    onChange={(e) => handleChangeRole(user, e.target.value)}
                    className="btn-action reset"
                    style={{ cursor: 'pointer' }}
                  >
                    {ROLE_OPTIONS.map((role) => (
                      <option key={role.value} value={role.value}>{role.label}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleToggleSuspend(user)}
                    className="btn-action danger"
                    style={{
                      background: status === 'suspended' ? 'rgba(52, 211, 153, 0.15)' : 'rgba(244, 63, 94, 0.15)',
                      color: status === 'suspended' ? 'var(--accent-emerald)' : 'var(--accent-rose)'
                    }}
                  >
                    {status === 'suspended' ? '정지 해제' : '계정 정지'}
                  </button>
                  <button
                    onClick={() => handleDeleteUser(user)}
                    className="btn-icon-action"
                    style={{ color: 'var(--accent-rose)', width: '38px', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    title="계정 삭제"
                  >
                    <span className="material-icons-round" style={{ fontSize: '1.1rem' }}>delete</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* MEMBER DETAIL MODAL */}
      {selectedUser && (
        <div className="modal-overlay" onClick={() => setSelectedUser(null)}>
          <div className="glass-panel modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '650px' }}>
            <div className="card-header-row" style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '1rem' }}>
              <h2 className="card-title">
                <span className="material-icons-round">account_circle</span>
                {selectedUser.name || selectedUser.username} 상세 프로필
              </h2>
              <button className="btn-icon-action" onClick={() => setSelectedUser(null)}>
                <span className="material-icons-round">close</span>
              </button>
            </div>

            <div className="members-modal-grid">
              <div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>사용자 아이디</p>
                <p style={{ fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '0.75rem' }}>{selectedUser.username}</p>
                
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>이메일</p>
                <p style={{ color: 'var(--text-primary)', marginBottom: '0.75rem' }}>{selectedUser.email}</p>

                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>가입 상태 / 권한 / OS</p>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.2rem', alignItems: 'center' }}>
                  <span className={`badge ${selectedUser.role}`}>{getRoleLabel(selectedUser.role)}</span>
                  <span className={`badge ${selectedUser.status || 'active'}`}>{selectedUser.status === 'suspended' ? '정지됨' : '정상'}</span>
                  {selectedUser.os && (
                    <span className="badge" style={{ 
                      background: selectedUser.os.toLowerCase() === 'ios' ? 'rgba(0, 122, 255, 0.1)' : 'rgba(52, 199, 89, 0.1)',
                      color: selectedUser.os.toLowerCase() === 'ios' ? '#007AFF' : '#34C759',
                      border: `1px solid ${selectedUser.os.toLowerCase() === 'ios' ? 'rgba(0, 122, 255, 0.2)' : 'rgba(52, 199, 89, 0.2)'}`
                    }}>
                      {selectedUser.os}
                    </span>
                  )}
                </div>
              </div>

              <div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>현재 보유 포인트</p>
                <p style={{ fontWeight: 'bold', color: 'var(--accent-purple)', fontSize: '1.2rem', marginBottom: '0.75rem' }}>
                  {selectedUser.points.toLocaleString()} P
                </p>

                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>말씀 학습 진도</p>
                <p style={{ color: 'var(--text-primary)', marginBottom: '0.75rem' }}>
                  {getVerseText(selectedUser.currentVerseIndex)} ({Math.round((selectedUser.currentVerseIndex / BIBLE_DATA_RAW.length) * 100)}%)
                </p>

                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>마지막 학습 / 출석일</p>
                <p style={{ color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                  암송: {selectedUser.lastMissionDate || '기록 없음'}<br />
                  출석: {selectedUser.lastCheckInDate || '기록 없음'}
                </p>
              </div>
            </div>

            {/* POINT ADJUSTMENT FORM */}
            <div className="glass-panel" style={{ background: 'rgba(255, 255, 255, 0.01)', border: '1px dashed var(--glass-border)', margin: '1.5rem 0', padding: '1rem' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '0.75rem', color: 'var(--text-primary)' }}>포인트 지급 / 차감 조정</h3>
              
              <form onSubmit={handlePointsSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <select
                    value={pointAction}
                    onChange={(e) => setPointAction(e.target.value as any)}
                    style={{ width: '90px', padding: '0.5rem', background: 'rgba(255, 255, 255, 0.65)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)', borderRadius: '8px' }}
                  >
                    <option value="pay">지급 (+)</option>
                    <option value="deduct">차감 (-)</option>
                  </select>

                  <input
                    type="number"
                    placeholder="포인트 양 (ex. 100)"
                    value={pointAmount || ''}
                    onChange={(e) => setPointAmount(Math.max(0, parseInt(e.target.value) || 0))}
                    required
                    style={{ flex: 1, padding: '0.5rem', background: 'rgba(255, 255, 255, 0.65)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)', borderRadius: '8px' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <input
                    type="text"
                    placeholder="조정 사유 (예: 이벤트 리워드, 관리자 임의 지급 등)"
                    value={pointReason}
                    onChange={(e) => setPointReason(e.target.value)}
                    required
                    style={{ flex: 1, padding: '0.5rem', background: 'rgba(255, 255, 255, 0.65)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)', borderRadius: '8px' }}
                  />

                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={submittingPoints}
                    style={{ padding: '0.5rem 1rem', boxShadow: 'none' }}
                  >
                    {submittingPoints ? '처리중' : '적용'}
                  </button>
                </div>
              </form>
            </div>

            {/* POINT HISTORY LIST */}
            <h3 style={{ fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '0.5rem', color: 'var(--text-primary)' }}>최근 포인트 변동 이력</h3>
            <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid var(--glass-border)', borderRadius: '8px' }}>
              <table className="admin-table" style={{ fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                    <th style={{ padding: '0.5rem' }}>내용</th>
                    <th style={{ padding: '0.5rem' }}>종류</th>
                    <th style={{ padding: '0.5rem' }}>금액</th>
                    <th style={{ padding: '0.5rem' }}>일시</th>
                  </tr>
                </thead>
                <tbody>
                  {!selectedUser.pointsHistory || selectedUser.pointsHistory.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)' }}>
                        포인트 적립/사용 이력이 없습니다.
                      </td>
                    </tr>
                  ) : (
                    [...selectedUser.pointsHistory].reverse().map((h) => (
                      <tr key={h.id}>
                        <td data-label="내용" style={{ padding: '0.5rem' }}>{h.title}</td>
                        <td data-label="종류" style={{ padding: '0.5rem' }}>
                          <span className={`badge ${h.type || 'signup'}`} style={{ fontSize: '0.65rem' }}>
                            {h.type}
                          </span>
                        </td>
                        <td data-label="금액" style={{
                          padding: '0.5rem',
                          fontWeight: 'bold',
                          color: h.amount >= 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)'
                        }}>
                          {h.amount >= 0 ? `+${h.amount}` : h.amount} P
                        </td>
                        <td data-label="일시" style={{ padding: '0.5rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>{h.date}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
