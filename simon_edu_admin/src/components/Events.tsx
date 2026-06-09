import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, serverTimestamp, getDoc, setDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { db, storage } from '../firebase';
import { PUBLISH_ROLES, ROLE_OPTIONS } from '../roles';
import BIBLE_DATA_RAW from '../assets/bible_data.json';

interface EventItem {
  id: string;
  eventType?: 'special_challenge' | 'mission_exam' | 'general_event';
  title: string;
  description: string;
  rewardPoints: number;
  imageUrl?: string;
  homeBanner?: string;
  popup?: boolean;
  active: boolean;
  startDate: string;
  endDate: string;
  participantsCount?: number;
  targetGroups?: string[];
  targetUsers?: string[];
  targetRoles?: string[];
  pushOnCreate?: boolean;
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
  const [eventType, setEventType] = useState<'special_challenge' | 'mission_exam' | 'general_event'>('general_event');
  const [description, setDescription] = useState('');
  const [rewardPoints, setRewardPoints] = useState<number>(0);
  const [imageUrl, setImageUrl] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState('');
  const [active, setActive] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [targetRoles, setTargetRoles] = useState<string[]>([...PUBLISH_ROLES]);
  const [pushOnCreate, setPushOnCreate] = useState(true);
  
  const [submitting, setSubmitting] = useState(false);
  const [examStartKey, setExamStartKey] = useState('1:1');
  const [examEndKey, setExamEndKey] = useState('22:21');
  const [examMaxPoints, setExamMaxPoints] = useState(500);
  const [challengeStartKey, setChallengeStartKey] = useState('7:1');
  const [challengeEndKey, setChallengeEndKey] = useState('7:17');
  const [challengeBonusPoints, setChallengeBonusPoints] = useState(50);

  const verseOptions = BIBLE_DATA_RAW.map((verse: any) => ({
    key: `${verse.chapter}:${verse.verse}`,
    label: `요한계시록 ${verse.chapter}장 ${verse.verse}절`
  }));

  const parseVerseKey = (key: string) => {
    const [chapter, verse] = key.split(':').map((v) => parseInt(v, 10));
    return { chapter: chapter || 1, verse: verse || 1 };
  };

  const getVerseOrder = (key: string) => BIBLE_DATA_RAW.findIndex((verse: any) => `${verse.chapter}:${verse.verse}` === key);
  const fallbackImageUrl = 'https://images.unsplash.com/photo-1504052434569-70ad58565b90?w=500&auto=format&fit=crop&q=60';

