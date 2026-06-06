import { useState, useEffect } from "react";
import {
  collection,
  onSnapshot,
  doc,
  addDoc,
  updateDoc,
  increment,
  writeBatch,
  getDocs,
} from "firebase/firestore";
import { db } from "../firebase";

interface Participant {
  userId: string;
  username: string;
  crewId?: string;
  crewName?: string;
  score: number;
  timeSpent: number; // in seconds
  timestamp: any;
}

interface Battle {
  id: string;
  title: string;
  type: "individual" | "team";
  status: "active" | "settled";
  chapter: number;
  entryFee: number;
  prizePool: number;
  createdAt: any;
  participants?: Participant[];
  settledAt?: any;
  winners?: string[];
}

interface Crew {
  id: string;
  name: string;
  createdAt: any;
  leaderId: string;
  leaderName: string;
  points: number;
  memberCount: number;
}

interface User {
  id: string;
  name: string;
  username: string;
  crewId?: string;
}

interface CrewManagementProps {
  adminEmail: string;
}

export default function CrewManagement({ adminEmail }: CrewManagementProps) {
  const [crews, setCrews] = useState<Crew[]>([]);
  const [battles, setBattles] = useState<Battle[]>([]);
  const [activeTab, setActiveTab] = useState<"battles" | "crews">("battles");

  // Create Battle Form State
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState<"individual" | "team">("individual");
  const [newChapter, setNewChapter] = useState<number>(7);
  const [newEntryFee, setNewEntryFee] = useState<number>(10);
  const [newBasePrize, setNewBasePrize] = useState<number>(100);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // New Crew States
  const [users, setUsers] = useState<User[]>([]);
  const [newCrewName, setNewCrewName] = useState("");
  const [newCrewLeaderId, setNewCrewLeaderId] = useState("");
  const [isCreatingCrew, setIsCreatingCrew] = useState(false);

  // Add Member States
  const [selectedCrewForAddMember, setSelectedCrewForAddMember] = useState<Crew | null>(null);
  const [newMemberUserId, setNewMemberUserId] = useState("");
  const [isAddingMember, setIsAddingMember] = useState(false);

  // Fetch Crews
  useEffect(() => {
    const q = collection(db, "crews");
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: Crew[] = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as Crew);
        });
        setCrews(list.sort((a, b) => b.points - a.points));
      },
      (err) => {
        console.error("Crews load error:", err);
      }
    );
    return () => unsubscribe();
  }, []);

  // Fetch Battles
  useEffect(() => {
    const q = collection(db, "battles");
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: Battle[] = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as Battle);
        });
        setBattles(
          list.sort((a, b) => {
            if (a.status === "active" && b.status === "settled") return -1;
            if (a.status === "settled" && b.status === "active") return 1;
            return b.createdAt?.seconds - a.createdAt?.seconds;
          })
        );
      },
      (err) => {
        console.error("Battles load error:", err);
      }
    );
    return () => unsubscribe();
  }, []);

  // Fetch Users
  useEffect(() => {
    const q = collection(db, "users");
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: User[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          list.push({
            id: doc.id,
            name: data.name || data.username || "이름없음",
            username: data.username || "",
            crewId: data.crewId || "",
          } as User);
        });
        setUsers(list);
      },
      (err) => {
        console.error("Users load error:", err);
      }
    );
    return () => unsubscribe();
  }, []);

  // Create New Battle
  const handleCreateBattle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    setIsSubmitting(true);
    try {
      const battleData = {
        title: newTitle.trim(),
        type: newType,
        status: "active",
        chapter: Number(newChapter),
        entryFee: Number(newEntryFee),
        prizePool: Number(newBasePrize),
        createdAt: new Date(),
        participants: [],
      };

      await addDoc(collection(db, "battles"), battleData);

      // Log action
      await addDoc(collection(db, "logs"), {
        action: "create_battle",
        details: `Created battle "${newTitle}" (Ch ${newChapter}, Type ${newType})`,
        admin: adminEmail,
        timestamp: new Date(),
      });

      setNewTitle("");
      alert("성공적으로 대결이 생성되었습니다.");
    } catch (err) {
      console.error("Battle creation error:", err);
      alert("대결 생성 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Disband Crew
  const handleDisbandCrew = async (crew: Crew) => {
    if (
      !confirm(
        `"${crew.name}" 크루를 정말 해체하시겠습니까? 소속 멤버들의 크루 정보가 초기화됩니다.`
      )
    ) {
      return;
    }

    try {
      // Find all users in this crew
      const usersSnapshot = await getDocs(collection(db, "users"));
      const batch = writeBatch(db);

      usersSnapshot.forEach((uDoc) => {
        const userData = uDoc.data();
        if (userData.crewId === crew.id) {
          batch.update(doc(db, "users", uDoc.id), {
            crewId: "",
            crewName: "",
          });
        }
      });

      batch.delete(doc(db, "crews", crew.id));
      await batch.commit();

      // Log action
      await addDoc(collection(db, "logs"), {
        action: "disband_crew",
        details: `Disbanded crew "${crew.name}"`,
        admin: adminEmail,
        timestamp: new Date(),
      });

      alert("크루가 해체되었습니다.");
    } catch (err) {
      console.error("Disband crew error:", err);
      alert("크루 해체 중 오류가 발생했습니다.");
    }
  };

  // Create New Crew
  const handleCreateCrew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCrewName.trim() || !newCrewLeaderId) return;

    setIsCreatingCrew(true);
    try {
      const leader = users.find((u) => u.id === newCrewLeaderId);
      if (!leader) return alert("선택된 리더를 찾을 수 없습니다.");

      // Check if duplicate crew name exists locally
      const dup = crews.find((c) => c.name.toLowerCase() === newCrewName.trim().toLowerCase());
      if (dup) return alert("이미 동일한 이름의 크루가 존재합니다.");

      const crewId = "crew_" + Date.now();
      const batch = writeBatch(db);

      // Create crew doc
      const crewRef = doc(db, "crews", crewId);
      batch.set(crewRef, {
        name: newCrewName.trim(),
        createdAt: new Date(),
        leaderId: leader.id,
        leaderName: leader.name,
        points: 0,
        memberCount: 1,
      });

      // Update user doc
      const userRef = doc(db, "users", leader.id);
      batch.update(userRef, {
        crewId: crewId,
        crewName: newCrewName.trim(),
      });

      // Log action
      const logRef = doc(collection(db, "logs"));
      batch.set(logRef, {
        action: "create_crew_admin",
        details: `Created crew "${newCrewName.trim()}" with leader "${leader.name}"`,
        admin: adminEmail,
        timestamp: new Date(),
      });

      await batch.commit();

      setNewCrewName("");
      setNewCrewLeaderId("");
      alert(`🎉 [${newCrewName.trim()}] 크루가 생성되었습니다!`);
    } catch (err) {
      console.error("Crew creation error:", err);
      alert("크루 생성 중 오류가 발생했습니다.");
    } finally {
      setIsCreatingCrew(false);
    }
  };

  // Add Member to Crew
  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCrewForAddMember || !newMemberUserId) return;

    setIsAddingMember(true);
    try {
      const user = users.find((u) => u.id === newMemberUserId);
      if (!user) return alert("선택된 회원을 찾을 수 없습니다.");

      const batch = writeBatch(db);

      // Update user doc with crewId & crewName
      const userRef = doc(db, "users", user.id);
      batch.update(userRef, {
        crewId: selectedCrewForAddMember.id,
        crewName: selectedCrewForAddMember.name,
      });

      // Increment memberCount in crew
      const crewRef = doc(db, "crews", selectedCrewForAddMember.id);
      batch.update(crewRef, {
        memberCount: increment(1),
      });

      // Write log
      const logRef = doc(collection(db, "logs"));
      batch.set(logRef, {
        action: "add_crew_member_admin",
        details: `Added member "${user.name}" to crew "${selectedCrewForAddMember.name}"`,
        admin: adminEmail,
        timestamp: new Date(),
      });

      await batch.commit();

      alert(`🎉 [${user.name}] 회원이 [${selectedCrewForAddMember.name}] 크루에 정상적으로 추가되었습니다!`);
      setSelectedCrewForAddMember(null);
      setNewMemberUserId("");
    } catch (err) {
      console.error("Add member error:", err);
      alert("멤버 추가 중 오류가 발생했습니다.");
    } finally {
      setIsAddingMember(false);
    }
  };

  // Settle Battle (정산 및 종료)
  const handleSettleBattle = async (battle: Battle) => {
    const participants = battle.participants || [];
    if (participants.length === 0) {
      if (!confirm("참가자가 없습니다. 대결을 종료하시겠습니까?")) return;
      try {
        await updateDoc(doc(db, "battles", battle.id), {
          status: "settled",
          settledAt: new Date(),
        });
        alert("대결이 종료되었습니다.");
      } catch (err) {
        console.error(err);
      }
      return;
    }

    if (
      !confirm(
        `참가자 ${participants.length}명의 대결을 정산하고 종료하시겠습니까?`
      )
    ) {
      return;
    }

    try {
      const batch = writeBatch(db);
      const winnersList: string[] = [];
      const logDetails: string[] = [];

      if (battle.type === "individual") {
        // Individual Battle Settlement
        // Sort: highest score first, then fastest time (lowest timeSpent)
        const sorted = [...participants].sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return a.timeSpent - b.timeSpent;
        });

        // 1st, 2nd, 3rd place reward
        const totalPrize = battle.prizePool;
        const rewards = [
          { rank: 1, pct: 0.5 },
          { rank: 2, pct: 0.3 },
          { rank: 3, pct: 0.2 },
        ];

        sorted.forEach((p, idx) => {
          if (idx < 3) {
            const rewardPct =
              sorted.length >= 3
                ? rewards[idx].pct
                : idx === 0
                ? 0.7
                : idx === 1
                ? 0.3
                : 0;
            const rewardAmount = Math.max(10, Math.round(totalPrize * rewardPct));

            batch.update(doc(db, "users", p.userId), {
              points: increment(rewardAmount),
            });

            // Point history
            const pHistoryRef = doc(collection(db, `users/${p.userId}/pointsHistory`));
            batch.set(pHistoryRef, {
              type: "battle_win",
              title: `대결 1위/2위/3위 보상 [${battle.title}]`,
              amount: rewardAmount,
              date: new Date().toISOString().replace("T", " ").substring(0, 19),
            });

            winnersList.push(`${p.username} (${idx + 1}등, +${rewardAmount}P)`);
          }
        });

        logDetails.push(`Individual battle winners: ${winnersList.join(", ")}`);
      } else {
        // Team Battle Settlement
        // Group by crew
        const crewStats: Record<
          string,
          {
            crewId: string;
            crewName: string;
            totalScore: number;
            totalTime: number;
            count: number;
            members: { userId: string; username: string }[];
          }
        > = {};

        participants.forEach((p) => {
          if (!p.crewId) return;
          if (!crewStats[p.crewId]) {
            crewStats[p.crewId] = {
              crewId: p.crewId,
              crewName: p.crewName || "",
              totalScore: 0,
              totalTime: 0,
              count: 0,
              members: [],
            };
          }
          crewStats[p.crewId].totalScore += p.score;
          crewStats[p.crewId].totalTime += p.timeSpent;
          crewStats[p.crewId].count += 1;
          crewStats[p.crewId].members.push({
            userId: p.userId,
            username: p.username,
          });
        });

        // Convert to array and find winner
        const crewsList = Object.values(crewStats).map((c) => ({
          ...c,
          avgScore: c.totalScore / c.count,
          avgTime: c.totalTime / c.count,
        }));

        // Sort crews: highest avgScore first, then lowest avgTime
        crewsList.sort((a, b) => {
          if (b.avgScore !== a.avgScore) return b.avgScore - a.avgScore;
          return a.avgTime - b.avgTime;
        });

        if (crewsList.length > 0) {
          const winnerCrew = crewsList[0];
          const totalPrize = battle.prizePool;
          // Distribute to crew's total points
          batch.update(doc(db, "crews", winnerCrew.crewId), {
            points: increment(100), // add 100 crew trophy points
          });

          // Distribute points divided among participating crew members
          const shareAmount = Math.max(
            10,
            Math.round(totalPrize / winnerCrew.members.length)
          );

          winnerCrew.members.forEach((m) => {
            batch.update(doc(db, "users", m.userId), {
              points: increment(shareAmount),
            });

            // Point history
            const pHistoryRef = doc(collection(db, `users/${m.userId}/pointsHistory`));
            batch.set(pHistoryRef, {
              type: "battle_win",
              title: `크루 대결 승리 크루 보상 [${battle.title}]`,
              amount: shareAmount,
              date: new Date().toISOString().replace("T", " ").substring(0, 19),
            });
          });

          winnersList.push(`크루 [${winnerCrew.crewName}] 승리`);
          logDetails.push(
            `Winner Crew: ${winnerCrew.crewName} (${winnerCrew.members.length} members rewarded with +${shareAmount}P each)`
          );
        } else {
          logDetails.push("No crew entries found.");
        }
      }

      // Update battle status
      batch.update(doc(db, "battles", battle.id), {
        status: "settled",
        settledAt: new Date(),
        winners: winnersList,
      });

      await batch.commit();

      // Log action
      await addDoc(collection(db, "logs"), {
        action: "settle_battle",
        details: `Settled battle "${battle.title}". ${logDetails.join(". ")}`,
        admin: adminEmail,
        timestamp: new Date(),
      });

      alert("대결이 성공적으로 정산 및 종료되었습니다.");
    } catch (err) {
      console.error("Battle settlement error:", err);
      alert("대결 정산 중 오류가 발생했습니다.");
    }
  };

  return (
    <div className="dashboard-grid-container" style={{ display: "block" }}>
      {/* Sub tabs */}
      <div
        className="auth-tabs"
        style={{
          marginBottom: "1.5rem",
          display: "flex",
          maxWidth: "350px",
          borderRadius: "8px",
          overflow: "hidden",
        }}
      >
        <button
          className={`auth-tab ${activeTab === "battles" ? "active" : ""}`}
          onClick={() => setActiveTab("battles")}
          style={{ flex: 1, padding: "0.6rem 0", height: "auto" }}
        >
          대결 / 매치 관리
        </button>
        <button
          className={`auth-tab ${activeTab === "crews" ? "active" : ""}`}
          onClick={() => setActiveTab("crews")}
          style={{ flex: 1, padding: "0.6rem 0", height: "auto" }}
        >
          크루 목록 관리
        </button>
      </div>

      {activeTab === "battles" ? (
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "1.5rem" }}>
          {/* Battle List Panel */}
          <div className="dashboard-card glass-panel" style={{ padding: "1.5rem" }}>
            <div className="card-title">
              <span className="material-icons-round" style={{ color: "var(--accent-purple)" }}>
                emoji_events
              </span>
              활성 & 종료 대결 목록
            </div>

            <div className="custom-scroll" style={{ maxHeight: "70vh", overflowY: "auto", marginTop: "1rem" }}>
              {battles.length === 0 ? (
                <p style={{ textAlign: "center", color: "var(--text-secondary)", padding: "2rem" }}>
                  등록된 대결이 없습니다.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  {battles.map((b) => (
                    <div
                      key={b.id}
                      style={{
                        padding: "1rem",
                        borderRadius: "12px",
                        border: "1px solid var(--glass-border)",
                        background:
                          b.status === "active"
                            ? "linear-gradient(135deg, rgba(147, 51, 234, 0.08), rgba(255, 255, 255, 0.02))"
                            : "rgba(255, 255, 255, 0.02)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                          <span
                            style={{
                              fontSize: "0.75rem",
                              fontWeight: "bold",
                              padding: "0.15rem 0.4rem",
                              borderRadius: "4px",
                              marginRight: "0.5rem",
                              background: b.type === "team" ? "var(--accent-blue-glow)" : "var(--accent-purple-glow)",
                              color: b.type === "team" ? "var(--accent-blue)" : "var(--accent-purple)",
                            }}
                          >
                            {b.type === "team" ? "팀전" : "개인전"}
                          </span>
                          <span
                            style={{
                              fontSize: "0.75rem",
                              fontWeight: "bold",
                              padding: "0.15rem 0.4rem",
                              borderRadius: "4px",
                              background: b.status === "active" ? "rgba(16, 185, 129, 0.15)" : "rgba(255, 255, 255, 0.08)",
                              color: b.status === "active" ? "#10b981" : "var(--text-secondary)",
                            }}
                          >
                            {b.status === "active" ? "진행 중" : "정산 완료"}
                          </span>
                          <h4 style={{ margin: "0.5rem 0 0.25rem 0", fontSize: "1.05rem", color: "var(--text-primary)" }}>
                            {b.title}
                          </h4>
                          <p style={{ margin: 0, fontSize: "0.825rem", color: "var(--text-secondary)" }}>
                            목표: 요한계시록 {b.chapter}장 | 참가비: {b.entryFee}P | 총 상금: {b.prizePool}P
                          </p>
                        </div>
                        {b.status === "active" && (
                          <button
                            onClick={() => handleSettleBattle(b)}
                            className="btn-demo"
                            style={{
                              padding: "0.4rem 0.8rem",
                              fontSize: "0.8rem",
                              background: "linear-gradient(135deg, var(--accent-purple), var(--accent-blue))",
                              border: "none",
                              color: "white",
                              cursor: "pointer",
                            }}
                          >
                            정산 및 종료
                          </button>
                        )}
                      </div>

                      {/* Participant overview */}
                      <div style={{ marginTop: "0.75rem", borderTop: "1px dashed var(--glass-border)", paddingTop: "0.5rem" }}>
                        <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                          참가자 수: {b.participants?.length || 0}명
                        </span>
                        {b.participants && b.participants.length > 0 && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem", marginTop: "0.3rem" }}>
                            {b.participants.slice(0, 5).map((p, pIdx) => (
                              <span
                                key={pIdx}
                                style={{
                                  fontSize: "0.7rem",
                                  padding: "0.15rem 0.35rem",
                                  borderRadius: "4px",
                                  background: "rgba(255,255,255,0.05)",
                                  color: "var(--text-muted)",
                                }}
                              >
                                {p.username} ({p.score}개, {p.timeSpent}초)
                              </span>
                            ))}
                            {b.participants.length > 5 && (
                              <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", alignSelf: "center" }}>
                                외 {b.participants.length - 5}명
                              </span>
                            )}
                          </div>
                        )}
                        {b.winners && b.winners.length > 0 && (
                          <div style={{ marginTop: "0.5rem", fontSize: "0.8rem", color: "var(--accent-amber)" }}>
                            🏆 우승: {b.winners.join(", ")}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Create Battle Form */}
          <div className="dashboard-card glass-panel" style={{ padding: "1.5rem", height: "fit-content" }}>
            <div className="card-title">
              <span className="material-icons-round" style={{ color: "var(--accent-purple)" }}>
                add_circle
              </span>
              새로운 대결 생성
            </div>

            <form onSubmit={handleCreateBattle} style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1rem" }}>
              <div className="form-group">
                <label>대결 이름 / 타이틀</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="예: 제 1회 시몬 스피드 암송 챔피언십"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div className="form-group">
                  <label>대결 방식</label>
                  <select
                    className="input-field"
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as "individual" | "team")}
                    style={{ background: "var(--card-bg-fallback)", color: "var(--text-primary)" }}
                  >
                    <option value="individual">개인전 (개인 랭킹)</option>
                    <option value="team">팀전 (크루 대결)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>목표 성경 (요한계시록)</label>
                  <select
                    className="input-field"
                    value={newChapter}
                    onChange={(e) => setNewChapter(Number(e.target.value))}
                    style={{ background: "var(--card-bg-fallback)", color: "var(--text-primary)" }}
                  >
                    {Array.from({ length: 22 }, (_, i) => i + 1).map((ch) => (
                      <option key={ch} value={ch}>
                        요한계시록 {ch}장
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div className="form-group">
                  <label>참가비 (포인트)</label>
                  <input
                    type="number"
                    className="input-field"
                    value={newEntryFee}
                    onChange={(e) => setNewEntryFee(Math.max(0, Number(e.target.value)))}
                    min="0"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>기본 상금 보너스</label>
                  <input
                    type="number"
                    className="input-field"
                    value={newBasePrize}
                    onChange={(e) => setNewBasePrize(Math.max(0, Number(e.target.value)))}
                    min="0"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                className="btn-primary"
                disabled={isSubmitting}
                style={{
                  background: "linear-gradient(135deg, var(--accent-purple), var(--accent-blue))",
                  border: "none",
                  marginTop: "0.5rem",
                  height: "44px",
                  fontWeight: "bold",
                  cursor: "pointer",
                }}
              >
                {isSubmitting ? "생성 중..." : "대결 개설하기"}
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "1.5rem" }}>
          {/* Crews List Panel */}
          <div className="dashboard-card glass-panel" style={{ padding: "1.5rem" }}>
            <div className="card-title">
              <span className="material-icons-round" style={{ color: "var(--accent-purple)" }}>
                groups
              </span>
              크루(동아리) 리스트
            </div>

            <div className="custom-scroll" style={{ maxHeight: "70vh", overflowY: "auto", marginTop: "1rem" }}>
              {crews.length === 0 ? (
                <p style={{ textAlign: "center", color: "var(--text-secondary)", padding: "2rem" }}>
                  등록된 크루가 없습니다.
                </p>
              ) : (
                <table className="members-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--glass-border)", color: "var(--text-secondary)" }}>
                      <th style={{ padding: "0.75rem", textAlign: "left" }}>순위</th>
                      <th style={{ padding: "0.75rem", textAlign: "left" }}>크루 이름</th>
                      <th style={{ padding: "0.75rem", textAlign: "left" }}>방장(크루장)</th>
                      <th style={{ padding: "0.75rem", textAlign: "left" }}>멤버 수</th>
                      <th style={{ padding: "0.75rem", textAlign: "right" }}>누적 포인트</th>
                      <th style={{ padding: "0.75rem", textAlign: "center" }}>관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {crews.map((c, idx) => (
                      <tr
                        key={c.id}
                        style={{
                          borderBottom: "1px solid rgba(255,255,255,0.03)",
                          color: "var(--text-primary)",
                        }}
                      >
                        <td style={{ padding: "0.75rem", fontWeight: "bold" }}>#{idx + 1}</td>
                        <td style={{ padding: "0.75rem", fontWeight: "600" }}>{c.name}</td>
                        <td style={{ padding: "0.75rem" }}>{c.leaderName || "알 수 없음"}</td>
                        <td style={{ padding: "0.75rem" }}>{c.memberCount}명</td>
                        <td style={{ padding: "0.75rem", textAlign: "right", color: "var(--accent-purple)", fontWeight: "bold" }}>
                          {c.points} P
                        </td>
                        <td style={{ padding: "0.75rem", textAlign: "center" }}>
                          <div style={{ display: "flex", gap: "0.4rem", justifyContent: "center" }}>
                            <button
                              onClick={() => setSelectedCrewForAddMember(c)}
                              style={{
                                background: "var(--accent-blue-glow)",
                                color: "var(--accent-blue)",
                                border: "1px solid rgba(59, 130, 246, 0.3)",
                                padding: "0.25rem 0.5rem",
                                borderRadius: "4px",
                                fontSize: "0.8rem",
                                cursor: "pointer",
                              }}
                            >
                              멤버 추가
                            </button>
                            <button
                              onClick={() => handleDisbandCrew(c)}
                              style={{
                                background: "rgba(244, 63, 94, 0.15)",
                                color: "var(--accent-rose)",
                                border: "1px solid rgba(244, 63, 94, 0.3)",
                                padding: "0.25rem 0.5rem",
                                borderRadius: "4px",
                                fontSize: "0.8rem",
                                cursor: "pointer",
                              }}
                            >
                              해체
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Create Crew Form Panel */}
          <div className="dashboard-card glass-panel" style={{ padding: "1.5rem", height: "fit-content" }}>
            <div className="card-title">
              <span className="material-icons-round" style={{ color: "var(--accent-purple)" }}>
                group_add
              </span>
              새로운 크루 생성
            </div>

            <form onSubmit={handleCreateCrew} style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1rem" }}>
              <div className="form-group">
                <label>크루 이름</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="예: 요한계시록 정복단"
                  value={newCrewName}
                  onChange={(e) => setNewCrewName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>크루장(방장) 지정</label>
                <select
                  className="input-field"
                  value={newCrewLeaderId}
                  onChange={(e) => setNewCrewLeaderId(e.target.value)}
                  style={{ background: "var(--card-bg-fallback)", color: "var(--text-primary)" }}
                  required
                >
                  <option value="">-- 크루장을 선택하세요 --</option>
                  {users
                    .filter((u) => !u.crewId) // Only users without a crew
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} (@{u.username})
                      </option>
                    ))}
                </select>
                <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                  ※ 현재 크루에 가입되지 않은 회원만 크루장으로 지정 가능합니다.
                </p>
              </div>

              <button
                type="submit"
                className="btn-primary"
                disabled={isCreatingCrew}
                style={{
                  background: "linear-gradient(135deg, var(--accent-purple), var(--accent-blue))",
                  border: "none",
                  marginTop: "0.5rem",
                  height: "44px",
                  fontWeight: "bold",
                  cursor: "pointer",
                }}
              >
                {isCreatingCrew ? "생성 중..." : "크루 창설하기"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal for adding a member */}
      {selectedCrewForAddMember && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.6)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
        >
          <div
            className="dashboard-card glass-panel"
            style={{
              width: "100%",
              maxWidth: "400px",
              padding: "1.75rem",
              background: "var(--card-bg-fallback)",
              border: "1px solid var(--accent-purple)",
            }}
          >
            <div className="card-title" style={{ marginBottom: "1rem", color: "var(--accent-purple)" }}>
              <span className="material-icons-round">person_add</span>
              크루 멤버 추가
            </div>
            <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "1.25rem" }}>
              선택한 회원을 <strong>[{selectedCrewForAddMember.name}]</strong> 크루에 직접 가입시킵니다.
            </p>

            <form onSubmit={handleAddMember} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div className="form-group">
                <label>추가할 회원 선택</label>
                <select
                  className="input-field"
                  value={newMemberUserId}
                  onChange={(e) => setNewMemberUserId(e.target.value)}
                  style={{ background: "var(--card-bg-fallback)", color: "var(--text-primary)", width: "100%" }}
                  required
                >
                  <option value="">-- 회원을 선택하세요 --</option>
                  {users
                    .filter((u) => !u.crewId) // Only users without a crew
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} (@{u.username})
                      </option>
                    ))}
                </select>
              </div>

              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={isAddingMember}
                  style={{
                    flex: 1,
                    background: "linear-gradient(135deg, var(--accent-purple), var(--accent-blue))",
                    border: "none",
                    height: "40px",
                    fontWeight: "bold",
                    cursor: "pointer",
                  }}
                >
                  {isAddingMember ? "추가 중..." : "추가"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCrewForAddMember(null);
                    setNewMemberUserId("");
                  }}
                  className="btn-demo"
                  style={{
                    flex: 1,
                    height: "40px",
                    cursor: "pointer",
                  }}
                >
                  취소
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
