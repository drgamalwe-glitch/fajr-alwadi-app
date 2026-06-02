import { useEffect, useState } from "react";
import type { Car, Partner, CashRegisterEntry } from "../types";
import { callTauri } from "../api/tauri";
import { computeDashboardStats } from "../utils/finance";
import { PriceDisplay } from "@/components/ui";

interface DashboardProps {
  cars: Car[];
  partners?: Partner[];
}

export function Dashboard({ cars, partners = [] }: DashboardProps) {
  const stats = computeDashboardStats(cars, partners);
  const [safeEntries, setSafeEntries] = useState<CashRegisterEntry[]>([]);
  const [masterEntries, setMasterEntries] = useState<CashRegisterEntry[]>([]);
  const [bankEntries, setBankEntries] = useState<CashRegisterEntry[]>([]);
  const [investorsTotals, setInvestorsTotals] = useState<[number, number]>([0, 0]);

  useEffect(() => {
    void callTauri<CashRegisterEntry[]>("get_cash_register_entries", { paymentType: "قاصه" })
      .then((data) => setSafeEntries(data ?? []))
      .catch(() => setSafeEntries([]));

    void callTauri<CashRegisterEntry[]>("get_cash_register_entries", { paymentType: "ماستر" })
      .then((data) => setMasterEntries(data ?? []))
      .catch(() => setMasterEntries([]));

    void callTauri<CashRegisterEntry[]>("get_cash_register_entries", { paymentType: "مصرف" })
      .then((data) => setBankEntries(data ?? []))
      .catch(() => setBankEntries([]));

    void callTauri<[number, number]>("get_investors_totals")
      .then((data) => setInvestorsTotals(data ?? [0, 0]))
      .catch(() => setInvestorsTotals([0, 0]));
  }, []);

  const computeIqdBalance = (list: CashRegisterEntry[]) =>
    list.length > 0 ? list.filter((e) => e.currency !== "USD").reduce((sum, e) => sum + e.amount, 0) : 0;

  const computeUsdBalance = (list: CashRegisterEntry[]) =>
    list.length > 0 ? list.filter((e) => e.currency === "USD").reduce((sum, e) => sum + e.amount, 0) : 0;

  const safeIqd = computeIqdBalance(safeEntries);
  const safeUsd = computeUsdBalance(safeEntries);
  const masterIqd = computeIqdBalance(masterEntries);
  const masterUsd = computeUsdBalance(masterEntries);
  const bankIqd = computeIqdBalance(bankEntries);
  const bankUsd = computeUsdBalance(bankEntries);

  const [investorsIqd, investorsUsd] = investorsTotals;
  const partnersIqd = safeIqd + masterIqd + bankIqd - investorsIqd;
  const partnersUsd = safeUsd + masterUsd + bankUsd - investorsUsd;

  // Commented out unused variables to satisfy TypeScript compiler (TS6133)
  // const netIqd = Math.round(iqdBalance + stats.iqdInventory - stats.investorsTotal);
  // const netUsd = Math.round(usdBalance + stats.usdInventory);

  // const expensesIqd = entries
  //   .filter(e => e.type_ === "مصروف" && e.currency !== "USD")
  //   .reduce((sum, e) => sum + Math.abs(e.amount), 0);
  // const expensesUsd = entries
  //   .filter(e => e.type_ === "مصروف" && e.currency === "USD")
  //   .reduce((sum, e) => sum + Math.abs(e.amount), 0);

  // const debtCars = cars.filter(c => c.status === "مبيوعة" && (c.payment_type === "موعد" || c.payment_type === "اقساط"));
  // const debtIqd = debtCars
  //   .filter(c => c.sale_currency !== "USD")
  //   .reduce((sum, c) => sum + (c.amount_remaining ?? 0), 0);
  // const debtUsd = debtCars
  //   .filter(c => c.sale_currency === "USD")
  //   .reduce((sum, c) => sum + (c.amount_remaining ?? 0), 0);

  type CardColor = "gold" | "purple" | "green" | "cyan" | "amber" | "default";

  const colorThemes: Record<CardColor, {
    cardBg: string; cardBorder: string; cardShadow: string;
    titleColor: string; titleShadow: string;
    svgStroke: string; svgCircle2: string;
    subBg: string; subColor: string; subBorder: string; subShadow: string;
    labelColor: string;
  }> = {
    gold: {
      cardBg: "linear-gradient(145deg, rgba(212,175,55,0.22), rgba(255,215,0,0.10), rgba(180,140,30,0.18))",
      cardBorder: "1.5px solid rgba(212,175,55,0.45)",
      cardShadow: "0 0 32px rgba(212,175,55,0.18), 0 4px 24px rgba(212,175,55,0.12), inset 0 1px 0 rgba(255,255,255,0.08)",
      titleColor: "#f0d060", titleShadow: "0 0 12px rgba(212,175,55,0.5)",
      svgStroke: "rgba(212,175,55,0.35)", svgCircle2: "rgba(212,175,55,0.7)",
      subBg: "linear-gradient(135deg, rgba(212,175,55,0.28), rgba(255,215,0,0.12))",
      subColor: "#f0d060", subBorder: "1px solid rgba(212,175,55,0.4)", subShadow: "0 0 20px rgba(212,175,55,0.15)",
      labelColor: "rgba(212,175,55,0.75)",
    },
    purple: {
      cardBg: "linear-gradient(145deg, rgba(147,51,234,0.22), rgba(168,85,247,0.10), rgba(109,40,217,0.18))",
      cardBorder: "1.5px solid rgba(147,51,234,0.45)",
      cardShadow: "0 0 32px rgba(147,51,234,0.18), 0 4px 24px rgba(147,51,234,0.12), inset 0 1px 0 rgba(255,255,255,0.08)",
      titleColor: "#d8b4fe", titleShadow: "0 0 12px rgba(147,51,234,0.5)",
      svgStroke: "rgba(147,51,234,0.35)", svgCircle2: "rgba(168,85,247,0.7)",
      subBg: "linear-gradient(135deg, rgba(147,51,234,0.28), rgba(168,85,247,0.12))",
      subColor: "#d8b4fe", subBorder: "1px solid rgba(147,51,234,0.4)", subShadow: "0 0 20px rgba(147,51,234,0.15)",
      labelColor: "rgba(168,85,247,0.75)",
    },
    green: {
      cardBg: "linear-gradient(145deg, rgba(34,197,94,0.20), rgba(74,222,128,0.10), rgba(22,163,74,0.16))",
      cardBorder: "1.5px solid rgba(34,197,94,0.45)",
      cardShadow: "0 0 32px rgba(34,197,94,0.18), 0 4px 24px rgba(34,197,94,0.12), inset 0 1px 0 rgba(255,255,255,0.08)",
      titleColor: "#86efac", titleShadow: "0 0 12px rgba(34,197,94,0.5)",
      svgStroke: "rgba(34,197,94,0.35)", svgCircle2: "rgba(74,222,128,0.7)",
      subBg: "linear-gradient(135deg, rgba(34,197,94,0.28), rgba(74,222,128,0.12))",
      subColor: "#86efac", subBorder: "1px solid rgba(34,197,94,0.4)", subShadow: "0 0 20px rgba(34,197,94,0.15)",
      labelColor: "rgba(74,222,128,0.75)",
    },
    cyan: {
      cardBg: "linear-gradient(145deg, rgba(6,182,212,0.22), rgba(34,211,238,0.10), rgba(8,145,178,0.18))",
      cardBorder: "1.5px solid rgba(6,182,212,0.45)",
      cardShadow: "0 0 32px rgba(6,182,212,0.18), 0 4px 24px rgba(6,182,212,0.12), inset 0 1px 0 rgba(255,255,255,0.08)",
      titleColor: "#67e8f9", titleShadow: "0 0 12px rgba(6,182,212,0.5)",
      svgStroke: "rgba(6,182,212,0.35)", svgCircle2: "rgba(34,211,238,0.7)",
      subBg: "linear-gradient(135deg, rgba(6,182,212,0.28), rgba(34,211,238,0.12))",
      subColor: "#67e8f9", subBorder: "1px solid rgba(6,182,212,0.4)", subShadow: "0 0 20px rgba(6,182,212,0.15)",
      labelColor: "rgba(34,211,238,0.75)",
    },
    amber: {
      cardBg: "linear-gradient(145deg, rgba(245,158,11,0.22), rgba(251,191,36,0.10), rgba(217,119,6,0.18))",
      cardBorder: "1.5px solid rgba(245,158,11,0.45)",
      cardShadow: "0 0 32px rgba(245,158,11,0.18), 0 4px 24px rgba(245,158,11,0.12), inset 0 1px 0 rgba(255,255,255,0.08)",
      titleColor: "#fcd34d", titleShadow: "0 0 12px rgba(245,158,11,0.5)",
      svgStroke: "rgba(245,158,11,0.35)", svgCircle2: "rgba(245,158,11,0.7)",
      subBg: "linear-gradient(135deg, rgba(245,158,11,0.28), rgba(251,191,36,0.12))",
      subColor: "#fcd34d", subBorder: "1px solid rgba(245,158,11,0.4)", subShadow: "0 0 20px rgba(245,158,11,0.15)",
      labelColor: "rgba(251,191,36,0.75)",
    },
    default: {
      cardBg: "", cardBorder: "", cardShadow: "",
      titleColor: "", titleShadow: "",
      svgStroke: "rgba(255,255,255,0.15)", svgCircle2: "rgba(16,185,129,0.5)",
      subBg: "linear-gradient(135deg, rgba(216,168,90,0.18), rgba(216,168,90,0.08))",
      subColor: "#d8a85a", subBorder: "1px solid rgba(216,168,90,0.2)", subShadow: "0 0 15px rgba(216,168,90,0.08)",
      labelColor: "rgba(216,168,90,0.6)",
    },
  };

  function StatCard({ title, iqdValue, usdValue, wide, color = "default" }: { title: string; iqdValue: number; usdValue: number; wide?: boolean; color?: CardColor }) {
    const boxStyle = wide ? { padding: "0.75rem 1.5rem", minWidth: "200px" } : { padding: "0.75rem 1rem", minWidth: "0" };
    const theme = colorThemes[color];
    const isColored = color !== "default";
    const usdTheme = color === "default" ? {
      bg: "linear-gradient(135deg, rgba(16,185,129,0.18), rgba(16,185,129,0.08))",
      color: "#10b981", border: "1px solid rgba(16,185,129,0.2)", shadow: "0 0 15px rgba(16,185,129,0.08)",
      label: "rgba(16,185,129,0.6)",
    } : {
      bg: theme.subBg, color: theme.subColor, border: theme.subBorder, shadow: theme.subShadow, label: theme.labelColor,
    };
    return (
      <article className="stat-card" style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "0",
        padding: "1.5rem 2rem",
        position: "relative",
        ...(isColored ? {
          background: theme.cardBg,
          border: theme.cardBorder,
          boxShadow: theme.cardShadow,
          backdropFilter: "blur(12px)",
        } : {}),
      }}>
        <h3 className="stat-label" style={{
          fontSize: "1.35rem",
          fontWeight: 700,
          letterSpacing: "0.5px",
          marginBottom: 0,
          ...(isColored ? { color: theme.titleColor, textShadow: theme.titleShadow } : {}),
        }}>{title}</h3>
        <svg viewBox="0 0 100 36" style={{ width: "180px", height: "36px", margin: "4px 0 6px 0" }}>
          <path d="M 50 0 L 50 12 Q 50 17, 25 17 L 18 34 M 50 12 Q 50 17, 75 17 L 82 34"
                stroke={theme.svgStroke} strokeWidth="1.5" fill="none" strokeLinecap="round" />
          <circle cx="18" cy="34" r="2" fill="rgba(216,168,90,0.5)" />
          <circle cx="82" cy="34" r="2" fill={theme.svgCircle2} />
        </svg>
        <div style={{ display: "flex", gap: "1rem", width: "100%", justifyContent: "center" }}>
          <div style={{
            flex: "1 1 0",
            background: theme.subBg,
            borderRadius: "12px",
            ...boxStyle,
            direction: "ltr",
            textAlign: "center",
            fontWeight: 800,
            fontSize: "1.3rem",
            color: theme.subColor,
            border: theme.subBorder,
            boxShadow: theme.subShadow,
          }}>
            <div style={{ fontSize: "0.75rem", fontWeight: 400, color: theme.labelColor, marginBottom: "4px", direction: "rtl" }}>الدينار العراقي</div>
            <PriceDisplay amount={iqdValue} />
          </div>
          <div style={{
            flex: "1 1 0",
            background: usdTheme.bg,
            borderRadius: "12px",
            ...boxStyle,
            direction: "ltr",
            textAlign: "center",
            fontWeight: 800,
            fontSize: "1.3rem",
            color: usdTheme.color,
            border: usdTheme.border,
            boxShadow: usdTheme.shadow,
          }}>
            <div style={{ fontSize: "0.75rem", fontWeight: 400, color: usdTheme.label, marginBottom: "4px", direction: "rtl" }}>الدولار الامريكي</div>
            <PriceDisplay amount={usdValue} currency="USD" />
          </div>
        </div>
      </article>
    );
  }

  return (
    <div className="dashboard">
      <div className="page-intro">
        <h2 className="page-intro__title">شركة فجر الوادي لتجارة السيارات</h2>
        <p className="page-intro__desc">بإدارة سيد منتصر الحيدري وامير الزجراوي</p>
      </div>

      <div className="dash-section">
        <div className="dash-section__title">الملخص المالي</div>
        <div className="stats-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          <StatCard title="القاصة" iqdValue={safeIqd} usdValue={safeUsd} wide color="gold" />
          <StatCard title="الماستر" iqdValue={masterIqd} usdValue={masterUsd} wide color="purple" />
          <StatCard title="المصرف" iqdValue={bankIqd} usdValue={bankUsd} wide color="green" />
          <StatCard title="المعرض" iqdValue={stats.iqdInventory} usdValue={stats.usdInventory} wide color="cyan" />
          <StatCard title="الشركاء" iqdValue={partnersIqd} usdValue={partnersUsd} wide color="amber" />
        </div>
      </div>
    </div>
  );
}
