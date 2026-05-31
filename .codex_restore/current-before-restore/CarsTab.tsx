import { useEffect, useMemo, useRef, useState } from "react";
import { buildCarInvokeArgs, callTauri } from "../api/tauri";
import type { Car, CarFormState } from "../types";
import { carNetProfit, carProfitPercentage, formatIqd, formatNumber } from "../utils/finance";
import { cleanAndNormalizeNumbers } from "../utils/numberInput";
import { CarFormPanel } from "./CarFormPanel";

interface CarsTabProps {
  cars: Car[];
  onRefresh: () => Promise<void>;
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
  | "selling"
  | "status";

const SORT_LABELS: Record<CarSortKey, string> = {
  model: "نوع السيارة",
  year: "سنة الصنع",
  color: "اللون",
  number: "رقم السيارة",
  chassis: "رقم الشاصي",
  purchase: "سعر الشراء",
  selling: "سعر البيع",
  status: "الحالة",
};

type CarsTabId = "available" | "sold_cash" | "sold_installment";
const CARS_TABS: { id: CarsTabId; label: string }[] = [
  { id: "available", label: "المتوفر" },
  { id: "sold_cash", label: "كاش" },
  { id: "sold_installment", label: "غير نقدي" },
];

const emptyForm = (): CarFormState => ({
  num: "", province: "", chassis: "",
  model: "", year: "", name: "",
  color: "", details: "",
  purchase: "", selling: "",
  status: "متوفرة", paymentType: "كاش",
  amountPaid: "", amountRemaining: "", installmentMonths: "1",
  buyerName: "", phone: "", purchaseDate: "", saleDate: "", deliveryDate: "", firstPaymentDate: "",
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
  };
}

async function syncCustomerDebtFromCarSale(form: CarFormState) {
  if (form.status !== "مبيوعة" || form.paymentType === "كاش") return;

  const buyerName = form.buyerName.trim();
  if (!buyerName) return;

  const selling = Number(form.selling) || 0;
  const amountPaid = Number(form.amountPaid) || 0;
  const amountRemaining = Number(form.amountRemaining) || Math.max(0, selling - amountPaid);

  await callTauri("sync_customer_debt_from_car_sale", {
    buyerName,
    phone: form.phone.trim(),
    carLabel: form.name || form.model || form.num || "سيارة",
    paymentType: form.paymentType,
    amountPaid,
    amountRemaining,
    installmentMonths: Math.max(1, Number(form.installmentMonths) || 1),
    saleDate: form.saleDate || new Date().toISOString().slice(0, 10),
    deliveryDate: form.deliveryDate || null,
    firstPaymentDate: form.firstPaymentDate || null,
  });
}

export function CarsTab({ cars, onRefresh }: CarsTabProps) {
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
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const [isFormModified, setIsFormModified] = useState(false);

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
        : carsTab === "sold_cash" ? car.status === "مبيوعة" && car.payment_type === "كاش"
        : car.status === "مبيوعة" && (car.payment_type === "موعد" || car.payment_type === "اقساط");
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
          : a.status;
        const bv = sortConfig.key === "model" ? (b.car_model || b.car_name)
          : sortConfig.key === "year" ? (b.car_year ?? "")
          : sortConfig.key === "color" ? (b.color ?? "")
          : sortConfig.key === "number" ? (b.car_plate_num ?? b.car_number)
          : sortConfig.key === "chassis" ? (b.chassis_number ?? "")
          : b.status;
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
    setIsFormModified(false);
  };

  /* سيارة جديدة */
  const startNewCar = () => {
    setSelectedId(null);
    replaceForm(emptyForm());
    setPanelMode("new");
  };

  const closePanel = () => {
    setSelectedId(null);
    replaceForm(emptyForm());
    setPanelMode(null);
  };

