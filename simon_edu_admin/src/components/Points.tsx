import { useState } from 'react';
import { doc, updateDoc, arrayUnion, addDoc, collection } from 'firebase/firestore';
import { db } from '../firebase';

interface User {
  id: string;
  username: string;
  name?: string;
  email: string;
  points: number;
  pointsHistory?: Array<{
    id: string;
    type: string;
    title: string;
    amount: number;
    date: string;
  }>;
}

interface PointsProps {
  users: User[];
  adminEmail: string;
}

export default function Points({ users, adminEmail }: PointsProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [targetUserId, setTargetUserId] = useState('');
  const [pointsAmount, setPointsAmount] = useState<number>(0);
  const [pointsReason, setPointsReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Consolidate point histories
  interface GlobalHistoryItem {
    id: string;
    userId: string;
    username: string;
    name?: string;
    type: string;
    title: string;
    amount: number;
    date: string;
  }

  const allHistories: GlobalHistoryItem[] = [];
  users.forEach(u => {
    u.pointsHistory?.forEach(h => {
      allHistories.push({
        id: h.id,
        userId: u.id,
        username: u.username,
        name: u.name,
        type: h.type,
        title: h.title,
        amount: h.amount,
        date: h.date
      });
    });
  });

  // Sort consolidated history by date desc
  allHistories.sort((a, b) => b.date.localeCompare(a.date));

  const filteredHistories = allHistories.filter(h => {
    return h.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (h.name && h.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      h.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      h.type.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const handleManualAward = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetUserId || pointsAmount <= 0 || !pointsReason) return;
    setSubmitting(true);

    const targetUser = users.find(u => u.id === targetUserId);
    if (!targetUser) {
      alert('대상 사용자를 찾을 수 없습니다.');
      setSubmitting(false);
      return;
    }

    const historyItem = {
      id: 'hist_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      type: 'admin',
      title: `[관리자 지급] ${pointsReason}`,
      amount: pointsAmount,
      date: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
    };

    try {
      const userRef = doc(db, 'users', targetUser.id);
      await updateDoc(userRef, {
        points: (targetUser.points || 0) + pointsAmount,
        pointsHistory: arrayUnion(historyItem)
      });

      // Audit Log
      await addDoc(collection(db, 'logs'), {
        adminEmail,
        type: 'points_award',
        details: `수동 포인트 지급: ${pointsAmount}P (사유: ${pointsReason})`,
        targetUserId: targetUser.id,
        targetUserName: targetUser.name || targetUser.username,
        timestamp: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
        rawTimestamp: Date.now()
      });

      alert(`${targetUser.name || targetUser.username} 님에게 ${pointsAmount}P가 수동 지급되었습니다.`);
      setTargetUserId('');
      setPointsAmount(0);
      setPointsReason('');
    } catch (err: any) {
      console.error(err);
      alert('포인트 지급 실패: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="view-container points-grid-container">
      {/* LEFT COLUMN: HISTORY LIST */}
      <div className="glass-panel">
        <div className="card-header-row">
          <h2 className="card-title">
            <span className="material-icons-round">receipt_long</span>
            포인트 지급 / 차감 내역
          </h2>
          
          <div className="search-input-wrapper" style={{ margin: 0 }}>
            <span className="material-icons-round">search</span>
            <input
              type="text"
              className="input-field"
              placeholder="사용자, 내용 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="table-container" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>사용자</th>
                <th>내용</th>
                <th>구분</th>
                <th>포인트</th>
                <th>일시</th>
              </tr>
            </thead>
            <tbody>
              {filteredHistories.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    포인트 거래 내역이 없습니다.
                  </td>
                </tr>
              ) : (
                filteredHistories.map((h) => (
                  <tr key={h.id}>
                    <td data-label="사용자">
                      <span style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>{h.username}</span>
                      {h.name && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '0.25rem' }}>({h.name})</span>}
                    </td>
                    <td data-label="내용">{h.title}</td>
                    <td data-label="구분">
                      <span className={`badge ${h.type || 'signup'}`}>
                        {h.type === 'challenge' ? '암송 챌린지' :
                         h.type === 'attendance' ? '출석 체크' :
                         h.type === 'signup' ? '가입 축하금' : '관리자 조정'}
                      </span>
                    </td>
                    <td data-label="포인트" style={{
                      fontWeight: 'bold',
                      fontFamily: 'var(--font-en)',
                      color: h.amount >= 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)'
                    }}>
                      {h.amount >= 0 ? `+${h.amount}` : h.amount} P
                    </td>
                    <td data-label="일시" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{h.date}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* RIGHT COLUMN: MANUAL POINT AWARD */}
      <div className="glass-panel" style={{ height: 'fit-content' }}>
        <h2 className="card-title" style={{ marginBottom: '1.25rem' }}>
          <span className="material-icons-round">monetization_on</span>
          수동 포인트 지급
        </h2>

        <form onSubmit={handleManualAward} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="form-group">
            <label htmlFor="targetUser">지급 대상 회원</label>
            <select
              id="targetUser"
              required
              value={targetUserId}
              onChange={(e) => setTargetUserId(e.target.value)}
              style={{
                background: 'rgba(255, 255, 255, 0.65)',
                border: '1px solid var(--glass-border)',
                color: 'var(--text-primary)',
                padding: '0.65rem',
                borderRadius: '8px'
              }}
            >
              <option value="">회원을 선택하세요</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>
                  {u.name ? `${u.name} (${u.username})` : u.username} - {u.points.toLocaleString()}P 보유
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="pointsAmount">지급 포인트 수량</label>
            <input
              type="number"
              id="pointsAmount"
              required
              min={1}
              value={pointsAmount || ''}
              onChange={(e) => setPointsAmount(Math.max(0, parseInt(e.target.value) || 0))}
              placeholder="예: 500"
              style={{ padding: '0.65rem' }}
            />
          </div>

          <div className="form-group">
            <label htmlFor="pointsReason">지급 사유</label>
            <textarea
              id="pointsReason"
              required
              value={pointsReason}
              onChange={(e) => setPointsReason(e.target.value)}
              placeholder="회원에게 표기될 지급 사유를 입력하세요 (예: 출석 이벤트 보상)"
              rows={3}
              style={{ padding: '0.65rem', fontFamily: 'inherit', resize: 'none' }}
            />
          </div>

          <button
            type="submit"
            className="btn-primary"
            disabled={submitting || !targetUserId || pointsAmount <= 0}
            style={{ width: '100%', justifyContent: 'center', marginTop: '0.5rem' }}
          >
            {submitting ? '지급 처리 중...' : '포인트 지급하기'}
          </button>
        </form>
      </div>
    </div>
  );
}
