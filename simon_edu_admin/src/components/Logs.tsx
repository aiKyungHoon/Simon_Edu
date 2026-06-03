import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, limit, orderBy } from 'firebase/firestore';
import { db } from '../firebase';

interface LogItem {
  id: string;
  adminEmail: string;
  type: string;
  details: string;
  targetUserId: string;
  targetUserName: string;
  timestamp: string;
  rawTimestamp?: number;
}

export default function Logs() {
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  // Real-time synchronization for latest 100 logs
  useEffect(() => {
    const q = query(
      collection(db, 'logs'),
      orderBy('rawTimestamp', 'desc'),
      limit(100)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logList: LogItem[] = [];
      snapshot.forEach((doc) => {
        logList.push({ id: doc.id, ...doc.data() } as LogItem);
      });

      // Provide mock logs if collection is empty
      if (logList.length === 0) {
        setLogs([
          {
            id: 'mock_log_1',
            adminEmail: 'admin@simon.edu',
            type: 'points_award',
            details: '수동 포인트 지급: 100P (사유: 테스트 계정 생성 축하 보상)',
            targetUserId: 'user_grace',
            targetUserName: '박은혜 (grace)',
            timestamp: '2026-06-02 21:05:44',
            rawTimestamp: Date.now() - 3600000
          },
          {
            id: 'mock_log_2',
            adminEmail: 'admin@simon.edu',
            type: 'role_change',
            details: '권한 변경: user -> admin',
            targetUserId: 'admin_kyunghoon',
            targetUserName: '김경훈 (admin)',
            timestamp: '2026-06-02 18:29:12',
            rawTimestamp: Date.now() - 7200000
          },
          {
            id: 'mock_log_3',
            adminEmail: 'admin@simon.edu',
            type: 'settings_update',
            details: '전역 시스템 설정 수정 (포인트 규칙 및 법적 문서 링크 고도화)',
            targetUserId: 'global_settings',
            targetUserName: '전역 시스템 설정',
            timestamp: '2026-06-02 14:12:00',
            rawTimestamp: Date.now() - 14400000
          },
          {
            id: 'mock_log_4',
            adminEmail: 'admin@simon.edu',
            type: 'quiz_edit',
            details: '말씀/퀴즈 수정: 요한계시록 1장 1절 (난이도: normal)',
            targetUserId: 'ch1_v1',
            targetUserName: '요한계시록 1장 1절',
            timestamp: '2026-06-02 10:22:15',
            rawTimestamp: Date.now() - 28800000
          }
        ]);
      } else {
        setLogs(logList);
      }
      setLoading(false);
    }, (error) => {
      console.error("Error loading logs:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      log.adminEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.targetUserName.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesType = typeFilter === 'all' || log.type === typeFilter;

    return matchesSearch && matchesType;
  });

  const getLogTypeLabel = (type: string) => {
    switch (type) {
      case 'points_award': return '포인트 지급';
      case 'points_deduct': return '포인트 차감';
      case 'role_change': return '권한 변경';
      case 'account_suspend': return '계정 정지';
      case 'account_unsuspend': return '정지 해제';
      case 'account_delete': return '계정 삭제';
      case 'quiz_edit': return '말씀/퀴즈 편집';
      case 'event_create': return '이벤트 등록';
      case 'event_edit': return '이벤트 수정';
      case 'event_toggle': return '이벤트 토글';
      case 'event_delete': return '이벤트 삭제';
      case 'notice_create': return '공지 등록';
      case 'notice_edit': return '공지 수정';
      case 'notice_pin': return '공지 고정';
      case 'notice_toggle': return '공지 토글';
      case 'notice_delete': return '공지 삭제';
      case 'settings_update': return '설정 변경';
      default: return type;
    }
  };

  return (
    <div className="view-container">
      {/* FILTER PANEL */}
      <div className="glass-panel" style={{ marginBottom: '1.5rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="search-input-wrapper">
          <span className="material-icons-round">search</span>
          <input
            type="text"
            className="input-field"
            placeholder="관리자 계정, 대상, 내용 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>작업 종류:</span>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            style={{
              background: 'rgba(255, 255, 255, 0.65)',
              border: '1px solid var(--glass-border)',
              color: 'var(--text-primary)',
              padding: '0.4rem 0.8rem',
              borderRadius: '6px'
            }}
          >
            <option value="all">전체 로그</option>
            <option value="points_award">포인트 지급</option>
            <option value="points_deduct">포인트 차감</option>
            <option value="role_change">권한 변경</option>
            <option value="account_suspend">계정 정지</option>
            <option value="account_unsuspend">정지 해제</option>
            <option value="account_delete">계정 삭제</option>
            <option value="quiz_edit">말씀/퀴즈 편집</option>
            <option value="event_create">이벤트 등록/수정</option>
            <option value="notice_create">공지사항 변경</option>
            <option value="settings_update">시스템 설정 변경</option>
          </select>
        </div>
      </div>

      {/* LOGS TABLE */}
      <div className="glass-panel">
        <h2 className="card-title" style={{ marginBottom: '1rem' }}>
          <span className="material-icons-round">security</span>
          관리자 감사 로그 (Audit Logs - 최신 100건)
        </h2>

        <div className="table-container" style={{ margin: 0, maxHeight: '60vh', overflowY: 'auto' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>수행 관리자</th>
                <th>작업 구분</th>
                <th>상세 내용</th>
                <th>작업 대상</th>
                <th>수행 일시</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '3rem' }}>
                    <span className="material-icons-round" style={{ fontSize: '2rem', color: 'var(--accent-purple)', animation: 'spin 1.5s linear infinite' }}>
                      sync
                    </span>
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    일치하는 감사 로그가 없습니다.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id}>
                    <td style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{log.adminEmail}</td>
                    <td>
                      <span className={`badge admin`} style={{ fontSize: '0.7rem' }}>
                        {getLogTypeLabel(log.type)}
                      </span>
                    </td>
                    <td>{log.details}</td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>{log.targetUserName}</td>
                    <td style={{ fontFamily: 'var(--font-en)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{log.timestamp}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
