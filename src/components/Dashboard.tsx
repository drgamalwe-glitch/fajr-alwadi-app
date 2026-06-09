import { useEffect, useState } from "react";
import type { Car, Partner, CashRegisterEntry, UnifiedAccount } from "../types";
import "../styles/colors.css";
import { callTauri } from "../api/tauri";
import {
  PriceDisplay,
  TextInput,
  PriceInput,
  SelectMenu,
  SelectMenuContent,
  SelectMenuItem,
  SelectMenuTrigger,
  SelectMenuValue,
  StatCard,
} from "@/components/ui";

import { todayIsoDate } from "../utils/dateSegments";
import {
  Coins,
  CreditCard,
  TrendingUp,
  Car as CarIcon,
  Plus,
  Landmark,
  Calendar,
  CheckCircle2,
  PartyPopper,
  Phone,
} from "lucide-react";
import "../styles/dashboard.css";

// ── نظام الألوان مُستمَد من colors.css ──────────────────
// --red:   #4d000a   (أحمر داكن — للتحذيرات / المصاريف / الأخطار)
// --gold:  #d7a800   (ذهبي     — التوكيد الرئيسي / العناصر المميزة)
// --gray:  #7a7a7a   (رمادي    — النصوص الثانوية / الحدود)
// --black: #0e0e0e   (أسود    — الخلفية الرئيسية)
// --white: #ffffff   (أبيض    — النص الأساسي)

interface DashboardProps {
  cars: Car[];
  partners: Partner[];
  onRefresh: () => Promise<void>;
  onOpenCarForm: (mode: "new" | "edit", car?: Car) => void;
}

interface InstallmentAlert {
  id: number;
  buyerName: string;
  phone: string;
  dueDate: string;
  amount: number;
  currency: string;
  status: "overdue" | "due_today" | "upcoming";
  daysDifference: number;
  notes: string;
  carInfo?: string;
  partnerKind?: string;
}

// ── مكون زر الإجراء السريع ────────────────────────────
function QuickBtn({
  icon: Icon,
  label,
  sublabel,
  onClick,
  variant = "gold",
  className = "",
  iconColor,
}: {
  icon: React.ComponentType<{ className?: string; size?: number; style?: React.CSSProperties; strokeWidth?: number }>;
  label: string;
  sublabel?: string;
  onClick: () => void;
  variant?: "gold" | "red" | "gray";
  className?: string;
  iconColor?: string;
}) {
  const variantMap = {
    gold: {
      bg: "color-mix(in srgb, var(--smiles-bg), transparent 92%)",
      hover: "color-mix(in srgb, var(--smiles-bg), transparent 84%)",
      border: "color-mix(in srgb, var(--smiles-bg), transparent 65%)",
      icon: iconColor || "var(--smiles)",
      iconBg: "color-mix(in srgb, var(--smiles-bg), transparent 88%)",
      shadow: "color-mix(in srgb, var(--smiles-bg), transparent 85%)"
    },
    red: {
      bg: "rgba(77,0,10,0.18)",
      hover: "rgba(77,0,10,0.32)",
      border: "transparent",
      icon: iconColor || "var(--smiles)",
      iconBg: "color-mix(in srgb, var(--smiles-bg), transparent 80%)",
      shadow: "rgba(77,0,10,0.35)"
    },
    gray: {
      bg: "rgba(122,122,122,0.07)",
      hover: "rgba(122,122,122,0.14)",
      border: "rgba(122,122,122,0.3)",
      icon: iconColor || "var(--smiles)",
      iconBg: "color-mix(in srgb, var(--smiles-bg), transparent 90%)",
      shadow: "rgba(122,122,122,0.15)"
    },
  };
  const v = variantMap[variant];
  const ic = iconColor || v.icon;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`quick-btn ${className}`}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.4rem",
        flex: 1,
        minWidth: "140px",
        cursor: "pointer",
        color: "var(--white)",
        fontFamily: "inherit",
        backdropFilter: "blur(10px)",
      } as React.CSSProperties}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "44px",
          height: "44px",
          borderRadius: "12px",
          background: `color-mix(in srgb, ${ic} 14%, transparent)`,
          color: ic,
          marginBottom: "0.2rem",
          border: `1px solid color-mix(in srgb, ${ic} 30%, transparent)`,
          boxShadow: `0 0 16px color-mix(in srgb, ${ic} 20%, transparent)`,
          transition: "box-shadow 0.25s",
        }}
      >
        <Icon size={20} strokeWidth={2.2} />
      </div>
      <span style={{ fontSize: "var(--fs-sm)", fontWeight: "var(--fw-bold)", color: "var(--white)" }}>{label}</span>
      {sublabel && <span style={{ fontSize: "var(--fs-xs)", color: "var(--gray)" }}>{sublabel}</span>}
    </button>
  );
}

