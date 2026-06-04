import { useRef } from "react";
import type { TabId } from "../types";
import { BrandLogo } from "./BrandLogo";

interface HeaderProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  onSidebarScroll?: (deltaY: number) => void;
}

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "dashboard", label: "لوحــــــــة التحكــــــــــم", icon: "✦" },
  { id: "cars", label: "المعــــــــــــــــــــــــــــــرض", icon: "◈" },
  { id: "partners-financial", label: "حسابات العمــلاء", icon: "❖" },
  { id: "expenses", label: "المصروفــــــــــــــــــات", icon: "◉" },
  { id: "financial-accounts", label: "القاصــــــــــــــــــــــــــــــــة", icon: "♢" },
  { id: "financial-transactions", label: "سجــل المعاملات", icon: "⇄" },
];

export function Header({ activeTab, onTabChange, onSidebarScroll }: HeaderProps) {
  // throttle: prevent multiple tab jumps per single scroll gesture
  const lastScrollAt = useRef(0);

  const handleWheel = (e: React.WheelEvent<HTMLElement>) => {
    const now = Date.now();
    if (now - lastScrollAt.current < 650) return; // 650ms cooldown
    lastScrollAt.current = now;
    onSidebarScroll?.(e.deltaY);
  };

  return (
    <aside className="app-sidebar" onWheel={handleWheel}>
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
            </span>
          </button>
        ))}
      </nav>
    </aside>
  );
}
