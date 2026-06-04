import { useState } from 'react';
import BIBLE_DATA_RAW from '../assets/bible_data.json';

interface User {
  id: string;
  username: string;
  name?: string;
  email: string;
  points: number;
  consecutiveCheckIns: number;
  lastCheckInDate: string | null;
  lastMissionDate: string | null;
  currentVerseIndex: number;
  checkInHistory?: string[];
  pointsHistory?: Array<{
    id: string;
    type: string;
    title: string;
    amount: number;
    date: string;
  }>;
}

interface StatsProps {
  users: User[];
}

export default function Stats({ users }: StatsProps) {
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const totalVerses = BIBLE_DATA_RAW.length;

  // 1. Calculate Chapter Start Indices dynamically
  // chapterMap[chapterNum] = startIndex
  const chapterMap: Record<number, number> = {};
  for (let c = 1; c <= 22; c++) {
    const idx = BIBLE_DATA_RAW.findIndex(v => v.chapter === c);
    chapterMap[c] = idx !== -1 ? idx : totalVerses;
  }
  
  // Helper: format user verse position
  const getVersePositionText = (index: number) => {
    if (index >= totalVerses) return '요한계시록 완주 완료 🎉';
    const verse = BIBLE_DATA_RAW[index];
    return verse ? `요한계시록 ${verse.chapter}장 ${verse.verse}절` : `학습 전 (0%)`;
  };

  // Helper: Calculate Chapter completions
  // completions[chapter] = count of users who completed this chapter (i.e. index >= start of next chapter)
  const chapterCompletions = Array.from({ length: 22 }, (_, i) => {
    const ch = i + 1;
    const nextChapterStart = ch === 22 ? totalVerses : chapterMap[ch + 1];
    
    const count = users.filter(u => u.currentVerseIndex >= nextChapterStart).length;
    const rate = users.length > 0 ? Math.round((count / users.length) * 100) : 0;
    
    return { chapter: ch, count, rate };
  });

  // 2. Funnel Analysis calculations
  const totalUsers = users.length || 1;
  const startedCount = users.filter(u => u.currentVerseIndex > 0).length;
  const ch6StartIndex = chapterMap[6];
  const ch6Count = users.filter(u => u.currentVerseIndex >= ch6StartIndex).length;
  const ch12StartIndex = chapterMap[12];
  const ch12Count = users.filter(u => u.currentVerseIndex >= ch12StartIndex).length;
  const ch18StartIndex = chapterMap[18];
  const ch18Count = users.filter(u => u.currentVerseIndex >= ch18StartIndex).length;
  const completedCount = users.filter(u => u.currentVerseIndex >= totalVerses).length;

  const funnelStages = [
    { label: '가입 완료', count: users.length, pct: 100, drop: 0 },
    { label: '학습 시작', count: startedCount, pct: Math.round((startedCount / totalUsers) * 100), drop: 100 - Math.round((startedCount / totalUsers) * 100) },
    { label: '6장 도달', count: ch6Count, pct: Math.round((ch6Count / totalUsers) * 100), drop: startedCount > 0 ? Math.round(((startedCount - ch6Count) / startedCount) * 100) : 0 },
    { label: '12장 도달', count: ch12Count, pct: Math.round((ch12Count / totalUsers) * 100), drop: ch6Count > 0 ? Math.round(((ch6Count - ch12Count) / ch6Count) * 100) : 0 },
    { label: '18장 도달', count: ch18Count, pct: Math.round((ch18Count / totalUsers) * 100), drop: ch12Count > 0 ? Math.round(((ch12Count - ch18Count) / ch12Count) * 100) : 0 },
    { label: '전체 완주', count: completedCount, pct: Math.round((completedCount / totalUsers) * 100), drop: ch18Count > 0 ? Math.round(((ch18Count - completedCount) / ch18Count) * 100) : 0 },
  ];

  // 3. Filtered User List for Progress Check
  const filteredUsers = users.filter(u => {
    return u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.name && u.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase());
  });

  // SVG Chart sizing
  const chartHeight = 150;
  const chartWidth = 500;
  const paddingLeft = 30;
  const paddingRight = 10;
  const paddingTop = 15;
  const paddingBottom = 20;

  // Max count for chart scaling
  const maxCompletionCount = Math.max(...chapterCompletions.map(c => c.count)) || 1;

  return (
    <div className="view-container">
      {/* CHAPTER COMPLETION CHARTS */}
      <div className="dashboard-row-equal" style={{ marginBottom: '1.5rem' }}>
        {/* Chapter Completion Bar Chart (SVG) */}
        <div className="glass-panel">
          <div className="card-header-row">
            <h2 className="card-title">
              <span className="material-icons-round">bar_chart</span>
              장별 완주 회원 수 (요한계시록 1~22장)
            </h2>
          </div>
          
          <div style={{ width: '100%', overflowX: 'auto', display: 'flex', justifyContent: 'center' }}>
            <svg width={chartWidth} height={chartHeight} style={{ background: 'transparent' }}>
              {/* Grid Lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                const y = paddingTop + (1 - ratio) * (chartHeight - paddingTop - paddingBottom);
                return (
                  <line
                    key={idx}
                    x1={paddingLeft}
                    y1={y}
                    x2={chartWidth - paddingRight}
                    y2={y}
                    stroke="var(--glass-border)"
                    strokeWidth="1"
                  />
                );
              })}

              {/* Bar render */}
              {chapterCompletions.map((c, i) => {
                const barWidth = 14;
                const gap = 7;
                const x = paddingLeft + i * (barWidth + gap) + 5;
                const heightVal = maxCompletionCount > 0 ? (c.count / maxCompletionCount) * (chartHeight - paddingTop - paddingBottom) : 0;
                const y = chartHeight - paddingBottom - heightVal;

                return (
                  <g key={c.chapter}>
                    <rect
                      x={x}
                      y={y}
                      width={barWidth}
                      height={Math.max(2, heightVal)}
                      rx="3"
                      fill="url(#barGradient)"
                    />
                    <text
                      x={x + barWidth / 2}
                      y={chartHeight - 4}
                      fill="var(--text-muted)"
                      fontSize="7"
                      textAnchor="middle"
                    >
                      {c.chapter}
                    </text>
                  </g>
                );
              })}

              {/* Gradients */}
              <defs>
                <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent-purple)" />
                  <stop offset="100%" stopColor="var(--accent-blue)" />
                </linearGradient>
              </defs>
            </svg>
          </div>
        </div>

        {/* Chapter Completion Rate Line Chart (SVG) */}
        <div className="glass-panel">
          <div className="card-header-row">
            <h2 className="card-title">
              <span className="material-icons-round">show_chart</span>
              장별 학습 통과율 (%)
            </h2>
          </div>

          <div style={{ width: '100%', overflowX: 'auto', display: 'flex', justifyContent: 'center' }}>
            <svg width={chartWidth} height={chartHeight} style={{ background: 'transparent' }}>
              {/* Grid Lines */}
              {[0, 25, 50, 75, 100].map((val, idx) => {
                const ratio = val / 100;
                const y = paddingTop + (1 - ratio) * (chartHeight - paddingTop - paddingBottom);
                return (
                  <g key={idx}>
                    <line
                      x1={paddingLeft}
                      y1={y}
                      x2={chartWidth - paddingRight}
                      y2={y}
                      stroke="var(--glass-border)"
                      strokeWidth="1"
                    />
                    <text x="2" y={y + 3} fill="var(--text-muted)" fontSize="8">
                      {val}%
                    </text>
                  </g>
                );
              })}

              {/* Line path render */}
              {(() => {
                const points = chapterCompletions.map((c, i) => {
                  const barWidth = 14;
                  const gap = 7;
                  const x = paddingLeft + i * (barWidth + gap) + 5 + barWidth / 2;
                  const ratio = c.rate / 100;
                  const y = paddingTop + (1 - ratio) * (chartHeight - paddingTop - paddingBottom);
                  return `${x},${y}`;
                }).join(' ');

                return (
                  <>
                    <polyline
                      fill="none"
                      stroke="var(--accent-emerald)"
                      strokeWidth="2"
                      points={points}
                    />
                    {chapterCompletions.map((c, i) => {
                      const barWidth = 14;
                      const gap = 7;
                      const x = paddingLeft + i * (barWidth + gap) + 5 + barWidth / 2;
                      const ratio = c.rate / 100;
                      const y = paddingTop + (1 - ratio) * (chartHeight - paddingTop - paddingBottom);

                      return (
                        <circle
                          key={c.chapter}
                          cx={x}
                          cy={y}
                          r="3"
                          fill="var(--bg-primary)"
                          stroke="var(--accent-emerald)"
                          strokeWidth="1.5"
                        />
                      );
                    })}
                  </>
                );
              })()}
            </svg>
          </div>
        </div>
      </div>

      <div className="dashboard-row">
        {/* DISENGAGEMENT FUNNEL ANALYSIS */}
        <div className="glass-panel">
          <h2 className="card-title" style={{ marginBottom: '1.5rem' }}>
            <span className="material-icons-round">filter_alt</span>
            학습 이탈 분석 깔때기 (Disengagement Funnel)
          </h2>

          <div className="funnel-container">
            {funnelStages.map((stage, idx) => (
              <div key={idx} className="funnel-stage">
                <span className="funnel-stage-label">{stage.label}</span>
                <div className="funnel-bar-wrapper">
                  <div
                    className="funnel-bar-fill"
                    style={{
                      width: `${Math.max(12, stage.pct)}%`,
                      background: idx === 0 ? 'var(--accent-purple)' :
                                  idx === 5 ? 'var(--accent-emerald)' :
                                  'linear-gradient(90deg, var(--accent-purple), var(--accent-blue))'
                    }}
                  >
                    {stage.count}명 ({stage.pct}%)
                  </div>
                </div>
                <span className="funnel-drop-off">
                  {idx > 0 && stage.drop > 0 ? `-${stage.drop}%` : '-'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* PROGRESS BY MEMBER */}
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h2 className="card-title">
            <span className="material-icons-round">search</span>
            회원별 학습 현황 추적
          </h2>

          <input
            type="text"
            className="input-field"
            placeholder="회원 이름 또는 아이디 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ paddingLeft: '2.5rem' }}
          />

          <div style={{ flex: 1, maxHeight: '250px', overflowY: 'auto', border: '1px solid var(--glass-border)', borderRadius: '8px' }}>
            <table className="admin-table" style={{ fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.01)' }}>
                  <th style={{ padding: '0.5rem' }}>회원</th>
                  <th style={{ padding: '0.5rem' }}>진도율</th>
                  <th style={{ padding: '0.5rem' }}>위치</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={3} style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)' }}>
                      검색된 회원이 없습니다.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => {
                    const pct = Math.min(100, Math.round((user.currentVerseIndex / totalVerses) * 100));
                    return (
                      <tr
                        key={user.id}
                        onClick={() => setSelectedUser(user)}
                        style={{ cursor: 'pointer', background: selectedUser?.id === user.id ? 'var(--sidebar-active)' : 'transparent' }}
                      >
                        <td data-label="회원" style={{ padding: '0.5rem', fontWeight: 'bold' }}>{user.name || user.username}</td>
                        <td data-label="진도율" style={{ padding: '0.5rem', fontFamily: 'var(--font-en)' }}>{pct}%</td>
                        <td data-label="위치" style={{ padding: '0.5rem', fontSize: '0.75rem' }}>{getVersePositionText(user.currentVerseIndex)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Detailed inspect card */}
          {selectedUser && (
            <div style={{ background: 'rgba(255, 255, 255, 0.45)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--glass-border)', fontSize: '0.8rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>{selectedUser.name || selectedUser.username} 님의 학습 이력</span>
                <span style={{ color: 'var(--accent-purple)', fontWeight: 'bold' }}>{selectedUser.points.toLocaleString()}P</span>
              </div>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>마지막 출석: {selectedUser.lastCheckInDate || '없음'}</p>
              <p style={{ color: 'var(--text-secondary)' }}>마지막 퀴즈: {selectedUser.lastMissionDate || '없음'}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
