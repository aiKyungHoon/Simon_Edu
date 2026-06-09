import React from "react";

interface SidebarProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  adminUser: any;
  onLogout: () => void;
  isOpen?: boolean;
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onTabChange,
  adminUser,
  onLogout,
  isOpen = false,
  onClose,
}) => {
  const menuItems = [
    { id: "dashboard", label: "대시보드", icon: "dashboard" },
    { id: "members", label: "회원 관리", icon: "people" },
    { id: "points", label: "포인트 관리", icon: "monetization_on" },
    { id: "quizzes", label: "말씀 / 퀴즈 관리", icon: "menu_book" },
    { id: "missionExam", label: "사명자 시험", icon: "assignment" },
    { id: "events", label: "이벤트 관리", icon: "emoji_events" },
    { id: "stats", label: "학습 통계", icon: "analytics" },
    { id: "notices", label: "공지사항 관리", icon: "campaign" },
    { id: "settings", label: "설정 관리", icon: "settings" },
    { id: "logs", label: "관리자 로그", icon: "terminal" },
    { id: "push", label: "푸시 알림 관리", icon: "notifications" },
  ];

  return (
    <>
      {/* Mobile backdrop overlay */}
      {isOpen && <div className="sidebar-overlay-mobile" onClick={onClose}></div>}

      <div className={`sidebar ${isOpen ? "open" : ""}`}>
        <div className="sidebar-header">
          <span className="material-icons-round" style={{ color: "var(--accent-purple)", fontSize: "1.75rem" }}>
            menu_book
          </span>
          <div>
            <div className="logo-text">
              Simon<span>Edu</span>
            </div>
            <div className="subtitle">관리자 시스템</div>
          </div>
          {/* Close button inside sidebar on mobile */}
          {onClose && (
            <button className="btn-icon-action sidebar-close-btn" onClick={onClose}>
              <span className="material-icons-round">close</span>
            </button>
          )}
        </div>

        <div className="sidebar-profile">
          <div className="profile-avatar">
            {adminUser?.name ? adminUser.name.charAt(0) : "A"}
          </div>
          <div className="profile-info">
            <div className="profile-name">{adminUser?.name || "관리자"}</div>
            <div className="profile-role">{adminUser?.email || "admin@simonedu.com"}</div>
          </div>
        </div>

        <ul className="sidebar-menu">
          {menuItems.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => {
                  onTabChange(item.id);
                  if (onClose) onClose();
                }}
                className={`menu-item ${currentTab === item.id ? "active" : ""}`}
                style={{ width: "100%", background: "none", border: "none", textAlign: "left" }}
              >
                <span className="material-icons-round">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            </li>
          ))}
          
          <li style={{ marginTop: "auto", borderTop: "1px solid var(--glass-border)", paddingTop: "0.5rem" }}>
            <button
              onClick={onLogout}
              className="menu-item"
              style={{ width: "100%", background: "none", border: "none", color: "var(--accent-rose)", textAlign: "left" }}
            >
              <span className="material-icons-round">logout</span>
              <span>로그아웃</span>
            </button>
          </li>
        </ul>
      </div>
    </>
  );
};
