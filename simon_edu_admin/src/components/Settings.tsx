import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, addDoc, collection } from 'firebase/firestore';
import { db } from '../firebase';

interface SystemSettings {
  signUpPoints: number;
  checkInPoints: number;
  bonus7Days: number;
  bonus15Days: number;
  bonus30Days: number;
  privacyPolicyUrl: string;
  termsUrl: string;
  appVersion: string;
}

interface SettingsProps {
  adminEmail: string;
}

export default function Settings({ adminEmail }: SettingsProps) {
  const [settings, setSettings] = useState<SystemSettings>({
    signUpPoints: 100,
    checkInPoints: 10,
    bonus7Days: 50,
    bonus15Days: 100,
    bonus30Days: 200,
    privacyPolicyUrl: 'https://simon-edu-bible-game.firebaseapp.com/privacy',
    termsUrl: 'https://simon-edu-bible-game.firebaseapp.com/privacy',
    appVersion: '1.0.2'
  });
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form states
  const [signUpPoints, setSignUpPoints] = useState(100);
  const [checkInPoints, setCheckInPoints] = useState(10);
  const [bonus7Days, setBonus7Days] = useState(50);
  const [bonus15Days, setBonus15Days] = useState(100);
  const [bonus30Days, setBonus30Days] = useState(200);
  const [privacyPolicyUrl, setPrivacyPolicyUrl] = useState('');
  const [termsUrl, setTermsUrl] = useState('');
  const [appVersion, setAppVersion] = useState('1.0.2');

  // Load settings from Firestore `settings/global`
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const docRef = doc(db, 'settings', 'global');
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data() as SystemSettings;
          setSettings(data);
          
          setSignUpPoints(data.signUpPoints);
          setCheckInPoints(data.checkInPoints);
          setBonus7Days(data.bonus7Days || 50);
          setBonus15Days(data.bonus15Days || 100);
          setBonus30Days(data.bonus30Days || 200);
          setPrivacyPolicyUrl(data.privacyPolicyUrl);
          setTermsUrl(data.termsUrl || '');
          setAppVersion(data.appVersion || '1.0.2');
        } else {
          // Initialize form with default states
          setPrivacyPolicyUrl(settings.privacyPolicyUrl);
          setTermsUrl(settings.termsUrl);
        }
      } catch (err) {
        console.error("Error loading system settings:", err);
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const updatedData: SystemSettings = {
      signUpPoints: Number(signUpPoints),
      checkInPoints: Number(checkInPoints),
      bonus7Days: Number(bonus7Days),
      bonus15Days: Number(bonus15Days),
      bonus30Days: Number(bonus30Days),
      privacyPolicyUrl,
      termsUrl,
      appVersion
    };

    try {
      const docRef = doc(db, 'settings', 'global');
      await setDoc(docRef, updatedData, { merge: true });

      // Audit Log
      await addDoc(collection(db, 'logs'), {
        adminEmail,
        type: 'settings_update',
        details: '전역 시스템 설정 수정 (포인트 규칙 및 법적 문서 링크 고도화)',
        targetUserId: 'global_settings',
        targetUserName: '전역 시스템 설정',
        timestamp: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
        rawTimestamp: Date.now()
      });

      setSettings(updatedData);
      alert('전역 설정이 성공적으로 저장되었으며 모바일/웹 클라이언트에 즉시 반영되었습니다.');
    } catch (err: any) {
      console.error(err);
      alert('설정 저장 실패: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="view-container" style={{ maxWidth: '800px', margin: '0 auto' }}>
      <div className="glass-panel" style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 800 }}>전역 환경 설정</h1>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Simon Edu 모바일 앱 및 웹의 기본 규칙, 포인트 가치, 약관 정보를 중앙 통제합니다.</p>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '5rem' }}>
          <span className="material-icons-round" style={{ fontSize: '3rem', color: 'var(--accent-purple)', animation: 'spin 1.5s linear infinite' }}>
            sync
          </span>
        </div>
      ) : (
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* POINT RULE SETTINGS */}
          <div className="glass-panel">
            <h2 className="card-title" style={{ marginBottom: '1.25rem', color: 'var(--text-primary)' }}>
              <span className="material-icons-round">stars</span>
              기본 보상 포인트 설정
            </h2>

            <div className="settings-points-grid">
              <div className="form-group">
                <label htmlFor="signUpPts">신규 회원가입 보너스 (P)</label>
                <input
                  type="number"
                  id="signUpPts"
                  required
                  min={0}
                  value={signUpPoints}
                  onChange={(e) => setSignUpPoints(Math.max(0, parseInt(e.target.value) || 0))}
                />
              </div>

              <div className="form-group">
                <label htmlFor="checkInPts">일반 일일 출석 포인트 (P)</label>
                <input
                  type="number"
                  id="checkInPts"
                  required
                  min={0}
                  value={checkInPoints}
                  onChange={(e) => setCheckInPoints(Math.max(0, parseInt(e.target.value) || 0))}
                />
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--glass-border)', marginTop: '1.25rem', paddingTop: '1.25rem' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '1rem', color: 'var(--text-primary)' }}>연속 출석 체크 보너스 포인트</h3>
              
              <div className="settings-bonus-grid">
                <div className="form-group">
                  <label htmlFor="b7">7일 연속 보너스</label>
                  <input
                    type="number"
                    id="b7"
                    required
                    min={0}
                    value={bonus7Days}
                    onChange={(e) => setBonus7Days(Math.max(0, parseInt(e.target.value) || 0))}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="b15">15일 연속 보너스</label>
                  <input
                    type="number"
                    id="b15"
                    required
                    min={0}
                    value={bonus15Days}
                    onChange={(e) => setBonus15Days(Math.max(0, parseInt(e.target.value) || 0))}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="b30">30일 연속 보너스</label>
                  <input
                    type="number"
                    id="b30"
                    required
                    min={0}
                    value={bonus30Days}
                    onChange={(e) => setBonus30Days(Math.max(0, parseInt(e.target.value) || 0))}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* POLICY URL SETTINGS */}
          <div className="glass-panel">
            <h2 className="card-title" style={{ marginBottom: '1.25rem', color: 'var(--text-primary)' }}>
              <span className="material-icons-round">gavel</span>
              법적 약관 & 서비스 정보 설정
            </h2>

            <div className="form-group">
              <label htmlFor="policyUrl">개인정보 처리방침 URL</label>
              <input
                type="url"
                id="policyUrl"
                required
                placeholder="https://..."
                value={privacyPolicyUrl}
                onChange={(e) => setPrivacyPolicyUrl(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label htmlFor="termsUrl">서비스 이용약관 URL</label>
              <input
                type="url"
                id="termsUrl"
                placeholder="https://..."
                value={termsUrl}
                onChange={(e) => setTermsUrl(e.target.value)}
              />
            </div>

            <div className="form-group" style={{ maxWidth: '200px' }}>
              <label htmlFor="appVer">모바일 앱 배포 버전 명시</label>
              <input
                type="text"
                id="appVer"
                required
                placeholder="예: 1.0.0"
                value={appVersion}
                onChange={(e) => setAppVersion(e.target.value)}
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn-primary"
            disabled={saving}
            style={{ width: '100%', justifyContent: 'center', padding: '0.9rem', fontSize: '1rem', fontWeight: 'bold' }}
          >
            {saving ? '저장 처리 중...' : '환경 설정 변경 저장'}
          </button>
        </form>
      )}
    </div>
  );
}
