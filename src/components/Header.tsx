import type { TabId } from "../types";
import { BrandLogo } from "./BrandLogo";

interface HeaderProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  debtorAlertCount?: number;
}

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "dashboard", label: "لوحة المعلومات", icon: "✦" },
  { id: "cars", label: "مخزن السيارات", icon: "◈" },
  { id: "partners", label: "الشركاء", icon: "⊕" },
  { id: "investors", label: "المستثمرين", icon: "⬢" },
  { id: "debtors", label: "ديون العملاء", icon: "◎" },
  { id: "expenses", label: "المصروفات", icon: "◉" },
  { id: "financial-accounts", label: "الحسابات المالية", icon: "♢" },
  { id: "financial-transactions", label: "الحركات المالية", icon: "⇄" },
];

export function Header({ activeTab, onTabChange, debtorAlertCount = 0 }: HeaderProps) {
  return (
    <aside className="app-sidebar">
      <div className="sidebar-glow" aria-hidden />

      <div className="sidebar-header">
        <BrandLogo size="lg" className="sidebar-logo" />
      </div>

      <nav className="sidebar-nav" aria-label="التنقل الرئيسي">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`nav-btn ${activeTab === tab.id ? "nav-btn--active" : ""}`}
            onClick={() => onTabChange(tab.id)}
            aria-current={activeTab === tab.id ? "page" : undefined}
          >
            <span className="nav-btn__icon" aria-hidden>
              {tab.icon}
            </span>
            <span className="nav-btn__label">
              {tab.label}
              {tab.id === "debtors" && debtorAlertCount > 0 && (
                <span
                  className="badge badge--pulse"
                  style={{
                    marginRight: "0.35rem",
                    background: "var(--danger, #dc3545)",
                    color: "#fff",
                    fontSize: "0.65rem",
                    padding: "0.1rem 0.4rem",
                    borderRadius: "8px",
                    fontWeight: 700,
                    animation: "pulse 2s infinite",
                  }}
                >
                  {debtorAlertCount}
                </span>
              )}
            </span>
          </button>
        ))}
      </nav>
    </aside>
  );
}
