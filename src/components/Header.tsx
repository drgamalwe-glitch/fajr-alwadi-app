import type { TabId } from "../types";
import { BrandLogo } from "./BrandLogo";
import { GoldFxButton } from "./ui/GoldFxButton";
import { UnifiedDateField } from "./UnifiedDateField";

interface HeaderProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  onSidebarSectionClick?: (tab: TabId) => void;
  onSidebarSectionRightClick?: (tab: TabId) => void;
  onDeposit?: () => void;
  onWithdraw?: () => void;
  depositLabel?: string;
  withdrawLabel?: string;
  onAddAccount?: () => void;
  onAddCar?: () => void;
  onAddBatchCar?: () => void;
  onAddAgency?: () => void;
  onAddExpense?: () => void;
  onAddDistribute?: () => void;
  onSaveCar?: () => void;
  onCancelCar?: () => void;
  saveCarDisabled?: boolean;
  fromDate: string;
  toDate: string;
  onFromDateChange: (val: string) => void;
  onToDateChange: (val: string) => void;
  // Obs-2: sub-tab context so the date filter is only shown on the profit-distribution sub-tab inside expenses.
  expensesSubTab?: "expenses" | "profit";
}

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "dashboard", label: "لوحــــــــــــــــــة التحكــــــــــم", icon: "✦" },
  { id: "cars", label: "المعــــــــــــــــــــــــــــــــــــــــرض", icon: "◈" },
  { id: "partners-financial", label: "حسابات العمــــــــــــلاء", icon: "❖" },
  { id: "agencies", label: "الوكـــــــــــــــــــــــــــــــــــــالات", icon: "✉" },
  { id: "expenses", label: "الارباح والمصروفات", icon: "◉" },
  { id: "financial-accounts", label: "القاصــــــــــــــــــــــــــــــــــــــــــة", icon: "♢" },
];

export function Header({
  activeTab,
  onTabChange,
  onSidebarSectionClick,
  onSidebarSectionRightClick,
  onDeposit,
  onWithdraw,
  depositLabel = "إيداع",
  withdrawLabel = "سحب",
  onAddAccount,
  onAddCar,
  onAddBatchCar,
  onAddAgency,
  onAddExpense,
  onAddDistribute,
  onSaveCar,
  onCancelCar,
  saveCarDisabled,
  fromDate,
  toDate,
  onFromDateChange,
  onToDateChange,
  expensesSubTab,
}: HeaderProps) {
  const handleTabClick = (tabId: TabId) => {
    if (onSidebarSectionClick) {
      onSidebarSectionClick(tabId);
    } else {
      onTabChange(tabId);
    }
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
            data-testid={`nav-${tab.id}`}
            className={`nav-btn ${activeTab === tab.id ? "nav-btn--active" : ""}`}
            onClick={() => handleTabClick(tab.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              if (onSidebarSectionRightClick) {
                onSidebarSectionRightClick(tab.id);
              }
            }}
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

      {/* ── خط فاصل + فلتر التاريخ من / إلى ── */}
      {activeTab === "expenses" && expensesSubTab === "profit" && (
        <>
          <div className="sidebar-divider" style={{ backgroundColor: "rgba(255,255,255,0.15)", margin: "8px 0" }} />
          <div className="sidebar-date-filter" style={{ padding: "0 16px 12px", display: "flex", flexDirection: "column", gap: "8px", direction: "rtl" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ color: "rgba(255,255,255,0.7)", fontWeight: "bold", minWidth: "24px", fontSize: "var(--fs-sm)", textAlign: "right" }}>من</span>
              <UnifiedDateField value={fromDate} onChange={onFromDateChange} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ color: "rgba(255,255,255,0.7)", fontWeight: "bold", minWidth: "24px", fontSize: "var(--fs-sm)", textAlign: "right" }}>إلى</span>
              <UnifiedDateField value={toDate} onChange={onToDateChange} />
            </div>
          </div>
        </>
      )}

      {/* ── خط فاصل + أزرار العمليات ── */}
      {(onAddAccount || onAddCar || onAddAgency || onAddExpense || onAddDistribute || (onDeposit && onWithdraw) || (onSaveCar && onCancelCar)) && (
        <div className="sidebar-actions-area">
          <div className="sidebar-divider" />
          {onAddAccount && !onDeposit && (
            <GoldFxButton
              type="button"
              variant="gold"
              onClick={onAddAccount}
              data-testid="btn-add-account"
            >
              <span className="gold-fx-btn__icon">+</span>
              <span className="gold-fx-btn__label">إضافة حساب</span>
            </GoldFxButton>
          )}
          {onAddCar && !onSaveCar && (
            <div className="flex flex-col gap-2 w-full">
              <GoldFxButton
                type="button"
                variant="gold"
                onClick={onAddCar}
                data-testid="btn-add-car"
              >
                <span className="gold-fx-btn__icon">+</span>
                <span className="gold-fx-btn__label">إضافة سيارة</span>
              </GoldFxButton>
              {onAddBatchCar && (
                <GoldFxButton
                  type="button"
                  variant="gold"
                  onClick={onAddBatchCar}
                  data-testid="btn-add-car-batch"
                >
                  <span className="gold-fx-btn__icon">+</span>
                  <span className="gold-fx-btn__label">إضافة مجموعة</span>
                </GoldFxButton>
              )}
            </div>
          )}
          {onSaveCar && onCancelCar && (
            <div className="sidebar-action-btns">
              <GoldFxButton
                type="button"
                variant="green"
                onClick={onSaveCar}
                disabled={saveCarDisabled}
                data-testid="btn-save-car"
              >

                <span className="gold-fx-btn__label">حفظ</span>
              </GoldFxButton>
              <GoldFxButton
                type="button"
                variant="red"
                onClick={onCancelCar}
                data-testid="btn-cancel-car"
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
              data-testid="btn-add-agency"
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
              data-testid="btn-add-expense"
            >
              <span className="gold-fx-btn__icon">+</span>
              <span className="gold-fx-btn__label">إضافة مصروف</span>
            </GoldFxButton>
          )}
          {onAddDistribute && (
            <GoldFxButton
              type="button"
              variant="gold"
              onClick={onAddDistribute}
            >
              <span className="gold-fx-btn__icon">↻</span>
              <span className="gold-fx-btn__label">تصفير الارباح</span>
            </GoldFxButton>
          )}
          {onDeposit && onWithdraw && (
            <div className="sidebar-action-btns sidebar-action-btns--account">
              <GoldFxButton
                type="button"
                variant="green"
                onClick={onDeposit}
                data-testid="btn-account-deposit"
              >
                <span className="gold-fx-btn__icon">↓</span>
                <span className="gold-fx-btn__label">{depositLabel}</span>
              </GoldFxButton>
              <GoldFxButton
                type="button"
                variant="red"
                onClick={onWithdraw}
                data-testid="btn-account-withdraw"
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