  const loadMissionSettings = async () => {
    try {
      const docRef = doc(db, 'settings', 'global');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setExamStartKey(`${data.examStartChapter || 1}:${data.examStartVerse || 1}`);
        setExamEndKey(`${data.examEndChapter || 22}:${data.examEndVerse || 21}`);
        setExamMaxPoints(data.examMaxPoints || 500);
        setChallengeStartKey(`${data.challengeStartChapter || data.activeChallengeChapter || 7}:${data.challengeStartVerse || 1}`);
        setChallengeEndKey(`${data.challengeEndChapter || data.activeChallengeChapter || 7}:${data.challengeEndVerse || 17}`);
        setChallengeBonusPoints(data.challengeBonusPoints || 50);
      }
    } catch (err) {
      console.error('Exam settings load error:', err);
    }
  };

  const saveMissionSettingsForEvent = async () => {
    const examStart = parseVerseKey(examStartKey);
    const examEnd = parseVerseKey(examEndKey);
    const challengeStart = parseVerseKey(challengeStartKey);
    const challengeEnd = parseVerseKey(challengeEndKey);

    const docRef = doc(db, 'settings', 'global');
    const payload: Record<string, number> = {};
    if (eventType === 'mission_exam') {
      Object.assign(payload, {
        examStartChapter: examStart.chapter,
        examStartVerse: examStart.verse,
        examEndChapter: examEnd.chapter,
        examEndVerse: examEnd.verse,
        examMaxPoints: Number(examMaxPoints),
      });
    }
    if (eventType === 'special_challenge') {
      Object.assign(payload, {
        challengeStartChapter: challengeStart.chapter,
        challengeStartVerse: challengeStart.verse,
        challengeEndChapter: challengeEnd.chapter,
        challengeEndVerse: challengeEnd.verse,
        activeChallengeChapter: challengeStart.chapter,
        challengeBonusPoints: Number(challengeBonusPoints)
      });
    }
    if (Object.keys(payload).length > 0) {
      await setDoc(docRef, payload, { merge: true });
    }
  };

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
    setEventType('general_event');
    setTitle('');
    setDescription('');
    setRewardPoints(100);
    setImageUrl('');
    setImageFile(null);
    setImagePreviewUrl('');
    setActive(true);
    setTargetRoles([...PUBLISH_ROLES]);
    setPushOnCreate(true);
    loadMissionSettings();
    
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
    setEventType(event.eventType || 'general_event');
    setTitle(event.title);
    setDescription(event.description);
    setRewardPoints(event.rewardPoints);
    setImageUrl(event.imageUrl || '');
    setImageFile(null);
    setImagePreviewUrl(event.imageUrl || '');
    setActive(event.active);
    setStartDate(event.startDate);
    setEndDate(event.endDate);
    setTargetRoles(event.targetRoles && event.targetRoles.length > 0 ? event.targetRoles : [...PUBLISH_ROLES]);
    setPushOnCreate(event.pushOnCreate !== false);
    loadMissionSettings();
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

    if (eventType === 'mission_exam' && getVerseOrder(examStartKey) > getVerseOrder(examEndKey)) {
      alert('사명자 시험 시작 성구는 종료 성구보다 앞에 있어야 합니다.');
      setSubmitting(false);
      return;
    }
    if (eventType === 'special_challenge' && getVerseOrder(challengeStartKey) > getVerseOrder(challengeEndKey)) {
      alert('스페셜 암송 챌린지 시작 성구는 종료 성구보다 앞에 있어야 합니다.');
      setSubmitting(false);
      return;
    }

    const effectiveRewardPoints =
      eventType === 'mission_exam'
        ? Number(examMaxPoints)
        : eventType === 'special_challenge'
          ? Number(challengeBonusPoints)
          : Number(rewardPoints);

    try {
      let uploadedImageUrl = imageUrl;
      if (imageFile) {
        const safeName = imageFile.name.replace(/[^\w.-]/g, '_');
        const imageRef = ref(storage, `event-banners/${Date.now()}_${safeName}`);
        const snapshot = await uploadBytes(imageRef, imageFile);
        uploadedImageUrl = await getDownloadURL(snapshot.ref);
        setImageUrl(uploadedImageUrl);
        setImagePreviewUrl(uploadedImageUrl);
      }

      const eventData = {
        eventType,
        title,
        description,
        rewardPoints: effectiveRewardPoints,
        imageUrl: uploadedImageUrl || fallbackImageUrl,
        homeBanner: uploadedImageUrl || fallbackImageUrl,
        popup: active && pushOnCreate,
        active,
        startDate,
        endDate,
        targetGroups: eventType === 'mission_exam' ? targetRoles : [],
        targetUsers: [],
        targetRoles: eventType === 'mission_exam' ? targetRoles : [],
        pushOnCreate,
      };

      await saveMissionSettingsForEvent();

      if (editingEvent) {
        // Edit Mode
        const isMock = editingEvent.id.startsWith('mock_');
        if (!isMock) {
          const eventRef = doc(db, 'events', editingEvent.id);
          await updateDoc(eventRef, eventData);
        }

        await logAdminAction(
          'event_edit',
          `이벤트 수정: ${title} (${effectiveRewardPoints}P)`,
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

        if (active && pushOnCreate) {
          await addDoc(collection(db, 'push_queue'), {
            title: `이벤트 안내: ${title}`,
            body: description,
            target: eventType === 'mission_exam' ? 'roles' : 'all',
            targetGroups: eventType === 'mission_exam' ? targetRoles : [],
            targetUsers: [],
            targetRoles: eventType === 'mission_exam' ? targetRoles : [],
            targetName: eventType === 'mission_exam' ? '특정 사명자' : '전체 인원',
            eventId: docRef.id,
            eventTitle: title,
            status: 'pending',
            createdAt: serverTimestamp(),
            sentAt: null,
            error: null
          });
        }

        await logAdminAction(
          'event_create',
          `이벤트 신규 등록: ${title} (${effectiveRewardPoints}P)`,
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
                <label>등록 유형</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.5rem' }}>
                  {[
                    { id: 'special_challenge', label: '스페셜 암송 챌린지!', sub: '푸시 전체인원', icon: 'local_fire_department' },
                    { id: 'mission_exam', label: '사명자 시험', sub: '특정사명자', icon: 'assignment' },
                    { id: 'general_event', label: '이벤트', sub: '푸시 전체인원', icon: 'emoji_events' }
                  ].map((type) => (
                    <button
                      key={type.id}
                      type="button"
                      onClick={() => setEventType(type.id as any)}
                      style={{
                        border: eventType === type.id ? '1px solid var(--accent-purple)' : '1px solid var(--glass-border)',
                        background: eventType === type.id ? 'var(--sidebar-active)' : 'rgba(255,255,255,0.35)',
                        borderRadius: '10px',
                        padding: '0.75rem 0.55rem',
                        cursor: 'pointer',
                        color: 'var(--text-primary)',
                        textAlign: 'left',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.25rem',
                        minHeight: '84px'
                      }}
                    >
                      <span className="material-icons-round" style={{ fontSize: '1.15rem', color: eventType === type.id ? 'var(--accent-purple)' : 'var(--text-muted)' }}>{type.icon}</span>
                      <span style={{ fontSize: '0.78rem', fontWeight: 800, lineHeight: 1.25 }}>{type.label}</span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{type.sub}</span>
                    </button>
                  ))}
                </div>
              </div>

              {eventType === 'mission_exam' && (
                <div className="glass-panel" style={{ background: 'rgba(59,130,246,0.08)', padding: '1rem' }}>
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem', fontWeight: 800, marginBottom: '0.75rem' }}>
                    <span className="material-icons-round" style={{ color: 'var(--accent-blue)', fontSize: '1.05rem' }}>quiz</span>
                    사명자 시험 시작/종료 성구/포인트
                  </h3>
                  <div className="events-modal-grid">
                    <div className="form-group">
                      <label htmlFor="examStartVerse">시작 성구</label>
                      <select id="examStartVerse" value={examStartKey} onChange={(e) => setExamStartKey(e.target.value)}>
                        {verseOptions.map((option) => (
                          <option key={option.key} value={option.key}>{option.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label htmlFor="examEndVerse">종료 성구</label>
                      <select id="examEndVerse" value={examEndKey} onChange={(e) => setExamEndKey(e.target.value)}>
                        {verseOptions.map((option) => (
                          <option key={option.key} value={option.key}>{option.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label htmlFor="examMaxPoints">만점 포인트</label>
                      <input
                        type="number"
                        id="examMaxPoints"
                        required
                        min={0}
                        value={examMaxPoints}
                        onChange={(e) => setExamMaxPoints(Math.max(0, parseInt(e.target.value) || 0))}
                      />
                    </div>
                  </div>
                </div>
              )}

              {eventType === 'special_challenge' && (
                <div className="glass-panel" style={{ background: 'rgba(147,51,234,0.08)', padding: '1rem' }}>
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem', fontWeight: 800, marginBottom: '0.75rem' }}>
                    <span className="material-icons-round" style={{ color: 'var(--accent-purple)', fontSize: '1.05rem' }}>local_fire_department</span>
                    스페셜 암송 챌린지 시작/종료 성구/포인트
                  </h3>
                  <div className="events-modal-grid">
                    <div className="form-group">
                      <label htmlFor="challengeStartVerse">시작 성구</label>
                      <select id="challengeStartVerse" value={challengeStartKey} onChange={(e) => setChallengeStartKey(e.target.value)}>
                        {verseOptions.map((option) => (
                          <option key={option.key} value={option.key}>{option.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label htmlFor="challengeEndVerse">종료 성구</label>
                      <select id="challengeEndVerse" value={challengeEndKey} onChange={(e) => setChallengeEndKey(e.target.value)}>
                        {verseOptions.map((option) => (
                          <option key={option.key} value={option.key}>{option.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label htmlFor="challengeBonus">완료 보너스 포인트</label>
                      <input
                        type="number"
                        id="challengeBonus"
                        required
                        min={0}
                        value={challengeBonusPoints}
                        onChange={(e) => setChallengeBonusPoints(Math.max(0, parseInt(e.target.value) || 0))}
                      />
                    </div>
                  </div>
                </div>
              )}

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

              {eventType === 'general_event' && (
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
              )}

              <div className="form-group">
                <label htmlFor="evtImage">배너 이미지 첨부</label>
                <label className="event-image-upload" htmlFor="evtImage">
                  <input
                    type="file"
                    id="evtImage"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      setImageFile(file);
                      if (file) {
                        setImagePreviewUrl(URL.createObjectURL(file));
                      }
                    }}
                  />
                  <span className="event-image-preview">
                    {imagePreviewUrl ? (
                      <img src={imagePreviewUrl} alt="이벤트 배너 미리보기" />
                    ) : (
                      <span className="event-image-empty">
                        <span className="material-icons-round">add_photo_alternate</span>
                        이미지 선택
                      </span>
                    )}
                  </span>
                  <span className="event-image-meta">
                    <strong>{imageFile ? imageFile.name : '모바일/PC에서 이미지 업로드'}</strong>
                    <small>JPG, PNG, WEBP 이미지를 첨부해 주세요.</small>
                  </span>
                </label>
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

              {eventType === 'mission_exam' && (
                <div className="mission-role-panel">
                  <div className="mission-role-header">
                    <div>
                      <span className="mission-role-kicker">대상 권한</span>
                      <strong>특정사명자에게만 노출</strong>
                    </div>
                    <span className="mission-role-count">{targetRoles.length}개 선택</span>
                  </div>
                  <div className="mission-role-grid">
                    {ROLE_OPTIONS.filter((role) => role.value !== 'user').map((role) => {
                      const checked = targetRoles.includes(role.value);
                      return (
                        <label key={role.value} className={`mission-role-card ${checked ? 'selected' : ''}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              setTargetRoles((prev) => (
                                e.target.checked ? [...new Set([...prev, role.value])] : prev.filter((r) => r !== role.value)
                              ));
                            }}
                          />
                          <span className="mission-role-check">
                            <span className="material-icons-round">{checked ? 'check' : 'add'}</span>
                          </span>
                          <span className="mission-role-name">{role.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  id="evtPushOnCreate"
                  checked={pushOnCreate}
                  onChange={(e) => setPushOnCreate(e.target.checked)}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <label htmlFor="evtPushOnCreate" style={{ cursor: 'pointer', margin: 0 }}>
                  저장 시 앱 알림 및 푸시 자동 등록 ({eventType === 'mission_exam' ? '특정사명자' : '전체인원'})
                </label>
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
