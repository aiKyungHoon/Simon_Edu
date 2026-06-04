import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query } from 'firebase/firestore';
import { db } from '../firebase';

interface EventItem {
  id: string;
  title: string;
  description: string;
  rewardPoints: number;
  imageUrl?: string;
  active: boolean;
  startDate: string;
  endDate: string;
  participantsCount?: number;
}

interface EventsProps {
  adminEmail: string;
}

export default function Events({ adminEmail }: EventsProps) {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal / Form state
  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventItem | null>(null);
  
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [rewardPoints, setRewardPoints] = useState<number>(0);
  const [imageUrl, setImageUrl] = useState('');
  const [active, setActive] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  const [submitting, setSubmitting] = useState(false);

  // Sync real-time events collection
  useEffect(() => {
    const q = query(collection(db, 'events'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const eventList: EventItem[] = [];
      snapshot.forEach((doc) => {
        eventList.push({ id: doc.id, ...doc.data() } as EventItem);
      });
      
      // If Firestore is empty, provide mock data for premium first-time experience
      if (eventList.length === 0) {
        setEvents([
          {
            id: 'mock_event_1',
            title: '요한계시록 1장 암송 챌린지',
            description: '요한계시록 1장 1절부터 20절까지 암송을 모두 완료하면 지급되는 특별 보너스 포인트!',
            rewardPoints: 500,
            imageUrl: 'https://images.unsplash.com/photo-1504052434569-70ad58565b90?w=500&auto=format&fit=crop&q=60',
            active: true,
            startDate: '2026-05-28',
            endDate: '2026-06-15',
            participantsCount: 15
          },
          {
            id: 'mock_event_2',
            title: '7일 연속 출석 미션',
            description: '쉬지 않고 7일 동안 연속으로 출석 체크를 달성한 회원들에게 주어지는 축하금!',
            rewardPoints: 200,
            imageUrl: 'https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=500&auto=format&fit=crop&q=60',
            active: true,
            startDate: '2026-05-01',
            endDate: '2026-06-30',
            participantsCount: 42
          },
          {
            id: 'mock_event_3',
            title: '호국보훈의 달 암송 대회',
            description: '나라를 사랑하는 마음으로 암송 퀴즈를 10회 이상 클리어 시 보너스 300P 지급',
            rewardPoints: 300,
            imageUrl: 'https://images.unsplash.com/photo-1461360370896-922624d12aa1?w=500&auto=format&fit=crop&q=60',
            active: false,
            startDate: '2026-06-01',
            endDate: '2026-06-07',
            participantsCount: 8
          }
        ]);
      } else {
        setEvents(eventList);
      }
      setLoading(false);
    }, (error) => {
      console.error(error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const openCreateModal = () => {
    setEditingEvent(null);
    setTitle('');
    setDescription('');
    setRewardPoints(100);
    setImageUrl('');
    setActive(true);
    
    // Default dates
    const today = new Date().toISOString().split('T')[0];
    setStartDate(today);
    
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    setEndDate(nextMonth.toISOString().split('T')[0]);
    
    setShowModal(true);
  };

  const openEditModal = (event: EventItem) => {
    setEditingEvent(event);
    setTitle(event.title);
    setDescription(event.description);
    setRewardPoints(event.rewardPoints);
    setImageUrl(event.imageUrl || '');
    setActive(event.active);
    setStartDate(event.startDate);
    setEndDate(event.endDate);
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

  const handleToggleActive = async (event: EventItem) => {
    const isMock = event.id.startsWith('mock_');
    const newActive = !event.active;

    try {
      if (!isMock) {
        const eventRef = doc(db, 'events', event.id);
        await updateDoc(eventRef, { active: newActive });
      }

      // Log
      await logAdminAction(
        'event_toggle',
        `이벤트 상태 변경: ${event.title} (${newActive ? '활성화' : '비활성화'})`,
        event.id,
        event.title
      );

      // Local state update for mock events
      if (isMock) {
        setEvents(events.map(e => e.id === event.id ? { ...e, active: newActive } : e));
      }
      alert(`이벤트가 ${newActive ? '활성' : '비활성'} 처리되었습니다.`);
    } catch (err: any) {
      console.error(err);
      alert('상태 변경 실패: ' + err.message);
    }
  };

  const handleDelete = async (event: EventItem) => {
    if (!window.confirm(`정말로 이벤트 [${event.title}]을 삭제하시겠습니까?`)) return;
    const isMock = event.id.startsWith('mock_');

    try {
      if (!isMock) {
        const eventRef = doc(db, 'events', event.id);
        await deleteDoc(eventRef);
      }

      await logAdminAction(
        'event_delete',
        `이벤트 삭제: ${event.title}`,
        event.id,
        event.title
      );

      if (isMock) {
        setEvents(events.filter(e => e.id !== event.id));
      }
      alert('이벤트가 삭제되었습니다.');
    } catch (err: any) {
      console.error(err);
      alert('이벤트 삭제 실패: ' + err.message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    const eventData = {
      title,
      description,
      rewardPoints: Number(rewardPoints),
      imageUrl: imageUrl || 'https://images.unsplash.com/photo-1504052434569-70ad58565b90?w=500&auto=format&fit=crop&q=60',
      active,
      startDate,
      endDate,
    };

    try {
      if (editingEvent) {
        // Edit Mode
        const isMock = editingEvent.id.startsWith('mock_');
        if (!isMock) {
          const eventRef = doc(db, 'events', editingEvent.id);
          await updateDoc(eventRef, eventData);
        }

        await logAdminAction(
          'event_edit',
          `이벤트 수정: ${title} (${rewardPoints}P)`,
          editingEvent.id,
          title
        );

        if (isMock) {
          setEvents(events.map(e => e.id === editingEvent.id ? { ...e, ...eventData } : e));
        }
        alert('이벤트가 수정되었습니다.');
      } else {
        // Create Mode
        const docRef = await addDoc(collection(db, 'events'), {
          ...eventData,
          participantsCount: 0
        });

        await logAdminAction(
          'event_create',
          `이벤트 신규 등록: ${title} (${rewardPoints}P)`,
          docRef.id,
          title
        );

        alert('새 이벤트가 등록되었습니다.');
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
          <h1 style={{ fontSize: '1.25rem', fontWeight: 800 }}>이벤트 & 챌린지 운영</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>회원 동기부여를 위한 암송 챌린지 및 마일스톤 이벤트를 설계합니다.</p>
        </div>

        <button className="btn-primary" onClick={openCreateModal}>
          <span className="material-icons-round">add_circle</span>
          이벤트 추가
        </button>
      </div>

      {/* EVENTS CARD GRID */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '5rem' }}>
          <span className="material-icons-round" style={{ fontSize: '3rem', color: 'var(--accent-purple)', animation: 'spin 1.5s linear infinite' }}>
            sync
          </span>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
          {events.map((event) => (
            <div key={event.id} className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem', position: 'relative', overflow: 'hidden' }}>
              {/* Event Image */}
              <div style={{ width: '100%', height: '140px', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--glass-border)', position: 'relative' }}>
                <img
                  src={event.imageUrl}
                  alt={event.title}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                <span className={`badge ${event.active ? 'active' : 'suspended'}`} style={{ position: 'absolute', top: '10px', right: '10px', boxShadow: '0 4px 10px rgba(0,0,0,0.5)' }}>
                  {event.active ? '진행 중' : '종료 / 중지'}
                </span>
              </div>

              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>{event.title}</h3>
                <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--accent-amber)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <span className="material-icons-round" style={{ fontSize: '1rem' }}>stars</span>
                  보상: {event.rewardPoints} P 지급
                </span>
              </div>

              {/* Description */}
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', flex: 1, lineBreak: 'anywhere' }}>
                {event.description}
              </p>

              {/* Date & Participants info */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', borderTop: '1px solid var(--glass-border)', paddingTop: '0.75rem' }}>
                <span>📅 {event.startDate} ~ {event.endDate}</span>
                <span style={{ fontWeight: 'bold', color: 'var(--accent-blue)' }}>👥 {event.participantsCount || 0}명 달성</span>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button className="btn-secondary" style={{ flex: 1, padding: '0.4rem', fontSize: '0.8rem' }} onClick={() => openEditModal(event)}>
                  수정
                </button>
                <button
                  className="btn-secondary"
                  style={{
                    flex: 1,
                    padding: '0.4rem',
                    fontSize: '0.8rem',
                    color: event.active ? 'var(--accent-rose)' : 'var(--accent-emerald)',
                    borderColor: event.active ? 'rgba(244,63,94,0.2)' : 'rgba(52,211,153,0.2)'
                  }}
                  onClick={() => handleToggleActive(event)}
                >
                  {event.active ? '중지하기' : '활성하기'}
                </button>
                <button
                  className="btn-icon-action"
                  style={{ color: 'var(--accent-rose)', border: '1px solid var(--glass-border)', borderRadius: '8px' }}
                  onClick={() => handleDelete(event)}
                  title="이벤트 삭제"
                >
                  <span className="material-icons-round">delete</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CREATE & EDIT DIALOG MODAL */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="glass-panel modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '450px' }}>
            <div className="card-header-row" style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '1rem', marginBottom: '1.25rem' }}>
              <h2 className="card-title">
                <span className="material-icons-round">event</span>
                {editingEvent ? '이벤트 수정' : '새 이벤트 등록'}
              </h2>
              <button className="btn-icon-action" onClick={() => setShowModal(false)}>
                <span className="material-icons-round">close</span>
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group">
                <label htmlFor="evtTitle">이벤트 제목</label>
                <input
                  type="text"
                  id="evtTitle"
                  required
                  placeholder="예: 7장 암송 챌린지"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label htmlFor="evtDesc">상세 설명</label>
                <textarea
                  id="evtDesc"
                  required
                  placeholder="이벤트 세부 내용 및 미션 완수 조건을 작성하세요."
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  style={{ fontFamily: 'inherit', resize: 'none' }}
                />
              </div>

              <div className="form-group">
                <label htmlFor="evtReward">보상 포인트 (P)</label>
                <input
                  type="number"
                  id="evtReward"
                  required
                  min={0}
                  value={rewardPoints || ''}
                  onChange={(e) => setRewardPoints(Math.max(0, parseInt(e.target.value) || 0))}
                  placeholder="예: 300"
                />
              </div>

              <div className="form-group">
                <label htmlFor="evtImage">배너 이미지 URL</label>
                <input
                  type="url"
                  id="evtImage"
                  placeholder="https://..."
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                />
              </div>

              <div className="events-modal-grid">
                <div className="form-group">
                  <label htmlFor="evtStart">시작 일자</label>
                  <input
                    type="date"
                    id="evtStart"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="evtEnd">종료 일자</label>
                  <input
                    type="date"
                    id="evtEnd"
                    required
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                <input
                  type="checkbox"
                  id="evtActive"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <label htmlFor="evtActive" style={{ cursor: 'pointer', margin: 0 }}>등록 즉시 노출 (활성화)</label>
              </div>

              <button
                type="submit"
                className="btn-primary"
                disabled={submitting}
                style={{ width: '100%', justifyContent: 'center', padding: '0.8rem', marginTop: '0.5rem' }}
              >
                {submitting ? '저장 처리 중...' : '이벤트 저장하기'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
