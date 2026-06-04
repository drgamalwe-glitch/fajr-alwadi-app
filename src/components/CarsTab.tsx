import { useEffect, useMemo, useRef, useState } from "react";
import { buildCarInvokeArgs, callTauri } from "../api/tauri";
import type { Car, CarFormState, PartnerTransaction } from "../types";
import { carNetProfit, carProfitPercentage } from "../utils/finance";
import { cleanAndNormalizeNumbers } from "../utils/numberInput";
import { todayIsoDate } from "../utils/dateSegments";
import { CarFormPanel } from "./CarFormPanel";
import { ActionButton, PriceDisplay, TextInput } from "@/components/ui";

interface CarsTabProps {
  cars: Car[];
  onRefresh: () => Promise<void>;
  carFormTrigger: { mode: "new" | "edit"; car?: Car } | null;
  onClearCarFormTrigger: () => void;
}

/** وضع اللوحة الجانبية */
type PanelMode = "edit" | "new";
type CarSortKey =
  | "model"
  | "year"
  | "color"
  | "number"
  | "chassis"
  | "purchase"
  | "selling";

const SORT_LABELS: Record<CarSortKey, string> = {
  model: "نوع السيارة",
  year: "سنة الصنع",
  color: "اللون",
  number: "رقم السيارة",
  chassis: "رقم الشاصي",
  purchase: "سعر الشراء",
  selling: "سعر البيع",
};

type CarsTabId = "available" | "sold";
const CARS_TABS: { id: CarsTabId; label: string }[] = [
  { id: "available", label: "المعروض" },
  { id: "sold", label: "المبــــــــــــــــــاع" },
];

const emptyForm = (): CarFormState => ({
  num: "", province: "", chassis: "",
  model: "", year: "", name: "",
  color: "", details: "",
  purchase: "", selling: "",
  status: "متوفرة", paymentType: "كاش",
  amountPaid: "", amountRemaining: "", installmentMonths: "1",
  buyerName: "", phone: "", purchaseDate: "", saleDate: "", deliveryDate: "", firstPaymentDate: "",
  currency: "IQD",
  saleCurrency: "IQD",
  purchasePaymentType: "قاصه",
  salePaymentType: "قاصه",
  purchaseType: "كاش",
  financerName: "",
  commissionType: "لا يوجد",
  commissionValue: "",
  carPartners: [],
});

function carToForm(car: Car): CarFormState {
  return {
    num: car.car_plate_num ?? car.car_number,
    province: car.car_province ?? "",
    chassis: car.chassis_number ?? "",
    model: car.car_model ?? "",
    year: car.car_year ?? "",
    name: car.car_name,
    color: car.color ?? "",
    details: car.details ?? "",
    purchase: String(car.purchase_price ?? 0),
    selling: String(car.selling_price ?? 0),
    status: car.status,
    paymentType: car.payment_type ?? "كاش",
    amountPaid: String(car.amount_paid ?? car.cash_price ?? 0),
    amountRemaining: String(car.amount_remaining ?? 0),
    installmentMonths: String(car.installment_months ?? 1),
    buyerName: car.buyer_name ?? "",
    phone: car.buyer_phone ?? "",
    purchaseDate: car.purchase_date ?? "",
    saleDate: car.sale_date ?? "",
    deliveryDate: car.delivery_date ?? "",
    firstPaymentDate: car.first_payment_date ?? "",
    currency: (car.currency as "IQD" | "USD") ?? "IQD",
    saleCurrency: (car.sale_currency as "IQD" | "USD") ?? "IQD",
    purchasePaymentType: (car.purchase_payment_type === "ماستر" ? "ماستر" : "قاصه"),
    salePaymentType: (car.sale_payment_type === "ماستر" ? "ماستر" : "قاصه"),
    purchaseType: car.purchase_type === "دين" ? "تمويل" : ((car.purchase_type as any) ?? "كاش"),
    financerName: car.financer_name ?? "",
    commissionType: (car.commission_type as any) ?? "لا يوجد",
    commissionValue: String(car.commission_value ?? 0),
    carPartners: (car.car_partners ?? []).map((p) => ({
      partner_name: p.partner_name,
      amount: String(p.amount),
      currency: (p.currency as "IQD" | "USD") ?? "IQD",
      kind: p.kind ?? "شريك",
    })),
  };
}

