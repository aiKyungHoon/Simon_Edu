import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db } from '../firebase';

interface ExamAttempt {
  id?: string;
  score: number;
  correctCount?: number;
  totalCount?: number;
  submittedAt?: string;
  region?: string;
  applicantName?: string;
  eventId?: string;
  eventTitle?: string;
  startChapter?: number;
  startVerse?: number;
  endChapter?: number;
  endVerse?: number;
  answers?: Array<{
    question?: string;
    correct?: string;
    userAnswer?: string;
    isCorrect?: boolean;
    verse?: {
      chapter: number;
      verse: number;
      text: string;
    };
    userTypedText?: string;
    accuracy?: number;
    html?: string;
  }>;
}

interface ExamSubmission {
  id: string;
  region?: string;
  applicantName?: string;
  regionNameKey?: string;
  score: number;
  pointsEarned?: number;
  attemptCount: number;
  lastAttemptDate?: string;
  lastScore?: number;
  lastUserEmail?: string;
  attempts?: ExamAttempt[];
}

interface User {
  id: string;
  username: string;
  name?: string;
  email: string;
  examRegion?: string;
  examApplicantName?: string;
  examSubmission?: Omit<ExamSubmission, 'id'>;
}

interface MissionExamProps {
  users?: User[];
}

const getRegionNameKey = (region?: string, name?: string) => {
  const cleanRegion = String(region || '').trim().replace(/\s+/g, ' ');
  const cleanName = String(name || '').trim().replace(/\s+/g, ' ');
  if (!cleanRegion || !cleanName) return '';
  return `${cleanRegion}__${cleanName}`.toLowerCase().replace(/[\/#?\[\]]/g, '_');
};

const getExamRangeLabel = (submission: ExamSubmission) => {
  const attempts = submission.attempts || [];
  if (attempts.length > 0) {
    const lastAttempt = attempts[attempts.length - 1];
    
    // Check if event start/end chapter/verse is present
    if (lastAttempt.startChapter !== undefined && lastAttempt.endChapter !== undefined) {
      const startCh = lastAttempt.startChapter;
      const startV = lastAttempt.startVerse || 1;
      const endCh = lastAttempt.endChapter;
      const endV = lastAttempt.endVerse || 1;
      if (startCh === endCh) {
        return `계${startCh}장 ${startV}절 ~ ${endV}절`;
      } else {
        return `계${startCh}장 ${startV}절 ~ ${endCh}장 ${endV}절`;
      }
    }
    
    const answers = lastAttempt.answers || [];
    if (answers.length > 0) {
      const firstAns = answers[0];
      const lastAns = answers[answers.length - 1];
      
      const firstVerse = firstAns.verse;
      const lastVerse = lastAns.verse;
      
      if (firstVerse && lastVerse) {
        if (firstVerse.chapter === lastVerse.chapter) {
          return `계${firstVerse.chapter}장 ${firstVerse.verse}절 ~ ${lastVerse.verse}절`;
        } else {
          return `계${firstVerse.chapter}장 ${firstVerse.verse}절 ~ ${lastVerse.chapter}장 ${lastVerse.verse}절`;
        }
      }
      
      // Fallback: parse from question text (e.g., "요한계시록 1장 1절")
      const firstQ = firstAns.question || '';
      const lastQ = lastAns.question || '';
      const firstMatch = firstQ.match(/(\d+)장\s*(\d+)절/);
      const lastMatch = lastQ.match(/(\d+)장\s*(\d+)절/);
      if (firstMatch && lastMatch) {
        const startCh = firstMatch[1];
        const startV = firstMatch[2];
        const endCh = lastMatch[1];
        const endV = lastMatch[2];
        if (startCh === endCh) {
          return `계${startCh}장 ${startV}절 ~ ${endV}절`;
        } else {
          return `계${startCh}장 ${startV}절 ~ ${endCh}장 ${endV}절`;
        }
      }
    }
  }
  
  // Fallback 2: parse from eventTitle (e.g., "사명자 암송 대비 (7장)")
  if (submission.attempts && submission.attempts.length > 0 && submission.attempts[submission.attempts.length - 1].eventTitle) {
    const title = submission.attempts[submission.attempts.length - 1].eventTitle!;
    const match = title.match(/\((\d+)장\)/);
    if (match) {
      return `계${match[1]}장`;
    }
    return title;
  }
  
  return '-';
};

const groupAttemptsByEvent = (submission: ExamSubmission): ExamSubmission[] => {
  const attempts = submission.attempts || [];
  if (attempts.length === 0) {
    return [submission];
  }
  
  const groups: { [key: string]: ExamAttempt[] } = {};
  attempts.forEach(attempt => {
    let key = '';
    if (attempt.eventId) {
      key = attempt.eventId;
    } else if (attempt.eventTitle) {
      key = attempt.eventTitle;
    } else {
      const answers = attempt.answers || [];
      if (answers.length > 0) {
        const firstAns = answers[0];
        const ch = firstAns.verse?.chapter || (firstAns.question ? parseInt(firstAns.question.match(/(\d+)장/)?.[1] || '0') : 0);
        if (ch === 7) key = 'legacy_7';
        else if (ch === 22) key = 'legacy_22';
        else key = `legacy_ch_${ch}`;
      } else {
        key = 'unknown';
      }
    }
    
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(attempt);
  });
  
  return Object.entries(groups).map(([key, groupAttempts]) => {
    const sortedAttempts = [...groupAttempts].sort((a, b) => {
      return new Date(a.submittedAt || 0).getTime() - new Date(b.submittedAt || 0).getTime();
    });
    
    const bestScore = sortedAttempts.reduce((max, a) => Math.max(max, a.score || 0), 0);
    const lastAttempt = sortedAttempts[sortedAttempts.length - 1];
    
    const getPoints = (s: number) => {
      if (s === 100) return 500;
      if (s >= 95) return 450;
      if (s >= 90) return 400;
      if (s >= 80) return 300;
      if (s >= 70) return 200;
      if (s >= 60) return 100;
      return 0;
    };
    const bestPoints = sortedAttempts.reduce((max, a) => Math.max(max, getPoints(a.score || 0)), 0);
    
    return {
      ...submission,
      id: `${submission.id}_${key}`,
      score: bestScore,
      lastScore: lastAttempt.score,
      pointsEarned: bestPoints,
      attemptCount: sortedAttempts.length,
      lastAttemptDate: lastAttempt.submittedAt,
      attempts: sortedAttempts
    } as ExamSubmission;
  });
};

export default function MissionExam({ users = [] }: MissionExamProps) {
  const [submissions, setSubmissions] = useState<ExamSubmission[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedSubmission, setSelectedSubmission] = useState<ExamSubmission | null>(null);
  const [selectedRange, setSelectedRange] = useState<string>('all');

  useEffect(() => {
    const q = query(collection(db, 'mission_exam_submissions'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: ExamSubmission[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as ExamSubmission);
      });
      setSubmissions(list);
      setLoading(false);
    }, (err) => {
      console.error('Mission exam submissions load error:', err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const rows = useMemo(() => {
    const rawList = [
      ...submissions,
      ...users
        .filter((user) => user.examSubmission)
        .map((user) => {
          const legacy = user.examSubmission!;
          const region = legacy.region || user.examRegion || '';
          const applicantName = legacy.applicantName || user.examApplicantName || user.name || user.username;
          return {
            id: `legacy_${user.id}`,
            ...legacy,
            region,
            applicantName,
            regionNameKey: legacy.regionNameKey || getRegionNameKey(region, applicantName)
          } as ExamSubmission;
        })
        .filter((legacy) => (
          !legacy.regionNameKey || !submissions.some((submission) => submission.regionNameKey === legacy.regionNameKey)
        ))
    ];

    const splitList: ExamSubmission[] = [];
    rawList.forEach(submission => {
      splitList.push(...groupAttemptsByEvent(submission));
    });

    return splitList.sort((a, b) => {
      const dateA = new Date(a.lastAttemptDate || 0).getTime();
      const dateB = new Date(b.lastAttemptDate || 0).getTime();
      if (dateB !== dateA) return dateB - dateA;
      
      const scoreDiff = (b.score || 0) - (a.score || 0);
      if (scoreDiff !== 0) return scoreDiff;
      return (b.attemptCount || 0) - (a.attemptCount || 0);
    });
  }, [submissions, users]);

  const uniqueRanges = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      const label = getExamRangeLabel(r);
      if (label && label !== '-') {
        set.add(label);
      }
    });
    return Array.from(set).sort((a, b) => {
      const matchA = a.match(/계\s*(\d+)장\s*(\d+)절/);
      const matchB = b.match(/계\s*(\d+)장\s*(\d+)절/);
      if (matchA && matchB) {
        const chA = parseInt(matchA[1], 10);
        const chB = parseInt(matchB[1], 10);
        if (chA !== chB) return chA - chB;
        const vA = parseInt(matchA[2], 10);
        const vB = parseInt(matchB[2], 10);
        return vA - vB;
      }
      return a.localeCompare(b, 'ko');
    });
  }, [rows]);

  const filteredRows = useMemo(() => {
    let list = rows;
    if (selectedRange !== 'all') {
      list = list.filter((r) => getExamRangeLabel(r) === selectedRange);
    }
    
    const searchTerms = searchTerm.trim().toLowerCase().split(/[\s,/;]+/).filter(t => t.length > 0);
    if (searchTerms.length > 0) {
      list = list.filter((r) => {
        return searchTerms.some(term => {
          const nameMatch = r.applicantName && r.applicantName.toLowerCase().includes(term);
          const regionMatch = r.region && r.region.toLowerCase().includes(term);
          return !!(nameMatch || regionMatch);
        });
      });
    }
    return list;
  }, [rows, selectedRange, searchTerm]);

  useEffect(() => {
    if (selectedRange !== 'all' && !uniqueRanges.includes(selectedRange)) {
      setSelectedRange('all');
    }
  }, [uniqueRanges, selectedRange]);

  const attempts = selectedSubmission?.attempts || [];

  const downloadCSV = () => {
    const headers = ['지역', '장', '이름', '시험 최고 점수', '최근 시험 점수', '지급 포인트', '최근 응시일', '총 응시횟수'];
    const csvRows = filteredRows.map(r => [
      r.region || '-',
      getExamRangeLabel(r),
      r.applicantName || '-',
      `${r.score || 0}점`,
      `${r.lastScore ?? r.score ?? 0}점`,
      `${r.pointsEarned || 0}P`,
      r.lastAttemptDate || '-',
      `${r.attemptCount || 0}회`
    ]);
    
    // UTF-8 BOM to display Korean characters properly in Excel
    const csvContent = "\uFEFF" + [headers, ...csvRows]
      .map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
      .join('\n');
      
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `simon_edu_mission_exams_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="view-container">
      <div className="glass-panel mission-exam-header" style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 800 }}>시몬에듀 사명자 시험</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>지역과 이름 기준으로 최고 점수와 응시횟수, 회차별 제출 내역을 확인합니다.</p>
        </div>
        <div className="mission-exam-controls" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="search-input-wrapper" style={{ minWidth: '240px' }}>
            <span className="material-icons-round">search</span>
            <input
              type="text"
              className="input-field"
              placeholder="이름, 지역 다중 검색 (쉼표/공백)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                fontSize: '0.85rem',
                padding: '0.4rem 0.5rem 0.4rem 2.2rem',
                height: '34px',
                background: 'rgba(255, 255, 255, 0.65)'
              }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>장 필터:</span>
            <select
              value={selectedRange}
              onChange={(e) => setSelectedRange(e.target.value)}
              style={{
                background: 'rgba(255, 255, 255, 0.65)',
                border: '1px solid var(--glass-border)',
                color: 'var(--text-primary)',
                padding: '0.4rem 0.8rem',
                borderRadius: '6px',
                fontSize: '0.85rem',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="all">전체</option>
              {uniqueRanges.map((range) => (
                <option key={range} value={range}>{range}</option>
              ))}
            </select>
          </div>
          <div className="badge active">응시자 {filteredRows.length}명</div>
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

      <div className="glass-panel">
        <div className="table-container" style={{ margin: 0 }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>지역</th>
                <th>장</th>
                <th>이름</th>
                <th>시험 점수</th>
                <th>최근 점수</th>
                <th>지급 기준 포인트</th>
                <th>최근 응시일</th>
                <th>응시횟수 (내역)</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    시험 제출 내역을 불러오는 중입니다.
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    아직 시험 제출 내역이 없습니다.
                  </td>
                </tr>
              ) : filteredRows.map((submission) => (
                <tr key={submission.id}>
                  <td data-label="지역" style={{ fontWeight: 700 }}>{submission.region || '-'}</td>
                  <td data-label="장" style={{ fontWeight: 600 }}>{getExamRangeLabel(submission)}</td>
                  <td data-label="이름" style={{ fontWeight: 700 }}>{submission.applicantName || '-'}</td>
                  <td data-label="시험 최고 점수" style={{ fontWeight: 800, color: 'var(--accent-purple)' }}>{submission.score || 0}점</td>
                  <td data-label="최근 점수">{submission.lastScore ?? submission.score ?? 0}점</td>
                  <td data-label="지급 기준 포인트" style={{ color: 'var(--accent-amber)', fontWeight: 700 }}>{submission.pointsEarned || 0}P</td>
                  <td data-label="최근 응시일">{submission.lastAttemptDate || '-'}</td>
                  <td data-label="응시횟수 (내역)">
                    <button className="btn-action edit" onClick={() => setSelectedSubmission(submission)}>
                      {submission.attemptCount || 0}회
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedSubmission && (
        <div className="modal-overlay" onClick={() => setSelectedSubmission(null)}>
          <div className="glass-panel modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '780px' }}>
            <div className="card-header-row" style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '1rem', marginBottom: '1rem' }}>
              <h2 className="card-title">
                <span className="material-icons-round">assignment</span>
                {selectedSubmission.region || '-'} / {selectedSubmission.applicantName || '-'} 시험 응시 내역
              </h2>
              <button className="btn-icon-action" onClick={() => setSelectedSubmission(null)}>
                <span className="material-icons-round">close</span>
              </button>
            </div>

            {attempts.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                회차별 상세 내역은 다음 응시부터 저장됩니다.
              </div>
            ) : (
              <div className="custom-scroll" style={{ maxHeight: '65vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {[...attempts].reverse().map((attempt, index) => (
                  <details key={attempt.id || index} open={index === 0} style={{ border: '1px solid var(--glass-border)', borderRadius: '10px', padding: '1rem' }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 800 }}>
                      {attempt.submittedAt || '-'} | {attempt.eventTitle ? `${attempt.eventTitle} | ` : ''}{attempt.region || selectedSubmission.region || '-' } / {attempt.applicantName || selectedSubmission.applicantName || '-'} | {attempt.score}점 | {attempt.correctCount || 0}/{attempt.totalCount || 10} 정답
                    </summary>
                    <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {(attempt.answers || []).map((answer, answerIndex) => {
                        const questionText = answer.question || (answer.verse ? `요한계시록 ${answer.verse.chapter}장 ${answer.verse.verse}절` : `성구 ${answerIndex + 1}`);
                        const userAnswerText = answer.userAnswer || answer.userTypedText || '(미입력)';
                        const correctAnswerText = answer.correct || answer.verse?.text || '';
                        
                        let isCorrect = false;
                        if (typeof answer.isCorrect === 'boolean') {
                          isCorrect = answer.isCorrect;
                        } else if (typeof answer.accuracy === 'number') {
                          isCorrect = answer.accuracy >= 80;
                        } else if (answer.userTypedText && answer.verse?.text) {
                          isCorrect = answer.userTypedText.trim() === answer.verse.text.trim();
                        }

                        return (
                          <div key={`${attempt.id || index}_${answerIndex}`} style={{ 
                            padding: '0.75rem', 
                            borderRadius: '8px', 
                            background: 'rgba(0,0,0,0.03)',
                            border: '1px solid rgba(184, 134, 11, 0.15)',
                            marginBottom: '0.5rem'
                          }}>
                            <div style={{ fontWeight: 700, color: '#1f2937', marginBottom: '0.25rem' }}>
                              {answerIndex + 1}. {questionText}
                            </div>
                            <div style={{ fontSize: '0.85rem', color: '#4b5563', marginBottom: '0.25rem' }}>
                              내 답: <span style={{ fontWeight: 700, color: userAnswerText === '(미입력)' ? '#9ca3af' : (isCorrect ? 'var(--accent-emerald)' : 'var(--accent-rose)') }}>{userAnswerText}</span>
                            </div>
                            <div style={{ fontSize: '0.85rem', color: '#4b5563' }}>
                              정답: <span style={{ fontWeight: 700, color: 'var(--accent-emerald)' }}>{correctAnswerText}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </details>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