  const patchForm = (patch: Partial<CarFormState>) => {
    setIsFormModified(true);
    return setForm(() => {
      const normalized: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(patch)) {
        normalized[key] = typeof val === "string" ? cleanAndNormalizeNumbers(val) : val;
      }
      const next = { ...formRef.current, ...normalized } as CarFormState;
      if ("model" in patch || "year" in patch) {
        next.name = [next.model, next.year].filter(Boolean).join(" ");
      }
      if ((next.paymentType === "اقساط" || next.paymentType === "موعد") && ("selling" in patch || "amountPaid" in patch || "paymentType" in patch)) {
        next.amountRemaining = String(Math.max(0, Number(next.selling) - Number(next.amountPaid)));
      }
      formRef.current = next;
      return next;
    });
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
    if (!form.province) {
      showToast("يرجى اختيار المحافظة");
      return;
    }
    const purchaseNum = Number(form.purchase);
    if (!purchaseNum) {
      showToast("يرجى إدخال سعر شراء صحيح");
      return;
    }
    if (form.status === "مبيوعة") {
      const sellingNum = Number(form.selling);
      const amountPaidNum = Number(form.amountPaid);
      if (!sellingNum) {
        showToast("يرجى إدخال سعر بيع صحيح");
        return;
      }
      if (!amountPaidNum) {
        showToast("يرجى إدخال المبلغ المستلم صحيح");
        return;
      }
    }
    setSaving(true);
    try {
      await callTauri("add_car", buildCarInvokeArgs(form));

      // ═══════════════════════════════════════════════
      //  Automation Pipeline — يُشتغل مرة واحدة فقط عند
      //  أول مرة تُباع فيها السيارة (status transition)
      // ═══════════════════════════════════════════════
      if (form.status === "مبيوعة" && form.paymentType !== "كاش") {
        await syncCustomerDebtFromCarSale(form);
      }

      if (panelMode === "new") {
        setSelectedId(form.num.trim());
        setPanelMode("edit");
      } else {
        closePanel();
      }
      setCarsTab(
        form.status === "متوفرة" ? "available"
        : form.paymentType === "كاش" ? "sold_cash"
        : "sold_installment",
      );
      await onRefresh();
    } catch (err) {
      console.error(err);
      showToast("تعذر حفظ السيارة — تحقق من البيانات");
    } finally {
      setSaving(false);
    }
  };

  const confirmDiscardChanges = (save: boolean) => {
    setShowUnsavedModal(false);
    if (save) {
      // المستخدم سيضغط على حفظ — نوجهه إلى الحفظ, لكن في هذا السياق
      // نغلق النافذة بعد الحفظ. التطبيق الحالي يحفظ بشكل صريح عبر زر الحفظ.
    }
    closePanel();
    setIsFormModified(false);
  };

  const handleClosePanel = () => {
    if (isFormModified) {
      setShowUnsavedModal(true);
    } else {
      closePanel();
    }
  };

  /* ── Esc key ── */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showDeleteModal || showUnsavedModal) {
          setShowDeleteModal(false);
          setShowUnsavedModal(false);
          return;
        }
        if (panelMode !== null) {
          if (isFormModified) {
            setShowUnsavedModal(true);
          } else {
            closePanel();
          }
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [panelMode, isFormModified, showDeleteModal, showUnsavedModal]);

  const executeTableDelete = async () => {
    if (!carToDelete) return;
    setSaving(true);
    try {
      await callTauri("delete_car", { num: carToDelete.car_number });
      setShowDeleteModal(false);
      setCarToDelete(null);
      showToast("تم حذف السيارة بنجاح");
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
    <div className="cars-page">
      {toast && <div className="toast" role="status">{toast}</div>}

      {/* ── تبويبات الحالة ── */}
      <div className="cars-tabs">
        {CARS_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`cars-tab cars-tab--${tab.id} ${carsTab === tab.id ? "cars-tab--active" : ""}`}
            onClick={() => setCarsTab(tab.id)}
          >
            {tab.label}
            <span className="cars-tab__count">
              {tab.id === "available"
                ? cars.filter((c) => c.status === "متوفرة").length
                : tab.id === "sold_cash"
                  ? cars.filter((c) => c.status === "مبيوعة" && c.payment_type === "كاش").length
                  : cars.filter((c) => c.status === "مبيوعة" && (c.payment_type === "موعد" || c.payment_type === "اقساط")).length}
            </span>
          </button>
        ))}
      </div>

      {/* ── شريط الأدوات ── */}
      <div className="cars-page__toolbar">
        <div className="cars-page__toolbar-start">
          <span className="cars-page__count">{filteredCars.length} سيارة</span>
        </div>
        <div className="toolbar-controls">
          <button type="button" className="btn btn--primary" onClick={startNewCar}>
            + سيارة جديدة
          </button>
          <input
            className="input input--search"
            type="search"
            placeholder="بحث..."
            value={search}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* ── التخطيط الرئيسي ── */}
      <div className="cars-layout">

        {/* جدول السيارات */}
        <div className="cars-list-panel">
          {filteredCars.length === 0 ? (
            <div className="cars-empty">
              <p>لا توجد سيارات مطابقة</p>
              <button type="button" className="btn btn--primary" onClick={startNewCar}>
                إضافة أول سيارة
              </button>
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
                    <th className="ct-status">{renderSortHeader("status")}</th>
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
                        <td className="ct-price">{formatIqd(car.purchase_price)}</td>
                        <td className="ct-price">
                          {isSold ? (
                            <>
                              <div>{formatIqd(car.selling_price)}</div>
                              <div className="ct-profit text-green">
                                +{formatNumber(profit)} ({carProfitPercentage(car)}%)
                              </div>
                            </>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td className="ct-status">
                          <span className={`badge ${isSold ? "badge--sold" : "badge--available"}`}>
                            {car.status}
                          </span>
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

      {panelMode !== null && (
        <div className="modal-overlay modal-overlay--soft" role="presentation" onClick={handleClosePanel}>
          <div
            className="modal-dialog modal-dialog--wide modal-dialog--car"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <CarFormPanel
              form={form}
              isEditing={isEditing}
              saving={saving}
              onChange={patchForm}
              onSubmit={handleSubmit}
              onClose={handleClosePanel}
            />
          </div>
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
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => { setShowDeleteModal(false); setCarToDelete(null); }}
                disabled={saving}
              >
                إلغاء
              </button>
              <button
                type="button"
                className="btn btn--danger-solid"
                onClick={() => void executeTableDelete()}
                disabled={saving}
              >
                {saving ? "جاري الحذف..." : "تأكيد الحذف"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* نافذة تنبيه حفظ التعديلات */}
      {showUnsavedModal && (
        <div className="modal-overlay" role="presentation" onClick={() => setShowUnsavedModal(false)}>
          <div
            className="modal-dialog"
            role="alertdialog"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="modal-dialog__title">تعديلات غير محفوظة</h3>
            <p className="modal-dialog__message">
              لقد قمت بإجراء تعديلات على البيانات. هل تريد حفظ التعديلات أو عدم حفظ التعديلات؟
            </p>
            <div className="modal-dialog__actions">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setShowUnsavedModal(false)}
              >
                إلغاء
              </button>
              <button
                type="button"
                className="btn btn--danger"
                onClick={() => confirmDiscardChanges(false)}
              >
                عدم حفظ التعديلات
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => confirmDiscardChanges(true)}
              >
                حفظ التعديلات
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
