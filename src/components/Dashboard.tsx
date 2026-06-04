import { useEffect, useState } from "react";
import type { Car, Partner, CashRegisterEntry, UnifiedAccount } from "../types";
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
} from "@/components/ui";

import { todayIsoDate } from "../utils/dateSegments";
import {
  Coins,
  CreditCard,
  TrendingUp,
  Car as CarIcon,
  Plus,
  Zap,
  Landmark,
  Calendar,

  CheckCircle2,
  PartyPopper,
  Phone,
} from "lucide-react";

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

// ── مكون بطاقة الإحصائية ──────────────────────────────
function StatCard({
  icon: Icon,
  label,
  children,
  accent,
}: {
  icon: React.ComponentType<{ className?: string; size?: number; style?: React.CSSProperties; strokeWidth?: number }>;
  label: string;
  children: React.ReactNode;
  accent: string;
}) {
  return (
    <article
      className="stat-card"
      style={{
        position: "relative",
        background: "linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.01) 100%)",
        backdropFilter: "blur(20px) saturate(180%)",
        WebkitBackdropFilter: "blur(20px) saturate(180%)",
        borderRadius: "18px",
        padding: "1.5rem",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderTop: `1px solid rgba(255, 255, 255, 0.12)`,
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        cursor: "default",
        overflow: "hidden",
      } as React.CSSProperties}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-4px)";
        e.currentTarget.style.borderColor = `${accent}40`;
        e.currentTarget.style.boxShadow = `0 12px 40px rgba(0, 0, 0, 0.35), 0 0 15px ${accent}20`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.08)";
        e.currentTarget.style.boxShadow = "0 8px 32px rgba(0, 0, 0, 0.25)";
      }}
    >
      {/* Decorative glow blob in the top-right corner of each card */}
      <div
        style={{
          position: "absolute",
          top: "-20px",
          right: "-20px",
          width: "80px",
          height: "80px",
          background: accent,
          filter: "blur(40px)",
          opacity: 0.15,
          pointerEvents: "none",
        }}
      />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
        <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 700, letterSpacing: "0.03em" }}>
          {label}
        </span>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "36px",
            height: "36px",
            borderRadius: "10px",
            background: `${accent}15`,
            border: `1px solid ${accent}30`,
            color: accent,
            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.1), 0 0 10px ${accent}10`,
          }}
        >
          <Icon size={18} strokeWidth={2.2} />
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
        {children}
      </div>
    </article>
  );
}

// ── مكون زر الإجراء السريع ────────────────────────────
function QuickBtn({
  icon: Icon,
  label,
  sublabel,
  onClick,
  color,
}: {
  icon: React.ComponentType<{ className?: string; size?: number; style?: React.CSSProperties; strokeWidth?: number }>;
  label: string;
  sublabel?: string;
  onClick: () => void;
  color: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.4rem",
        flex: 1,
        minWidth: "140px",
        padding: "1.1rem 0.75rem",
        background: `linear-gradient(135deg, ${color}08 0%, ${color}03 100%)`,
        border: `1px solid rgba(255, 255, 255, 0.08)`,
        borderTop: `1px solid rgba(255, 255, 255, 0.12)`,
        borderRadius: "14px",
        cursor: "pointer",
        transition: "all 0.22s cubic-bezier(0.4, 0, 0.2, 1)",
        color: "#fff",
        fontFamily: "inherit",
        backdropFilter: "blur(10px)",
      } as React.CSSProperties}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-3px)";
        e.currentTarget.style.background = `linear-gradient(135deg, ${color}15 0%, ${color}08 100%)`;
        e.currentTarget.style.borderColor = `${color}40`;
        e.currentTarget.style.boxShadow = `0 8px 24px ${color}15`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.background = `linear-gradient(135deg, ${color}08 0%, ${color}03 100%)`;
        e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.08)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "42px",
          height: "42px",
          borderRadius: "50%",
          background: `${color}15`,
          color: color,
          marginBottom: "0.2rem",
          boxShadow: `0 0 12px ${color}10`,
          border: `1px solid ${color}25`,
        }}
      >
        <Icon size={20} strokeWidth={2.2} />
      </div>
      <span style={{ fontSize: "0.88rem", fontWeight: 700, color: "#fff" }}>{label}</span>
      {sublabel && <span style={{ fontSize: "0.72rem", opacity: 0.5 }}>{sublabel}</span>}
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
  const isToday = alert.status === "due_today";
  const borderColor = isOverdue ? "#ef4444" : isToday ? "#f97316" : "#eab308";
  const bgColor = isOverdue
    ? "rgba(239,68,68,0.06)"
    : isToday
    ? "rgba(249,115,22,0.06)"
    : "rgba(234,179,8,0.04)";

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
        borderRight: `4px solid ${borderColor}`,
        borderRadius: "10px",
        border: `1px solid ${borderColor}30`,
        borderRightWidth: "4px",
        borderRightColor: borderColor,
      }}
    >
      {/* الحالة */}
      <div
        style={{
          width: "8px",
          height: "8px",
          borderRadius: "50%",
          background: borderColor,
          flexShrink: 0,
          boxShadow: isOverdue ? `0 0 6px ${borderColor}` : "none",
        }}
      />

      {/* معلومات المشتري */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: "0.9rem", marginBottom: "0.15rem" }}>
          {alert.buyerName}
        </div>
        <div style={{ fontSize: "0.72rem", opacity: 0.55, display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
            <Calendar size={12} className="opacity-70" />
            {alert.dueDate}
          </span>
          {isOverdue && (
            <span style={{ color: "#ef4444", fontWeight: 600 }}>
              متأخر {alert.daysDifference} يوم
            </span>
          )}
          {isToday && (
            <span style={{ color: "#f97316", fontWeight: 600 }}>مستحق اليوم</span>
          )}
          {alert.carInfo && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
              <CarIcon size={12} className="opacity-70" />
              {alert.carInfo}
            </span>
          )}
        </div>
      </div>

      {/* المبلغ */}
      <div style={{ fontWeight: 800, fontSize: "1rem", color: borderColor, flexShrink: 0 }}>
        {alert.amount.toLocaleString("en-US")} {alert.currency === "USD" ? "USD" : "IQ"}
      </div>

      {/* الأزرار */}
      <div style={{ display: "flex", gap: "0.4rem", flexShrink: 0 }}>
        <button
          type="button"
          onClick={() => onPay(alert)}
          style={{
            padding: "0.35rem 0.75rem",
            background: "linear-gradient(135deg, #22c55e, #16a34a)",
            border: "none",
            borderRadius: "8px",
            color: "#fff",
            fontSize: "0.78rem",
            fontWeight: 700,
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
              color: "#fff",
              fontSize: "0.78rem",
              fontWeight: 700,
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
            <svg viewBox="0 0 24 24" width={14} height={14} fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12c0 2.137.56 4.146 1.54 5.92L.06 23.94l6.02-1.48A11.93 11.93 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.6c-1.96 0-3.82-.6-5.36-1.6l-.38-.24-4.06 1 .86-4.2-.24-.4C1.8 14.6 1.2 12.8 1.2 10.8 1.2 5.84 5.84 1.2 12 1.2s10.8 4.64 10.8 10.8-4.64 10.8-10.8 10.8zm5.92-6.84c-.32-.16-1.88-.92-2.16-1.04-.28-.12-.5-.16-.72.16-.22.32-.84 1.04-1.04 1.24-.2.2-.4.24-.72.08s-1.4-.52-2.68-1.64c-.98-.88-1.64-1.96-1.84-2.28-.2-.32-.02-.5.14-.66.14-.14.32-.36.48-.56.16-.2.22-.32.32-.56.1-.24.06-.44-.02-.6-.08-.16-.72-1.72-.98-2.36-.26-.64-.52-.56-.72-.56-.18 0-.4-.04-.62-.04s-.56.08-.86.4c-.3.32-1.14 1.12-1.14 2.72s1.18 3.16 1.34 3.4c.16.24 2.32 3.52 5.62 4.92.78.34 1.4.54 1.88.7.78.24 1.5.2 2.06.12.64-.08 1.88-.76 2.14-1.5.26-.74.26-1.38.18-1.5-.08-.12-.28-.2-.6-.36z"/></svg>
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
        background: "rgba(139,92,246,0.05)",
        borderRight: "4px solid #8b5cf6",
        borderRadius: "10px",
        border: "1px solid rgba(139,92,246,0.2)",
        borderRightWidth: "4px",
        borderRightColor: "#8b5cf6",
      }}
    >
      <Landmark size={18} style={{ color: "#a78bfa" }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>{creditor.partner_name}</div>
        {creditor.phone && (
          <div style={{ fontSize: "0.72rem", opacity: 0.5, display: "flex", alignItems: "center", gap: "0.25rem" }}>
            <Phone size={12} className="opacity-75" />
            <span>{creditor.phone}</span>
          </div>
        )}
      </div>
      <div style={{ textAlign: "left", flexShrink: 0 }}>
        {creditor.usd_balance < 0 && (
          <div style={{ fontWeight: 800, fontSize: "0.95rem", color: "#ef4444" }}>
            {totalDebt.toLocaleString("ar-IQ")} USD
          </div>
        )}
        {creditor.iqd_balance < 0 && (
          <div style={{ fontWeight: 600, fontSize: "0.8rem", color: "#fca5a5" }}>
            {Math.abs(creditor.iqd_balance).toLocaleString("ar-IQ")} IQ
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => onPay(creditor.partner_name)}
        style={{
          padding: "0.35rem 0.85rem",
          background: "linear-gradient(135deg, #8b5cf6, #7c3aed)",
          border: "none",
          borderRadius: "8px",
          color: "#fff",
          fontSize: "0.78rem",
          fontWeight: 700,
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

// ── المكون الرئيسي: لوحة التحكم ──────────────────────
export function Dashboard({ cars, partners, onRefresh, onOpenCarForm }: DashboardProps) {


  // 2. الأرصدة
  const [safeEntries, setSafeEntries] = useState<CashRegisterEntry[]>([]);
  const [masterEntries, setMasterEntries] = useState<CashRegisterEntry[]>([]);
  const [unifiedAccounts, setUnifiedAccounts] = useState<UnifiedAccount[]>([]);
  const [installments, setInstallments] = useState<InstallmentAlert[]>([]);
  const [loadingAction, setLoadingAction] = useState(false);


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

          // نعرض الأقساط المتأخرة ومستحقة اليوم والقادمة خلال 30 يوم
          if (diffDays <= 30) {
            // استخرج معلومات السيارة من الملاحظات إن وجدت
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

  useEffect(() => { void loadBalances(); }, [partners]);
  useEffect(() => { void loadInstallments(); }, [partners]);

  // حسابات الأرصدة
  const computeIqdBalance = (list: CashRegisterEntry[]) =>
    list.filter((e) => e.currency !== "USD").reduce((s, e) => s + e.amount, 0);
  const computeUsdBalance = (list: CashRegisterEntry[]) =>
    list.filter((e) => e.currency === "USD").reduce((s, e) => s + e.amount, 0);

  const safeIqd = computeIqdBalance(safeEntries);
  const safeUsd = computeUsdBalance(safeEntries);
  const masterIqd = computeIqdBalance(masterEntries);
  const masterUsd = computeUsdBalance(masterEntries);

  const inventoryValue = cars
    .filter((c) => c.status === "متوفرة")
    .reduce((s, c) => s + (c.purchase_price || 0), 0);

  const currentMonthStr = new Date().toISOString().slice(0, 7);
  const monthlyProfits = cars.reduce((total, car) => {
    if (car.status === "مبيوعة" && car.sale_date?.startsWith(currentMonthStr)) {
      return total + ((car.selling_price || 0) - (car.purchase_price || 0));
    }
    return total;
  }, 0);



  const creditors = unifiedAccounts.filter((a) => a.iqd_balance < 0 || a.usd_balance < 0);

  const filteredInstallments = installments.filter(
    (a) => a.status === "overdue" || a.status === "due_today"
  );

  // 3. النوافذ المنبثقة
  const [showQuickSale, setShowQuickSale] = useState(false);
  const [showQuickExpense, setShowQuickExpense] = useState(false);

  const [expenseDesc, setExpenseDesc] = useState("");
  const [expenseAmt, setExpenseAmt] = useState("");
  const [expenseCurrency, setExpenseCurrency] = useState<"IQD" | "USD">("IQD");
  const [expenseCar, setExpenseCar] = useState("");

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

  // 4. تسديد قسط
  const [showPayInstallmentModal, setShowPayInstallmentModal] = useState(false);
  const [selectedInstallment, setSelectedInstallment] = useState<InstallmentAlert | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<"قاصه" | "ماستر">("قاصه");

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
      const dueNum = selectedInstallment.amount;
      if (paidNum > dueNum) {
        const txs = await callTauri<any[]>("get_partner_transactions", {
          partnerName: selectedInstallment.buyerName,
          kind: partnerKind,
        });
        const futureInstallments = txs
          .filter((t) => t.type_ === "سحب" && t.id !== selectedInstallment.id)
          .sort((a, b) => a.date.localeCompare(b.date));

        if (futureInstallments.length > 0) {
          const excess = paidNum - dueNum;
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

  // 5. تسديد الممولين
  const [showPayCreditorModal, setShowPayCreditorModal] = useState(false);
  const [selectedCreditor, setSelectedCreditor] = useState("");
  const [creditorAmount, setCreditorAmount] = useState("");
  const [creditorCurrency, setCreditorCurrency] = useState<"IQD" | "USD">("USD");
  const [creditorMethod, setCreditorMethod] = useState<"قاصه" | "ماستر">("قاصه");
  const [courierName, setCourierName] = useState("");
  const [creditorCommission, setCreditorCommission] = useState("");
  const [commissionCurrency, setCommissionCurrency] = useState<"IQD" | "USD">("USD");

  const handleOpenPayCreditor = (name?: string) => {
    if (name) setSelectedCreditor(name);
    setShowPayCreditorModal(true);
  };

  const handlePayCreditor = async () => {
    if (!selectedCreditor || !Number(creditorAmount)) return;
    setLoadingAction(true);
    try {
      const amountNum = Number(creditorAmount);
      const commissionNum = Number(creditorCommission) || 0;

      const matchingPartner = partners.find((p) => p.partner_name === selectedCreditor && (p.kind === "ممول" || p.kind === "مطلوب"));
      const matchingAccount = unifiedAccounts.find((a) => a.partner_name === selectedCreditor);
      const partnerKind = matchingPartner?.kind || matchingAccount?.kind || "مطلوب";

      await callTauri("add_partner_transaction", {
        partnerName: selectedCreditor,
        kind: partnerKind,
        type: "سحب",
        amount: amountNum,
        date: todayIsoDate(),
        notes: `تسديد دين للممول ${selectedCreditor}${courierName ? ` بيد ${courierName}` : ""}`,
        currency: creditorCurrency,
        paymentType: creditorMethod,
      });

      if (commissionNum > 0) {
        await callTauri("add_expense", {
          description: `عمولة تسديد تمويل للممول ${selectedCreditor}`,
          amount: commissionNum,
          date: todayIsoDate(),
          notes: courierName ? `تسديد دين بيد ${courierName}` : null,
          currency: commissionCurrency,
          carNumber: null,
        });
      }

      setShowPayCreditorModal(false);
      setSelectedCreditor(""); setCreditorAmount(""); setCourierName(""); setCreditorCommission("");
      await onRefresh(); await loadBalances();
    } catch (err) { console.error(err); }
    finally { setLoadingAction(false); }
  };

  const monthName = new Date().toLocaleDateString("ar-IQ", { month: "long", year: "numeric" });

  return (
    <div className="dashboard" style={{ display: "flex", flexDirection: "column", gap: "1.25rem", flex: 1, minHeight: 0, height: "100%" }}>

      {/* ═══════════════════════════════════════════════════
          عنوان ترويسة لوحة التحكم للشركة
      ═══════════════════════════════════════════════════ */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          gap: "0.5rem",
          background: "linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.02) 100%)",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          borderRadius: "20px",
          padding: "1.5rem 2rem",
          backdropFilter: "blur(20px)",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2), inset 0 1px 1px rgba(255, 255, 255, 0.10)",
        }}
      >
        <h1
          style={{
            margin: "0 0 0.8rem 0",
            fontSize: "2.2rem",
            fontWeight: 900,
            color: "#ffffff",
            letterSpacing: "0.02em",
            fontFamily: "var(--title-font-family)",
            textAlign: "center",
          } as React.CSSProperties}
        >
          البرنامج الحسابي لشركة فجر الوادي
        </h1>

        <p
          style={{
            margin: 0,
            fontSize: "1.25rem",
            color: "var(--text-muted)",
            fontWeight: 600,
            fontFamily: "var(--title-font-family)",
            opacity: 0.85,
          }}
        >
          بإدارة امير الزجراوي وسيد منتصر الحيدري
        </p>
      </div>

      {/* ═══════════════════════════════════════════════════
          بطاقات الملخص المالي
      ═══════════════════════════════════════════════════ */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem" }}>
        <StatCard icon={Coins} label="رصيد القاصة النقدية" accent="#d4af37">
          <div style={{ fontSize: "1.2rem", fontWeight: 800 }}><PriceDisplay amount={safeIqd} /></div>
          {safeUsd > 0 && (
            <div style={{ fontSize: "0.95rem", opacity: 0.75, marginTop: "0.2rem" }}>
              <PriceDisplay amount={safeUsd} currency="USD" />
            </div>
          )}
        </StatCard>

        <StatCard icon={CreditCard} label="رصيد حساب الماستر" accent="#8b5cf6">
          <div style={{ fontSize: "1.2rem", fontWeight: 800 }}><PriceDisplay amount={masterIqd} /></div>
          {masterUsd > 0 && (
            <div style={{ fontSize: "0.95rem", opacity: 0.75, marginTop: "0.2rem" }}>
              <PriceDisplay amount={masterUsd} currency="USD" />
            </div>
          )}
        </StatCard>

        <StatCard icon={TrendingUp} label={`أرباح ${monthName}`} accent="#22c55e">
          <div
            style={{
              fontSize: "1.35rem",
              fontWeight: 800,
              color: monthlyProfits >= 0 ? "#22c55e" : "#ef4444",
            }}
          >
            <PriceDisplay amount={Math.abs(monthlyProfits)} />
          </div>
          {monthlyProfits < 0 && (
            <div style={{ fontSize: "0.72rem", color: "#ef4444", marginTop: "0.2rem" }}>خسارة</div>
          )}
        </StatCard>

        <StatCard icon={CarIcon} label="قيمة مخزون المعرض" accent="#06b6d4">
          <div style={{ fontSize: "1.35rem", fontWeight: 800, color: "#06b6d4" }}>
            <PriceDisplay amount={inventoryValue} />
          </div>
          <div style={{ fontSize: "0.72rem", opacity: 0.5, marginTop: "0.2rem" }}>
            {cars.filter((c) => c.status === "متوفرة").length} سيارة
          </div>
        </StatCard>
      </div>

      {/* ═══════════════════════════════════════════════════
          شريط الإجراءات السريعة
      ═══════════════════════════════════════════════════ */}
      <div
        style={{
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: "16px",
          padding: "1.1rem",
        }}
      >
        <div style={{ fontSize: "0.72rem", opacity: 0.5, marginBottom: "0.75rem", fontWeight: 600, letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: "0.3rem" }}>
          <Zap size={12} style={{ color: "#ffd27b" }} />
          <span>إجراءات سريعة</span>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <QuickBtn
            icon={Plus}
            label="شراء سيارة"
            sublabel="تسجيل سيارة جديدة"
            onClick={() => onOpenCarForm("new")}
            color="#22c55e"
          />
          <QuickBtn
            icon={CarIcon}
            label="بيع سيارة"
            sublabel="إتمام عملية بيع"
            onClick={() => setShowQuickSale(true)}
            color="#f59e0b"
          />
          <QuickBtn
            icon={Coins}
            label="تسجيل مصروف"
            sublabel="مصروف يومي أو خاص"
            onClick={() => setShowQuickExpense(true)}
            color="#f43f5e"
          />
          <QuickBtn
            icon={Landmark}
            label="تسديد ممول"
            sublabel="سداد دين للجهة الممولة"
            onClick={() => handleOpenPayCreditor()}
            color="#8b5cf6"
          />
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════
          القسم السفلي: الأقساط + الديون
      ═══════════════════════════════════════════════════ */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem", flex: 1, minHeight: 0 }}>

        {/* ── الأقساط المستحقة ── */}
        <div
          style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: "16px",
            padding: "1.25rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.85rem",
            minHeight: 0,
          }}
        >
          {/* رأس القسم */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Calendar size={18} style={{ color: "var(--gold)" }} />
              <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>الأقساط والمستحقات</span>
              {filteredInstallments.length > 0 && (
                <span
                  style={{
                    background: "#ef4444",
                    color: "#fff",
                    fontSize: "0.68rem",
                    fontWeight: 800,
                    padding: "0.1rem 0.45rem",
                    borderRadius: "20px",
                    animation: "pulse 2s infinite",
                  }}
                >
                  {filteredInstallments.length}
                </span>
              )}
            </div>
            <span style={{ fontSize: "0.72rem", opacity: 0.45 }}>
              {installments.length} إجمالي
            </span>
          </div>



          {/* القائمة */}
          <div className="dashboard-scroll-list" style={{ display: "flex", flexDirection: "column", gap: "0.55rem", flex: 1, overflowY: "auto", minHeight: 0 }}>
            {filteredInstallments.length > 0 ? (
              filteredInstallments.map((alert) => (
                <InstallmentRow key={alert.id} alert={alert} onPay={handleOpenPayInstallment} />
              ))
            ) : (
              <div
                style={{
                  textAlign: "center",
                  padding: "2.5rem 1rem",
                  color: "rgba(255,255,255,0.3)",
                  fontSize: "0.85rem",
                }}
              >
                <CheckCircle2 size={36} style={{ color: "#22c55e", margin: "0 auto 0.5rem auto", opacity: 0.6 }} />
                <div>لا توجد أقساط متأخرة أو مستحقة</div>
              </div>
            )}
          </div>
        </div>

        {/* ── الجهات الممولة ── */}
        <div
          style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: "16px",
            padding: "1.25rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.85rem",
            minHeight: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Landmark size={18} style={{ color: "#8b5cf6" }} />
              <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>الجهات الممولة (الدائنون)</span>
              {creditors.length > 0 && (
                <span
                  style={{
                    background: "#8b5cf6",
                    color: "#fff",
                    fontSize: "0.68rem",
                    fontWeight: 800,
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
                background: "rgba(139,92,246,0.15)",
                border: "1px solid rgba(139,92,246,0.35)",
                borderRadius: "8px",
                color: "#a78bfa",
                fontSize: "0.72rem",
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              + تسديد دفعة
            </button>
          </div>

          <div className="dashboard-scroll-list" style={{ display: "flex", flexDirection: "column", gap: "0.55rem", flex: 1, overflowY: "auto", minHeight: 0 }}>
            {creditors.length > 0 ? (
              creditors.map((c) => (
                <CreditorRow key={c.partner_name} creditor={c} onPay={handleOpenPayCreditor} />
              ))
            ) : (
              <div
                style={{
                  textAlign: "center",
                  padding: "2.5rem 1rem",
                  color: "rgba(255,255,255,0.3)",
                  fontSize: "0.85rem",
                }}
              >
                <PartyPopper size={36} style={{ color: "#8b5cf6", margin: "0 auto 0.5rem auto", opacity: 0.6 }} />
                <div>لا توجد مديونيات للممولين حالياً</div>
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
          <div
            className="modal-dialog"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "90%",
              maxWidth: "500px",
              background: "var(--card-bg, #141414)",
              borderRadius: "20px",
              border: "1px solid rgba(245,158,11,0.25)",
              boxShadow: "0 24px 80px rgba(0,0,0,0.7)",
              maxHeight: "80vh",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              className="modal-dialog__header"
              style={{
                background: "linear-gradient(135deg, rgba(245,158,11,0.12), rgba(245,158,11,0.04))",
                borderBottom: "1px solid rgba(245,158,11,0.2)",
                padding: "1.1rem 1.5rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#f59e0b", margin: 0 }}>
                🚗 بيع سيارة متوفرة
              </h2>
              <button
                type="button"
                onClick={() => setShowQuickSale(false)}
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  border: "none",
                  background: "rgba(255,255,255,0.08)",
                  color: "#fff",
                  fontSize: "1.1rem",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "inherit",
                }}
              >
                ×
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
              <div style={{ padding: "2rem", overflowY: "auto", flex: 1 }}>
                <div
                  style={{
                    marginBottom: "1rem",
                    fontSize: "0.85rem",
                    opacity: 0.7,
                    fontWeight: 600,
                  }}
                >
                  اختر السيارة المراد بيعها:
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                  {cars.filter((c) => c.status === "متوفرة").length === 0 ? (
                    <div style={{ textAlign: "center", padding: "2rem", opacity: 0.4 }}>
                      لا توجد سيارات متوفرة للبيع
                    </div>
                  ) : (
                    cars
                      .filter((c) => c.status === "متوفرة")
                      .map((c) => (
                        <button
                          key={c.car_number}
                          type="button"
                          onClick={() => {
                            setShowQuickSale(false);
                            onOpenCarForm("edit", c);
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "0.85rem 1.1rem",
                            background: "rgba(255,255,255,0.03)",
                            border: "1px solid rgba(255,255,255,0.08)",
                            borderRadius: "10px",
                            cursor: "pointer",
                            color: "#fff",
                            fontFamily: "inherit",
                            textAlign: "right",
                            transition: "all 0.15s",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = "rgba(245,158,11,0.08)";
                            e.currentTarget.style.borderColor = "rgba(245,158,11,0.35)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                            e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>
                              {c.car_name} {c.car_model}
                            </div>
                            <div style={{ fontSize: "0.75rem", opacity: 0.5, marginTop: "0.15rem" }}>
                              رقم اللوحة: {c.car_number} · سنة {c.car_year}
                            </div>
                          </div>
                          <div style={{ textAlign: "left" }}>
                            <div style={{ fontSize: "0.8rem", color: "#f59e0b", fontWeight: 700 }}>
                              {(c.purchase_price || 0).toLocaleString("ar-IQ")} {c.currency === "USD" ? "USD" : "IQ"}
                            </div>
                            <div style={{ fontSize: "0.7rem", opacity: 0.4 }}>سعر الشراء</div>
                          </div>
                        </button>
                      ))
                  )}
                </div>
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
          <div
            className="modal-dialog"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "90%",
              maxWidth: "460px",
              background: "var(--card-bg, #141414)",
              borderRadius: "20px",
              border: "1px solid rgba(244,63,94,0.25)",
              boxShadow: "0 24px 80px rgba(0,0,0,0.7)",
            }}
          >
            <div
              className="modal-dialog__header"
              style={{
                background: "linear-gradient(135deg, rgba(244,63,94,0.12), rgba(244,63,94,0.04))",
                borderBottom: "1px solid rgba(244,63,94,0.2)",
                padding: "1.1rem 1.5rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <h2 style={{ fontSize: "1.05rem", fontWeight: 800, color: "#f43f5e", margin: 0 }}>
                💸 تسجيل مصروف جديد
              </h2>
              <button
                type="button"
                onClick={() => setShowQuickExpense(false)}
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  border: "none",
                  background: "rgba(255,255,255,0.08)",
                  color: "#fff",
                  fontSize: "1.1rem",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "inherit",
                }}
              >
                ×
              </button>
            </div>
            <form
              onSubmit={handleExpenseSubmit}
              style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              <div className="form-group">
                <label className="label">بيان المصروف *</label>
                <TextInput
                  value={expenseDesc}
                  onChange={(e) => setExpenseDesc(e.target.value)}
                  placeholder="وصف المصروف..."
                  required
                />
              </div>
              <div className="form-group">
                <label className="label">المبلغ والعملة *</label>
                <PriceInput
                  value={expenseAmt}
                  onChange={setExpenseAmt}
                  currency={expenseCurrency}
                  onCurrencyChange={(cur) => setExpenseCurrency(cur as any)}
                />
              </div>
              <div className="form-group">
                <label className="label">ربط بسيارة (اختياري)</label>
                <SelectMenu
                  value={expenseCar}
                  onValueChange={(val) => setExpenseCar(val === " " ? "" : val)}
                >
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
              <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem" }}>
                <button
                  type="submit"
                  disabled={loadingAction || !expenseDesc.trim() || !Number(expenseAmt)}
                  style={{
                    flex: 1,
                    padding: "0.75rem",
                    background: "linear-gradient(135deg, #f43f5e, #be123c)",
                    border: "none",
                    borderRadius: "10px",
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: "0.9rem",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    opacity: loadingAction ? 0.6 : 1,
                    transition: "opacity 0.15s",
                  }}
                >
                  {loadingAction ? "جاري التسجيل..." : "✓ تسجيل المصروف"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowQuickExpense(false)}
                  style={{
                    padding: "0.75rem 1.25rem",
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "10px",
                    color: "rgba(255,255,255,0.6)",
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  إلغاء
                </button>
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
          <div
            className="modal-dialog"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "90%",
              maxWidth: "480px",
              background: "var(--card-bg, #141414)",
              borderRadius: "20px",
              border: "1px solid rgba(34,197,94,0.2)",
              boxShadow: "0 24px 80px rgba(0,0,0,0.8)",
            }}
          >
            <div
              style={{
                background: "linear-gradient(135deg, rgba(34,197,94,0.1), rgba(34,197,94,0.03))",
                borderBottom: "1px solid rgba(34,197,94,0.15)",
                padding: "1.1rem 1.5rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <h2 style={{ fontSize: "1.05rem", fontWeight: 800, color: "#22c55e", margin: 0 }}>
                📅 تسديد قسط
              </h2>
              <button
                type="button"
                onClick={() => setShowPayInstallmentModal(false)}
                style={{
                  width: "30px",
                  height: "30px",
                  borderRadius: "50%",
                  border: "none",
                  background: "rgba(255,255,255,0.08)",
                  color: "#fff",
                  fontSize: "1rem",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "inherit",
                }}
              >
                ×
              </button>
            </div>

            <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.1rem" }}>
              {/* معلومات القسط */}
              <div
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: "12px",
                  padding: "1rem",
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "0.5rem",
                }}
              >
                <div>
                  <div style={{ fontSize: "0.68rem", opacity: 0.5 }}>العميل</div>
                  <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>{selectedInstallment.buyerName}</div>
                </div>
                <div>
                  <div style={{ fontSize: "0.68rem", opacity: 0.5 }}>تاريخ الاستحقاق</div>
                  <div style={{ fontWeight: 600, fontSize: "0.85rem", color: "#f97316" }}>
                    {selectedInstallment.dueDate}
                  </div>
                </div>
                <div style={{ gridColumn: "span 2" }}>
                  <div style={{ fontSize: "0.68rem", opacity: 0.5 }}>قيمة القسط المستحق</div>
                  <div style={{ fontWeight: 800, fontSize: "1.3rem", color: "#d4af37" }}>
                    {selectedInstallment.amount.toLocaleString("ar-IQ")}{" "}
                    {selectedInstallment.currency === "USD" ? "USD" : "IQ"}
                  </div>
                </div>
              </div>

              {/* حقل المبلغ */}
              <div className="form-group">
                <label className="label">المبلغ المسدد</label>
                <PriceInput
                  value={payAmount}
                  onChange={setPayAmount}
                  currency={selectedInstallment.currency as "IQD" | "USD"}
                  onCurrencyChange={() => {}}
                />
                {Number(payAmount) > selectedInstallment.amount && (
                  <div
                    style={{
                      marginTop: "0.5rem",
                      padding: "0.6rem 0.75rem",
                      background: "rgba(34,197,94,0.08)",
                      border: "1px solid rgba(34,197,94,0.2)",
                      borderRadius: "8px",
                      fontSize: "0.75rem",
                      color: "#86efac",
                    }}
                  >
                    ✨ الفائض{" "}
                    <strong>
                      {(Number(payAmount) - selectedInstallment.amount).toLocaleString("ar-IQ")}{" "}
                      {selectedInstallment.currency === "USD" ? "USD" : "IQ"}
                    </strong>{" "}
                    سيتم توزيعه على الأقساط القادمة تلقائياً
                  </div>
                )}
              </div>

              {/* طريقة التسديد */}
              <div className="form-group">
                <label className="label">يدخل إلى</label>
                <div className="payment-type-selector">
                  {(["قاصه", "ماستر"] as const).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      className={`payment-type-btn payment-type-btn--${opt === "قاصه" ? "qasa" : "master"} ${payMethod === opt ? "payment-type-btn--active" : ""}`}
                      onClick={() => setPayMethod(opt)}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", gap: "0.75rem" }}>
                <button
                  type="button"
                  disabled={loadingAction || !Number(payAmount)}
                  onClick={handlePayInstallment}
                  style={{
                    flex: 1,
                    padding: "0.8rem",
                    background: "linear-gradient(135deg, #22c55e, #16a34a)",
                    border: "none",
                    borderRadius: "10px",
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: "0.95rem",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    opacity: loadingAction ? 0.6 : 1,
                    transition: "opacity 0.15s",
                  }}
                >
                  {loadingAction ? "جاري التسديد..." : "✓ تأكيد التسديد"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowPayInstallmentModal(false)}
                  style={{
                    padding: "0.8rem 1.25rem",
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "10px",
                    color: "rgba(255,255,255,0.6)",
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  إلغاء
                </button>
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
          <div
            className="modal-dialog"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "90%",
              maxWidth: "500px",
              background: "var(--card-bg, #141414)",
              borderRadius: "20px",
              border: "1px solid rgba(139,92,246,0.25)",
              boxShadow: "0 24px 80px rgba(0,0,0,0.8)",
            }}
          >
            <div
              style={{
                background: "linear-gradient(135deg, rgba(139,92,246,0.12), rgba(139,92,246,0.04))",
                borderBottom: "1px solid rgba(139,92,246,0.2)",
                padding: "1.1rem 1.5rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <h2 style={{ fontSize: "1.05rem", fontWeight: 800, color: "#a78bfa", margin: 0 }}>
                🏦 تسديد دفعة للجهة الممولة
              </h2>
              <button
                type="button"
                onClick={() => setShowPayCreditorModal(false)}
                style={{
                  width: "30px",
                  height: "30px",
                  borderRadius: "50%",
                  border: "none",
                  background: "rgba(255,255,255,0.08)",
                  color: "#fff",
                  fontSize: "1rem",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "inherit",
                }}
              >
                ×
              </button>
            </div>

            <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.1rem" }}>

              {/* اختيار الدائن */}
              <div className="form-group">
                <label className="label">الجهة الممولة / الدائن *</label>
                {creditors.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
                    {creditors.map((c) => (
                      <button
                        key={c.partner_name}
                        type="button"
                        onClick={() => setSelectedCreditor(c.partner_name)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "0.75rem 1rem",
                          background: selectedCreditor === c.partner_name
                            ? "rgba(139,92,246,0.15)"
                            : "rgba(255,255,255,0.03)",
                          border: `1px solid ${selectedCreditor === c.partner_name ? "rgba(139,92,246,0.5)" : "rgba(255,255,255,0.07)"}`,
                          borderRadius: "10px",
                          cursor: "pointer",
                          color: "#fff",
                          fontFamily: "inherit",
                          transition: "all 0.15s",
                        }}
                      >
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>{c.partner_name}</div>
                          {c.phone && (
                            <div style={{ fontSize: "0.7rem", opacity: 0.45 }}>📞 {c.phone}</div>
                          )}
                        </div>
                        <div style={{ textAlign: "left" }}>
                          {c.usd_balance < 0 && (
                            <div style={{ fontWeight: 800, color: "#ef4444", fontSize: "0.9rem" }}>
                              {Math.abs(c.usd_balance).toLocaleString("ar-IQ")} USD
                            </div>
                          )}
                          {c.iqd_balance < 0 && (
                            <div style={{ fontWeight: 600, color: "#fca5a5", fontSize: "0.8rem" }}>
                              {Math.abs(c.iqd_balance).toLocaleString("ar-IQ")} IQ
                            </div>
                          )}
                        </div>
                        {selectedCreditor === c.partner_name && (
                          <span style={{ color: "#a78bfa", fontSize: "1rem" }}>✓</span>
                        )}
                      </button>
                    ))}
                    {/* أو اختيار يدوي */}
                    <SelectMenu
                      value={selectedCreditor}
                      onValueChange={(val) => setSelectedCreditor(val === " " ? "" : val)}
                    >
                      <SelectMenuTrigger className="input flex items-center justify-between text-right" style={{ marginTop: "0.25rem", fontSize: "0.8rem" }}>
                        <SelectMenuValue placeholder="-- أو اختر من الكل --" />
                      </SelectMenuTrigger>
                      <SelectMenuContent className="z-[1100]">
                        <SelectMenuItem value=" " className="text-right justify-end">-- أو اختر من الكل --</SelectMenuItem>
                        {partners
                          .filter((p) => p.kind === "مطلوب" || p.kind === "ممول")
                          .map((p) => (
                            <SelectMenuItem key={p.partner_name} value={p.partner_name} className="text-right justify-end">
                              {p.partner_name}
                            </SelectMenuItem>
                          ))}
                      </SelectMenuContent>
                    </SelectMenu>
                  </div>
                ) : (
                  <SelectMenu
                    value={selectedCreditor}
                    onValueChange={(val) => setSelectedCreditor(val === " " ? "" : val)}
                  >
                    <SelectMenuTrigger className="input flex items-center justify-between text-right">
                      <SelectMenuValue placeholder="-- اختر الجهة الممولة --" />
                    </SelectMenuTrigger>
                    <SelectMenuContent className="z-[1100]">
                      <SelectMenuItem value=" " className="text-right justify-end">-- اختر الجهة الممولة --</SelectMenuItem>
                      {partners
                        .filter((p) => p.kind === "مطلوب" || p.kind === "ممول")
                        .map((p) => (
                          <SelectMenuItem key={p.partner_name} value={p.partner_name} className="text-right justify-end">
                            {p.partner_name}
                          </SelectMenuItem>
                        ))}
                    </SelectMenuContent>
                  </SelectMenu>
                )}
              </div>

              {/* المبلغ */}
              <div className="form-group">
                <label className="label">المبلغ المسدد *</label>
                <PriceInput
                  value={creditorAmount}
                  onChange={setCreditorAmount}
                  currency={creditorCurrency}
                  onCurrencyChange={(cur) => setCreditorCurrency(cur as any)}
                />
              </div>

              {/* طريقة الدفع */}
              <div className="form-group">
                <label className="label">يخرج من</label>
                <div className="payment-type-selector">
                  {(["قاصه", "ماستر"] as const).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      className={`payment-type-btn payment-type-btn--${opt === "قاصه" ? "qasa" : "master"} ${creditorMethod === opt ? "payment-type-btn--active" : ""}`}
                      onClick={() => setCreditorMethod(opt)}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              {/* بيد شخص */}
              <div className="form-group">
                <label className="label">بيد شخص (الناقل) — اختياري</label>
                <TextInput
                  value={courierName}
                  onChange={(e) => setCourierName(e.target.value)}
                  placeholder="اسم الشخص الذي سيحمل المبلغ..."
                />
              </div>

              {/* العمولة */}
              <div className="form-group">
                <label className="label">عمولة التحويل — اختياري</label>
                <PriceInput
                  value={creditorCommission}
                  onChange={setCreditorCommission}
                  currency={commissionCurrency}
                  onCurrencyChange={(cur) => setCommissionCurrency(cur as any)}
                />
              </div>

              <div style={{ display: "flex", gap: "0.75rem" }}>
                <button
                  type="button"
                  disabled={loadingAction || !selectedCreditor || !Number(creditorAmount)}
                  onClick={handlePayCreditor}
                  style={{
                    flex: 1,
                    padding: "0.8rem",
                    background: "linear-gradient(135deg, #8b5cf6, #7c3aed)",
                    border: "none",
                    borderRadius: "10px",
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: "0.95rem",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    opacity: loadingAction || !selectedCreditor || !Number(creditorAmount) ? 0.5 : 1,
                    transition: "opacity 0.15s",
                  }}
                >
                  {loadingAction ? "جاري التسديد..." : "✓ تأكيد التسديد"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowPayCreditorModal(false)}
                  style={{
                    padding: "0.8rem 1.25rem",
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "10px",
                    color: "rgba(255,255,255,0.6)",
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