export function CarsTab({
  cars,
  onRefresh,
  carFormTrigger,
  onClearCarFormTrigger,
}: CarsTabProps) {
  const [form, setForm] = useState<CarFormState>(emptyForm);
  const formRef = useRef<CarFormState>(emptyForm());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelMode, setPanelMode] = useState<PanelMode | null>(null);
  const [search, setSearch] = useState("");
  const [carsTab, setCarsTab] = useState<CarsTabId>("available");
  const [sortConfig, setSortConfig] = useState<{ key: CarSortKey; direction: "asc" | "desc" } | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [carToDelete, setCarToDelete] = useState<Car | null>(null);

  const availableCarsList = useMemo(() => cars.filter((c) => c.status === "متوفرة"), [cars]);
  const purchaseIqd = useMemo(() => availableCarsList.filter((c) => c.currency !== "USD").reduce((sum, c) => sum + c.purchase_price, 0), [availableCarsList]);
  const purchaseUsd = useMemo(() => availableCarsList.filter((c) => c.currency === "USD").reduce((sum, c) => sum + c.purchase_price, 0), [availableCarsList]);

  const replaceForm = (next: CarFormState) => {
    formRef.current = next;
    setForm(next);
  };

  const isEditing = panelMode === "edit";

  /* ── فلترة وترتيب ── */
  const filteredCars = useMemo(() => {
    const q = search.trim().toLowerCase();
    let result = cars.filter((car) => {
      const matchesStatus =
        carsTab === "available" ? car.status === "متوفرة"
        : car.status === "مبيوعة";
      const matchesSearch =
        !q ||
        car.car_number.toLowerCase().includes(q) ||
        car.car_name.toLowerCase().includes(q) ||
        (car.car_model ?? "").toLowerCase().includes(q) ||
        (car.car_year ?? "").includes(q) ||
        (car.chassis_number ?? "").toLowerCase().includes(q) ||
        (car.color ?? "").toLowerCase().includes(q) ||
        (car.car_province ?? "").toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });

    if (sortConfig) {
      const sign = sortConfig.direction === "asc" ? 1 : -1;
      result = [...result].sort((a, b) => {
        if (sortConfig.key === "purchase") return (a.purchase_price - b.purchase_price) * sign;
        if (sortConfig.key === "selling") return (a.selling_price - b.selling_price) * sign;
        const av = sortConfig.key === "model" ? (a.car_model || a.car_name)
          : sortConfig.key === "year" ? (a.car_year ?? "")
          : sortConfig.key === "color" ? (a.color ?? "")
          : sortConfig.key === "number" ? (a.car_plate_num ?? a.car_number)
          : sortConfig.key === "chassis" ? (a.chassis_number ?? "")
          : "";
        const bv = sortConfig.key === "model" ? (b.car_model || b.car_name)
          : sortConfig.key === "year" ? (b.car_year ?? "")
          : sortConfig.key === "color" ? (b.color ?? "")
          : sortConfig.key === "number" ? (b.car_plate_num ?? b.car_number)
          : sortConfig.key === "chassis" ? (b.chassis_number ?? "")
          : "";
        return String(av).localeCompare(String(bv), "ar", { numeric: true }) * sign;
      });
    }
    return result;
  }, [cars, search, carsTab, sortConfig]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const showToast = (msg: string) => setToast(msg);

  /* نقرة واحدة → تعديل مباشر */
  const handleSingleClick = (car: Car) => {
    setSelectedId(car.car_number);
    replaceForm(carToForm(car));
    setPanelMode("edit");
  };

  /* سيارة جديدة */
  const startNewCar = () => {
    setSelectedId(null);
    replaceForm({ ...emptyForm(), purchaseDate: todayIsoDate() });
    setPanelMode("new");
  };

  const closePanel = () => {
    setSelectedId(null);
    replaceForm(emptyForm());
    setPanelMode(null);
  };

  useEffect(() => {
    if (!carFormTrigger) return;
    if (carFormTrigger.mode === "new") {
      startNewCar();
    } else if (carFormTrigger.mode === "edit" && carFormTrigger.car) {
      handleSingleClick(carFormTrigger.car);
    }
    onClearCarFormTrigger();
  }, [carFormTrigger]);

  const patchForm = (patch: Partial<CarFormState>) => {
    const normalized: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(patch)) {
      normalized[key] = typeof val === "string" ? cleanAndNormalizeNumbers(val) : val;
    }
    const next = { ...formRef.current, ...normalized } as CarFormState;
    if ("model" in patch || "year" in patch) {
      next.name = [next.model, next.year].filter(Boolean).join(" ");
    }
    if (next.paymentType === "كاش") {
      next.amountPaid = next.selling;
      next.amountRemaining = "0";
      next.installmentMonths = "1";
    } else {
      if ("selling" in patch || "amountPaid" in patch || "paymentType" in patch) {
        next.amountRemaining = String(Math.max(0, Number(next.selling) - Number(next.amountPaid)));
      }
    }
    formRef.current = next;
    setForm(next);
  };

  const toggleSort = (key: CarSortKey) => {
    setSortConfig((prev) => ({
      key,
      direction: prev?.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  const renderSortHeader = (key: CarSortKey) => (
    <button type="button" className="th-sort-btn" onClick={() => toggleSort(key)}>
      <span>{SORT_LABELS[key]}</span>
      <span className="th-sort-indicator" aria-hidden>
        {sortConfig?.key === key ? (sortConfig.direction === "asc" ? "↑" : "↓") : "↕"}
      </span>
    </button>
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.num.trim() || !form.model.trim()) {
      showToast("يرجى إدخال رقم اللوحة والموديل");
      return;
    }
    const purchaseNum = Number(form.purchase);
    if (!purchaseNum) {
      showToast("يرجى إدخال سعر شراء صحيح");
      return;
    }
    if (form.status === "مبيوعة") {
      const sellingNum = Number(form.selling);
      if (!sellingNum) {
        showToast("يرجى إدخال سعر بيع صحيح");
        return;
      }
      if (form.paymentType !== "كاش") {
        const amountPaidNum = Number(form.amountPaid);
        if (isNaN(amountPaidNum) || amountPaidNum < 0) {
          showToast("يرجى إدخال المقدمة المستلمة بشكل صحيح");
          return;
        }
      }
    }

    // 🔍 تحديد ما إذا كانت هذه عملية بيع جديدة — منع تكرار الأقساط
    const isNewSale = (() => {
      if (panelMode === "new") return form.status === "مبيوعة";
      const originalCar = cars.find((c) => c.car_number === selectedId);
      return originalCar?.status === "متوفرة" && form.status === "مبيوعة";
    })();

    setSaving(true);
    try {
      // تحديد السيارة الأصلية قبل التعديل
      const originalCar = cars.find((c) => c.car_number === selectedId);
      // هل كانت السيارة مبيوعة أصلاً قبل هذا التعديل
      const wasSold = originalCar?.status === "مبيوعة";
      // هل تحولت السيارة من متوفرة إلى مبيوعة الآن → بيع جديد
      const isSaleOnly = isEditing && wasSold;

      // أرسل بيانات السيارة للحفظ
      const carArgs = buildCarInvokeArgs(form);

      // عند تعديل سيارة مبيوعة → احتفظ بتاريخ الشراء الأصلي ولا تتغيره
      if (isSaleOnly && originalCar) {
        carArgs.purchaseDate = originalCar.purchase_date ?? carArgs.purchaseDate;
      }

      await callTauri("add_car", carArgs);

      // تَمَّتْ مَنَاقَلَةُ عَمَلِيَّةِ تَوْزِيعِ الأَرْبَاحِ إِلَى خَلْفِيَّةِ الرُّسْتِ لِتَكُونَ تِلْقَائِيَّةً وَآَمِنَةً.

      // ═══════════════════════════════════════════════
      //  Automation Pipeline — يُشتغل مرة واحدة فقط عند
      //  أول مرة تُباع فيها السيارة (status transition)
      // ═══════════════════════════════════════════════
      // لا تُسجّل حركة بيع جديدة إذا كانت السيارة مبيوعة أصلاً (isSaleOnly)
      if (isNewSale && !isSaleOnly && form.status === "مبيوعة" && form.paymentType !== "كاش") {
        const buyerName = form.buyerName.trim();
        const phone = form.phone.trim();
        const carLabel = form.name || form.model || "سيارة";

        if (buyerName) {
          // 1. إنشاء/تحديث ديون العميل
          const partnerKind = "مقترض";
          await callTauri("add_partner", { name: buyerName, phone, kind: partnerKind });

          // 2. تسديد الدفعة المستلمة (نسجل فقط الدفعة المسددة بالـ "إيداع")
          const amountPaidNum = Number(form.amountPaid);
          if (amountPaidNum > 0) {
            // إيداع (التسديد الفعلي للدفعة)
            await callTauri("add_partner_transaction", {
              partnerName: buyerName,
              kind: partnerKind,
              type: "ايداع",
              amount: amountPaidNum,
              date: form.saleDate || new Date().toISOString().slice(0, 10),
              notes: `دفعة أولى مستلمة - بيع ${carLabel}`,
              currency: form.saleCurrency,
            });
          }

          // 3. المبلغ المتبقي
          const remaining = Number(form.amountRemaining);
          if (remaining > 0) {
            // 🛡️ التحقق الأمني: نتأكد من عدم وجود معاملات سابقة لهذه البيعة
            const existingTxns = await callTauri<PartnerTransaction[]>(
              "get_partner_transactions",
              { partnerName: buyerName, kind: partnerKind },
            );
            const saleLabel = `- ${carLabel}`;
            const alreadyLinked = existingTxns?.some((tx) => tx.notes?.includes(saleLabel));
            if (!alreadyLinked) {
              if (form.paymentType === "اقساط") {
                // CASE A: أقساط — تقسيم على الأشهر
                const months = Math.max(1, Number(form.installmentMonths) || 1);
                const perMonth = Math.floor(remaining / months);
                const remainder = remaining - perMonth * months;
                const baseDate = form.firstPaymentDate || form.saleDate || new Date().toISOString().slice(0, 10);

                for (let i = 0; i < months; i++) {
                  const d = new Date(baseDate);
                  d.setMonth(d.getMonth() + i);
                  const amount = i === months - 1 ? perMonth + remainder : perMonth;

                  await callTauri("add_partner_transaction", {
                    partnerName: buyerName,
                    kind: partnerKind,
                    type: "سحب",
                    amount,
                    date: d.toISOString().slice(0, 10),
                    notes: `قسط ${i + 1}/${months}${saleLabel}`,
                    currency: form.saleCurrency,
                  });
                }
              } else if (form.paymentType === "موعد") {
                // CASE B: موعد تسليم — قيد واحد
                const dueDate = form.deliveryDate || form.saleDate || new Date().toISOString().slice(0, 10);
                await callTauri("add_partner_transaction", {
                  partnerName: buyerName,
                  kind: partnerKind,
                  type: "سحب",
                  amount: remaining,
                  date: dueDate,
                  notes: `موعد تسليم${saleLabel}`,
                  currency: form.saleCurrency,
                });
              }
            }
          }
        }
      }

      closePanel();
      setCarsTab(
        form.status === "متوفرة" ? "available" : "sold",
      );
      await onRefresh();
    } catch (err) {
      console.error(err);
      showToast("تعذر حفظ السيارة — تحقق من البيانات");
    } finally {
      setSaving(false);
    }
  };

  const handleClosePanel = () => {
    closePanel();
  };

  /* ── Esc key ── */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showDeleteModal) {
          setShowDeleteModal(false);
          return;
        }
        if (panelMode !== null) {
          closePanel();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [panelMode, showDeleteModal]);

  const executeTableDelete = async () => {
    if (!carToDelete) return;
    setSaving(true);
    try {
      await callTauri("delete_car", { num: carToDelete.car_number });
      setShowDeleteModal(false);
      setCarToDelete(null);
      if (selectedId === carToDelete.car_number) {
        closePanel();
      }
      await onRefresh();
    } catch (err) {
      console.error(err);
      showToast("تعذر حذف السيارة — حاول مرة أخرى");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="cars-page" style={{ position: "relative", display: "flex", flexDirection: "column", gap: "1.25rem", flex: 1, minHeight: 0, height: "100%", overflow: "hidden" }}>
      {toast && <div className="toast" role="status">{toast}</div>}

      {/* ── شريط الأدوات (دائماً ظاهر) ── */}
      <div className="cars-page__toolbar">
        <div className="cars-page__toolbar-right" style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          {/* تبويبات الحالة */}
          <div className="cars-tabs">
            {CARS_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`cars-tab cars-tab--${tab.id} ${carsTab === tab.id ? "cars-tab--active" : ""}`}
                onClick={() => {
                  if (panelMode !== null) {
                    closePanel();
                  }
                  setCarsTab(tab.id);
                }}
              >
                {tab.label}
                <span className="cars-tab__count">
                  {cars.filter((c) => tab.id === "available" ? c.status === "متوفرة" : c.status === "مبيوعة").length}
                </span>
              </button>
            ))}
          </div>

          <ActionButton type="button" variant="primary" className="btn-new-car" onClick={startNewCar}>
            + شراء سيارة جديدة
          </ActionButton>
        </div>
        <div className="cars-page__toolbar-center">
          <TextInput
            type="search"
            placeholder="بحث عن سيارة..."
            value={search}
            inputSize="sm"
            onFocus={() => {
              if (panelMode !== null) {
                closePanel();
              }
            }}
            onChange={(e) => {
              if (panelMode !== null) {
                closePanel();
              }
              setSearch(e.target.value);
            }}
            containerClassName="min-w-[300px] w-full max-w-[420px]"
          />
        </div>
        <div className="cars-page__toolbar-left" style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          {carsTab === "available" && panelMode === null && (
            <>
              <div className="summary-card-premium summary-card-premium--iqd">
                <div className="summary-card-premium__label">مجموع المعرض بالدينار</div>
                <PriceDisplay amount={purchaseIqd} />
              </div>
              <div className="summary-card-premium summary-card-premium--usd">
                <div className="summary-card-premium__label">مجموع المعرض بالدولار</div>
                <PriceDisplay amount={purchaseUsd} currency="USD" />
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── المحتوى الرئيسي (جدول أو نموذج) ── */}
      {panelMode === null ? (
        <div
          key="list-view"
          style={{ 
            position: "relative"
          }}
        >
          {/* ── التخطيط الرئيسي ── */}
          <div className="cars-layout">
            {/* جدول السيارات */}
            <div className="cars-list-panel">
              {filteredCars.length === 0 ? (
                <div className="cars-empty">
                  <p>لا توجد سيارات مطابقة</p>
                </div>
              ) : (
                <div className="table-wrapper">
                  <table className="data-table cars-data-table">
                    <thead>
                      <tr>
                        <th className="ct-model">{renderSortHeader("model")}</th>
                        <th className="ct-year">{renderSortHeader("year")}</th>
                        <th className="ct-color">{renderSortHeader("color")}</th>
                        <th className="ct-num">{renderSortHeader("number")}</th>
                        <th className="ct-chassis">{renderSortHeader("chassis")}</th>
                        <th className="ct-price">{renderSortHeader("purchase")}</th>
                        <th className="ct-price">{renderSortHeader("selling")}</th>
                        <th className="ct-profit" colSpan={2}>الأرباح</th>
                        <th className="ct-delete">حذف</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCars.map((car) => {
                        const profit = carNetProfit(car);
                        const isSold = car.status === "مبيوعة";
                        const isSelected = selectedId === car.car_number;

                        return (
                          <tr
                            key={car.car_number}
                            className={`cars-tr${isSelected ? " cars-tr--selected" : ""}`}
                            onClick={() => handleSingleClick(car)}
                            title="اضغط لعرض التفاصيل"
                          >
                            <td className="ct-model cell-bold">
                              {car.car_model || car.car_name || "—"}
                            </td>
                            <td className="ct-year">{car.car_year || "—"}</td>
                            <td className="ct-color">{car.color || "—"}</td>
                            <td className="ct-num cell-bold">
                              <span className="ct-plate">{car.car_plate_num ?? car.car_number}</span>
                              {car.car_province && (
                                <span className="ct-province">{car.car_province}</span>
                              )}
                            </td>
                            <td className="ct-chassis">{car.chassis_number || "—"}</td>
                            <td className="ct-price" style={{ color: car.currency === "USD" ? "#10b981" : "#d8a85a" }}>
                              <PriceDisplay amount={car.purchase_price} currency={car.currency} />
                            </td>
                            <td className="ct-price" style={{ color: car.sale_currency === "USD" ? "#10b981" : "#d8a85a" }}>
                              {isSold ? (
                                <div><PriceDisplay amount={car.selling_price} currency={car.sale_currency} /></div>
                              ) : (
                                <span className="text-muted">—</span>
                              )}
                            </td>
                            <td className="ct-profit">
                              {isSold ? <span><PriceDisplay amount={profit} currency={car.sale_currency} /></span> : <span className="text-muted">—</span>}
                            </td>
                            <td className="ct-profit-pct">
                              {isSold ? <span className="text-green">({carProfitPercentage(car)}%)</span> : <span className="text-muted">—</span>}
                            </td>
                            <td className="ct-delete" onClick={(e) => e.stopPropagation()}>
                              <button
                                className="partner-inline-delete-btn"
                                title="حذف السيارة"
                                onClick={() => {
                                  setCarToDelete(car);
                                  setShowDeleteModal(true);
                                }}
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div
          key="form-view"
          style={{ 
            position: "relative",
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            flex: 1
          }}
        >
          <CarFormPanel
            embedMode={true}
            form={form}
            isEditing={isEditing}
            saving={saving}
            onChange={patchForm}
            onSubmit={handleSubmit}
            onClose={handleClosePanel}
          />
        </div>
      )}

      {/* نافذة تأكيد الحذف من الجدول */}
      {showDeleteModal && carToDelete && (
        <div className="modal-overlay" role="presentation" onClick={() => setShowDeleteModal(false)}>
          <div
            className="modal-dialog"
            role="alertdialog"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="modal-dialog__title">تأكيد حذف السيارة</h3>
            <p className="modal-dialog__message">
              هل أنت متأكد من حذف السيارة <strong>{carToDelete.car_name || carToDelete.car_model || carToDelete.car_number}</strong> نهائياً؟
              لا يمكن التراجع عن هذا الإجراء.
            </p>
            <div className="modal-dialog__actions">
              <ActionButton
                type="button"
                variant="ghost"
                onClick={() => { setShowDeleteModal(false); setCarToDelete(null); }}
                disabled={saving}
              >
                إلغاء
              </ActionButton>
              <ActionButton
                type="button"
                variant="danger"
                onClick={() => void executeTableDelete()}
                disabled={saving}
              >
                {saving ? "جاري الحذف..." : "تأكيد الحذف"}
              </ActionButton>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