// ── مكون صف قسط ─────────────────────────────────────
function InstallmentRow({
  alert,
  onPay,
}: {
  alert: InstallmentAlert;
  onPay: (a: InstallmentAlert) => void;
}) {
  const isOverdue = alert.status === "overdue";
  const isToday   = alert.status === "due_today";

  // ألوان الحالة — مشتقة من متغيرات colors.css
  const borderColor = isOverdue ? "#c0001a" /* أحمر داكن مشتق من --red */ : isToday ? "var(--gold)" : "var(--gray)";
  const bgColor     = isOverdue ? "rgba(77,0,10,0.1)" : isToday ? "rgba(215,168,0,0.06)" : "rgba(122,122,122,0.05)";

  const currencyName = alert.currency === "USD" ? "دولار أمريكي" : "دينار عراقي";
  const waText = `السيد ${alert.buyerName} المحترم،\nنود تذكيركم بأن قسط السيارة المستحق بتاريخ ${alert.dueDate} والبالغ (${alert.amount.toLocaleString("en-US")}) ${currencyName} قد حان موعد سداده.\nنرجو التفضل بتسديد القسط في أقرب وقت ممكن.\nشاكرين لكم حسن تعاونكم، ونتطلع دائماً لخدمتكم.\nمع التقدير والاحترام،\nفجر الوادي لتجارة السيارات`;
  const cleanPhone = alert.phone.replace(/\D/g, "").replace(/^0+/, "");
  const waLink = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(waText)}`;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        padding: "0.9rem 1rem",
        background: bgColor,
        borderRadius: "10px",
        border: `1px solid ${borderColor}40`,
        borderRightWidth: "4px",
        borderRightColor: borderColor,
      }}
    >
      {/* مؤشر الحالة */}
      <div
        style={{
          width: "8px",
          height: "8px",
          borderRadius: "50%",
          background: borderColor,
          flexShrink: 0,
          boxShadow: isOverdue ? `0 0 8px ${borderColor}` : "none",
        }}
      />

      {/* معلومات المشتري */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: "var(--fw-bold)", fontSize: "var(--fs-sm)", color: "var(--white)", marginBottom: "0.15rem" }}>
          {alert.buyerName}
        </div>
        <div style={{ fontSize: "var(--fs-xs)", color: "var(--gray)", display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
            <Calendar size={12} />
            {alert.dueDate}
          </span>
          {isOverdue && (
            <span style={{ color: "#e05070", fontWeight: "var(--fw-medium)" }}>
              متأخر {alert.daysDifference} يوم
            </span>
          )}
          {isToday && (
            <span style={{ color: "var(--smiles)", fontWeight: "var(--fw-medium)" }}>مستحق اليوم</span>
          )}
          {alert.carInfo && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
              <CarIcon size={12} />
              {alert.carInfo}
            </span>
          )}
        </div>
      </div>

      {/* المبلغ */}
      <div style={{ fontWeight: "var(--fw-extrabold)", fontSize: "var(--fs-base)", color: borderColor, flexShrink: 0 }}>
        {alert.amount.toLocaleString("en-US")} {alert.currency === "USD" ? "USD" : "IQ"}
      </div>

      {/* الأزرار */}
      <div style={{ display: "flex", gap: "0.4rem", flexShrink: 0 }}>
        <button
          type="button"
          onClick={() => onPay(alert)}
          style={{
            padding: "0.35rem 0.75rem",
            background: "linear-gradient(135deg, rgba(215,168,0,0.9), rgba(180,130,0,0.95))",
            border: "none",
            borderRadius: "8px",
            color: "var(--black)",
            fontSize: "var(--fs-xs)",
            fontWeight: "var(--fw-extrabold)",
            cursor: "pointer",
            fontFamily: "inherit",
            transition: "opacity 0.15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
        >
          تم التسديد ✓
        </button>
        {alert.phone && (
          <button
            type="button"
            onClick={async () => {
              const text = encodeURIComponent(waText);
              try {
                await callTauri("open_whatsapp", { phone: cleanPhone, text });
              } catch {
                window.open(waLink, "_blank");
              }
            }}
            style={{
              padding: "0.35rem 0.6rem",
              background: "linear-gradient(135deg, #25D366, #128C7E)",
              borderRadius: "8px",
              color: "var(--white)",
              fontSize: "var(--fs-xs)",
              fontWeight: "var(--fw-bold)",
              border: "none",
              cursor: "pointer",
              fontFamily: "inherit",
              display: "flex",
              alignItems: "center",
              gap: "0.25rem",
              transition: "opacity 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          >
            <svg viewBox="0 0 24 24" width={14} height={14} fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12c0 2.137.56 4.146 1.54 5.92L.06 23.94l6.02-1.48A11.93 11.93 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.6c-1.96 0-3.82-.6-5.36-1.6l-.38-.24-4.06 1 .86-4.2-.24-.4C1.8 14.6 1.2 12.8 1.2 10.8 1.2 5.84 5.84 1.2 12 1.2s10.8 4.64 10.8 10.8-4.64 10.8-10.8 10.8zm5.92-6.84c-.32-.16-1.88-.92-2.16-1.04-.28-.12-.5-.16-.72.16-.22.32-.84 1.04-1.04 1.24-.2.2-.4.24-.72.08s-1.4-.52-2.68-1.64c-.98-.88-1.64-1.96-1.84-2.28-.2-.32-.02-.5.14-.66.14-.14.32-.36.48-.56.16-.2.22-.32.32-.56.1-.24.06-.44-.02-.6-.08-.16-.72-1.72-.98-2.36-.26-.64-.52-.56-.72-.56-.18 0-.4-.04-.62-.04s-.56.08-.86.4c-.3.32-1.14 1.12-1.14 2.72s1.18 3.16 1.34 3.4c.16.24 2.32 3.52 5.62 4.92.78.34 1.4.54 1.88.7.78.24 1.5.2 2.06.12.64-.08 1.88-.76 2.14-1.5.26-.74.26-1.38.18-1.5-.08-.12-.28-.2-.6-.36z" /></svg>
          </button>
        )}
      </div>
    </div>
  );
}

// ── مكون صف دائن ─────────────────────────────────────
function CreditorRow({
  creditor,
  onPay,
}: {
  creditor: UnifiedAccount;
  onPay: (name: string) => void;
}) {
  const totalDebt = Math.abs(creditor.usd_balance);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        padding: "0.9rem 1rem",
        background: "rgba(77,0,10,0.1)",
        borderRadius: "10px",
        border: "1px solid rgba(180,0,20,0.2)",
        borderRightWidth: "4px",
        borderRightColor: "#c0001a",
      }}
    >
      <Landmark size={18} style={{ color: "var(--smiles)", flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: "var(--fw-bold)", fontSize: "var(--fs-sm)", color: "var(--white)" }}>{creditor.partner_name}</div>
        {creditor.phone && (
          <div style={{ fontSize: "var(--fs-xs)", color: "var(--gray)", display: "flex", alignItems: "center", gap: "0.25rem" }}>
            <Phone size={12} />
            <span>{creditor.phone}</span>
          </div>
        )}
      </div>
      <div style={{ textAlign: "left", flexShrink: 0 }}>
        {creditor.usd_balance < 0 && (
          <div style={{ fontWeight: "var(--fw-extrabold)", fontSize: "var(--fs-base)", color: "#e05070" }}>
            {totalDebt.toLocaleString("ar-IQ")} USD
          </div>
        )}
        {creditor.iqd_balance < 0 && (
          <div style={{ fontWeight: "var(--fw-medium)", fontSize: "var(--fs-sm)", color: "#c08090" }}>
            {Math.abs(creditor.iqd_balance).toLocaleString("ar-IQ")} IQ
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => onPay(creditor.partner_name)}
        style={{
          padding: "0.35rem 0.85rem",
          background: "linear-gradient(135deg, rgba(215,168,0,0.9), rgba(180,130,0,0.95))",
          border: "none",
          borderRadius: "8px",
          color: "var(--black)",
          fontSize: "var(--fs-xs)",
          fontWeight: "var(--fw-extrabold)",
          cursor: "pointer",
          fontFamily: "inherit",
          flexShrink: 0,
          transition: "opacity 0.15s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
      >
        تسديد
      </button>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// ── المكون الرئيسي: لوحة التحكم ─────────────────────
// ════════════════════════════════════════════════════════
export function Dashboard({ cars, partners, onRefresh, onOpenCarForm }: DashboardProps) {

  const [safeEntries,     setSafeEntries]     = useState<CashRegisterEntry[]>([]);
  const [masterEntries,   setMasterEntries]   = useState<CashRegisterEntry[]>([]);
  const [unifiedAccounts, setUnifiedAccounts] = useState<UnifiedAccount[]>([]);
  const [installments,    setInstallments]    = useState<InstallmentAlert[]>([]);
  const [loadingAction,   setLoadingAction]   = useState(false);

  const loadBalances = async () => {
    try {
      const [safe, master, unified] = await Promise.all([
        callTauri<CashRegisterEntry[]>("get_cash_register_entries", { paymentType: "قاصه" }),
        callTauri<CashRegisterEntry[]>("get_cash_register_entries", { paymentType: "ماستر" }),
        callTauri<UnifiedAccount[]>("get_unified_accounts"),
      ]);
      setSafeEntries(safe || []);
      setMasterEntries(master || []);
      setUnifiedAccounts(unified || []);
    } catch (e) {
      console.error(e);
    }
  };

  const loadInstallments = async () => {
    const debtors = partners.filter((p) => p.kind === "مطلوب" || p.kind === "مقترض");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const alerts: InstallmentAlert[] = [];

    await Promise.allSettled(
      debtors.map(async (debtor) => {
        const txs = await callTauri<any[]>("get_partner_transactions", {
          partnerName: debtor.partner_name,
          kind: debtor.kind,
        });
        for (const tx of txs || []) {
          if (tx.type_ !== "سحب") continue;
          const cleanDate = (tx.date || "").replace(/\//g, "-").trim();
          const parts = cleanDate.split("-");
          let due = new Date();
          if (parts.length === 3) {
            const y = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10) - 1;
            const d = parseInt(parts[2], 10);
            if (!isNaN(y) && !isNaN(m) && !isNaN(d)) due = new Date(y, m, d);
          }
          due.setHours(0, 0, 0, 0);
          const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);

          if (diffDays <= 30) {
            const carInfo = tx.notes
              ? (tx.notes.match(/#بيع_سيارة_([^\s]+)/)?.[1] || "")
              : "";

            alerts.push({
              id: tx.id,
              buyerName: debtor.partner_name,
              phone: debtor.phone || "",
              dueDate: tx.date,
              amount: tx.amount,
              currency: tx.currency || "IQD",
              status: diffDays < 0 ? "overdue" : diffDays === 0 ? "due_today" : "upcoming",
              daysDifference: Math.abs(diffDays),
              notes: tx.notes || "",
              carInfo,
              partnerKind: debtor.kind,
            });
          }
        }
      })
    );
    setInstallments(alerts.sort((a, b) => a.dueDate.localeCompare(b.dueDate)));
  };

  useEffect(() => { void loadBalances();    }, [partners]);
  useEffect(() => { void loadInstallments(); }, [partners]);

  // حسابات الأرصدة
  const computeIqdBalance = (list: CashRegisterEntry[]) =>
    list.filter((e) => e.currency !== "USD").reduce((s, e) => s + e.amount, 0);
  const computeUsdBalance = (list: CashRegisterEntry[]) =>
    list.filter((e) => e.currency === "USD").reduce((s, e)  => s + e.amount, 0);

  const safeIqd    = computeIqdBalance(safeEntries);
  const safeUsd    = computeUsdBalance(safeEntries);
  const masterIqd  = computeIqdBalance(masterEntries);
  const masterUsd  = computeUsdBalance(masterEntries);

  const inventoryValue = cars
    .filter((c) => c.status === "متوفرة")
    .reduce((s, c) => s + (c.purchase_price || 0), 0);

  const currentMonthStr = new Date().toISOString().slice(0, 7);
  const monthlyProfits  = cars.reduce((total, car) => {
    if (car.status === "مبيوعة" && car.sale_date?.startsWith(currentMonthStr)) {
      return total + ((car.selling_price || 0) - (car.purchase_price || 0));
    }
    return total;
  }, 0);

  const creditors = unifiedAccounts.filter((a) => a.iqd_balance < 0 || a.usd_balance < 0);
  const filteredInstallments = installments.filter(
    (a) => a.status === "overdue" || a.status === "due_today"
  );

  // ── نوافذ الإجراءات السريعة ──
  const [showQuickSale,    setShowQuickSale]    = useState(false);
  const [showQuickExpense, setShowQuickExpense] = useState(false);

  const [expenseDesc,     setExpenseDesc]     = useState("");
  const [expenseAmt,      setExpenseAmt]      = useState("");
  const [expenseCurrency, setExpenseCurrency] = useState<"IQD" | "USD">("IQD");
  const [expenseCar,      setExpenseCar]      = useState("");

  const handleExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseDesc.trim() || !Number(expenseAmt)) return;
    setLoadingAction(true);
    try {
      await callTauri("add_expense", {
        description: expenseDesc.trim(),
        amount: Number(expenseAmt) || 0,
        date: todayIsoDate(),
        notes: expenseCar ? `مصروف مرتبط بالسيارة ${expenseCar}` : null,
        currency: expenseCurrency,
        carNumber: expenseCar || null,
      });
      setShowQuickExpense(false);
      setExpenseDesc(""); setExpenseAmt(""); setExpenseCar("");
      await onRefresh(); await loadBalances();
    } catch (err) { console.error(err); }
    finally { setLoadingAction(false); }
  };

  // ── تسديد قسط ──
  const [showPayInstallmentModal, setShowPayInstallmentModal] = useState(false);
  const [selectedInstallment,     setSelectedInstallment]     = useState<InstallmentAlert | null>(null);
  const [payAmount,  setPayAmount]  = useState("");
  const [payMethod,  setPayMethod]  = useState<"قاصه" | "ماستر">("قاصه");

  const handleOpenPayInstallment = (alert: InstallmentAlert) => {
    setSelectedInstallment(alert);
    setPayAmount(String(alert.amount));
    setShowPayInstallmentModal(true);
  };

  const handlePayInstallment = async () => {
    if (!selectedInstallment || !Number(payAmount)) return;
    setLoadingAction(true);
    try {
      const partnerKind = selectedInstallment.partnerKind || "مطلوب";
      await callTauri("add_partner_transaction", {
        partnerName: selectedInstallment.buyerName,
        kind: partnerKind,
        type: "ايداع",
        amount: Number(payAmount),
        date: todayIsoDate(),
        notes: `تسديد قسط من لوحة التحكم - ${selectedInstallment.notes}`,
        currency: selectedInstallment.currency,
        paymentType: payMethod,
      });

      const paidNum = Number(payAmount);
      const dueNum  = selectedInstallment.amount;
      if (paidNum > dueNum) {
        const txs = await callTauri<any[]>("get_partner_transactions", {
          partnerName: selectedInstallment.buyerName,
          kind: partnerKind,
        });
        const futureInstallments = txs
          .filter((t) => t.type_ === "سحب" && t.id !== selectedInstallment.id)
          .sort((a, b) => a.date.localeCompare(b.date));

        if (futureInstallments.length > 0) {
          const excess    = paidNum - dueNum;
          const distribute = excess / futureInstallments.length;
          for (const fut of futureInstallments) {
            const nextAmount = Math.max(0, fut.amount - distribute);
            await callTauri("update_partner_transaction", {
              id: fut.id,
              partnerName: selectedInstallment.buyerName,
              kind: partnerKind,
              type_: "سحب",
              amount: nextAmount,
              date: fut.date,
              notes: fut.notes,
              currency: fut.currency || "IQD",
              paymentType: fut.payment_type || "قاصه",
            });
          }
        }
      }

      await callTauri("delete_partner_transaction", {
        id: selectedInstallment.id,
        partnerName: selectedInstallment.buyerName,
        kind: partnerKind,
      });

      setShowPayInstallmentModal(false);
      setSelectedInstallment(null);
      setPayAmount("");
      await onRefresh(); await loadBalances(); await loadInstallments();
    } catch (err) { console.error(err); }
    finally { setLoadingAction(false); }
  };

  // ── تسديد الممولين ──
  const [showPayCreditorModal, setShowPayCreditorModal] = useState(false);
  const [selectedCreditor,     setSelectedCreditor]     = useState("");
  const [creditorAmount,       setCreditorAmount]       = useState("");
  const [creditorCurrency,     setCreditorCurrency]     = useState<"IQD" | "USD">("USD");
  const [courierName,          setCourierName]          = useState("");
  const [creditorCommission,   setCreditorCommission]   = useState("");
  const [commissionCurrency,   setCommissionCurrency]   = useState<"IQD" | "USD">("USD");

  const handleOpenPayCreditor = (name?: string) => {
    if (name) setSelectedCreditor(name);
    setShowPayCreditorModal(true);
  };

  const handlePayCreditor = async () => {
    // تنظيف الاسم والبيانات المحددة فوراً
    const cleanCreditorName = selectedCreditor.trim();
    if (!cleanCreditorName || !Number(creditorAmount)) return;
    
    setLoadingAction(true);
    try {
      const amountNum = Number(creditorAmount);
      const commissionNum = Number(creditorCommission) || 0;
      
      // العثور على الحساب الفعلي للممول المختار في النظام لمعرفة نوع حسابه الحقيقي بدقة (ممول أو مطلوب)
      const matchingPartner = partners.find(
        (p) => p.partner_name.trim() === cleanCreditorName && (p.kind === "ممول" || p.kind === "مطلوب")
      );
      const matchingAccount = unifiedAccounts.find((a) => a.partner_name.trim() === cleanCreditorName);
      const partnerKind = matchingPartner?.kind || matchingAccount?.kind || "ممول";

      // استدعاء السيرفر بالبيانات المظهرة النظيفة تماماً
      await callTauri("pay_financier_from_partners", {
        financierName: cleanCreditorName,
        financierKind: partnerKind, // نمرر نوع حساب الممول الأصلي (ممول) وليس حساب الشركة!
        amount: amountNum,
        date: todayIsoDate(),
        notes: `تسديد دين للممول ${cleanCreditorName}${courierName ? ` بيد ${courierName.trim()}` : ""}`,
        currency: creditorCurrency,
        commissionAmount: commissionNum,
        commissionCurrency: commissionCurrency,
        commissionNotes: courierName ? `تسديد دين بيد ${courierName.trim()}` : null,
      });

      setShowPayCreditorModal(false);
      setSelectedCreditor("");
      setCreditorAmount("");
      setCourierName("");
      setCreditorCommission("");
      
      // تحديث كامل للواجهة والقوائم
      await onRefresh();
      await loadBalances();
    } catch (err) {
      console.error("فشل تأكيد عملية تسديد الممول والتحويل المالي:", err);
    } finally {
      setLoadingAction(false);
    }
  };

  const monthName = new Date().toLocaleDateString("ar-IQ", { month: "long", year: "numeric" });

  // ── أنماط زر مشتركة (مُعاد استخدامها) ──
  const btnPrimary: React.CSSProperties = {
    flex: 1,
    padding: "0.8rem",
    background: "linear-gradient(135deg, var(--gold), #b08800)",
    border: "none",
    borderRadius: "10px",
    color: "var(--black)",
    fontWeight: "var(--fw-extrabold)",
    fontSize: "var(--fs-base)",
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "opacity 0.15s",
  };
  const btnSecondary: React.CSSProperties = {
    padding: "0.8rem 1.25rem",
    background: "rgba(122,122,122,0.08)",
    border: "1px solid rgba(122,122,122,0.2)",
    borderRadius: "10px",
    color: "var(--gray)",
    fontWeight: "var(--fw-medium)",
    cursor: "pointer",
    fontFamily: "inherit",
  };

  return (
    <div
      className="dashboard"
      style={{ display: "flex", flexDirection: "column", gap: 0, flex: 1, minHeight: 0, height: "100%" }}
    >

      {/* ── شريط الأدوات الموحد ── */}
      <div className="cars-page__toolbar unified-toolbar">
        <div className="unified-toolbar__right" />
        <div
          className="unified-toolbar__center"
          style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}
        >
          <h2
            className="unified-toolbar__title"
            style={{
              fontSize: "var(--fs-title)",
              color: "var(--smiles)",
              letterSpacing: "0.02em",
            }}
          >
            البرنامج الحسابي لشركة فجر الوادي
          </h2>
          <span style={{ color: "var(--gray)", fontSize: "var(--fs-sm)", fontWeight: "var(--fw-medium)" }}>
            بإدارة امير الزجراوي ومنتصر الحيدري
          </span>
        </div>
        <div className="unified-toolbar__left" />
      </div>

      {/* ═══════════════════════════════════════════════════
          بطاقات الملخص المالي
      ═══════════════════════════════════════════════════ */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem", marginBottom: "1.25rem" }}>

        <StatCard icon={Coins} label="رصيد القاصة النقدية" variant="safe">
          <div style={{ fontSize: "var(--fs-md)", fontWeight: "800", color: "var(--dc-safe-accent)" }}>
            <PriceDisplay amount={safeIqd} />
          </div>
          {safeUsd > 0 && (
            <div style={{ fontSize: "var(--fs-base)", color: "var(--gray)", marginTop: "0.2rem" }}>
              <PriceDisplay amount={safeUsd} currency="USD" />
            </div>
          )}
        </StatCard>

        <StatCard icon={CreditCard} label="رصيد حساب الماستر" variant="master">
          <div style={{ fontSize: "var(--fs-md)", fontWeight: "800", color: "var(--dc-master-accent)" }}>
            <PriceDisplay amount={masterIqd} />
          </div>
          {masterUsd > 0 && (
            <div style={{ fontSize: "var(--fs-base)", color: "var(--gray)", marginTop: "0.2rem" }}>
              <PriceDisplay amount={masterUsd} currency="USD" />
            </div>
          )}
        </StatCard>

        <StatCard icon={TrendingUp} label={`أرباح ${monthName}`} variant="profit" isLoss={monthlyProfits < 0}>
          <div style={{
            fontSize: "var(--fs-lg)",
            fontWeight: "800",
            color: monthlyProfits >= 0 ? "var(--dc-profit-accent)" : "var(--dc-loss-accent)",
          }}>
            <PriceDisplay amount={Math.abs(monthlyProfits)} />
          </div>
          {monthlyProfits < 0 && (
            <div style={{ fontSize: "var(--fs-xs)", color: "var(--dc-loss-accent)", marginTop: "0.2rem" }}>خسارة</div>
          )}
        </StatCard>

        <StatCard icon={CarIcon} label="قيمة مخزون المعرض" variant="inventory">
          <div style={{ fontSize: "var(--fs-lg)", fontWeight: "800", color: "var(--dc-inventory-accent)" }}>
            <PriceDisplay amount={inventoryValue} />
          </div>
          <div style={{ fontSize: "var(--fs-xs)", color: "var(--gray)", marginTop: "0.2rem" }}>
            {cars.filter((c) => c.status === "متوفرة").length} سيارة
          </div>
        </StatCard>
      </div>

      {/* ═══════════════════════════════════════════════════
          شريط الإجراءات السريعة
      ═══════════════════════════════════════════════════ */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem", marginBottom: "1.25rem" }}>
        <QuickBtn
          icon={Plus}
          label="شراء سيارة"
          sublabel="تسجيل سيارة جديدة"
          onClick={() => onOpenCarForm("new")}
          variant="gold"
          className="quick-btn--colored quick-btn--buy"
          iconColor="var(--dc-buy-accent)"
        />
        <QuickBtn
          icon={CarIcon}
          label="بيع سيارة"
          sublabel="إتمام عملية بيع"
          onClick={() => setShowQuickSale(true)}
          variant="gold"
          className="quick-btn--colored quick-btn--sell"
          iconColor="var(--dc-sell-accent)"
        />
        <QuickBtn
          icon={Coins}
          label="تسجيل مصروف"
          sublabel="مصروف يومي أو خاص"
          onClick={() => setShowQuickExpense(true)}
          variant="red"
          className="quick-btn--colored quick-btn--expense"
          iconColor="var(--dc-expense-accent)"
        />
        <QuickBtn
          icon={Landmark}
          label="سحب ممول"
          sublabel="سداد دين للجهة الممولة"
          onClick={() => handleOpenPayCreditor()}
          variant="gray"
          className="quick-btn--colored quick-btn--creditor"
          iconColor="var(--dc-creditor-accent)"
        />
      </div>

      {/* ═══════════════════════════════════════════════════
          القسم السفلي: الأقساط + الديون
      ═══════════════════════════════════════════════════ */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem", flex: 1, minHeight: 0 }}>

        {/* ── الأقساط المستحقة ── */}
        <div
          className="dashboard-panel dashboard-panel--install"
          style={{ display: "flex", flexDirection: "column", gap: "0.85rem", minHeight: 0 }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Calendar size={18} style={{ color: "var(--dc-install-accent)" }} />
              <span style={{ fontWeight: "var(--fw-bold)", fontSize: "var(--fs-base)", color: "var(--white)" }}>
                الأقساط والمستحقات
              </span>
              {filteredInstallments.length > 0 && (
                <span
                  style={{
                    background: "rgba(251,146,60,0.15)",
                    border: "1px solid rgba(251,146,60,0.35)",
                    color: "var(--dc-install-accent)",
                    fontSize: "var(--fs-xs)",
                    fontWeight: "var(--fw-extrabold)",
                    padding: "0.1rem 0.45rem",
                    borderRadius: "20px",
                    animation: "dc-pulse 2s infinite",
                  }}
                >
                  {filteredInstallments.length}
                </span>
              )}
            </div>
            <span style={{ fontSize: "var(--fs-xs)", color: "var(--gray)" }}>
              {installments.length} إجمالي
            </span>
          </div>

          <div
            className="dashboard-scroll-list"
            style={{ display: "flex", flexDirection: "column", gap: "0.55rem", flex: 1, overflowY: "auto", minHeight: 0 }}
          >
            {filteredInstallments.length > 0 ? (
              filteredInstallments.map((alert) => (
                <InstallmentRow key={alert.id} alert={alert} onPay={handleOpenPayInstallment} />
              ))
            ) : (
              <div style={{ textAlign: "center", padding: "2.5rem 1rem" }}>
                <CheckCircle2 size={36} style={{ color: "var(--dc-install-accent)", margin: "0 auto 0.5rem auto", opacity: 0.6 }} />
                <div style={{ color: "var(--gray)", fontSize: "var(--fs-sm)" }}>لا توجد أقساط متأخرة أو مستحقة</div>
              </div>
            )}
          </div>
        </div>

        {/* ── الجهات الممولة ── */}
        <div
          className="dashboard-panel dashboard-panel--fund"
          style={{ display: "flex", flexDirection: "column", gap: "0.85rem", minHeight: 0 }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Landmark size={18} style={{ color: "var(--dc-fund-accent)" }} />
              <span style={{ fontWeight: "var(--fw-bold)", fontSize: "var(--fs-base)", color: "var(--white)" }}>
                الجهات الممولة (الدائنون)
              </span>
              {creditors.length > 0 && (
                <span
                  style={{
                    background: "rgba(52,211,153,0.12)",
                    border: "1px solid rgba(52,211,153,0.3)",
                    color: "var(--dc-fund-accent)",
                    fontSize: "var(--fs-xs)",
                    fontWeight: "var(--fw-extrabold)",
                    padding: "0.1rem 0.45rem",
                    borderRadius: "20px",
                  }}
                >
                  {creditors.length}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => handleOpenPayCreditor()}
              style={{
                padding: "0.3rem 0.7rem",
                background: "rgba(52,211,153,0.1)",
                border: "1px solid rgba(52,211,153,0.28)",
                borderRadius: "8px",
                color: "var(--dc-fund-accent)",
                fontSize: "var(--fs-xs)",
                fontWeight: "var(--fw-bold)",
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "background 0.15s",
              }}
            >
              + تسديد دفعة
            </button>
          </div>

          <div
            className="dashboard-scroll-list"
            style={{ display: "flex", flexDirection: "column", gap: "0.55rem", flex: 1, overflowY: "auto", minHeight: 0 }}
          >
            {creditors.length > 0 ? (
              creditors.map((c) => (
                <CreditorRow key={`${c.partner_name}_${c.kind}`} creditor={c} onPay={handleOpenPayCreditor} />
              ))
            ) : (
              <div style={{ textAlign: "center", padding: "2.5rem 1rem" }}>
                <PartyPopper size={36} style={{ color: "var(--dc-fund-accent)", margin: "0 auto 0.5rem auto", opacity: 0.6 }} />
                <div style={{ color: "var(--gray)", fontSize: "var(--fs-sm)" }}>لا توجد مديونيات للممولين حالياً</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════
          نافذة اختيار سيارة للبيع
      ════════════════════════════════════════════════════ */}
      {showQuickSale && (
        <div className="modal-overlay" style={{ zIndex: 1000 }} onClick={() => setShowQuickSale(false)}>
          <div className="modal-dialog modal-dialog--has-header" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "500px" }}>
            <div className="modal-dialog__header">
              <h2 className="modal-dialog__header-title">🚗 بيع سيارة متوفرة</h2>
              <button type="button" className="modal-dialog__close" onClick={() => setShowQuickSale(false)}>×</button>
            </div>
            <div className="modal-dialog__body modal-dialog__body--scroll">
              <div style={{ marginBottom: "0.5rem", fontSize: "var(--fs-sm)", color: "rgba(255,255,255,0.5)" }}>
                اختر السيارة المراد بيعها:
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {cars.filter((c) => c.status === "متوفرة").length === 0 ? (
                  <div style={{ textAlign: "center", padding: "2rem", color: "var(--gray)" }}>لا توجد سيارات متوفرة للبيع</div>
                ) : (
                  cars.filter((c) => c.status === "متوفرة").map((c) => (
                    <button
                      key={c.car_number}
                      type="button"
                      className="modal-select-item"
                      onClick={() => { setShowQuickSale(false); onOpenCarForm("edit", c); }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, fontSize: "var(--fs-base)", color: "#fff" }}>{c.car_name} {c.car_model}</div>
                        <div style={{ fontSize: "var(--fs-xs)", color: "rgba(255,255,255,0.4)", marginTop: "0.1rem" }}>
                          رقم اللوحة: {c.car_number} · سنة {c.car_year}
                        </div>
                      </div>
                      <div style={{ textAlign: "left", flexShrink: 0 }}>
                        <div style={{ fontSize: "var(--fs-sm)", color: "#d4af37", fontWeight: 700 }}>
                          {(c.purchase_price || 0).toLocaleString("en-US")} {c.currency === "USD" ? "USD" : "IQ"}
                        </div>
                        <div style={{ fontSize: "var(--fs-xs)", color: "rgba(255,255,255,0.35)" }}>سعر الشراء</div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════
          نافذة تسجيل مصروف
      ════════════════════════════════════════════════════ */}
      {showQuickExpense && (
        <div className="modal-overlay" style={{ zIndex: 1000 }} onClick={() => setShowQuickExpense(false)}>
          <div className="modal-dialog modal-dialog--has-header" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "460px" }}>
            <div className="modal-dialog__header">
              <h2 className="modal-dialog__header-title">💸 تسجيل مصروف جديد</h2>
              <button type="button" className="modal-dialog__close" onClick={() => setShowQuickExpense(false)}>×</button>
            </div>
            <form className="modal-dialog__body" onSubmit={handleExpenseSubmit}>
              <div className="form-group">
                <label className="label">بيان المصروف *</label>
                <TextInput value={expenseDesc} onChange={(e) => setExpenseDesc(e.target.value)} placeholder="وصف المصروف..." required />
              </div>
              <div className="form-group">
                <label className="label">المبلغ والعملة *</label>
                <PriceInput value={expenseAmt} onChange={setExpenseAmt} currency={expenseCurrency} onCurrencyChange={(cur) => setExpenseCurrency(cur as any)} />
              </div>
              <div className="form-group">
                <label className="label">ربط بسيارة (اختياري)</label>
                <SelectMenu value={expenseCar} onValueChange={(val) => setExpenseCar(val === " " ? "" : val)}>
                  <SelectMenuTrigger className="input flex items-center justify-between text-right">
                    <SelectMenuValue placeholder="-- بدون ربط --" />
                  </SelectMenuTrigger>
                  <SelectMenuContent className="z-[1100]">
                    <SelectMenuItem value=" " className="text-right justify-end">-- بدون ربط --</SelectMenuItem>
                    {cars.map((c) => (
                      <SelectMenuItem key={c.car_number} value={c.car_number} className="text-right justify-end">
                        {c.car_name} {c.car_model} ({c.car_number})
                      </SelectMenuItem>
                    ))}
                  </SelectMenuContent>
                </SelectMenu>
              </div>
              <div className="modal-dialog__actions">
                <ActionButton type="button" variant="ghost" onClick={() => setShowQuickExpense(false)}>إلغاء</ActionButton>
                <ActionButton type="submit" variant="danger" disabled={loadingAction || !expenseDesc.trim() || !Number(expenseAmt)}>
                  {loadingAction ? "جاري التسجيل..." : "تسجيل المصروف"}
                </ActionButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════
          نافذة تسديد قسط
      ════════════════════════════════════════════════════ */}
      {showPayInstallmentModal && selectedInstallment && (
        <div className="modal-overlay" style={{ zIndex: 1001 }} onClick={() => setShowPayInstallmentModal(false)}>
          <div className="modal-dialog modal-dialog--has-header" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "480px" }}>
            <div className="modal-dialog__header">
              <h2 className="modal-dialog__header-title">📅 تسديد قسط</h2>
              <button type="button" className="modal-dialog__close" onClick={() => setShowPayInstallmentModal(false)}>×</button>
            </div>
            <div className="modal-dialog__body">
              {/* معلومات القسط */}
              <div className="modal-info-card" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <div>
                  <div style={{ fontSize: "var(--fs-xs)", color: "rgba(255,255,255,0.45)" }}>العميل</div>
                  <div style={{ fontWeight: 700, color: "#fff" }}>{selectedInstallment.buyerName}</div>
                </div>
                <div>
                  <div style={{ fontSize: "var(--fs-xs)", color: "rgba(255,255,255,0.45)" }}>تاريخ الاستحقاق</div>
                  <div style={{ fontWeight: 600, color: "#d4af37" }}>{selectedInstallment.dueDate}</div>
                </div>
                <div style={{ gridColumn: "span 2" }}>
                  <div style={{ fontSize: "var(--fs-xs)", color: "rgba(255,255,255,0.45)" }}>قيمة القسط المستحق</div>
                  <div style={{ fontWeight: 800, fontSize: "var(--fs-lg)", color: "#d4af37" }}>
                    {selectedInstallment.amount.toLocaleString("en-US")} {selectedInstallment.currency === "USD" ? "USD" : "IQ"}
                  </div>
                </div>
              </div>
              <div className="form-group">
                <label className="label">المبلغ المسدد</label>
                <PriceInput value={payAmount} onChange={setPayAmount} currency={selectedInstallment.currency as "IQD" | "USD"} onCurrencyChange={() => {}} />
                {Number(payAmount) > selectedInstallment.amount && (
                  <div style={{ marginTop: "0.5rem", padding: "0.6rem 0.75rem", background: "rgba(212,175,55,0.07)", border: "1px solid rgba(212,175,55,0.2)", borderRadius: "8px", fontSize: "var(--fs-xs)", color: "#d4af37" }}>
                    ✨ الفائض <strong>{(Number(payAmount) - selectedInstallment.amount).toLocaleString("en-US")} {selectedInstallment.currency === "USD" ? "USD" : "IQ"}</strong> سيتم توزيعه على الأقساط القادمة تلقائياً
                  </div>
                )}
              </div>
              <div className="form-group">
                <label className="label">يدخل إلى</label>
                <div className="payment-type-selector">
                  {(["قاصه", "ماستر"] as const).map((opt) => (
                    <button key={opt} type="button" className={`payment-type-btn payment-type-btn--${opt === "قاصه" ? "qasa" : "master"} ${payMethod === opt ? "payment-type-btn--active" : ""}`} onClick={() => setPayMethod(opt)}>{opt}</button>
                  ))}
                </div>
              </div>
              <div className="modal-dialog__actions">
                <ActionButton type="button" variant="ghost" onClick={() => setShowPayInstallmentModal(false)}>إلغاء</ActionButton>
                <ActionButton type="button" variant="primary" disabled={loadingAction || !Number(payAmount)} onClick={handlePayInstallment}>
                  {loadingAction ? "جاري التسديد..." : "تأكيد التسديد"}
                </ActionButton>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════
          نافذة تسديد الممول
      ════════════════════════════════════════════════════ */}
      {showPayCreditorModal && (
        <div className="modal-overlay" style={{ zIndex: 1001 }} onClick={() => setShowPayCreditorModal(false)}>
          <div className="modal-dialog modal-dialog--has-header" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "500px" }}>
            <div className="modal-dialog__header">
              <h2 className="modal-dialog__header-title">🏦 تسديد دفعة للجهة الممولة</h2>
              <button type="button" className="modal-dialog__close" onClick={() => setShowPayCreditorModal(false)}>×</button>
            </div>
            <div className="modal-dialog__body modal-dialog__body--scroll">
              <div className="form-group">
                <label className="label">الجهة الممولة / الدائن *</label>
                {creditors.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                    {creditors.map((c) => (
                      <button
                        key={`${c.partner_name}_${c.kind}`}
                        type="button"
                        className={`modal-select-item ${selectedCreditor === c.partner_name ? "modal-select-item--active" : ""}`}
                        onClick={() => setSelectedCreditor(c.partner_name)}
                      >
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontWeight: 700, fontSize: "var(--fs-sm)", color: "#fff" }}>{c.partner_name}</div>
                          {c.phone && <div style={{ fontSize: "var(--fs-xs)", color: "rgba(255,255,255,0.4)" }}>📞 {c.phone}</div>}
                        </div>
                        <div style={{ textAlign: "left", flexShrink: 0 }}>
                          {c.usd_balance < 0 && <div style={{ fontWeight: 800, color: "#f87171", fontSize: "var(--fs-sm)" }}>{Math.abs(c.usd_balance).toLocaleString("en-US")} USD</div>}
                          {c.iqd_balance < 0 && <div style={{ fontWeight: 600, color: "#fca5a5", fontSize: "var(--fs-sm)" }}>{Math.abs(c.iqd_balance).toLocaleString("en-US")} IQ</div>}
                        </div>
                      </button>
                    ))}
                    <SelectMenu value={selectedCreditor} onValueChange={(val) => setSelectedCreditor(val === " " ? "" : val)}>
                      <SelectMenuTrigger className="input flex items-center justify-between text-right" style={{ marginTop: "0.25rem" }}>
                        <SelectMenuValue placeholder="-- أو اختر من الكل --" />
                      </SelectMenuTrigger>
                      <SelectMenuContent className="z-[1100]">
                        <SelectMenuItem value=" " className="text-right justify-end">-- أو اختر من الكل --</SelectMenuItem>
                        {partners.filter((p) => p.kind === "مطلوب" || p.kind === "ممول").map((p) => (
                          <SelectMenuItem key={`${p.partner_name}_${p.kind}`} value={p.partner_name} className="text-right justify-end">{p.partner_name}</SelectMenuItem>
                        ))}
                      </SelectMenuContent>
                    </SelectMenu>
                  </div>
                ) : (
                  <SelectMenu value={selectedCreditor} onValueChange={(val) => setSelectedCreditor(val === " " ? "" : val)}>
                    <SelectMenuTrigger className="input flex items-center justify-between text-right">
                      <SelectMenuValue placeholder="-- اختر الجهة الممولة --" />
                    </SelectMenuTrigger>
                    <SelectMenuContent className="z-[1100]">
                      <SelectMenuItem value=" " className="text-right justify-end">-- اختر الجهة الممولة --</SelectMenuItem>
                      {partners.filter((p) => p.kind === "مطلوب" || p.kind === "ممول").map((p) => (
                        <SelectMenuItem key={`${p.partner_name}_${p.kind}`} value={p.partner_name} className="text-right justify-end">{p.partner_name}</SelectMenuItem>
                      ))}
                    </SelectMenuContent>
                  </SelectMenu>
                )}
              </div>
              <div className="form-group">
                <label className="label">المبلغ المسدد *</label>
                <PriceInput value={creditorAmount} onChange={setCreditorAmount} currency={creditorCurrency} onCurrencyChange={(cur) => setCreditorCurrency(cur as any)} />
              </div>
              <div className="form-group">
                <label className="label">بيد شخص (الناقل) — اختياري</label>
                <TextInput value={courierName} onChange={(e) => setCourierName(e.target.value)} placeholder="اسم الشخص الذي سيحمل المبلغ..." />
              </div>
              <div className="form-group">
                <label className="label">عمولة التحويل — اختياري</label>
                <PriceInput value={creditorCommission} onChange={setCreditorCommission} currency={commissionCurrency} onCurrencyChange={(cur) => setCommissionCurrency(cur as any)} />
              </div>
              <div className="modal-dialog__actions">
                <ActionButton type="button" variant="ghost" onClick={() => setShowPayCreditorModal(false)}>إلغاء</ActionButton>
                <ActionButton type="button" variant="primary" disabled={loadingAction || !selectedCreditor || !Number(creditorAmount)} onClick={handlePayCreditor}>
                  {loadingAction ? "جاري التسديد..." : "تأكيد التسديد"}
                </ActionButton>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
