import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query } from 'firebase/firestore';
import { db } from '../firebase';

interface NoticeItem {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  active: boolean;
  createdAt: string;
  rawTimestamp?: number;
}

interface NoticesProps {
  adminEmail: string;
}

export default function Notices({ adminEmail }: NoticesProps) {
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit / Form state
  const [showModal, setShowModal] = useState(false);
  const [editingNotice, setEditingNotice] = useState<NoticeItem | null>(null);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [pinned, setPinned] = useState(false);
  const [active, setActive] = useState(true);

  const [submitting, setSubmitting] = useState(false);

  // Real-time synchronization
  useEffect(() => {
    const q = query(collection(db, 'notices'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const noticeList: NoticeItem[] = [];
      snapshot.forEach((doc) => {
        noticeList.push({ id: doc.id, ...doc.data() } as NoticeItem);
      });

      // Sort: pinned first, then date desc
      noticeList.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return (b.rawTimestamp || 0) - (a.rawTimestamp || 0);
      });

      // Mock notices for default viewing if database is empty
      if (noticeList.length === 0) {
        setNotices([
          {
            id: 'mock_notice_1',
            title: '📖 Simon Edu 서비스 정식 런칭 및 사용 안내',
            content: '안녕하세요! 성경 말씀 암송 비서 Simon Edu에 오신 것을 환영합니다.\n본 서비스는 요한계시록 1장부터 22장까지 한 절 한 절을 재미있는 퀴즈 형식으로 암송하고 학습 진척도를 기록하는 암송 플랫폼입니다.\n매일 출석체크 보상 및 암송 성공 보상으로 획득한 포인트를 모아 교회의 암송 시상에 활용해 보세요.',
            pinned: true,
            active: true,
            createdAt: '2026-05-28 09:00:00',
            rawTimestamp: Date.now() - 500000
          },
          {
            id: 'mock_notice_2',
            title: '🎉 신규 회원가입 웰컴 보너스 지급 안내',
            content: '서비스 런칭 기념! 지금 회원가입을 하시는 모든 신규 회원님들께 즉시 사용 가능한 100P 웰컴 보너스가 자동 적립됩니다.\n주변에 암송 챌린지를 전하고 함께 말씀 암송의 풍성한 은혜를 누리시길 바랍니다.',
            pinned: false,
            active: true,
            createdAt: '2026-05-29 10:15:30',
            rawTimestamp: Date.now() - 400000
          },
          {
            id: 'mock_notice_3',
            title: '🛠 서버 점검 및 시스템 고도화 작업 공지 (완료)',
            content: '원활한 모바일 앱 연동 및 데이터 동기화 기능 강화를 위한 데이터베이스 최적화 작업을 진행하였습니다. 협조해 주셔서 감사드립니다.',
            pinned: false,
            active: false,
            createdAt: '2026-05-26 23:00:00',
            rawTimestamp: Date.now() - 800000
          }
        ]);
      } else {
        setNotices(noticeList);
      }
      setLoading(false);
    }, (error) => {
      console.error(error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const openCreateModal = () => {
    setEditingNotice(null);
    setTitle('');
    setContent('');
    setPinned(false);
    setActive(true);
    setShowModal(true);
  };

  const openEditModal = (notice: NoticeItem) => {
    setEditingNotice(notice);
    setTitle(notice.title);
    setContent(notice.content);
    setPinned(notice.pinned);
    setActive(notice.active);
    setShowModal(true);
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
      console.error(e);
    }
  };

  const handleTogglePin = async (notice: NoticeItem) => {
    const isMock = notice.id.startsWith('mock_');
    const newPinned = !notice.pinned;

    try {
      if (!isMock) {
        const docRef = doc(db, 'notices', notice.id);
        await updateDoc(docRef, { pinned: newPinned });
      }

      await logAdminAction(
        'notice_pin',
        `공지사항 고정 상태 변경: ${notice.title} (${newPinned ? '상단 고정' : '고정 해제'})`,
        notice.id,
        notice.title
      );

      if (isMock) {
        setNotices(notices.map(n => n.id === notice.id ? { ...n, pinned: newPinned } : n));
      }
      alert(`공지사항 고정이 ${newPinned ? '설정' : '해제'}되었습니다.`);
    } catch (err: any) {
      console.error(err);
      alert('설정 실패: ' + err.message);
    }
  };

  const handleToggleActive = async (notice: NoticeItem) => {
    const isMock = notice.id.startsWith('mock_');
    const newActive = !notice.active;

    try {
      if (!isMock) {
        const docRef = doc(db, 'notices', notice.id);
        await updateDoc(docRef, { active: newActive });
      }

      await logAdminAction(
        'notice_toggle',
        `공지사항 노출 상태 변경: ${notice.title} (${newActive ? '노출' : '숨김'})`,
        notice.id,
        notice.title
      );

      if (isMock) {
        setNotices(notices.map(n => n.id === notice.id ? { ...n, active: newActive } : n));
      }
      alert(`공지사항 노출이 ${newActive ? '활성화' : '비활성화(숨김)'}되었습니다.`);
    } catch (err: any) {
      console.error(err);
      alert('설정 실패: ' + err.message);
    }
  };

  const handleDelete = async (notice: NoticeItem) => {
    if (!window.confirm(`정말로 공지사항 [${notice.title}]을 영구 삭제하시겠습니까?`)) return;
    const isMock = notice.id.startsWith('mock_');

    try {
      if (!isMock) {
        const docRef = doc(db, 'notices', notice.id);
        await deleteDoc(docRef);
      }

      await logAdminAction(
        'notice_delete',
        `공지사항 삭제: ${notice.title}`,
        notice.id,
        notice.title
      );

      if (isMock) {
        setNotices(notices.filter(n => n.id !== notice.id));
      }
      alert('공지사항이 삭제되었습니다.');
    } catch (err: any) {
      console.error(err);
      alert('삭제 실패: ' + err.message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    const noticeData = {
      title,
      content,
      pinned,
      active,
      createdAt: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
      rawTimestamp: Date.now()
    };

    try {
      if (editingNotice) {
        // Edit Mode
        const isMock = editingNotice.id.startsWith('mock_');
        if (!isMock) {
          const docRef = doc(db, 'notices', editingNotice.id);
          // Preserve creation date
          await updateDoc(docRef, {
            title,
            content,
            pinned,
            active
          });
        }

        await logAdminAction(
          'notice_edit',
          `공지사항 수정: ${title}`,
          editingNotice.id,
          title
        );

        if (isMock) {
          setNotices(notices.map(n => n.id === editingNotice.id ? { ...n, title, content, pinned, active } : n));
        }
        alert('공지사항이 수정되었습니다.');
      } else {
        // Create Mode
        const docRef = await addDoc(collection(db, 'notices'), noticeData);

        await logAdminAction(
          'notice_create',
          `공지사항 신규 등록: ${title}`,
          docRef.id,
          title
        );

        alert('공지사항이 등록되었습니다.');
      }
      setShowModal(false);
    } catch (err: any) {
      console.error(err);
      alert('저장 실패: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="view-container">
      {/* HEADER SECTION */}
      <div className="glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 800 }}>공지사항 운영관리</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>모바일/웹 성경 암송 앱 홈 화면에 노출될 중요 공지 및 이벤트를 배포합니다.</p>
        </div>

        <button className="btn-primary" onClick={openCreateModal}>
          <span className="material-icons-round">campaign</span>
          공지 작성
        </button>
      </div>

      {/* NOTICES LIST */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '5rem' }}>
          <span className="material-icons-round" style={{ fontSize: '3rem', color: 'var(--accent-purple)', animation: 'spin 1.5s linear infinite' }}>
            sync
          </span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {notices.map((notice) => (
            <div key={notice.id} className="glass-panel" style={{
              border: notice.pinned ? '1.5px solid var(--accent-purple)' : '1px solid var(--glass-border)',
              background: notice.pinned ? 'rgba(99, 102, 241, 0.05)' : 'var(--glass-bg)',
              position: 'relative'
            }}>
              {/* Top Row: Tags & Dates */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  {notice.pinned && (
                    <span className="badge admin" style={{ display: 'flex', alignItems: 'center', gap: '0.15rem' }}>
                      <span className="material-icons-round" style={{ fontSize: '0.9rem' }}>push_pin</span>
                      필독 고정
                    </span>
                  )}
                  <span className={`badge ${notice.active ? 'active' : 'suspended'}`}>
                    {notice.active ? '노출 중' : '비활성(숨김)'}
                  </span>
                </div>

                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>작성일: {notice.createdAt}</span>
              </div>

              {/* Title & Content */}
              <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.75rem' }}>{notice.title}</h2>
              
              <p style={{
                fontSize: '0.85rem',
                color: 'var(--text-secondary)',
                lineHeight: '1.5',
                whiteSpace: 'pre-line',
                marginBottom: '1rem',
                paddingBottom: '1rem',
                borderBottom: '1px solid var(--glass-border)'
              }}>
                {notice.content}
              </p>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  className="btn-action edit"
                  onClick={() => openEditModal(notice)}
                >
                  편집
                </button>
                <button
                  className="btn-action reset"
                  onClick={() => handleTogglePin(notice)}
                >
                  {notice.pinned ? '고정 해제' : '상단 고정'}
                </button>
                <button
                  className="btn-action edit"
                  style={{
                    background: notice.active ? 'rgba(251, 191, 36, 0.15)' : 'rgba(52, 211, 153, 0.15)',
                    color: notice.active ? 'var(--accent-amber)' : 'var(--accent-emerald)'
                  }}
                  onClick={() => handleToggleActive(notice)}
                >
                  {notice.active ? '숨기기' : '노출하기'}
                </button>
                <button
                  className="btn-action danger"
                  onClick={() => handleDelete(notice)}
                >
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CREATE / EDIT DIALOG */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="glass-panel modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="card-header-row" style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '1rem', marginBottom: '1.25rem' }}>
              <h2 className="card-title">
                <span className="material-icons-round">campaign</span>
                {editingNotice ? '공지사항 수정' : '신규 공지 작성'}
              </h2>
              <button className="btn-icon-action" onClick={() => setShowModal(false)}>
                <span className="material-icons-round">close</span>
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group">
                <label htmlFor="notTitle">공지 제목</label>
                <input
                  type="text"
                  id="notTitle"
                  required
                  placeholder="예: [안내] 중요 시스템 고도화 작업 완료 공지"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label htmlFor="notContent">공지 본문 내용</label>
                <textarea
                  id="notContent"
                  required
                  placeholder="사용자에게 전달할 자세한 내용을 상세히 기술하세요."
                  rows={8}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  style={{ fontFamily: 'inherit', resize: 'none', lineHeight: '1.5' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.5rem' }}>
                <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                  <input
                    type="checkbox"
                    id="notPin"
                    checked={pinned}
                    onChange={(e) => setPinned(e.target.checked)}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  <label htmlFor="notPin" style={{ cursor: 'pointer', margin: 0 }}>상단 필독 고정</label>
                </div>

                <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                  <input
                    type="checkbox"
                    id="notActive"
                    checked={active}
                    onChange={(e) => setActive(e.target.checked)}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  <label htmlFor="notActive" style={{ cursor: 'pointer', margin: 0 }}>즉시 게시</label>
                </div>
              </div>

              <button
                type="submit"
                className="btn-primary"
                disabled={submitting}
                style={{ width: '100%', justifyContent: 'center', padding: '0.8rem', marginTop: '0.5rem' }}
              >
                {submitting ? '저장 처리 중...' : '공지사항 게시하기'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
