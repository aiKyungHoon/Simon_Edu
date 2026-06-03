import { useState, useEffect } from 'react';
import { doc, setDoc, getDocs, collection, addDoc } from 'firebase/firestore';
import { db } from '../firebase';
import BIBLE_DATA_RAW from '../assets/bible_data.json';

interface Verse {
  chapter: number;
  verse: number;
  text: string;
  keywords: string[];
  difficulty?: 'easy' | 'normal' | 'hard';
  customQuestion?: string;
  customAnswer?: string;
}

interface QuizzesProps {
  adminEmail: string;
}

export default function Quizzes({ adminEmail }: QuizzesProps) {
  const [selectedChapter, setSelectedChapter] = useState<number>(1);
  const [verses, setVerses] = useState<Verse[]>([]);
  const [selectedVerse, setSelectedVerse] = useState<Verse | null>(null);
  
  // Edit Form State
  const [editText, setEditText] = useState('');
  const [editKeywords, setEditKeywords] = useState<string[]>([]);
  const [newKeyword, setNewKeyword] = useState('');
  const [difficulty, setDifficulty] = useState<'easy' | 'normal' | 'hard'>('normal');
  const [customQuestion, setCustomQuestion] = useState('');
  const [customAnswer, setCustomAnswer] = useState('');
  const [saving, setSaving] = useState(false);

  // Load custom quizzes/verses overrides from Firestore
  useEffect(() => {
    const loadCustomData = async () => {
      try {
        const customSnapshot = await getDocs(collection(db, 'customQuizzes'));
        const overrides: Record<string, any> = {};
        customSnapshot.forEach((doc) => {
          overrides[doc.id] = doc.data();
        });

        // Merge raw BIBLE_DATA with firestore overrides
        const mergedVerses = BIBLE_DATA_RAW.map((v) => {
          const key = `ch${v.chapter}_v${v.verse}`;
          if (overrides[key]) {
            return { ...v, ...overrides[key] } as Verse;
          }
          return { ...v, difficulty: 'normal' } as Verse;
        });

        setVerses(mergedVerses);
      } catch (err) {
        console.error("Error loading overrides:", err);
        // Fallback to raw data
        setVerses(BIBLE_DATA_RAW.map(v => ({ ...v, difficulty: 'normal' })));
      }
    };

    loadCustomData();
  }, []);

  // Filter verses by selected chapter
  const chapterVerses = verses.filter((v) => v.chapter === selectedChapter);

  const handleSelectVerse = (verse: Verse) => {
    setSelectedVerse(verse);
    setEditText(verse.text);
    setEditKeywords([...verse.keywords]);
    setDifficulty(verse.difficulty || 'normal');
    setCustomQuestion(verse.customQuestion || '');
    setCustomAnswer(verse.customAnswer || '');
  };

  const handleAddKeyword = () => {
    if (newKeyword.trim() && !editKeywords.includes(newKeyword.trim())) {
      setEditKeywords([...editKeywords, newKeyword.trim()]);
      setNewKeyword('');
    }
  };

  const handleRemoveKeyword = (kw: string) => {
    setEditKeywords(editKeywords.filter(k => k !== kw));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVerse) return;
    setSaving(true);

    const docKey = `ch${selectedVerse.chapter}_v${selectedVerse.verse}`;
    const overrideData = {
      chapter: selectedVerse.chapter,
      verse: selectedVerse.verse,
      text: editText,
      keywords: editKeywords,
      difficulty,
      customQuestion,
      customAnswer,
      updatedAt: new Date().toISOString()
    };

    try {
      // 1. Save to customQuizzes collection in Firestore
      await setDoc(doc(db, 'customQuizzes', docKey), overrideData);

      // 2. Audit Log
      await addDoc(collection(db, 'logs'), {
        adminEmail,
        type: 'quiz_edit',
        details: `말씀/퀴즈 수정: 요한계시록 ${selectedVerse.chapter}장 ${selectedVerse.verse}절 (난이도: ${difficulty})`,
        targetUserId: docKey,
        targetUserName: `요한계시록 ${selectedVerse.chapter}장 ${selectedVerse.verse}절`,
        timestamp: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
        rawTimestamp: Date.now()
      });

      // 3. Update local state
      setVerses(verses.map(v => {
        if (v.chapter === selectedVerse.chapter && v.verse === selectedVerse.verse) {
          return { ...v, ...overrideData };
        }
        return v;
      }));

      setSelectedVerse({ ...selectedVerse, ...overrideData });
      alert('성경 말씀 및 퀴즈 정보가 저장되었습니다. 모바일/웹 클라이언트에 실시간 적용됩니다.');
    } catch (err: any) {
      console.error(err);
      alert('저장 실패: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="view-container" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
      {/* LEFT COLUMN: CHAPTERS & VERSES LIST */}
      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '78vh' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 className="card-title">
            <span className="material-icons-round">menu_book</span>
            요한계시록 말씀 목록
          </h2>
          
          <select
            value={selectedChapter}
            onChange={(e) => setSelectedChapter(parseInt(e.target.value))}
            style={{
              background: 'rgba(255, 255, 255, 0.65)',
              border: '1px solid var(--glass-border)',
              color: 'var(--text-primary)',
              padding: '0.4rem 0.8rem',
              borderRadius: '8px',
              fontWeight: '600'
            }}
          >
            {Array.from({ length: 22 }, (_, i) => i + 1).map((ch) => (
              <option key={ch} value={ch}>{ch}장</option>
            ))}
          </select>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingRight: '0.25rem' }}>
          {chapterVerses.map((v) => {
            const isSelected = selectedVerse?.chapter === v.chapter && selectedVerse?.verse === v.verse;
            return (
              <div
                key={`${v.chapter}_${v.verse}`}
                onClick={() => handleSelectVerse(v)}
                style={{
                  padding: '1rem',
                  borderRadius: '10px',
                  background: isSelected ? 'var(--sidebar-active)' : 'rgba(255, 255, 255, 0.4)',
                  border: `1px solid ${isSelected ? 'var(--accent-purple)' : 'var(--glass-border)'}`,
                  cursor: 'pointer',
                  transition: 'all var(--transition-fast)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                  <span style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>
                    요한계시록 {v.chapter}장 {v.verse}절
                  </span>
                  <span className={`badge ${v.difficulty || 'normal'}`}>
                    {v.difficulty === 'easy' ? '쉬움' : v.difficulty === 'hard' ? '어려움' : '보통'}
                  </span>
                </div>
                <p style={{
                  fontSize: '0.825rem',
                  color: 'var(--text-secondary)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>
                  {v.text}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* RIGHT COLUMN: EDITOR PANEL */}
      <div className="glass-panel" style={{ height: '78vh', overflowY: 'auto' }}>
        {selectedVerse ? (
          <div>
            <h2 className="card-title" style={{ marginBottom: '1.25rem' }}>
              <span className="material-icons-round">edit_note</span>
              {selectedVerse.chapter}장 {selectedVerse.verse}절 퀴즈 편집기
            </h2>

            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div className="form-group">
                <label>성경 구절 텍스트</label>
                <textarea
                  required
                  rows={4}
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  style={{ fontFamily: 'inherit', resize: 'none' }}
                />
              </div>

              <div className="form-group">
                <label>암송 빈칸 키워드 (퀴즈 정답)</label>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <input
                    type="text"
                    placeholder="키워드 입력 (예: 그리스도)"
                    value={newKeyword}
                    onChange={(e) => setNewKeyword(e.target.value)}
                    style={{ flex: 1 }}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddKeyword();
                      }
                    }}
                  />
                  <button type="button" onClick={handleAddKeyword} className="btn-secondary" style={{ padding: '0.5rem 1rem' }}>
                    추가
                  </button>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', background: 'rgba(184, 134, 11, 0.05)', padding: '0.75rem', borderRadius: '8px', minHeight: '50px' }}>
                  {editKeywords.length === 0 ? (
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>등록된 빈칸 키워드가 없습니다. 단어를 추가해 주세요.</span>
                  ) : (
                    editKeywords.map((kw, i) => (
                      <span key={i} className="badge user" style={{ gap: '0.25rem', padding: '0.35rem 0.5rem' }}>
                        {kw}
                        <span
                          className="material-icons-round"
                          onClick={() => handleRemoveKeyword(kw)}
                          style={{ fontSize: '0.9rem', cursor: 'pointer', color: 'var(--accent-rose)' }}
                        >
                          cancel
                        </span>
                      </span>
                    ))
                  )}
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="difficulty">난이도 구분</label>
                <select
                  id="difficulty"
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as any)}
                  style={{
                    background: 'rgba(255, 255, 255, 0.65)',
                    border: '1px solid var(--glass-border)',
                    color: 'var(--text-primary)',
                    padding: '0.65rem',
                    borderRadius: '8px'
                  }}
                >
                  <option value="easy">쉬움 (빈칸 적음)</option>
                  <option value="normal">보통 (일반)</option>
                  <option value="hard">어려움 (빈칸 많음)</option>
                </select>
              </div>

              <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '1.25rem' }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '0.75rem', color: 'var(--text-primary)' }}>
                  [옵션] 서술형 커스텀 질문/정답 등록
                </h3>
                
                <div className="form-group">
                  <label htmlFor="customQ">커스텀 질문</label>
                  <input
                    type="text"
                    id="customQ"
                    placeholder="예: 예수 그리스도의 계시를 기록한 종의 이름은 무엇인가?"
                    value={customQuestion}
                    onChange={(e) => setCustomQuestion(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="customA">커스텀 정답</label>
                  <input
                    type="text"
                    id="customA"
                    placeholder="예: 요한"
                    value={customAnswer}
                    onChange={(e) => setCustomAnswer(e.target.value)}
                  />
                </div>
              </div>

              <button
                type="submit"
                className="btn-primary"
                disabled={saving}
                style={{ width: '100%', justifyContent: 'center', padding: '0.8rem', marginTop: '0.5rem' }}
              >
                {saving ? '저장 처리 중...' : '구절 및 퀴즈 설정 저장'}
              </button>
            </form>
          </div>
        ) : (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
            <span className="material-icons-round" style={{ fontSize: '4rem', marginBottom: '1rem', color: 'var(--glass-border)' }}>
              touch_app
            </span>
            <p>좌측 말씀 목록에서 편집할 성경 구절을 선택해 주세요.</p>
          </div>
        )}
      </div>
    </div>
  );
}
