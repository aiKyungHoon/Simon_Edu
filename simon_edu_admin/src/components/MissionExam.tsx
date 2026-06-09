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
  answers?: Array<{
    question: string;
    correct: string;
    userAnswer: string;
    isCorrect: boolean;
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

export default function MissionExam({ users = [] }: MissionExamProps) {
  const [submissions, setSubmissions] = useState<ExamSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubmission, setSelectedSubmission] = useState<ExamSubmission | null>(null);

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

  const rows = useMemo(() => (
    [
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
    ]
      .sort((a, b) => {
        const scoreDiff = (b.score || 0) - (a.score || 0);
        if (scoreDiff !== 0) return scoreDiff;
        return (b.attemptCount || 0) - (a.attemptCount || 0);
      })
  ), [submissions, users]);

  const attempts = selectedSubmission?.attempts || [];

  return (
    <div className="view-container">
      <div className="glass-panel" style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 800 }}>시몬에듀 사명자 시험</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>지역과 이름 기준으로 최고 점수와 응시횟수, 회차별 제출 내역을 확인합니다.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <div className="badge active">응시자 {rows.length}명</div>
        </div>
      </div>

      <div className="glass-panel">
        <div className="table-container" style={{ margin: 0 }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>지역</th>
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
                  <td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    시험 제출 내역을 불러오는 중입니다.
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    아직 시험 제출 내역이 없습니다.
                  </td>
                </tr>
              ) : rows.map((submission) => (
                <tr key={submission.id}>
                  <td style={{ fontWeight: 700 }}>{submission.region || '-'}</td>
                  <td style={{ fontWeight: 700 }}>{submission.applicantName || '-'}</td>
                  <td style={{ fontWeight: 800, color: 'var(--accent-purple)' }}>{submission.score || 0}점</td>
                  <td>{submission.lastScore ?? submission.score ?? 0}점</td>
                  <td style={{ color: 'var(--accent-amber)', fontWeight: 700 }}>{submission.pointsEarned || 0}P</td>
                  <td>{submission.lastAttemptDate || '-'}</td>
                  <td>
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
                      {attempt.submittedAt || '-'} | {attempt.region || selectedSubmission.region || '-'} / {attempt.applicantName || selectedSubmission.applicantName || '-'} | {attempt.score}점 | {attempt.correctCount || 0}/{attempt.totalCount || 10} 정답
                    </summary>
                    <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {(attempt.answers || []).map((answer, answerIndex) => (
                        <div key={`${attempt.id || index}_${answerIndex}`} style={{ padding: '0.65rem', borderRadius: '8px', background: 'rgba(255,255,255,0.35)' }}>
                          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{answerIndex + 1}. {answer.question}</div>
                          <div style={{ fontSize: '0.82rem', color: answer.isCorrect ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>
                            내 답: {answer.userAnswer || '(미입력)'} / 정답: {answer.correct}
                          </div>
                        </div>
                      ))}
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
