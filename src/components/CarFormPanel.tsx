import { useEffect, useRef, useState } from "react";
import { cn } from "../lib/utils";
import type { CarFormState } from "../types";

import { arabicKeyboardToEnglish, englishKeyboardToArabic, toChassisText } from "../utils/keyboardLayout";
import { toEnglishDigits } from "../utils/numberInput";
import { todayIsoDate } from "../utils/dateSegments";
import { UnifiedDateField } from "./UnifiedDateField";
import { YearScrollField } from "./YearScrollField";
import {
  ActionButton,
  TextInput,
  NumberInput,
  PriceDisplay,
  PriceInput,
  type Currency,
} from "@/components/ui";

function toEn(v: string) { return toEnglishDigits(v); }

interface CarFormPanelProps {
  form: CarFormState;
  isEditing: boolean;
  saving: boolean;
  onChange: (patch: Partial<CarFormState>) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose?: () => void;
}

export function CarFormPanel({
  form, isEditing, saving,
  onChange, onSubmit, onClose,
}: CarFormPanelProps) {
  const hasSellingPrice = form.selling !== "" && Number(form.selling) > 0;
  const hasBuyerName = form.buyerName.trim() !== "";
  const hasAmountPaid = form.amountPaid !== "" && Number(form.amountPaid) > 0;
  const isSold = hasSellingPrice && (hasBuyerName || hasAmountPaid);
  const installmentMonths = Number(form.installmentMonths) || 1;
  const amountRemaining = Number(form.amountRemaining) || 0;

  const autoPaymentType = (() => {
    const paid = Number(form.amountPaid) || 0;
    const sell = Number(form.selling) || 0;
    if (sell > 0 && paid >= sell) return "كاش";
    return installmentMonths > 1 ? "اقساط" : "موعد";
  })();

  const monthly = autoPaymentType === "اقساط" && installmentMonths > 0
    ? amountRemaining / installmentMonths : 0;
  const formRef = useRef<HTMLFormElement>(null);
  // عند النقر على سيارة موجودة → افتح مباشرة على تبويب البيع دائماً
  const [activePage, setActivePage] = useState<"car" | "sale">(
    isEditing ? "sale" : "car"
  );

  /* مزامنة حالة السيارة تلقائياً */
  useEffect(() => {
    const desiredStatus: "متوفرة" | "مبيوعة" = isSold ? "مبيوعة" : "متوفرة";
    if (form.status !== desiredStatus) {
      onChange({ status: desiredStatus });
      if (isSold && !form.saleDate) {
        onChange({ saleDate: todayIsoDate() });
      }
    }
  }, [isSold]);

  const prevAutoType = useRef(form.paymentType);

  useEffect(() => {
    const auto = autoPaymentType;
    if (auto === prevAutoType.current) return;

    const patch: Partial<CarFormState> = { paymentType: auto };

    if (auto === "كاش") {
      patch.amountRemaining = "";
      patch.installmentMonths = "1";
    } else {
      patch.amountRemaining = String(Math.max(0, Number(form.selling) - Number(form.amountPaid)));
      const existingDate = form.deliveryDate || form.firstPaymentDate;
      if (auto === "موعد") {
        patch.deliveryDate = form.deliveryDate || existingDate || todayIsoDate();
      }
      if (auto === "اقساط") {
        patch.firstPaymentDate = form.firstPaymentDate || existingDate || todayIsoDate();
      }
    }

    onChange(patch);
    prevAutoType.current = auto;
  }, [autoPaymentType]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const formEl = formRef.current;
    if (!formEl) return;

    formEl.querySelectorAll(".input--error").forEach(el => el.classList.remove("input--error"));

    const checks: { id: string; valid: () => boolean }[] = [
      { id: "car-model",     valid: () => !!form.model.trim() },
      { id: "car-year",      valid: () => !!form.year.trim() },
      { id: "car-color",      valid: () => !!form.color.trim() },
      { id: "car-num",       valid: () => !!form.num.trim() },
      { id: "car-chassis",   valid: () => !!form.chassis.trim() },
      { id: "car-purchase",  valid: () => form.purchase !== "" && Number(form.purchase) > 0 },
    ];
    // عند الوقوف على تبويب البيع (وضع التعديل) → تجاوز التحقق من حقول الشراء والسيارة
    if (isEditing && activePage === "sale") {
      checks.length = 0; // امسح كل حقول السيارة والشراء — لسنا بحاجة إعادة التحقق منها
      // إذا أدخل المستخدم بيانات البيع → تحقق منها
      if (isSold) {
        checks.push(
          { id: "car-selling",  valid: () => form.selling !== "" && Number(form.selling) > 0 },
          { id: "buyer-name",   valid: () => !!form.buyerName.trim() },
          { id: "amount-paid",  valid: () => form.amountPaid !== "" && Number(form.amountPaid) > 0 },
        );
        if (autoPaymentType !== "كاش") {
          checks.push(
            { id: "amount-remaining", valid: () => form.amountRemaining !== "" && Number(form.amountRemaining) > 0 },
          );
        }
        if (autoPaymentType === "اقساط") {
          checks.push(
            { id: "installment-months", valid: () => form.installmentMonths !== "" && Number(form.installmentMonths) > 0 },
            { id: "first-payment-date", valid: () => !!(form.firstPaymentDate || form.deliveryDate)?.trim() },
          );
        }
        if (autoPaymentType === "موعد") {
          checks.push(
            { id: "first-payment-date", valid: () => !!(form.deliveryDate || form.firstPaymentDate)?.trim() },
          );
        }
      }
    } else if (isSold) {
      checks.push(
        { id: "car-selling",  valid: () => form.selling !== "" && Number(form.selling) > 0 },
        { id: "buyer-name",   valid: () => !!form.buyerName.trim() },
        { id: "amount-paid",  valid: () => form.amountPaid !== "" && Number(form.amountPaid) > 0 },
      );
      if (autoPaymentType !== "كاش") {
        checks.push(
          { id: "amount-remaining",   valid: () => form.amountRemaining !== "" && Number(form.amountRemaining) > 0 },
        );
      }
      if (autoPaymentType === "اقساط") {
        checks.push(
          { id: "installment-months", valid: () => form.installmentMonths !== "" && Number(form.installmentMonths) > 0 },
          { id: "first-payment-date", valid: () => !!(form.firstPaymentDate || form.deliveryDate)?.trim() },
        );
      }
      if (autoPaymentType === "موعد") {
        checks.push(
          { id: "first-payment-date", valid: () => !!(form.deliveryDate || form.firstPaymentDate)?.trim() },
        );
      }
    }

    for (const { id, valid } of checks) {
      try {
        if (!valid()) {
          const el = formEl.querySelector<HTMLElement>(`#${id}`);
          el?.classList.add("input--error");
          el?.focus();
          formEl.classList.add("form--submitted");
          return;
        }
      } catch (err) {
        console.error(`Validation error for #${id}:`, err);
        return;
      }
    }

    onSubmit(e);
  };

  const patchEnglishText = (key: "num" | "chassis", value: string) => {
    const next = key === "chassis" ? toChassisText(value) : toEn(value);
    onChange({ [key]: next } as Pick<CarFormState, typeof key>);
  };

  return (
    <div className="modal-overlay modal-overlay--soft" role="presentation" onClick={onClose}>
      <div className="modal-dialog modal-dialog--car modal-dialog--wide" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="car-dialog-panel">
          <div className="car-dialog-panel__body" style={{ padding: 0 }}>
            <form
              id="car-form"
              className="car-form"
              onSubmit={handleSubmit}
              ref={formRef}
              onInput={(e) => {
                const target = e.target as HTMLElement;
                target.classList.remove("input--error");
                const formEl = formRef.current;
                if (formEl && !formEl.querySelector(".input--error")) {
                  formEl.classList.remove("form--submitted");
                }
              }}
              onChange={(e) => {
                const target = e.target as HTMLElement;
                target.classList.remove("input--error");
                const formEl = formRef.current;
                if (formEl && !formEl.querySelector(".input--error")) {
                  formEl.classList.remove("form--submitted");
                }
              }}
            >

              <div className="car-dashboard">

                {/* ── Tab Switcher ── */}
                <div className="car-dashboard__tabs">
                  <ActionButton
                    type="button"
                    variant="ghost"
                    onClick={() => setActivePage("car")}
                    iconOnly={false}
                    className={cn(
                      "car-dashboard__tab",
                      activePage === "car" && "car-dashboard__tab--car-active"
                    )}
                  >
                    🚗 بيانات السيارة والشراء
                  </ActionButton>
                  <ActionButton
                    type="button"
                    variant="ghost"
                    onClick={() => setActivePage("sale")}
                    iconOnly={false}
                    className={cn(
                      "car-dashboard__tab",
                      activePage === "sale" && "car-dashboard__tab--sale-active"
                    )}
                  >
                    💰 بيانات البيع
                  </ActionButton>
                </div>

                {/* ══════════════  الصفحة الأولى: بيانات السيارة  ══════════════ */}
                {activePage === "car" && (
                  <div className="car-dashboard__page">
                    <div className="car-dashboard__grid car-dashboard__grid--2col">

                      {/* ── قسم مواصفات المركبة ── */}
                      <div className="car-dashboard__card car-dashboard__card--car">
                        <h3 className="car-dashboard__card-title">🚗 مواصفات المركبة</h3>
                        <div className="car-dashboard__card-body car-dashboard__card-body--3col">
                          <div className="cf-field cf-field--model">
                            <label className="cf-label" htmlFor="car-model">نوع السيارة</label>
                            <TextInput
                              id="car-model"
                              value={form.model}
                              onInput={(e: React.FormEvent<HTMLInputElement>) => onChange({ model: arabicKeyboardToEnglish((e.target as HTMLInputElement).value).toUpperCase() })}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({ model: arabicKeyboardToEnglish(e.target.value).toUpperCase() })}
                              onBlur={(e: React.FocusEvent<HTMLInputElement>) => onChange({ model: arabicKeyboardToEnglish(e.target.value).toUpperCase() })}
                              placeholder="الموديل"
                              dir="ltr"
                              required
                              autoFocus={!isEditing}
                            />
                          </div>
                          <div className="cf-field cf-field--year">
                            <label className="cf-label" htmlFor="car-year">سنة الصنع</label>
                            <YearScrollField
                              id="car-year"
                              value={form.year}
                              onChange={(year) => onChange({ year })}
                              required
                            />
                          </div>
                          <div className="cf-field cf-field--color">
                            <label className="cf-label" htmlFor="car-color">اللون</label>
                            <TextInput
                              id="car-color"
                              value={form.color}
                              onInput={(e: React.FormEvent<HTMLInputElement>) => onChange({ color: englishKeyboardToArabic((e.target as HTMLInputElement).value) })}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({ color: englishKeyboardToArabic(e.target.value) })}
                              onBlur={(e: React.FocusEvent<HTMLInputElement>) => onChange({ color: englishKeyboardToArabic(e.target.value) })}
                              placeholder="لون"
                              required
                            />
                          </div>
                          <div className="cf-field cf-field--plate">
                            <label className="cf-label" htmlFor="car-num">رقم اللوحة</label>
                            <TextInput
                              id="car-num"
                              type="text"
                              inputMode="decimal"
                              value={form.num}
                              dir="ltr"
                              onInput={(e: React.FormEvent<HTMLInputElement>) => onChange({ num: toEn((e.target as HTMLInputElement).value).replace(/\D/g, "") })}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({ num: toEn(e.target.value).replace(/\D/g, "") })}
                              onBlur={(e: React.FocusEvent<HTMLInputElement>) => onChange({ num: toEn(e.target.value).replace(/\D/g, "") })}
                              onFocus={(e: React.FocusEvent<HTMLInputElement>) => e.target.select()}
                              placeholder="12345"
                              required
                            />
                          </div>
                          <div className="cf-field cf-field--chassis">
                            <label className="cf-label" htmlFor="car-chassis">رقم الشاصي</label>
                            <TextInput
                              id="car-chassis"
                              value={form.chassis}
                              dir="ltr"
                              onInput={(e: React.FormEvent<HTMLInputElement>) => patchEnglishText("chassis", (e.target as HTMLInputElement).value)}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => patchEnglishText("chassis", e.target.value)}
                              onBlur={(e: React.FocusEvent<HTMLInputElement>) => patchEnglishText("chassis", e.target.value)}
                              placeholder="VIN"
                              required
                            />
                          </div>
                        </div>
                      </div>

                      {/* ── قسم تفاصيل الشراء ── */}
                      <div className="car-dashboard__card car-dashboard__card--car">
                        <h3 className="car-dashboard__card-title">💰 تفاصيل الشراء</h3>
                        <div className="car-dashboard__card-body">
                          <div className="cf-field cf-field--price">
                            <label className="cf-label" htmlFor="car-purchase">سعر الشراء</label>
                            <PriceInput
                              id="car-purchase"
                              value={form.purchase}
                              onChange={(purchase) => onChange({ purchase })}
                              currency={form.currency as Currency}
                              onCurrencyChange={(currency) => onChange({ currency })}
                              required
                            />
                          </div>
                          <div className="cf-field cf-field--date">
                            <label className="cf-label">تاريخ الشراء</label>
                            <UnifiedDateField
                              value={form.purchaseDate}
                              onChange={(purchaseDate) => onChange({ purchaseDate })}
                            />
                          </div>
                          <div className="cf-field">
                            <label className="cf-label">نوع الدفع</label>
                            <div className="payment-type-selector">
                              {(["قاصه", "ماستر", "مصرف"] as const).map((opt) => (
                                <button
                                  key={opt}
                                  type="button"
                                  className={`payment-type-btn payment-type-btn--${opt === "قاصه" ? "qasa" : opt === "ماستر" ? "master" : "bank"} ${form.purchasePaymentType === opt ? "payment-type-btn--active" : ""}`}
                                  onClick={() => onChange({ purchasePaymentType: opt })}
                                >
                                  {opt}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ══════════════  الصفحة الثانية: بيانات البيع  ══════════════ */}
                {activePage === "sale" && (
                  <div className="car-dashboard__page">
                    <div className="car-dashboard__grid car-dashboard__grid--2col">

                      {/* ── بطاقة تفاصيل البيع والدفع ── */}
                      <div className="car-dashboard__card car-dashboard__card--sale-red">
                        <h3 className="car-dashboard__card-title">📈 تفاصيل البيع والدفع</h3>
                        <div className="car-dashboard__card-body car-dashboard__card-body--2col">

                          {/* صف ١: سعر البيع | المبلغ المستلم */}
                          <div className="cf-field">
                            <label className="cf-label">سعر البيع</label>
                            <PriceInput id="car-selling" value={form.selling}
                              onChange={(selling) => onChange({ selling })}
                              currency={form.saleCurrency as Currency}
                              onCurrencyChange={(saleCurrency) => onChange({ saleCurrency })}
                              required={isSold}
                              tabIndex={1}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") onChange({ amountPaid: form.selling });
                              }} />
                          </div>
                          <div className="cf-field">
                            <label className="cf-label">المبلغ المستلم</label>
                            <PriceInput id="amount-paid" value={form.amountPaid}
                              onChange={(amountPaid) => onChange({ amountPaid })}
                              currency={form.saleCurrency as Currency}
                              onCurrencyChange={(saleCurrency) => onChange({ saleCurrency })}
                              required={isSold}
                              tabIndex={2} />
                          </div>

                          {/* صف ٢: تاريخ البيع | نوع الدفع */}
                          <div className="cf-field">
                            <label className="cf-label">تاريخ البيع</label>
                            <UnifiedDateField
                              value={form.saleDate}
                              onChange={(saleDate) => onChange({ saleDate })}
                              tabIndex={3}
                            />
                          </div>
                          <div className="cf-field">
                            <label className="cf-label">نوع الدفع</label>
                            <div className="payment-type-selector">
                              {(["قاصه", "ماستر", "مصرف"] as const).map((opt) => (
                                <button
                                  key={opt}
                                  type="button"
                                  className={`payment-type-btn payment-type-btn--${opt === "قاصه" ? "qasa" : opt === "ماستر" ? "master" : "bank"} ${form.salePaymentType === opt ? "payment-type-btn--active" : ""}`}
                                  onClick={() => onChange({ salePaymentType: opt })}
                                >
                                  {opt}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* صف ٣: القسط الشهري - كامل العرض */}
                          <div className="cf-field cf-field--span2">
                            <div className="cf-row">
                              <span className="cf-row__label">القسط الشهري</span>
                              <div className="cf-row__value">
                                <strong className="cf-install-number"><PriceDisplay amount={monthly} /></strong>
                              </div>
                            </div>
                          </div>

                        </div>
                      </div>

                      {/* ── بطاقة المشتري والتسليم ── */}
                      <div className="car-dashboard__card car-dashboard__card--sale-red">
                        <h3 className="car-dashboard__card-title">
                          👤 المشتري والتسليم — {autoPaymentType === "كاش" ? "كاش" : autoPaymentType === "موعد" ? "موعد" : "أقساط"}
                        </h3>
                        <div className="car-dashboard__card-body car-dashboard__card-body--2col">

                          {/* صف ١: اسم المشتري | رقم الهاتف */}
                          <div className="cf-field">
                            <label className="cf-label" htmlFor="buyer-name">اسم المشتري</label>
                            <TextInput
                              id="buyer-name"
                              value={form.buyerName}
                              onChange={(e) => onChange({ buyerName: e.target.value })}
                              placeholder="الاسم"
                              required={isSold}
                              tabIndex={4}
                            />
                          </div>
                          <div className="cf-field">
                            <label className="cf-label" htmlFor="buyer-phone">رقم الهاتف</label>
                            <TextInput id="buyer-phone" value={form.phone}
                              autoComplete="new-password" dir="ltr" placeholder="07XX XXX XXXX"
                              onInput={(e: React.FormEvent<HTMLInputElement>) => onChange({ phone: toEn((e.target as HTMLInputElement).value).replace(/[^\d+\s()-]/g, "") })}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({ phone: toEn(e.target.value).replace(/[^\d+\s()-]/g, "") })}
                              onBlur={(e: React.FocusEvent<HTMLInputElement>) => onChange({ phone: toEn(e.target.value).replace(/[^\d+\s()-]/g, "") })}
                              tabIndex={5} />
                          </div>

                          {/* صف ٢: المتبقي | الأشهر */}
                          <div className="cf-field">
                            <label className="cf-label">المتبقي</label>
                            <PriceInput id="amount-remaining" value={form.amountRemaining}
                              onChange={(amountRemaining) => onChange({ amountRemaining })}
                              currency={form.saleCurrency as Currency}
                              onCurrencyChange={(saleCurrency) => onChange({ saleCurrency })}
                              required={isSold} disabled={autoPaymentType === "كاش"}
                              tabIndex={6} />
                          </div>
                          <div className="cf-field">
                            <label className="cf-label">الأشهر</label>
                            <NumberInput id="installment-months" value={form.installmentMonths} min={1} step={1}
                              onChange={(v) => onChange({ installmentMonths: String(Math.max(1, Number(v) || 1)) })}
                              required disabled={autoPaymentType === "كاش"}
                              tabIndex={8}
                              hideArrows
                            />
                          </div>

                          {/* صف ٣: القسط الأول - كامل العرض */}
                          <div className="cf-field cf-field--span2">
                            <label className="cf-label">
                              {autoPaymentType === "موعد" ? "موعد التسليم" : "القسط الأول"}
                            </label>
                            <UnifiedDateField id="first-payment-date"
                              value={autoPaymentType === "موعد" ? form.deliveryDate : form.firstPaymentDate}
                              onChange={(v) => {
                                if (autoPaymentType === "موعد") onChange({ deliveryDate: v });
                                else onChange({ firstPaymentDate: v });
                              }}
                              disabled={autoPaymentType === "كاش"}
                              tabIndex={9}
                            />
                          </div>

                        </div>
                      </div>

                    </div>
                  </div>
                )}

                {/* ── قسم الملاحظات (full width) ── */}
                <div className="car-dashboard__card car-dashboard__card--full car-dashboard__card--notes">
                  <h3 className="car-dashboard__card-title">📝 الملاحظات</h3>
                  <div className="car-dashboard__card-body--single">
                    <div className="cf-field cf-field--notes">
                      <textarea
                        id="car-details"
                        className="textarea cf-textarea"
                        value={form.details}
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                        onChange={(e) => onChange({ details: e.target.value })}
                        placeholder="حالة السيارة، الصبغ..."
                        rows={3}
                        tabIndex={10}
                      />
                    </div>
                  </div>
                </div>

                {/* ── أزرار الإجراءات ── */}
                <div className="car-dashboard__actions">
                  <ActionButton type="submit" variant="primary" disabled={saving} tabIndex={11}>
                    {saving
                      ? "جاري الحفظ..."
                      : activePage === "sale" && isEditing
                        ? "بيع السيارة"
                        : isEditing
                          ? "تعديل وحفظ البيانات"
                          : "تأكيد إضافة السيارة"}
                  </ActionButton>
                  <ActionButton type="button" variant="ghost" onClick={onClose} disabled={saving} tabIndex={12}>
                    إلغاء الأمر
                  </ActionButton>
                </div>

              </div>{/* /car-dashboard */}

            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
