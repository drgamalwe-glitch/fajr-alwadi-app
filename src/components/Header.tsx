import { useRef } from "react";
import type { TabId } from "../types";
import { BrandLogo } from "./BrandLogo";
import { GoldFxButton } from "./ui/GoldFxButton";

interface HeaderProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  onCarsSearchToggle?: () => void;
  onPartnersSearchToggle?: () => void;
  onAgenciesSearchToggle?: () => void;
  onDeposit?: () => void;
  onWithdraw?: () => void;
  depositLabel?: string;
  withdrawLabel?: string;
  onAddAccount?: () => void;
  onAddCar?: () => void;
  onAddAgency?: () => void;
  onAddExpense?: () => void;
  onAddDistribute?: () => void;
  onSaveCar?: () => void;
  onCancelCar?: () => void;
}

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "dashboard", label: "لوحــــــــة التحكــــــــــم", icon: "✦" },
  { id: "cars", label: "المعــــــــــــــــــــــــــــــرض", icon: "◈" },
  { id: "partners-financial", label: "حسابات العمــلاء", icon: "❖" },
  { id: "agencies", label: "الوكـــــــــــــــــــــــــــالات", icon: "✉" },
  { id: "expenses", label: "المصروفــــــــــــــــــات", icon: "◉" },
  { id: "profit-distribution", label: "توزيـــــــع الاربـــــــاح", icon: "⚖" },
  { id: "financial-accounts", label: "القاصــــــــــــــــــــــــــــــــة", icon: "♢" },
  { id: "financial-transactions", label: "سجــل المعاملات", icon: "⇄" },
];

export function Header({
  activeTab,
  onTabChange,
  onCarsSearchToggle,
  onPartnersSearchToggle,
  onAgenciesSearchToggle,
  onDeposit,
  onWithdraw,
  depositLabel = "إيداع",
  withdrawLabel = "سحب",
  onAddAccount,
  onAddCar,
  onAddAgency,
  onAddExpense,
  onAddDistribute,
  onSaveCar,
  onCancelCar,
}: HeaderProps) {
  // track double-click on cars tab
  const lastCarsClickAt = useRef(0);
  // track double-click on partners tab
  const lastPartnersClickAt = useRef(0);
  // track double-click on agencies tab
  const lastAgenciesClickAt = useRef(0);

  const handleTabClick = (tabId: TabId) => {
    if (tabId === "cars") {
      const now = Date.now();
      if (activeTab === "cars" && now - lastCarsClickAt.current < 400) {
        // نقرتان متتاليتان على تبويب المعرض → تبديل البحث
        lastCarsClickAt.current = 0;
        onCarsSearchToggle?.();
        return;
      }
      lastCarsClickAt.current = now;
    } else if (tabId === "partners-financial") {
      const now = Date.now();
      if (activeTab === "partners-financial" && now - lastPartnersClickAt.current < 400) {
        // نقرتان متتاليتان على تبويب حسابات العملاء → تبديل البحث
        lastPartnersClickAt.current = 0;
        onPartnersSearchToggle?.();
        return;
      }
      lastPartnersClickAt.current = now;
    } else if (tabId === "agencies") {
      const now = Date.now();
      if (activeTab === "agencies" && now - lastAgenciesClickAt.current < 400) {
        // نقرتان متتاليتان على تبويب الوكالات → تبديل البحث
        lastAgenciesClickAt.current = 0;
        onAgenciesSearchToggle?.();
        return;
      }
      lastAgenciesClickAt.current = now;
    }
    onTabChange(tabId);
  };

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
            data-tab={tab.id}
            className={`nav-btn ${activeTab === tab.id ? "nav-btn--active" : ""}`}
            onClick={() => handleTabClick(tab.id)}
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

      {/* ── خط فاصل + أزرار العمليات ── */}
      {(onAddAccount || onAddCar || onAddAgency || onAddExpense || onAddDistribute || (onDeposit && onWithdraw) || (onSaveCar && onCancelCar)) && (
        <div className="sidebar-actions-area">
          <div className="sidebar-divider" />
          {onAddAccount && !onDeposit && (
              <GoldFxButton
                type="button"
                variant="gold"
                onClick={onAddAccount}
              >
                <span className="gold-fx-btn__icon">+</span>
                <span className="gold-fx-btn__label">إضافة حساب</span>
              </GoldFxButton>
          )}
          {onAddCar && !onSaveCar && (
             <GoldFxButton
                type="button"
                variant="gold"
                onClick={onAddCar}
              >
                <span className="gold-fx-btn__icon">+</span>
                <span className="gold-fx-btn__label">إضافة سيارة</span>
              </GoldFxButton>
          )}
          {onSaveCar && onCancelCar && (
            <div className="sidebar-action-btns">
              <GoldFxButton
                type="button"
                variant="green"
                onClick={onSaveCar}
              >

                <span className="gold-fx-btn__label">حفظ</span>
              </GoldFxButton>
              <GoldFxButton
                type="button"
                variant="red"
                onClick={onCancelCar}
              >
                <span className="gold-fx-btn__label">إلغاء الأمر</span>
              </GoldFxButton>
            </div>
          )}
          {onAddAgency && (
            <GoldFxButton
              type="button"
              variant="gold"
              onClick={onAddAgency}
            >
              <span className="gold-fx-btn__icon">+</span>
              <span className="gold-fx-btn__label">إضافة وكالة</span>
            </GoldFxButton>
          )}
          {onAddExpense && (
            <GoldFxButton
              type="button"
              variant="gold"
              onClick={onAddExpense}
            >
              <span className="gold-fx-btn__icon">+</span>
              <span className="gold-fx-btn__label">إضافة مصروف</span>
            </GoldFxButton>
          )}
          {onAddDistribute && (
            <GoldFxButton
              type="button"
              variant="green"
              onClick={onAddDistribute}
            >
              <span className="gold-fx-btn__icon">⚖</span>
              <span className="gold-fx-btn__label">توزيع الأرباح</span>
            </GoldFxButton>
          )}
          {onDeposit && onWithdraw && (
            <div className="sidebar-action-btns">
              <GoldFxButton
                type="button"
                variant="green"
                onClick={onDeposit}
              >
                <span className="gold-fx-btn__icon">↓</span>
                <span className="gold-fx-btn__label">{depositLabel}</span>
              </GoldFxButton>
              <GoldFxButton
                type="button"
                variant="red"
                onClick={onWithdraw}
              >
                <span className="gold-fx-btn__icon">↑</span>
                <span className="gold-fx-btn__label">{withdrawLabel}</span>
              </GoldFxButton>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
