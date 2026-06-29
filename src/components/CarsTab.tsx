import { useEffect, useMemo, useRef, useState } from "react";
import { buildCarInvokeArgs, callTauri } from "../api/tauri";
import type { Car, CarExpenseRecord, CarFormState, Partner, PartnerTransaction } from "../types";
import { compareCarNetProfit, carProfitPercentage } from "../utils/finance";
import { cleanAndNormalizeNumbers, normalizePhoneNumber, toEnglishDigits } from "../utils/numberInput";
import { compareMoney, moneyAdd, moneySum } from "../utils/money";
import { todayIsoDate } from "../utils/dateSegments";
import { CarFormPanel } from "./CarFormPanel";
import { ActionButton, PriceDisplay, TextInput, PriceInput } from "@/components/ui";
import { PAGE_SIZE } from "../constants";
import { handlePaginationKeyDown, handlePaginationWheel } from "../utils/pagination";
import { GoldFxButton } from "./ui/GoldFxButton";
import { SearchableCombobox } from "./SearchableCombobox";
import { QuickAddPartnerModal } from "./QuickAddPartnerModal";
import { toChassisText } from "../utils/keyboardLayout";
import { YearScrollField } from "./YearScrollField";

interface CarsTabProps {
  cars: Car[];
  partners: Partner[];
  onRefresh: () => Promise<void>;
  carFormTrigger: { mode: "new" | "edit"; car?: Car; initialPage?: 0 | 1 } | null;
  onClearCarFormTrigger: () => void;
  searchOpen?: boolean;
  onSearchClose?: () => void;
  onAddCarChange?: (onAddCar: { action: () => void } | null) => void;
  onAddBatchCarChange?: (onAddBatchCar: { action: () => void } | null) => void;
  onCarFormActionsChange?: (actions: { onSave: () => void; onCancel: () => void; disabled?: boolean } | null) => void;
  onFormDirtyChange?: (isDirty: boolean) => void;
  requestCloseRef?: React.MutableRefObject<{ request: (afterClose?: () => void) => void } | null>;
  initialSubTab?: "available" | "sold" | null;
  onInitialSubTabSet?: () => void;
  onSubTabChange?: (tab: "available" | "sold") => void;
  returnState?: { section: string; subTab?: string } | null;
  onReturn?: () => void;
  onNavigateToPartner?: (name: string, kind?: string) => void;
}

/** وضع اللوحة الجانبية */
type PanelMode = "edit" | "new" | "batch";
type CarSortKey =
  | "model"
  | "year"
  | "color"
  | "number"
  | "chassis"
  | "purchase"
  | "selling"
  | "profit";

const SORT_LABELS: Record<CarSortKey, string> = {
  model: "نوع السيارة",
  year: "الموديل",
  color: "اللون",
  number: "رقم السيارة",
  chassis: "رقم الشاصي",
  purchase: "اجمالي التكلفة",
  selling: "سعر البيع",
  profit: "الأرباح",
};

type CarsTabId = "available" | "sold";
const CARS_TABS: { id: CarsTabId; label: string }[] = [
  { id: "available", label: "المعروض" },
  { id: "sold", label: "المبــــــــــــــــــاع" },
];

const emptyForm = (): CarFormState => ({
  num: "", chassis: "",
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
});

function carToForm(car: Car): CarFormState {
  return {
    num: car.car_plate_num ?? car.car_number,
    oldNum: car.car_number,
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
    phone: normalizePhoneNumber(car.buyer_phone ?? ""),
    purchaseDate: car.purchase_date ?? "",
    saleDate: car.sale_date ?? "",
    deliveryDate: car.delivery_date ?? "",
    firstPaymentDate: car.first_payment_date ?? "",
    currency: (car.currency as "IQD" | "USD") ?? "IQD",
    saleCurrency: (car.sale_currency as "IQD" | "USD") ?? "IQD",
    purchasePaymentType: "قاصه",
    salePaymentType: "قاصه",
    purchaseType: car.purchase_type === "تمويل" || car.purchase_type === "شركة" || car.purchase_type === "دين"
      ? (car.purchase_type === "دين" ? "تمويل" : car.purchase_type)
      : "كاش",
    financerName: car.financer_name ?? "",
    commissionType: (car.commission_type as CarFormState["commissionType"]) ?? "لا يوجد",
    commissionValue: String(car.commission_value ?? 0),
  };
}

export function CarsTab({
  cars,
  partners,
  onRefresh,
  carFormTrigger,
  onClearCarFormTrigger,
  searchOpen = false,
  onSearchClose,
  onAddCarChange,
  onAddBatchCarChange,
  onCarFormActionsChange,
  onFormDirtyChange,
  requestCloseRef,
  initialSubTab,
  onInitialSubTabSet,
  onSubTabChange,
  returnState,
  onReturn,
  onNavigateToPartner,
}: CarsTabProps) {
  const [form, setForm] = useState<CarFormState>(emptyForm);
  const formRef = useRef<CarFormState>(emptyForm());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelMode, setPanelMode] = useState<PanelMode | null>(null);
  const [isCarFormValid, setIsCarFormValid] = useState(false);
  const [initialFormPage, setInitialFormPage] = useState<0 | 1>(0);
  const [receivedInstallmentsTotal, setReceivedInstallmentsTotal] = useState(0);
  const [receivedInstallmentsCount, setReceivedInstallmentsCount] = useState(0);
  const [saleFieldsLocked, setSaleFieldsLocked] = useState(false);
  const [salePaymentContextLoading, setSalePaymentContextLoading] = useState(false);

  const onFormDirtyChangeRef = useRef(onFormDirtyChange);
  onFormDirtyChangeRef.current = onFormDirtyChange;

  const onInitialSubTabSetRef = useRef(onInitialSubTabSet);
  onInitialSubTabSetRef.current = onInitialSubTabSet;

  const onAddCarChangeRef = useRef(onAddCarChange);
  onAddCarChangeRef.current = onAddCarChange;

  const onAddBatchCarChangeRef = useRef(onAddBatchCarChange);
  onAddBatchCarChangeRef.current = onAddBatchCarChange;

  // Batch Car states
  interface BatchCarRow {
    model: string;
    year: string;
    color: string;
    purchase: string;
    currency: "IQD" | "USD";
    purchaseType: "كاش" | "تمويل" | "شركة";
    financerName: string;
    num: string;
    chassis: string;
  }
  const [batchRows, setBatchRows] = useState<BatchCarRow[]>([]);
  const [batchDirty, setBatchDirty] = useState(false);
  const [batchSaving, setBatchSaving] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const [showBatchCountModal, setShowBatchCountModal] = useState(false);
  const [batchCountDraft, setBatchCountDraft] = useState(10);

  // Duplicate detection state
  interface BatchDuplicateConflict {
    rowIdx: number;
    rowNum: string;
    rowChassis: string;
    conflictType: "num" | "chassis" | "both";
    conflictWith: string; // description of the conflicting source
  }
  const [showBatchDuplicateModal, setShowBatchDuplicateModal] = useState(false);
  const [batchDuplicateConflicts, setBatchDuplicateConflicts] = useState<BatchDuplicateConflict[]>([]);
  const [pendingBatchRowsAfterDupeCheck, setPendingBatchRowsAfterDupeCheck] = useState<BatchCarRow[]>([]);
  // نافذة الإضافة السريعة للممول / الشركة في نموذج المجموعة
  const [quickAddKindBatch, setQuickAddKindBatch] = useState<"ممول" | "شركة" | null>(null);

  const handleRow1Change = (patch: Partial<BatchCarRow>) => {
    setBatchRows((prev) => {
      return prev.map((row, idx) => {
        return {
          ...row,
          ...patch,
          num: idx === 0 ? (patch.num !== undefined ? patch.num : row.num) : row.num,
          chassis: idx === 0 ? (patch.chassis !== undefined ? patch.chassis : row.chassis) : row.chassis,
        };
      });
    });
  };

  const handleRowNChange = (idx: number, patch: Partial<Pick<BatchCarRow, "num" | "chassis">>) => {
    setBatchRows((prev) => {
      return prev.map((row, i) => {
        if (i === idx) {
          return { ...row, ...patch };
        }
        return row;
      });
    });
  };

  const createEmptyBatchRows = (count: number) =>
    Array.from({ length: count }, () => ({
      model: "",
      year: "",
      color: "",
      purchase: "",
      currency: "IQD" as const,
      purchaseType: "كاش" as const,
      financerName: "",
      num: "",
      chassis: "",
    }));

  const openBatchCountModal = () => {
    setBatchCountDraft(10);
    setShowBatchCountModal(true);
  };

  const startNewBatch = (count = batchCountDraft) => {
    const safeCount = Math.max(1, Math.min(1000, Number(count) || 10));
    setBatchRows(
      createEmptyBatchRows(safeCount)
    );
    setBatchDirty(false);
    setShowBatchCountModal(false);
    setPanelMode("batch");
  };

  const rowToFormState = (row: BatchCarRow, purchaseDate: string): CarFormState => ({
    num: row.num,
    chassis: row.chassis,
    model: row.model,
    year: row.year,
    name: [row.model, row.year].filter(Boolean).join(" "),
    color: row.color,
    details: "",
    purchase: row.purchase,
    selling: "",
    status: "متوفرة",
    paymentType: "كاش",
    amountPaid: "",
    amountRemaining: "",
    installmentMonths: "1",
    buyerName: "",
    phone: "",
    purchaseDate,
    saleDate: "",
    deliveryDate: "",
    firstPaymentDate: "",
    currency: row.currency,
    saleCurrency: "IQD",
    purchasePaymentType: "قاصه",
    salePaymentType: "قاصه",
    purchaseType: row.purchaseType,
    financerName: row.financerName,
    commissionType: "لا يوجد",
    commissionValue: "",
  });

  const [search, setSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchHighlightIdx, setSearchHighlightIdx] = useState(0);
  const [carsTab, setCarsTab] = useState<CarsTabId>("available");

  useEffect(() => {
    onSubTabChange?.(carsTab);
  }, [carsTab, onSubTabChange]);

  const [duplicateNumIndexes, setDuplicateNumIndexes] = useState<Set<number>>(new Set());
  const [duplicateChassisIndexes, setDuplicateChassisIndexes] = useState<Set<number>>(new Set());
  const [isBatchFormValid, setIsBatchFormValid] = useState(false);

  useEffect(() => {
    if (panelMode !== "batch") return;

    const dupNums = new Set<number>();
    const dupChassis = new Set<number>();

    const seenNums = new Map<string, number>();
    const seenChassis = new Map<string, number>();

    batchRows.forEach((row, idx) => {
      const num = row.num.trim().toUpperCase();
      const chassis = row.chassis.trim().toUpperCase();

      if (num) {
        if (seenNums.has(num)) {
          dupNums.add(idx);
          dupNums.add(seenNums.get(num)!);
        } else {
          seenNums.set(num, idx);
        }

        const existingByNum = cars.find(c =>
          c.car_number.trim().toUpperCase() === num ||
          (c.car_plate_num ?? "").trim().toUpperCase() === num
        );
        if (existingByNum) {
          dupNums.add(idx);
        }
      }

      if (chassis) {
        if (seenChassis.has(chassis)) {
          dupChassis.add(idx);
          dupChassis.add(seenChassis.get(chassis)!);
        } else {
          seenChassis.set(chassis, idx);
        }

        const existingByChassis = cars.find(c =>
          (c.chassis_number ?? "").trim().toUpperCase() === chassis
        );
        if (existingByChassis) {
          dupChassis.add(idx);
        }
      }
    });

    setDuplicateNumIndexes(dupNums);
    setDuplicateChassisIndexes(dupChassis);

    const allValid = batchRows.every((row, idx) => {
      const hasFields = !!row.model.trim() &&
        !!row.year.trim() &&
        !!row.color.trim() &&
        row.purchase !== "" &&
        Number(row.purchase) > 0 &&
        !!row.num.trim() &&
        !!row.chassis.trim();

      if (!hasFields) return false;

      if (idx === 0 && (row.purchaseType === "تمويل" || row.purchaseType === "شركة")) {
        if (!row.financerName.trim()) return false;
      }

      return true;
    });

    setIsBatchFormValid(allValid && dupNums.size === 0 && dupChassis.size === 0);
  }, [batchRows, cars, panelMode]);

  const [sortConfig, setSortConfig] = useState<{ key: CarSortKey; direction: "asc" | "desc" } | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [carToDelete, setCarToDelete] = useState<Car | null>(null);
  const [showSaleConfirm, setShowSaleConfirm] = useState(false);
  const [pendingSaleData, setPendingSaleData] = useState<CarFormState | null>(null);
  const [page, setPage] = useState(0);
  const lastAvailableClickRef = useRef(0);
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);
  const initialFormRef = useRef<CarFormState | null>(null);
  const pendingAfterCloseRef = useRef<(() => void) | null>(null);
  const [expenseDirty, setExpenseDirty] = useState(false);

  const availableCarsList = useMemo(() => cars.filter((c) => c.status === "متوفرة"), [cars]);
  // Fixed: inventory totals use Decimal and include car expenses without counting sold cars.
  const purchaseIqd = useMemo(() => moneySum(availableCarsList.filter((c) => c.currency !== "USD"), (c) => moneyAdd(c.purchase_price, c.expenses_sum || 0)), [availableCarsList]);
  const purchaseUsd = useMemo(() => moneySum(availableCarsList.filter((c) => c.currency === "USD"), (c) => moneyAdd(c.purchase_price, c.expenses_sum || 0)), [availableCarsList]);

  const soldCarsList = useMemo(() => cars.filter((c) => c.status === "مبيوعة"), [cars]);
  const salesIqd = useMemo(() => moneySum(soldCarsList.filter((c) => c.sale_currency !== "USD"), (c) => c.selling_price || 0), [soldCarsList]);
  const salesUsd = useMemo(() => moneySum(soldCarsList.filter((c) => c.sale_currency === "USD"), (c) => c.selling_price || 0), [soldCarsList]);

  const replaceForm = (next: CarFormState) => {
    formRef.current = next;
    setForm(next);
  };

  const isEditing = panelMode === "edit";

  const hasFormChanges = useMemo(() => {
    if (panelMode === "batch") return batchDirty;
    if (!initialFormRef.current || !panelMode) return false;
    const a = JSON.stringify(initialFormRef.current);
    const b = JSON.stringify(formRef.current);
    return a !== b || expenseDirty;
  }, [form, panelMode, expenseDirty, batchDirty]);

  const hasFormChangesRef = useRef(hasFormChanges);
  hasFormChangesRef.current = hasFormChanges;

  useEffect(() => {
    onFormDirtyChangeRef.current?.(hasFormChanges);
  }, [hasFormChanges]);

  useEffect(() => {
    if (initialSubTab) {
      setCarsTab(initialSubTab);
      onInitialSubTabSetRef.current?.();
    }
  }, [initialSubTab]);

  /* ── فلترة وترتيب ── */
  const filteredCars = useMemo(() => {
    const q = toEnglishDigits(search.trim()).toLowerCase();
    let result = cars.filter((car) => {
      const matchesStatus =
        q !== ""
          ? true
          : carsTab === "available"
          ? car.status === "متوفرة"
          : car.status === "مبيوعة";
      const matchesSearch =
        !q ||
        car.car_number.toLowerCase().includes(q) ||
        car.car_name.toLowerCase().includes(q) ||
        (car.car_plate_num ?? "").toLowerCase().includes(q) ||
        (car.car_model ?? "").toLowerCase().includes(q) ||
        (car.car_year ?? "").toLowerCase().includes(q) ||
        (car.chassis_number ?? "").toLowerCase().includes(q) ||
        (car.color ?? "").toLowerCase().includes(q) ||
        (car.buyer_name ?? "").toLowerCase().includes(q) ||
        (car.buyer_phone ?? "").toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });

    if (sortConfig) {
      const sign = sortConfig.direction === "asc" ? 1 : -1;
      result = [...result].sort((a, b) => {
        if (sortConfig.key === "purchase") {
          const totalA = moneyAdd(a.purchase_price, a.expenses_sum || 0);
          const totalB = moneyAdd(b.purchase_price, b.expenses_sum || 0);
          return compareMoney(totalA, totalB) * sign;
        }
        if (sortConfig.key === "selling") return compareMoney(a.selling_price, b.selling_price) * sign;
        if (sortConfig.key === "profit") return compareCarNetProfit(a, b) * sign;
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
    const lastPage = Math.max(0, Math.ceil(filteredCars.length / PAGE_SIZE) - 1);
    setPage(lastPage);
  }, [filteredCars.length, search, carsTab]);

  const totalPages = Math.max(1, Math.ceil(filteredCars.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);

  const pageEntries = useMemo(
    () => filteredCars.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE),
    [filteredCars, currentPage]
  );

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const showToast = (msg: string) => setToast(msg);

  /* نقرة واحدة → تعديل مباشر */
  const loadSalePaymentContext = async (car: Car, baseForm: CarFormState) => {
    const isDeferredSale = car.status === "مبيوعة" && (car.payment_type === "اقساط" || car.payment_type === "موعد");
    if (!isDeferredSale || !car.buyer_name?.trim()) {
      setReceivedInstallmentsTotal(0);
      setReceivedInstallmentsCount(0);
      setSaleFieldsLocked(false);
      setSalePaymentContextLoading(false);
      return;
    }

    setSalePaymentContextLoading(true);
    try {
      const txs = await callTauri<PartnerTransaction[]>("get_partner_transactions", {
        partnerName: car.buyer_name.trim(),
        kind: "زبون",
      });
      const activeTxs = (txs || []).filter((tx) => Number(tx.is_reversed ?? 0) === 0);
      const isForCar = (tx: PartnerTransaction) =>
        tx.related_source_id === car.car_number ||
        (tx.source_id ?? "").startsWith(`${car.car_number}:`) ||
        (tx.notes ?? "").includes(`#بيع_سيارة_${car.car_number}`);
      const downPayment = activeTxs
        .filter((tx) =>
          tx.source_type === "customer_sale_payment" &&
          tx.source_role === "sale_down_payment" &&
          isForCar(tx)
        )
        .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
      const paymentRows = activeTxs.filter((tx) =>
        tx.source_type === "customer_payment" &&
        tx.source_role === "customer_payment" &&
        isForCar(tx) &&
        ((tx.type_ ?? "").includes("قسط") || (tx.notes ?? "").includes("قسط#"))
      );
      const paidScheduleRows = activeTxs.filter((tx) =>
        tx.source_type === "customer_installment_schedule" &&
        tx.source_role === "installment_schedule" &&
        (tx.type_ ?? "").startsWith("واصل") &&
        (tx.source_id ?? "").startsWith(`${car.car_number}:installment:`)
      );
      const paidTotal = paymentRows.length > 0
        ? paymentRows.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0)
        : paidScheduleRows.reduce((sum, tx) => sum + (Number(tx.actual_paid_amount ?? tx.amount) || 0), 0);
      const paidCount = paymentRows.length > 0 ? paymentRows.length : paidScheduleRows.length;
      const adjustedForm = {
        ...baseForm,
        amountPaid: String(downPayment || 0),
        amountRemaining: String(Math.max(0, Number(baseForm.selling) - (downPayment || 0) - paidTotal)),
      };

      if (selectedId === car.car_number || formRef.current.oldNum === car.car_number || formRef.current.num === car.car_number) {
        setReceivedInstallmentsTotal(paidTotal);
        setReceivedInstallmentsCount(paidCount);
        setSaleFieldsLocked(paidCount > 0);
        replaceForm(adjustedForm);
        initialFormRef.current = JSON.parse(JSON.stringify(adjustedForm));
      }
    } catch (err) {
      console.error("فشل تحميل حالة دفعات السيارة:", err);
      setReceivedInstallmentsTotal(0);
      setReceivedInstallmentsCount(0);
      setSaleFieldsLocked(false);
    } finally {
      setSalePaymentContextLoading(false);
    }
  };

  const handleSingleClick = (car: Car, initialPage: 0 | 1 = 0) => {
    const newForm = carToForm(car);
    setSelectedId(car.car_number);
    const isSoldCar = car.status === "مبيوعة" || (car.buyer_name && car.buyer_name.trim() !== "");
    setInitialFormPage(isSoldCar ? initialPage : 0);
    setReceivedInstallmentsTotal(0);
    setReceivedInstallmentsCount(0);
    setSaleFieldsLocked(false);
    replaceForm(newForm);
    initialFormRef.current = JSON.parse(JSON.stringify(newForm));
    setExpenseDirty(false);
    setPanelMode("edit");
    void loadSalePaymentContext(car, newForm);
  };

  /* سيارة جديدة */
  const startNewCar = () => {
    const newForm = { ...emptyForm(), purchaseDate: todayIsoDate() };
    setSelectedId(null);
    setInitialFormPage(0);
    setReceivedInstallmentsTotal(0);
    setReceivedInstallmentsCount(0);
    setSaleFieldsLocked(false);
    setSalePaymentContextLoading(false);
    replaceForm(newForm);
    initialFormRef.current = JSON.parse(JSON.stringify(newForm));
    setExpenseDirty(false);
    setPanelMode("new");
  };

  const closePanel = () => {
    setSelectedId(null);
    setInitialFormPage(0);
    setReceivedInstallmentsTotal(0);
    setReceivedInstallmentsCount(0);
    setSaleFieldsLocked(false);
    setSalePaymentContextLoading(false);
    replaceForm(emptyForm());
    initialFormRef.current = null;
    setExpenseDirty(false);
    setPanelMode(null);
  };

  const handleUnsavedSave = () => {
    setShowUnsavedConfirm(false);
    const formEl = document.getElementById("car-form") as HTMLFormElement | null;
    if (formEl) {
      formEl.requestSubmit();
    } else {
      closePanel();
      pendingAfterCloseRef.current?.();
      pendingAfterCloseRef.current = null;
    }
  };

  const handleUnsavedDiscard = () => {
    closePanel();
    setShowUnsavedConfirm(false);
    pendingAfterCloseRef.current?.();
    pendingAfterCloseRef.current = null;
  };

  const tryClosePanel = () => {
    if (hasFormChangesRef.current && panelMode !== null) {
      setShowUnsavedConfirm(true);
    } else {
      closePanel();
    }
  };

  useEffect(() => {
    if (!requestCloseRef) return;
    requestCloseRef.current = {
      request: (afterClose?: () => void) => {
        if (hasFormChangesRef.current && panelMode !== null) {
          pendingAfterCloseRef.current = afterClose ?? null;
          setShowUnsavedConfirm(true);
        } else {
          closePanel();
          afterClose?.();
        }
      },
    };
    return () => { requestCloseRef.current = null; };
  });

  useEffect(() => {
    if (!carFormTrigger) return;
    if (carFormTrigger.mode === "new") {
      startNewCar();
    } else if (carFormTrigger.mode === "edit" && carFormTrigger.car) {
      handleSingleClick(carFormTrigger.car, carFormTrigger.initialPage ?? 0);
    }
    onClearCarFormTrigger();
  }, [carFormTrigger]);

  useEffect(() => {
    onAddCarChangeRef.current?.({ action: startNewCar });
    onAddBatchCarChangeRef.current?.({ action: openBatchCountModal });
    return () => {
      onAddCarChangeRef.current?.(null);
      onAddBatchCarChangeRef.current?.(null);
    };
  }, []);

  useEffect(() => {
    if (panelMode !== null) {
      onCarFormActionsChange?.({
        onSave: () => {
          if (panelMode === "batch") {
            const formEl = document.getElementById("batch-car-form") as HTMLFormElement;
            if (formEl) {
              formEl.requestSubmit();
            }
          } else {
            const formEl = document.getElementById("car-form") as HTMLFormElement;
            if (formEl) {
              formEl.requestSubmit();
            }
          }
        },
        onCancel: () => {
          handleClosePanel();
        },
        disabled: panelMode === "batch" ? !isBatchFormValid : !isCarFormValid || salePaymentContextLoading,
      });
    } else {
      onCarFormActionsChange?.(null);
    }
    return () => {
      onCarFormActionsChange?.(null);
    };
  }, [panelMode, onCarFormActionsChange, isCarFormValid, isBatchFormValid]);

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
        const received = next.paymentType === "اقساط" || next.paymentType === "موعد"
          ? receivedInstallmentsTotal
          : 0;
        next.amountRemaining = String(Math.max(0, Number(next.selling) - Number(next.amountPaid) - received));
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
      {sortConfig?.key === key && <span className="th-sort-arrow">▲</span>}
    </button>
  );

  const getUnpaidInstallmentMonths = (formData: CarFormState) =>
    Math.max(1, (Number(formData.installmentMonths) || 1) - receivedInstallmentsCount);


  /** Check if sold-car sale fields changed — triggers update_sold_car_with_accounting */
  function hasSoldCarSaleAccountingChange(originalCar: Car | undefined, formData: CarFormState): boolean {
    if (!originalCar || originalCar.status !== "مبيوعة") return false;
    if (formData.status !== "مبيوعة") return false;
    return (
      Math.abs(Number(originalCar.selling_price) - Number(formData.selling)) > 0.001
      || (originalCar.sale_currency ?? "IQD") !== (formData.saleCurrency || "IQD")
      || (originalCar.payment_type ?? "") !== formData.paymentType
      || Math.abs(Number(originalCar.amount_paid ?? 0) - Number(formData.amountPaid ?? 0)) > 0.001
      || Math.abs(Number(originalCar.amount_remaining ?? 0) - Number(formData.amountRemaining ?? 0)) > 0.001
      || Number(originalCar.installment_months ?? 1) !== Number(formData.installmentMonths ?? 1) + 0
      || Math.abs(Number(originalCar.monthly_payment ?? 0) - (Number(formData.amountRemaining ?? 0) / getUnpaidInstallmentMonths(formData))) > 0.001
      || (originalCar.buyer_name ?? "") !== formData.buyerName.trim()
      || normalizePhoneNumber(originalCar.buyer_phone ?? "") !== normalizePhoneNumber(formData.phone)
      || (originalCar.sale_date ?? "") !== (formData.saleDate ?? "")
      || (originalCar.delivery_date ?? "") !== (formData.deliveryDate ?? "")
      || (originalCar.first_payment_date ?? "") !== (formData.firstPaymentDate ?? "")
    );
  }

  /** Check if sold-car cost fields changed — forces backend rebuild regardless of skipSaleAccounting */
  function hasSoldCarCostAccountingChange(originalCar: Car | undefined, formData: CarFormState): boolean {
    if (!originalCar || originalCar.status !== "مبيوعة") return false;
    if (formData.status !== "مبيوعة") return false;
    return (
      Math.abs(Number(originalCar.purchase_price) - Number(formData.purchase)) > 0.001
      || (originalCar.currency ?? "IQD") !== (formData.currency || "IQD")
      || (originalCar.purchase_type ?? "") !== (formData.purchaseType ?? "")
      || (originalCar.financer_name ?? "") !== (formData.financerName ?? "")
      || (originalCar.purchase_payment_type ?? "") !== (formData.purchasePaymentType ?? "")
    );
  }

  /** Check if sold-car identity field changed (car_number) */
  function hasSoldCarIdentityChange(originalCar: Car | undefined, formData: CarFormState): boolean {
    if (!originalCar || originalCar.status !== "مبيوعة") return false;
    if (formData.status !== "مبيوعة") return false;
    return (originalCar.car_number ?? "") !== formData.num.trim();
  }

  const handleAutoSave = async () => {
    const data = formRef.current;
    const originalCar = cars.find((c) => c.car_number === selectedId);
    const wasSold = originalCar?.status === "مبيوعة";
    const isNewSoldCar = panelMode === "new" && data.status === "مبيوعة";
    const isNewSaleFromAvailable = panelMode === "edit" && originalCar?.status === "متوفرة" && data.status === "مبيوعة";
    const hasSaleChange = wasSold && isEditing && hasSoldCarSaleAccountingChange(originalCar, data);
    const hasCostChange = wasSold && isEditing && hasSoldCarCostAccountingChange(originalCar, data);
    const hasIdentityChange = wasSold && isEditing && hasSoldCarIdentityChange(originalCar, data);
    const isPureSaleEdit = hasSaleChange && !hasCostChange && !hasIdentityChange;
    const isCostOrIdentityEdit = (hasCostChange || hasIdentityChange) && !hasSaleChange;

    try {
      if (isNewSoldCar) {
        // Atomic: create car + sell in one command
        await callTauri("save_and_sell_car_with_accounting", {
          num: data.num.trim(),
          chassis: data.chassis.trim(),
          model: data.model.trim(),
          year: data.year.trim(),
          name: data.name.trim(),
          color: data.color.trim(),
          details: data.details.trim(),
          purchase: Number(data.purchase) || 0,
          currency: data.currency || "IQD",
          saleCurrency: data.saleCurrency || "IQD",
          selling: Number(data.selling) || 0,
          paymentType: data.paymentType,
          amountPaid: Number(data.amountPaid) || 0,
          amountRemaining: Number(data.amountRemaining) || 0,
          installmentMonths: data.paymentType === "اقساط" ? Number(data.installmentMonths) || 1 : null,
          monthlyPayment: data.paymentType === "اقساط" ? (Number(data.amountRemaining) || 0) / getUnpaidInstallmentMonths(data) : null,
          buyerName: data.buyerName.trim(),
          buyerPhone: normalizePhoneNumber(data.phone),
          purchaseDate: data.purchaseDate || null,
          saleDate: data.saleDate || null,
          deliveryDate: data.deliveryDate || null,
          firstPaymentDate: data.firstPaymentDate || null,
          purchasePaymentType: data.purchasePaymentType,
          purchaseType: data.purchaseType === "تمويل" ? "دين" : (data.purchaseType || "كاش"),
          financerName: data.purchaseType === "تمويل" || data.purchaseType === "شركة" ? data.financerName || null : null,
          commissionType: null,
          commissionValue: null,
        });
      } else if (isPureSaleEdit) {
        // Pure sale field edit (no cost/identity change): use update_sold_car_with_accounting
        await callTauri("update_sold_car_with_accounting", {
          carNumber: data.num,
          buyerName: data.buyerName.trim(),
          buyerPhone: normalizePhoneNumber(data.phone),
          sellingPrice: Number(data.selling) || 0,
          saleCurrency: data.saleCurrency || "IQD",
          saleDate: data.saleDate || todayIsoDate(),
          paymentType: data.paymentType,
          amountPaid: Number(data.amountPaid) || 0,
          amountRemaining: Number(data.amountRemaining) || 0,
          installmentMonths: data.paymentType === "اقساط" ? Number(data.installmentMonths) || 1 : null,
          firstPaymentDate: data.firstPaymentDate || null,
          deliveryDate: data.deliveryDate || null,
          monthlyPayment: data.paymentType === "اقساط" ? (Number(data.amountRemaining) || 0) / getUnpaidInstallmentMonths(data) : null,
        });
      } else if (isCostOrIdentityEdit) {
        // Cost or identity change: go through add_car which supports all purchase fields + oldNum
        const carArgs = buildCarInvokeArgs(data);
        if (originalCar) {
          carArgs.oldNum = originalCar.car_number;
          carArgs.purchaseDate = originalCar.purchase_date ?? carArgs.purchaseDate;
        }
        await callTauri("add_car", { ...carArgs, skipSaleAccounting: true });
      } else if (isNewSaleFromAvailable) {
        // Selling an available car: use sell_car_with_accounting
        await callTauri("sell_car_with_accounting", {
          carNumber: data.num,
          buyerName: data.buyerName.trim(),
          buyerPhone: normalizePhoneNumber(data.phone),
          sellingPrice: Number(data.selling) || 0,
          saleCurrency: data.saleCurrency || "IQD",
          saleDate: data.saleDate || todayIsoDate(),
          paymentType: data.paymentType,
          amountPaid: Number(data.amountPaid) || 0,
          amountRemaining: Number(data.amountRemaining) || 0,
          installmentMonths: data.paymentType === "اقساط" ? Number(data.installmentMonths) || 1 : null,
          firstPaymentDate: data.firstPaymentDate || null,
          deliveryDate: data.deliveryDate || null,
          chassisNumber: data.chassis || null,
        });
      } else if (hasSaleChange && (hasCostChange || hasIdentityChange)) {
        // Mixed edits: sale + cost/identity simultaneously — not safe for a single backend call.
        // user must save sale change separately from cost/identity change.
        setToast("يرجى حفظ تعديل البيع منفصلًا عن تعديل التكلفة أو رقم السيارة");
        setSaving(false);
        return;
      } else {
        // Non-sale edit or new available car: use add_car
        const carArgs = buildCarInvokeArgs(data);
        if (isEditing && wasSold && originalCar) {
          carArgs.oldNum = originalCar.car_number;
          carArgs.purchaseDate = originalCar.purchase_date ?? carArgs.purchaseDate;
        }
        await callTauri("add_car", { ...carArgs, skipSaleAccounting: true });
      }

      await onRefresh();
      if (panelMode === "edit" && data.num !== selectedId) {
        setSelectedId(data.num);
      }
    } catch (err) {
      console.error("فشل الحفظ:", err);
      alert("فشل حفظ السيارة: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  const executeSaleAutomation = async (formData: CarFormState) => {
    // 1. تنظيف البيانات والأسماء تماماً من المسافات الخفية في حقل البيع والمعرض
    const buyerName = formData.buyerName.trim();
    const phone = normalizePhoneNumber(formData.phone);

    if (!buyerName) return;

    try {
      // Use the unified sell_car_with_accounting command for atomic sale workflow
      await callTauri("sell_car_with_accounting", {
        carNumber: formData.num,
        buyerName,
        buyerPhone: phone,
        sellingPrice: Number(formData.selling),
        saleCurrency: formData.saleCurrency || "IQD",
        saleDate: formData.saleDate || todayIsoDate(),
        paymentType: formData.paymentType,
        amountPaid: Number(formData.amountPaid) || 0,
        amountRemaining: Number(formData.amountRemaining) || 0,
        installmentMonths: formData.paymentType === "اقساط" ? Number(formData.installmentMonths) || 1 : null,
        firstPaymentDate: formData.firstPaymentDate || null,
        deliveryDate: formData.deliveryDate || null,
        chassisNumber: formData.chassis || null,
      });
    } catch (saveErr) {
      console.error("فشل إكمال أتمتة البيع والتسجيل التلقائي:", saveErr);
    }
  };

  const handleSaleConfirm = async () => {
    setShowSaleConfirm(false);
    if (pendingSaleData) {
      await executeSaleAutomation(pendingSaleData);
      setPendingSaleData(null);
      await onRefresh();
    }
  };

  const handleSaleCancel = () => {
    setShowSaleConfirm(false);
    setPendingSaleData(null);
  };

  const handlePurchaseAutomation = async (formData: CarFormState, originalCar?: Car) => {
    // Backend add_car now owns all car_purchase accounting (funder, company, cash).
    // This function only handles cleanup when purchase type changes.
    try {
      const currentFinancer = formData.purchaseType === "تمويل" ? formData.financerName.trim() : "";
      const oldFinancer = (originalCar?.purchase_type === "تمويل" || originalCar?.purchase_type === "دين") ? originalCar.financer_name?.trim() : "";
      const oldChassis = originalCar?.chassis_number?.trim();

      const currentCompany = formData.purchaseType === "شركة" ? formData.financerName.trim() : "";
      const oldCompany = originalCar?.purchase_type === "شركة" ? originalCar.financer_name?.trim() : "";

      // 1. If old financer transaction exists and we changed financer or purchase type, delete the old transaction
      if (oldFinancer && oldChassis) {
        const oldTxs = await callTauri<PartnerTransaction[]>(
          "get_partner_transactions",
          { partnerName: oldFinancer, kind: "ممول" }
        );
        const oldTx = oldTxs?.find(tx => tx.notes?.includes(oldChassis));

        if (oldTx) {
          if (formData.purchaseType !== "تمويل" || currentFinancer !== oldFinancer) {
            await callTauri("delete_partner_transaction", {
              id: oldTx.id,
              partnerName: oldFinancer,
              kind: "ممول",
            });
          }
        }
      }

      // 2. If old company transaction exists and we changed company or purchase type, delete the old transaction
      if (oldCompany && oldChassis) {
        const oldTxs = await callTauri<PartnerTransaction[]>(
          "get_partner_transactions",
          { partnerName: oldCompany, kind: "شركة" }
        );
        const oldTx = oldTxs?.find(tx => tx.notes?.includes(oldChassis));

        if (oldTx) {
          if (formData.purchaseType !== "شركة" || currentCompany !== oldCompany) {
            await callTauri("delete_partner_transaction", {
              id: oldTx.id,
              partnerName: oldCompany,
              kind: "شركة",
            });
          }
        }
      }

      // Note: Backend add_car handles creation of new funder/company purchase rows.
      // No duplicate frontend creation needed.

    } catch (err) {
      console.error("فشل إكمال أتمتة تمويل الشراء:", err);
    }
  };

  // Executes the actual saving after duplicate check is resolved
  const executeBatchSave = async (rowsToSave: BatchCarRow[]) => {
    setBatchSaving(true);
    setBatchProgress({ current: 0, total: rowsToSave.length });
    try {
      const purchaseDate = todayIsoDate();
      for (let i = 0; i < rowsToSave.length; i++) {
        setBatchProgress({ current: i + 1, total: rowsToSave.length });
        const row = rowsToSave[i];
        const formState = rowToFormState(row, purchaseDate);
        await callTauri("add_car", buildCarInvokeArgs(formState));
        await handlePurchaseAutomation(formState, undefined);
      }
      showToast(`تم حفظ ${rowsToSave.length} سيارة بنجاح.`);
      closePanel();
      await onRefresh();
    } catch (err) {
      console.error("Failed to save batch:", err);
      showToast("حدث خطأ أثناء حفظ المجموعة.");
    } finally {
      setBatchSaving(false);
    }
  };

  const handleBatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 1. Clear previous error indicators
    const formEl = e.currentTarget as HTMLFormElement;
    formEl.querySelectorAll(".input--error").forEach(el => el.classList.remove("input--error"));
    formEl.classList.remove("form--submitted");

    // 2. Perform validations
    const checks: { id: string; valid: () => boolean }[] = [];

    batchRows.forEach((row, idx) => {
      checks.push(
        { id: `batch-model-${idx}`, valid: () => !!row.model.trim() },
        { id: `batch-year-${idx}`, valid: () => !!row.year.trim() },
        { id: `batch-color-${idx}`, valid: () => !!row.color.trim() },
        { id: `batch-purchase-${idx}`, valid: () => row.purchase !== "" && Number(row.purchase) > 0 },
        { id: `batch-num-${idx}`, valid: () => !!row.num.trim() },
        { id: `batch-chassis-${idx}`, valid: () => !!row.chassis.trim() }
      );
      if (idx === 0 && (row.purchaseType === "تمويل" || row.purchaseType === "شركة")) {
        checks.push({
          id: "batch-financer-0",
          valid: () => !!row.financerName.trim()
        });
      }
    });

    let firstErrorId: string | null = null;
    for (const { id, valid } of checks) {
      if (!valid()) {
        const el = formEl.querySelector<HTMLElement>(`#${id}`);
        el?.classList.add("input--error");
        formEl.classList.add("form--submitted");
        if (!firstErrorId) {
          firstErrorId = id;
          if (id === "batch-financer-0") {
            const input = el?.querySelector<HTMLInputElement>('.combobox-trigger');
            input?.focus();
          } else {
            el?.focus();
          }
        }
      }
    }

    if (firstErrorId) {
      return;
    }

    // 3. Duplicate detection — check within batch rows and against existing cars
    const conflicts: BatchDuplicateConflict[] = [];
    const seenNums = new Map<string, number>(); // num -> first row index
    const seenChassis = new Map<string, number>(); // chassis -> first row index

    batchRows.forEach((row, idx) => {
      const num = row.num.trim().toUpperCase();
      const chassis = row.chassis.trim().toUpperCase();

      let numConflict = "";
      let chassisConflict = "";

      // Check within batch (row vs row)
      if (seenNums.has(num)) {
        numConflict = `الصف ${(seenNums.get(num)! + 1)}`;
      } else {
        seenNums.set(num, idx);
      }

      if (seenChassis.has(chassis)) {
        chassisConflict = `الصف ${(seenChassis.get(chassis)! + 1)}`;
      } else {
        seenChassis.set(chassis, idx);
      }

      // Check against existing cars in DB
      if (!numConflict) {
        const existingByNum = cars.find(c => c.car_number.trim().toUpperCase() === num || (c.car_plate_num ?? "").trim().toUpperCase() === num);
        if (existingByNum) {
          numConflict = `سيارة موجودة (${existingByNum.car_name || existingByNum.car_model || num})`;
        }
      }
      if (!chassisConflict) {
        const existingByChassis = cars.find(c => (c.chassis_number ?? "").trim().toUpperCase() === chassis);
        if (existingByChassis) {
          chassisConflict = `سيارة موجودة (${existingByChassis.car_name || existingByChassis.car_model || chassis})`;
        }
      }

      if (numConflict || chassisConflict) {
        const conflictType: BatchDuplicateConflict["conflictType"] =
          numConflict && chassisConflict ? "both" : numConflict ? "num" : "chassis";
        const conflictWith = [numConflict && `رقم اللوحة: ${numConflict}`, chassisConflict && `رقم الشاصي: ${chassisConflict}`]
          .filter(Boolean).join(" | ");
        conflicts.push({ rowIdx: idx, rowNum: row.num.trim(), rowChassis: row.chassis.trim(), conflictType, conflictWith });
      }
    });

    if (conflicts.length > 0) {
      setBatchDuplicateConflicts(conflicts);
      // Rows that are NOT conflicting
      const conflictIdxs = new Set(conflicts.map(c => c.rowIdx));
      const safeRows = batchRows.filter((_, idx) => !conflictIdxs.has(idx));
      setPendingBatchRowsAfterDupeCheck(safeRows);
      setShowBatchDuplicateModal(true);
      return;
    }

    // 4. No duplicates — save directly
    await executeBatchSave(batchRows);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleAutoSave();
    closePanel();
    pendingAfterCloseRef.current?.();
    pendingAfterCloseRef.current = null;
  };

  const handleClosePanel = () => {
    tryClosePanel();
  };

  /* ── متابعة حالة البحث المنبثق ── */
  useEffect(() => {
    if (searchOpen) {
      // تركيز حقل البحث بعد انتهاء الأنيميشن
      const t = setTimeout(() => searchInputRef.current?.focus(), 120);
      return () => clearTimeout(t);
    } else {
      setSearch("");
    }
  }, [searchOpen]);

  /* ── Esc key ── */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showUnsavedConfirm) {
          setShowUnsavedConfirm(false);
          return;
        }
        if (showDeleteModal) {
          setShowDeleteModal(false);
          return;
        }
        if (searchOpen) {
          onSearchClose?.();
          return;
        }
        if (panelMode !== null) {
          tryClosePanel();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [panelMode, showDeleteModal, searchOpen, showUnsavedConfirm]);

  const executeTableDelete = async () => {
    if (!carToDelete) return;
    setSaving(true);
    try {
      const carNumber = carToDelete.car_number;
      const chassis = carToDelete.chassis_number?.trim();
      const purchaseType = carToDelete.purchase_type;
      const financerName = carToDelete.financer_name?.trim();
      const buyerName = carToDelete.buyer_name?.trim();

      // 1. Delete car expenses
      try {
        const expenses = await callTauri<CarExpenseRecord[]>("get_car_expense_records", { carNumber });
        for (const exp of expenses || []) {
          await callTauri("delete_car_expense_record", { id: exp.id });
        }
      } catch (expErr) {
        console.error("Failed to delete car expenses:", expErr);
      }

      // 2. Delete funder transaction (تمويل)
      if ((purchaseType === "تمويل" || purchaseType === "دين") && financerName && chassis) {
        try {
          const txs = await callTauri<PartnerTransaction[]>(
            "get_partner_transactions",
            { partnerName: financerName, kind: "ممول" }
          );
          const tx = txs?.find(t => t.notes?.includes(chassis));
          if (tx) {
            await callTauri("delete_partner_transaction", {
              id: tx.id,
              partnerName: financerName,
              kind: "ممول",
            });
          }
        } catch (txnErr) {
          console.error("Failed to delete funder transaction on car delete:", txnErr);
        }
      }

      // 3. Delete شركة transaction
      if (purchaseType === "شركة" && financerName && chassis) {
        try {
          const txs = await callTauri<PartnerTransaction[]>(
            "get_partner_transactions",
            { partnerName: financerName, kind: "شركة" }
          );
          const tx = txs?.find(t => t.notes?.includes(chassis));
          if (tx) {
            await callTauri("delete_partner_transaction", {
              id: tx.id,
              partnerName: financerName,
              kind: "شركة",
            });
          }
        } catch (txnErr) {
          console.error("Failed to delete company transaction on car delete:", txnErr);
        }
      }

      // 5. Delete buyer (زبون) transactions related to this car
      if (buyerName && chassis) {
        try {
          const txs = await callTauri<PartnerTransaction[]>(
            "get_partner_transactions",
            { partnerName: buyerName, kind: "زبون" }
          );
          const relatedTxs = txs?.filter(t => t.notes?.includes(chassis) || t.notes?.includes(carNumber)) || [];
          for (const tx of relatedTxs) {
            await callTauri("delete_partner_transaction", {
              id: tx.id,
              partnerName: buyerName,
              kind: "زبون",
            });
          }
        } catch (txnErr) {
          console.error("Failed to delete buyer transactions on car delete:", txnErr);
        }
      }

      // 6. Delete the car itself
      const savedUser = localStorage.getItem("app_current_user");
      const adminName = savedUser ? (JSON.parse(savedUser).display_name || JSON.parse(savedUser).username) : "الإدارة";
      await callTauri("delete_car", { num: carNumber, adminName });

      setShowDeleteModal(false);
      setCarToDelete(null);
      if (selectedId === carNumber) {
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
    <div className="cars-page" data-active-tab={carsTab} style={{ position: "relative", display: "flex", flexDirection: "column", gap: 0, flex: 1, minHeight: 0, height: "100%", overflow: "hidden" }}>
      {toast && <div className="toast" role="status">{toast}</div>}

      {/* ── نافذة البحث المنبثقة ── */}
      {searchOpen && (
        <div className="search-overlay" onClick={() => onSearchClose?.()}>
          <div
            className="search-popup"
            onClick={(e) => e.stopPropagation()}
            role="search"
            aria-label="بحث في المعرض"
          >
            {/* ── رأس النافذة ── */}
            <div className="search-popup__header">
              <span className="search-popup__icon" aria-hidden>◈</span>
              <span className="search-popup__title">بحث في المعرض</span>
              {search.trim() && (
                <span className="search-popup__badge">
                  {filteredCars.length}
                </span>
              )}
              <button
                type="button"
                className="search-popup__close"
                onClick={() => onSearchClose?.()}
                aria-label="إغلاق البحث"
              >
                ✕
              </button>
            </div>

            {/* ── حقل البحث ── */}
            <div className="search-popup__body">
              <span className="search-popup__search-icon" aria-hidden>🔍</span>
              <input
                ref={searchInputRef}
                type="search"
                className="search-popup__input"
                placeholder="ابحث بالموديل، اللوحة، الشاصي، اللون، اسم المشتري أو رقم الهاتف..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setSearchHighlightIdx(0);
                }}
                onKeyDown={(e) => {
                  const results = filteredCars.slice(0, 8);
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setSearchHighlightIdx((i) => Math.min(i + 1, results.length - 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setSearchHighlightIdx((i) => Math.max(i - 1, 0));
                  } else if (e.key === "Enter" && results.length > 0) {
                    e.preventDefault();
                    const car = results[searchHighlightIdx] ?? results[0];
                    onSearchClose?.();
                    handleSingleClick(car);
                  }
                }}
                autoComplete="off"
                dir="rtl"
              />
              {search && (
                <button
                  type="button"
                  className="search-popup__clear"
                  onClick={() => { setSearch(""); setSearchHighlightIdx(0); }}
                  aria-label="مسح البحث"
                >
                  ✕
                </button>
              )}
            </div>

            {/* ── قائمة النتائج ── */}
            {search.trim() && (
              <div className="search-popup__results">
                {filteredCars.length === 0 ? (
                  <div className="search-popup__empty">
                    <span className="search-popup__empty-icon" aria-hidden>🚗</span>
                    <span>لا توجد سيارات مطابقة</span>
                  </div>
                ) : (
                  <ul className="search-popup__list" role="listbox">
                    {filteredCars.slice(0, 8).map((car, resultIdx) => {
                      const isSold = car.status === "مبيوعة";
                      const isHighlighted = resultIdx === searchHighlightIdx;
                      const q = toEnglishDigits(search.trim());
                      const highlight = (text: string) => {
                        if (!q) return text;
                        const idx = text.toLowerCase().indexOf(q.toLowerCase());
                        if (idx === -1) return text;
                        return (
                          <>
                            {text.slice(0, idx)}
                            <mark className="search-popup__mark">{text.slice(idx, idx + q.length)}</mark>
                            {text.slice(idx + q.length)}
                          </>
                        );
                      };
                      return (
                        <li
                          key={car.car_number}
                          className={`search-popup__item${isSold ? " search-popup__item--sold" : ""}${isHighlighted ? " search-popup__item--active" : ""}`}
                          role="option"
                          aria-selected={isHighlighted}
                          onMouseEnter={() => setSearchHighlightIdx(resultIdx)}
                          onClick={() => {
                            onSearchClose?.();
                            handleSingleClick(car);
                          }}
                        >
                          <div className="search-popup__item-main">
                            <span className="search-popup__item-model">
                              {highlight(car.car_model || car.car_name || "—")}
                            </span>
                            {car.car_year && (
                              <span className="search-popup__item-year">{car.car_year}</span>
                            )}
                            <span className={`search-popup__item-status${isSold ? " sold" : " available"}`}>
                              {isSold ? "مباع" : "متوفر"}
                            </span>
                          </div>
                          <div className="search-popup__item-sub">
                            <span className="search-popup__item-plate">
                              {highlight(car.car_plate_num ?? car.car_number)}
                            </span>
                            {car.color && (
                              <span className="search-popup__item-color">
                                <span className="search-popup__item-dot" aria-hidden>•</span>
                                {highlight(car.color)}
                              </span>
                            )}
                            {car.chassis_number && (
                              <span className="search-popup__item-chassis">
                                <span className="search-popup__item-dot" aria-hidden>•</span>
                                {highlight(car.chassis_number)}
                              </span>
                            )}
                            {isSold && car.buyer_name && (
                              <span className="search-popup__item-buyer">
                                <span className="search-popup__item-dot" aria-hidden>•</span>
                                👤 {highlight(car.buyer_name)}
                              </span>
                            )}
                            {isSold && car.buyer_phone && (
                              <span className="search-popup__item-phone">
                                <span className="search-popup__item-dot" aria-hidden>•</span>
                                📞 {highlight(car.buyer_phone)}
                              </span>
                            )}
                          </div>
                        </li>
                      );
                    })}
                    {filteredCars.length > 8 && (
                      <li className="search-popup__more">
                        و {filteredCars.length - 8} سيارة أخرى...
                      </li>
                    )}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── شريط الأدوات (دائماً ظاهر) ── */}
      <div className="cars-page__toolbar unified-toolbar">
        <div className="unified-toolbar__right">
          {returnState && onReturn && (
            <GoldFxButton
              type="button"
              isBack
              onClick={onReturn}
            >
              <span className="gold-fx-btn__icon">↩</span>
            </GoldFxButton>
          )}
          {/* تبويبات الحالة */}
          <div className="cars-tabs financial-tabs">
            {CARS_TABS.map((tab) => {
              const isActive = carsTab === tab.id;

              return (
                <button
                  key={tab.id}
                  type="button"
                  data-testid={`cars-subtab-${tab.id}`}
                  className={`${tab.id === "available" ? "top-btn-one" : "top-btn-two"} ${isActive ? (tab.id === "available" ? "top-btn-one--active" : "top-btn-two--active") : ""}`.trim()}
                  onClick={() => {
                    if (tab.id === "available") {
                      const now = Date.now();
                      if (now - lastAvailableClickRef.current < 300) {
                        lastAvailableClickRef.current = 0;
                        startNewCar();
                        return;
                      }
                      lastAvailableClickRef.current = now;
                    }
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
              );
            })}
          </div>
        </div>
        <div className="unified-toolbar__center">
        </div>
        <div className="unified-toolbar__left">
          {carsTab === "available" && panelMode === null && (
            <>
              <div className="currency-card currency-card--usd">
                <PriceDisplay amount={purchaseUsd} currency="USD" />
              </div>
              <div className="currency-card currency-card--iqd">
                <PriceDisplay amount={purchaseIqd} />
              </div>
            </>
          )}
          {carsTab === "sold" && panelMode === null && (
            <>
              <div className="currency-card currency-card--usd">
                <PriceDisplay amount={salesUsd} currency="USD" />
              </div>
              <div className="currency-card currency-card--iqd">
                <PriceDisplay amount={salesIqd} />
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
            position: "relative",
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column"
          }}
        >
          {/* العلامات الدالة على الصفحة (فوق الجدول) */}
          {totalPages >= 1 && (
            <div className="table-page-dots" aria-label="تنقل بين الصفحات">
              {Array.from({ length: totalPages }, (_, idx) => (
                <button
                  key={idx}
                  type="button"
                  className={`table-page-dot ${idx === currentPage ? "is-active" : ""}`}
                  onClick={() => setPage(idx)}
                  aria-label={`الصفحة ${idx + 1}`}
                />
              ))}
            </div>
          )}

          {/* جدول السيارات */}
          <section
            className="table-card-container"
            onWheel={(e) => handlePaginationWheel(e, currentPage, totalPages, setPage)}
            onKeyDown={(e) => handlePaginationKeyDown(e, currentPage, totalPages, setPage)}
            tabIndex={0}
          >
            <div className="table-wrapper" style={{ flex: 1, minHeight: 0 }}>
              {filteredCars.length === 0 ? (
                <div className="cars-empty">
                  <p>لا توجد سيارات مطابقة</p>
                </div>
              ) : (
                <table className="data-table cars-data-table">
                  <thead>
                    <tr>
                      <th className="cell-num" style={{ width: "24px" }}>ت</th>
                      <th className={`ct-model ${sortConfig?.key === "model" ? "th--sorted" : ""}`}>{renderSortHeader("model")}</th>
                      {carsTab !== "sold" && (
                        <>
                          <th className={`ct-year ${sortConfig?.key === "year" ? "th--sorted" : ""}`}>{renderSortHeader("year")}</th>
                          <th className={`ct-color ${sortConfig?.key === "color" ? "th--sorted" : ""}`}>{renderSortHeader("color")}</th>
                        </>
                      )}
                      <th className={`ct-num ${sortConfig?.key === "number" ? "th--sorted" : ""}`}>{renderSortHeader("number")}</th>
                      <th className={`ct-chassis ${sortConfig?.key === "chassis" ? "th--sorted" : ""}`}>{renderSortHeader("chassis")}</th>
                      <th className={`ct-price ${sortConfig?.key === "purchase" ? "th--sorted" : ""}`}>{renderSortHeader("purchase")}</th>
                      {carsTab !== "available" && (
                        <>
                          <th className={`ct-price ${sortConfig?.key === "selling" ? "th--sorted" : ""}`}>{renderSortHeader("selling")}</th>
                          <th className={`ct-profit ${sortConfig?.key === "profit" ? "th--sorted" : ""}`}>
                            {renderSortHeader("profit")}
                          </th>
                        </>
                      )}
                      {carsTab === "sold" && (
                        <th className="ct-buyer">اسم المشتري</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {pageEntries.map((car, idx) => {
                      const isSold = car.status === "مبيوعة";
                      const isSelected = selectedId === car.car_number;

                      return (
                        <tr
                          key={car.car_number}
                          data-testid={`car-row-${car.car_number}`}
                          className={`cars-tr${isSelected ? " cars-tr--selected" : ""}`}
                          onClick={() => handleSingleClick(car)}
                          title="اضغط لعرض التفاصيل"
                        >
                          <td className="cell-num">{currentPage * PAGE_SIZE + idx + 1}</td>
                          <td className="ct-model cell-bold">
                            {car.car_model || car.car_name || "—"}
                          </td>
                          {carsTab !== "sold" && (
                            <>
                              <td className="ct-year">{car.car_year || "—"}</td>
                              <td className="ct-color">{car.color || "—"}</td>
                            </>
                          )}
                          <td className="ct-num cell-bold">
                            <span className="ct-plate">{car.car_plate_num ?? car.car_number}</span>
                          </td>
                          <td className="ct-chassis">{car.chassis_number || "—"}</td>
                          <td className="ct-price">
                            <PriceDisplay amount={moneyAdd(car.purchase_price, car.expenses_sum || 0)} currency={car.currency} noColor />
                          </td>
                          {carsTab !== "available" && (
                            <>
                              <td className="ct-price">
                                {isSold ? (
                                  <div><PriceDisplay amount={car.selling_price} currency={car.sale_currency} noColor /></div>
                                ) : (
                                  <span className="text-muted">—</span>
                                )}
                              </td>
                              <td className="ct-profit-pct">
                                {isSold ? <span className="text-green">({carProfitPercentage(car)}%)</span> : <span className="text-muted">—</span>}
                              </td>
                            </>
                          )}
                          {carsTab === "sold" && (
                            <td className="ct-buyer" onClick={(e) => e.stopPropagation()}>
                              <span className="text-white font-bold">{car.buyer_name || "—"}</span>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                    {Array.from({ length: Math.max(0, PAGE_SIZE - pageEntries.length) }).map((_, i) => (
                      <tr key={`empty-${i}`} style={{ pointerEvents: "none" }} className="cars-tr opacity-25">
                        <td className="cell-num">&nbsp;</td>
                        <td className="ct-model">&nbsp;</td>
                        {carsTab !== "sold" && (
                          <>
                            <td className="ct-year">&nbsp;</td>
                            <td className="ct-color">&nbsp;</td>
                          </>
                        )}
                        <td className="ct-num">&nbsp;</td>
                        <td className="ct-chassis">&nbsp;</td>
                        <td className="ct-price">&nbsp;</td>
                        {carsTab !== "available" && (
                          <>
                            <td className="ct-price">&nbsp;</td>
                            <td className="ct-profit-pct">&nbsp;</td>
                          </>
                        )}
                        {carsTab === "sold" && (
                          <td className="ct-buyer">&nbsp;</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </div>
      ) : panelMode === "batch" ? (
        <div
          key="batch-form-view"
          className="batch-form-view"
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            flex: 1,
            padding: "0"
          }}
        >
          <form
            id="batch-car-form"
            onSubmit={handleBatchSubmit}
            onInput={() => setBatchDirty(true)}
            onChange={() => setBatchDirty(true)}
            className="flex-1 flex flex-col overflow-hidden font-arabic"
          >
            <div className="table-wrapper batch-table-wrapper flex-1 overflow-y-auto overflow-x-auto">
              <table className="data-table batch-data-table w-full text-right">
                <colgroup>
                  <col className="batch-col-seq" />
                  <col className="batch-col-model" />
                  <col className="batch-col-year" />
                  <col className="batch-col-color" />
                  <col className="batch-col-price" />
                  <col className="batch-col-type" />
                  <col className="batch-col-plate" />
                  <col className="batch-col-chassis" />
                </colgroup>
                <thead>
                  <tr>
                    <th>ت</th>
                    <th>نوع السيارة</th>
                    <th>الموديل</th>
                    <th>اللون</th>
                    <th>سعر الشراء</th>
                    <th>طريقة الشراء</th>
                    <th>رقم اللوحة</th>
                    <th>رقم الشاصي</th>
                  </tr>
                </thead>
                <tbody>
                  {batchRows.map((row, idx) => {
                    const isRow1 = idx === 0;
                    return (
                      <tr key={idx} className="batch-tr">
                        <td className="cell-num text-center">{idx + 1}</td>

                        {/* نوع السيارة */}
                        <td>
                          {isRow1 ? (
                            <TextInput
                              id="batch-model-0"
                              inputSize="sm"
                              value={row.model}
                              onInput={(e: React.FormEvent<HTMLInputElement>) => {
                                const val = (e.target as HTMLInputElement).value.toUpperCase();
                                handleRow1Change({ model: val });
                              }}
                              placeholder="نوع السيارة"
                              dir="ltr"
                              required
                            />
                          ) : (
                            <TextInput
                              disabled
                              inputSize="sm"
                              value={row.model}
                              placeholder="تلقائي من الصف الأول"
                              dir="ltr"
                            />
                          )}
                        </td>

                        {/* الموديل (السنة) */}
                        <td>
                          {isRow1 ? (
                            <YearScrollField
                              id="batch-year-0"
                              value={row.year}
                              onChange={(year: string) => handleRow1Change({ year })}
                              required
                            />
                          ) : (
                            <TextInput
                              disabled
                              inputSize="sm"
                              value={row.year}
                              placeholder="تلقائي"
                              dir="ltr"
                            />
                          )}
                        </td>

                        {/* اللون */}
                        <td>
                          {isRow1 ? (
                            <TextInput
                              id="batch-color-0"
                              inputSize="sm"
                              value={row.color}
                              onInput={(e: React.FormEvent<HTMLInputElement>) => {
                                const val = (e.target as HTMLInputElement).value;
                                handleRow1Change({ color: val });
                              }}
                              placeholder="اللون"
                              required
                            />
                          ) : (
                            <TextInput
                              disabled
                              inputSize="sm"
                              value={row.color}
                              placeholder="تلقائي"
                            />
                          )}
                        </td>

                        {/* سعر الشراء */}
                        <td>
                          {isRow1 ? (
                            <PriceInput
                              id="batch-purchase-0"
                              value={row.purchase}
                              onChange={(purchase) => handleRow1Change({ purchase })}
                              currency={row.currency}
                              onCurrencyChange={(currency) => handleRow1Change({ currency })}
                              required
                            />
                          ) : (
                            <div className="flex items-center justify-center h-[38px] bg-white/[0.02] border border-white/5 rounded-xl text-sm font-semibold text-white/50" dir="ltr">
                              {row.purchase ? Number(row.purchase).toLocaleString() : "0"} {row.currency}
                            </div>
                          )}
                        </td>

                        {/* طريقة الشراء */}
                        <td>
                          {isRow1 ? (
                            <div className="flex flex-col gap-1">
                              <div className="flex gap-1 justify-center">
                                {(["كاش", "تمويل", "شركة"] as const).map((opt) => (
                                  <button
                                    key={opt}
                                    type="button"
                                    className={`payment-type-btn payment-type-btn--sm payment-type-btn--${opt === "كاش" ? "green" : opt === "تمويل" ? "blue" : "orange"} ${row.purchaseType === opt ? "payment-type-btn--active" : ""}`}
                                    onClick={() => handleRow1Change({ purchaseType: opt, financerName: "" })}
                                  >
                                    {opt}
                                  </button>
                                ))}
                              </div>
                              {(row.purchaseType === "تمويل" || row.purchaseType === "شركة") && (
                                <div id="batch-financer-0" className="mt-1">
                                  {row.purchaseType === "تمويل" && (
                                    <div style={{ display: "flex", gap: "5px", alignItems: "center" }}>
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <SearchableCombobox
                                          value={row.financerName}
                                          onChange={(name) => handleRow1Change({ financerName: name })}
                                          placeholder="اختر الممول"
                                          options={partners.filter(p => (p.kind || "").trim().replace(/ة/g, "ه") === "ممول").map((p) => ({ label: p.partner_name, value: p.partner_name, kind: p.kind }))}
                                        />
                                      </div>
                                      <button
                                        type="button"
                                        title="إضافة ممول جديد"
                                        onClick={() => setQuickAddKindBatch("ممول")}
                                        style={{
                                          flexShrink: 0,
                                          width: "30px",
                                          height: "30px",
                                          borderRadius: "var(--all-radius)",
                                          border: "1px solid rgba(59,130,246,0.4)",
                                          background: "rgba(59,130,246,0.12)",
                                          color: "#93c5fd",
                                          fontSize: "16px",
                                          fontWeight: 700,
                                          cursor: "pointer",
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "center",
                                        }}
                                      >
                                        +
                                      </button>
                                    </div>
                                  )}
                                  {row.purchaseType === "شركة" && (
                                    <div style={{ display: "flex", gap: "5px", alignItems: "center" }}>
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <SearchableCombobox
                                          value={row.financerName}
                                          onChange={(name) => handleRow1Change({ financerName: name })}
                                          placeholder="اختر الشركة"
                                          options={partners.filter((p) => (p.kind || "").trim().replace(/ة/g, "ه") === "شركه").map((p) => ({ label: p.partner_name, value: p.partner_name, kind: p.kind }))}
                                        />
                                      </div>
                                      <button
                                        type="button"
                                        title="إضافة شركة جديدة"
                                        onClick={() => setQuickAddKindBatch("شركة")}
                                        style={{
                                          flexShrink: 0,
                                          width: "30px",
                                          height: "30px",
                                          borderRadius: "var(--all-radius)",
                                          border: "1px solid rgba(251,146,60,0.4)",
                                          background: "rgba(251,146,60,0.12)",
                                          color: "#fdba74",
                                          fontSize: "16px",
                                          fontWeight: 700,
                                          cursor: "pointer",
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "center",
                                        }}
                                      >
                                        +
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="text-center font-semibold text-white/50 text-sm">
                              {row.purchaseType === "كاش" ? "كاش" : `${row.purchaseType} - ${row.financerName || "..."}`}
                            </div>
                          )}
                        </td>

                        {/* رقم اللوحة */}
                        <td>
                          <TextInput
                            id={`batch-num-${idx}`}
                            inputSize="sm"
                            value={row.num}
                            onInput={(e: React.FormEvent<HTMLInputElement>) => {
                              const val = (e.target as HTMLInputElement).value;
                              const cleanVal = toEnglishDigits(val).replace(/[^\w\s\u0600-\u06FF-]/g, "");
                              if (isRow1) {
                                handleRow1Change({ num: cleanVal });
                              } else {
                                handleRowNChange(idx, { num: cleanVal });
                              }
                            }}
                            placeholder="رقم اللوحة"
                            dir="ltr"
                            required
                            containerClassName={duplicateNumIndexes.has(idx) ? "input-has-error" : ""}
                          />
                        </td>

                        {/* رقم الشاصي */}
                        <td>
                          <TextInput
                            id={`batch-chassis-${idx}`}
                            inputSize="sm"
                            value={row.chassis}
                            onInput={(e: React.FormEvent<HTMLInputElement>) => {
                              const val = (e.target as HTMLInputElement).value;
                              const cleanVal = toChassisText(val);
                              if (isRow1) {
                                handleRow1Change({ chassis: cleanVal });
                              } else {
                                handleRowNChange(idx, { chassis: cleanVal });
                              }
                            }}
                            placeholder="رقم الشاصي"
                            dir="ltr"
                            required
                            containerClassName={duplicateChassisIndexes.has(idx) ? "input-has-error" : ""}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </form>

          {/* Progress Overlay */}
          {batchSaving && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
              <div className="bg-[#1c1c1e] border border-white/10 rounded-2xl p-6 text-center max-w-sm w-full mx-4 shadow-2xl font-arabic">
                <div className="spinner mb-4 mx-auto" />
                <h4 className="text-lg font-bold text-white mb-2">جاري حفظ المجموعة</h4>
                <p className="text-white/60 text-sm">
                  تم حفظ {batchProgress.current} من {batchProgress.total} سيارات...
                </p>
                <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden mt-4">
                  <div
                    className="bg-[var(--gold-primary)] h-full transition-all duration-300"
                    style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          )}
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
            onChange={patchForm}
            onSubmit={handleSubmit}
            onClose={handleClosePanel}
            onExpenseDirtyChange={setExpenseDirty}
            onFormValidityChange={setIsCarFormValid}
            onNavigateToPartner={onNavigateToPartner}
            initialPage={initialFormPage}
            saleFieldsLocked={saleFieldsLocked}
            receivedInstallmentsTotal={receivedInstallmentsTotal}
            onSwitchToSpecs={() => {
              // العودة إلى تبويب مواصفات السيارة
              const formEl = document.getElementById("car-form");
              const tabButtons = formEl?.querySelectorAll(".car-form-tab");
              if (tabButtons && tabButtons.length >= 2) {
                (tabButtons[0] as HTMLButtonElement)?.click();
              }
            }}
          />
        </div>
      )}

      {showBatchCountModal && (
        <div className="fx-confirm-overlay" role="presentation" onClick={() => setShowBatchCountModal(false)}>
          <div
            className="fx-confirm-dialog batch-count-dialog"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="fx-confirm-title">عدد سيارات المجموعة</h3>
            <p className="fx-confirm-message">
              اختر عدد الصفوف التي تريد إدخالها دفعة واحدة.
            </p>
            <div className="batch-count-dialog__field">
              <label htmlFor="batch-count-input">عدد السيارات</label>
              <input
                id="batch-count-input"
                type="number"
                min={1}
                max={1000}
                value={batchCountDraft}
                onChange={(e) => setBatchCountDraft(Math.max(1, Math.min(1000, Number(e.target.value) || 1)))}
                onFocus={(e) => setTimeout(() => e.target.select(), 0)}
                autoFocus
              />
            </div>
            <div className="batch-count-dialog__quick">
              {[5, 10, 20, 50, 100, 200, 500, 1000].map((count) => (
                <button
                  key={count}
                  type="button"
                  className={batchCountDraft === count ? "batch-count-chip batch-count-chip--active" : "batch-count-chip"}
                  onClick={() => setBatchCountDraft(count)}
                >
                  {count}
                </button>
              ))}
            </div>
            <div className="fx-confirm-actions">
              <GoldFxButton
                type="button"
                variant="gold"
                onClick={() => startNewBatch(batchCountDraft)}
              >
                <span className="gold-fx-btn__label">إنشاء الجدول</span>
              </GoldFxButton>
              <ActionButton
                type="button"
                variant="ghost"
                onClick={() => setShowBatchCountModal(false)}
              >
                إلغاء
              </ActionButton>
            </div>
          </div>
        </div>
      )}

      {/* ── نافذة تحذير التكرار في المجموعة ── */}
      {showBatchDuplicateModal && (
        <div className="fx-confirm-overlay" role="presentation" onClick={() => setShowBatchDuplicateModal(false)}>
          <div
            className="fx-confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            style={{ maxWidth: "560px", width: "94vw" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
              <span style={{ fontSize: "22px" }}>⚠️</span>
              <h3 className="fx-confirm-title" style={{ margin: 0 }}>تكرار في أرقام السيارات</h3>
            </div>
            <p className="fx-confirm-message" style={{ marginBottom: "14px" }}>
              تم اكتشاف <strong>{batchDuplicateConflicts.length}</strong> تعارض في المجموعة المدخلة.
              السيارات المكررة لن يتم حفظها.
              {pendingBatchRowsAfterDupeCheck.length > 0
                ? ` سيتم حفظ ${pendingBatchRowsAfterDupeCheck.length} سيارة غير مكررة فقط.`
                : " لا توجد سيارات غير مكررة للحفظ."}
            </p>

            {/* Conflict list */}
            <div style={{
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.25)",
              borderRadius: "var(--all-radius)",
              padding: "10px 12px",
              marginBottom: "16px",
              maxHeight: "240px",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: "7px"
            }}>
              {batchDuplicateConflicts.map((conflict) => (
                <div key={conflict.rowIdx} style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "8px",
                  padding: "6px 8px",
                  background: "rgba(239,68,68,0.10)",
                  borderRadius: "var(--all-radius)",
                  fontSize: "0.85rem",
                  direction: "rtl"
                }}>
                  <span style={{ color: "#ef4444", fontWeight: 700, minWidth: "52px", flexShrink: 0 }}>الصف {conflict.rowIdx + 1}</span>
                  <span style={{ color: "rgba(255,255,255,0.55)", flexShrink: 0 }}>|</span>
                  <span style={{ color: "rgba(255,255,255,0.8)" }} dir="ltr">
                    {conflict.conflictType !== "chassis" && <span>لوحة: <strong style={{ color: "#fbbf24" }}>{conflict.rowNum}</strong> </span>}
                    {conflict.conflictType !== "num" && <span>شاصي: <strong style={{ color: "#fbbf24" }}>{conflict.rowChassis}</strong> </span>}
                    <span style={{ color: "rgba(255,255,255,0.45)", fontSize: "0.78rem", display: "block", marginTop: "2px" }}>← تعارض مع: {conflict.conflictWith}</span>
                  </span>
                </div>
              ))}
            </div>

            <div className="fx-confirm-actions">
              {pendingBatchRowsAfterDupeCheck.length > 0 && (
                <GoldFxButton
                  type="button"
                  variant="gold"
                  onClick={() => {
                    setShowBatchDuplicateModal(false);
                    void executeBatchSave(pendingBatchRowsAfterDupeCheck);
                  }}
                >
                  <span className="gold-fx-btn__label">حفظ ({pendingBatchRowsAfterDupeCheck.length})</span>
                </GoldFxButton>
              )}
              <ActionButton
                type="button"
                variant="ghost"
                onClick={() => {
                  setShowBatchDuplicateModal(false);
                  setBatchDuplicateConflicts([]);
                  setPendingBatchRowsAfterDupeCheck([]);
                }}
              >
                العودة للتعديل
              </ActionButton>
            </div>
          </div>
        </div>
      )}

      {/* نافذة تأكيد الحذف من الجدول */}
      {showDeleteModal && carToDelete && (
        <div className="fx-confirm-overlay" role="presentation" onClick={() => setShowDeleteModal(false)}>
          <div
            className="fx-confirm-dialog"
            role="alertdialog"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="fx-confirm-title">تأكيد حذف السيارة</h3>
            <p className="fx-confirm-message">
              هل أنت متأكد من حذف السيارة <strong>{carToDelete.car_name || carToDelete.car_model || carToDelete.car_number}</strong> نهائياً؟
              لا يمكن التراجع عن هذا الإجراء.
            </p>
            <div className="fx-confirm-actions">
              <GoldFxButton
                type="button"
                variant="red"
                onClick={() => void executeTableDelete()}
                disabled={saving}
              >

                <span className="gold-fx-btn__label">{saving ? "جاري الحذف..." : "تأكيد الحذف"}</span>
              </GoldFxButton>
              <ActionButton
                type="button"
                variant="ghost"
                onClick={() => { setShowDeleteModal(false); setCarToDelete(null); }}
                disabled={saving}
              >
                إلغاء
              </ActionButton>
            </div>
          </div>
        </div>
      )}

      {/* نافذة تأكيد حفظ التعديلات */}
      {showUnsavedConfirm && (
        <div className="fx-confirm-overlay" role="presentation" onClick={() => setShowUnsavedConfirm(false)}>
          <div
            className="fx-confirm-dialog"
            role="alertdialog"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="fx-confirm-title">هل تريد حفظ التعديلات؟</h3>
            <p className="fx-confirm-message">
              لديك تعديلات غير محفوظة. هل تريد حفظها قبل المغادرة؟
            </p>
            <div className="fx-confirm-actions">
              <ActionButton
                type="button"
                variant="success"
                onClick={() => void handleUnsavedSave()}
                disabled={saving}
              >
                {saving ? "جاري الحفظ..." : "نعم"}
              </ActionButton>
              <ActionButton
                type="button"
                variant="ghost"
                onClick={handleUnsavedDiscard}
                disabled={saving}
              >
                لا
              </ActionButton>
            </div>
          </div>
        </div>
      )}

      {/* نافذة الإضافة السريعة للممول / الشركة (المجموعة) */}
      {quickAddKindBatch && (
        <QuickAddPartnerModal
          kind={quickAddKindBatch}
          onClose={() => setQuickAddKindBatch(null)}
          onSaved={(name) => {
            setQuickAddKindBatch(null);
            handleRow1Change({ financerName: name });
            void onRefresh();
          }}
        />
      )}

      {/* نافذة تأكيد إنشاء حساب زبون */}
      {showSaleConfirm && pendingSaleData && (() => {
        const buyerName = pendingSaleData.buyerName.trim();
        const phone = normalizePhoneNumber(pendingSaleData.phone);
        const existingBuyer = partners.some(
          (p) => p.partner_name.trim() === buyerName && p.kind === "زبون"
        );
        const message = existingBuyer
          ? `هل تريد الشراء لـ ${buyerName} الموجود اسمه مسبقاً؟`
          : `هل تريد إنشاء حساب باسم ${buyerName} رقم هاتفه ${phone}؟`;
        return (
          <div className="fx-confirm-overlay" role="presentation" onClick={handleSaleCancel}>
            <div
              className="fx-confirm-dialog"
              role="alertdialog"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="fx-confirm-title">تأكيد البيع بالتقسيط</h3>
              <p className="fx-confirm-message">{message}</p>
              <div className="fx-confirm-actions">
                <GoldFxButton
                  type="button"
                  variant="green"
                  onClick={() => void handleSaleConfirm()}
                >
                  <span className="gold-fx-btn__label">نعم</span>
                </GoldFxButton>
                <ActionButton
                  type="button"
                  variant="ghost"
                  onClick={handleSaleCancel}
                >
                  إلغاء
                </ActionButton>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
