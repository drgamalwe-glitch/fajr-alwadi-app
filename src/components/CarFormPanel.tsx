import { useEffect, useRef } from "react";
import type { CarFormState } from "../types";
import { formatIqd } from "../utils/finance";
import { BYD_MODELS, CAR_COLORS, IRAQ_PROVINCES } from "../utils/carData";
import { arabicKeyboardToEnglish, englishKeyboardToArabic, toChassisText } from "../utils/keyboardLayout";
import { toEnglishDigits } from "../utils/numberInput";
import { todayIsoDate } from "../utils/dateSegments";
import { NumberInput } from "./NumberInput";
import { ComboBox } from "./ComboBox";
import { ElegantSwitch } from "./ElegantSwitch";
import { UnifiedDateField } from "./UnifiedDateField";
import { YearScrollField } from "./YearScrollField";

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
  const isSold = form.status === "مبيوعة";
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
  const title = [form.model, form.year].filter(Boolean).join(" ") || (isEditing ? "تفاصيل السيارة" : "سيارة جديدة");
  const plateLabel = form.num
    ? [form.num, form.province].filter(Boolean).join(" · ")
    : null;
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (isSold) {
      const el = document.getElementById("car-selling");
      if (el) setTimeout(() => el.focus(), 100);
      if (!form.saleDate) {
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

  /* ملاحظة تلقائية */
  const prevAutoNote = useRef("");

  useEffect(() => {
    if (!isSold) return;
    const carName = form.name || form.model || "";
    const buyer = form.buyerName?.trim();
    const phone = form.phone?.trim();
    const price = form.selling;
    const payLabel = autoPaymentType === "كاش" ? "كاش" : autoPaymentType === "موعد" ? "موعد تسليم" : "أقساط";

    const parts: string[] = [];
    if (buyer) parts.push(`المشتري: ${buyer}`);
    if (phone) parts.push(`الهاتف: ${phone}`);
    if (carName) parts.push(`السيارة: ${carName}`);
    if (price) parts.push(`السعر: ${Number(price).toLocaleString("en-US")}`);
    parts.push(`الدفع: ${payLabel}`);
    const note = parts.join(" | ");

    const current = form.details?.trim();
    if (!current || current === prevAutoNote.current) {
      onChange({ details: note });
      prevAutoNote.current = note;
    }
  }, [isSold, form.name, form.buyerName, form.phone, form.selling, autoPaymentType]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const formEl = formRef.current;
    if (!formEl) return;

    formEl.querySelectorAll(".input--error").forEach(el => el.classList.remove("input--error"));

    const checks: { id: string; valid: () => boolean }[] = [
      { id: "car-model",     valid: () => !!form.model.trim() },
      { id: "car-year",      valid: () => !!form.year.trim() },
      { id: "car-color",     valid: () => !!form.color.trim() },
      { id: "car-num",       valid: () => !!form.num.trim() },
      { id: "car-province",  valid: () => !!form.province.trim() },
      { id: "car-chassis",   valid: () => !!form.chassis.trim() },
      { id: "car-purchase",  valid: () => form.purchase !== "" && Number(form.purchase) > 0 },
    ];
    if (isSold) {
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
    <div className={`car-form-panel car-form-panel--${form.status === "مبيوعة" ? "sold" : "avail"}`}>
      <header className="cf-header">
        {onClose && (
          <button
            type="button"
            className="cf-close"
            onClick={onClose}
            aria-label="إغلاق"
            disabled={saving}
          >
            ×
          </button>
        )}
        <div className="cf-header__info">
          <p className="cf-header__line">{title}</p>
          {plateLabel && (
            <p className="cf-header__line" dir="ltr">{plateLabel}</p>
          )}
        </div>
        <div className="cf-header__status">
          <ElegantSwitch
            checked={form.status === "مبيوعة"}
            onChange={(checked) => onChange({ status: checked ? "مبيوعة" : "متوفرة" })}
            offLabel="متوفرة"
            onLabel="تم البيع"
            offColor="#10b981"
            onColor="#f43f5e"
            direction="horizontal"
            noLabels
          />
          <span className={`cf-status-label${form.status === "مبيوعة" ? " cf-status-label--sold" : ""}`}>
            {form.status === "مبيوعة" ? "مبيوعة" : "متوفرة"}
          </span>
        </div>
      </header>

      <form className="car-form" onSubmit={handleSubmit} ref={formRef}>
        <div className="cf-board">
          <section className="cf-zone cf-zone--vehicle">
            <h3 className="cf-zone__title">بيانات السيارة</h3>
            <div className="cf-zone__body">
          <div className="cf-board__row cf-board__row--vehicle">
            <div className="cf-field cf-field--model">
              <label className="cf-label" htmlFor="car-model">نوع السيارة</label>
              <ComboBox
                id="car-model"
                value={form.model}
                options={BYD_MODELS}
                onChange={(v) => onChange({ model: v })}
                transformInput={(v) => arabicKeyboardToEnglish(v).toUpperCase()}
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
              <ComboBox
                id="car-color"
                value={form.color}
                options={CAR_COLORS}
                onChange={(v) => onChange({ color: v })}
                transformInput={englishKeyboardToArabic}
                placeholder="لون"
                required
              />
            </div>
            <div className="cf-field cf-field--plate">
              <label className="cf-label" htmlFor="car-num">رقم اللوحة</label>
              <input
                id="car-num" className="input" type="text" inputMode="decimal"
                value={form.num} dir="ltr"
                autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
                onInput={(e) => patchEnglishText("num", e.currentTarget.value)}
                onChange={(e) => patchEnglishText("num", e.target.value)}
                onBlur={(e) => patchEnglishText("num", e.currentTarget.value)}
                onFocus={(e) => e.target.select()}
                onMouseUp={(e) => e.preventDefault()}
                placeholder="12345"
                required
              />
            </div>
            <div className="cf-field cf-field--province">
              <label className="cf-label" htmlFor="car-province">المحافظة</label>
              <ComboBox
                id="car-province"
                value={form.province}
                options={IRAQ_PROVINCES}
                onChange={(v) => onChange({ province: v })}
                transformInput={englishKeyboardToArabic}
                placeholder="محافظة"
                required
              />
            </div>
            <div className="cf-field cf-field--chassis">
              <label className="cf-label" htmlFor="car-chassis">رقم الشاصي</label>
              <input
                id="car-chassis" className="input" type="text"
                value={form.chassis} dir="ltr"
                autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
                onInput={(e) => patchEnglishText("chassis", e.currentTarget.value)}
                onChange={(e) => patchEnglishText("chassis", e.target.value)}
                onBlur={(e) => patchEnglishText("chassis", e.currentTarget.value)}
                placeholder="VIN"
                required
              />
            </div>
          </div>
            </div>
          </section>

          <div className="cf-trade-split">
            <section className="cf-zone cf-zone--purchase">
              <h3 className="cf-zone__title">الشراء</h3>
              <div className="cf-zone__body">
                <div className="cf-board__row cf-board__row--deal">
                  <div className="cf-field cf-field--price">
                    <label className="cf-label" htmlFor="car-purchase">سعر الشراء</label>
                    <NumberInput id="car-purchase" value={form.purchase} wheelMultiply={1000}
                      onChange={(purchase) => onChange({ purchase })} required />
                  </div>
                  <div className="cf-field cf-field--date">
                    <label className="cf-label">تاريخ الشراء</label>
                    <UnifiedDateField
                      value={form.purchaseDate}
                      onChange={(purchaseDate) => onChange({ purchaseDate })}
                    />
                  </div>
                </div>
              </div>
            </section>

            <section className={`cf-zone cf-zone--sale${!isSold ? " cf-zone--muted" : ""}`}>
              <h3 className="cf-zone__title">البيع</h3>
              <div className="cf-zone__body cf-zone__body--sale">
                <div className="cf-board__row cf-board__row--deal">
                  <div className="cf-field cf-field--price">
                    <label className="cf-label" htmlFor="car-selling">سعر البيع</label>
                    <NumberInput id="car-selling" value={form.selling} wheelMultiply={1000}
                      onChange={(selling) => onChange({ selling })} required disabled={!isSold}
                      tabIndex={1} onKeyDown={(e) => {
                        if (e.key === "Enter") onChange({ amountPaid: form.selling });
                      }} />
                  </div>
                  <div className="cf-field cf-field--price-sm">
                    <label className="cf-label" htmlFor="amount-paid">المبلغ المستلم</label>
                    <NumberInput id="amount-paid" value={form.amountPaid} wheelMultiply={1000}
                      onChange={(amountPaid) => onChange({ amountPaid })} required disabled={!isSold}
                      tabIndex={2} />
                  </div>
                </div>
                <div className="cf-board__row">
                  <div className="cf-field cf-field--date">
                    <label className="cf-label">تاريخ البيع</label>
                    <UnifiedDateField
                      value={form.saleDate}
                      onChange={(saleDate) => onChange({ saleDate })}
                      disabled={!isSold}
                      tabIndex={3}
                    />
                  </div>
                </div>
              </div>
            </section>

            <section className={`cf-zone cf-zone--buyer${!isSold ? " cf-zone--muted" : ""}`}>
              <h3 className="cf-zone__title">المشتري</h3>
              <div className="cf-zone__body cf-zone__body--buyer">
                <div className="cf-field cf-field--buyer">
                  <label className="cf-label" htmlFor="buyer-name">اسم المشتري</label>
                  <input
                    id="buyer-name" className="input" type="text"
                    value={form.buyerName}
                    onChange={(e) => onChange({ buyerName: e.target.value })}
                    placeholder="الاسم"
                    disabled={!isSold}
                    required={isSold}
                    tabIndex={4}
                  />
                </div>
                <div className="cf-field cf-field--phone">
                  <label className="cf-label" htmlFor="buyer-phone">رقم الهاتف</label>
                  <input id="buyer-phone" className="input" type="text" value={form.phone}
                    autoComplete="new-password" autoCorrect="off" autoCapitalize="off" spellCheck={false}
                    dir="ltr" placeholder="07XX XXX XXXX"
                    disabled={!isSold}
                    onInput={(e) => onChange({ phone: e.currentTarget.value })}
                    onChange={(e) => onChange({ phone: e.target.value })}
                    onBlur={(e) => onChange({ phone: e.currentTarget.value })}
                    tabIndex={5} />
                </div>
              </div>
            </section>
          </div>

          <section className={`cf-zone cf-zone--pay cf-zone--pay-${autoPaymentType === "كاش" ? "cash" : autoPaymentType === "موعد" ? "promise" : "installment"}${!isSold ? " cf-zone--muted" : ""}`}>
            <h3 className="cf-zone__title">
              الدفع {autoPaymentType === "كاش" ? "كاش" : autoPaymentType === "موعد" ? "موعد تسليم" : "أقساط"}
            </h3>
            <div className="cf-zone__body">
          <div className="cf-board__row cf-board__row--pay">
            <div className="cf-field cf-field--price-sm">
              <label className="cf-label" htmlFor="amount-remaining">المتبقي</label>
              <NumberInput id="amount-remaining" value={form.amountRemaining} wheelMultiply={1000}
                onChange={(amountRemaining) => onChange({ amountRemaining })}
                required={isSold} disabled={!isSold || autoPaymentType === "كاش"}
                tabIndex={6} />
            </div>
            <div className="cf-field cf-field--months">
              <label className="cf-label" htmlFor="installment-months">الأشهر</label>
              <NumberInput id="installment-months" value={form.installmentMonths} min={1} step={1}
                onChange={(v) => onChange({ installmentMonths: String(Math.max(1, Number(v) || 1)) })}
                required disabled={!isSold || autoPaymentType === "كاش"}
                tabIndex={8} />
            </div>
            <div className="cf-field cf-field--first-pay-date">
              <label className="cf-label" htmlFor="first-payment-date">
                {autoPaymentType === "موعد" ? "موعد التسليم" : "موعد القسط الأول"}
              </label>
              <UnifiedDateField id="first-payment-date"
                value={autoPaymentType === "موعد" ? form.deliveryDate : form.firstPaymentDate}
                onChange={(v) => {
                  if (autoPaymentType === "موعد") onChange({ deliveryDate: v });
                  else onChange({ firstPaymentDate: v });
                }}
                disabled={!isSold || autoPaymentType === "كاش"}
                tabIndex={9}
              />
            </div>
            <div className={`cf-install-summary${autoPaymentType !== "اقساط" ? " cf-install-summary--muted" : ""}`}>
              <span className="cf-label">القسط الشهري</span>
              <strong className="cf-install-amount">{formatIqd(monthly)}</strong>
            </div>
          </div>
            </div>
          </section>

          <section className="cf-zone cf-zone--notes">
            <h3 className="cf-zone__title">ملاحظات</h3>
            <div className="cf-zone__body cf-zone__body--notes">
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
              rows={2}
              tabIndex={10}
            />
          </div>
            </div>
          </section>
        </div>

        <footer className="cf-footer">
          <div className="cf-footer__left">
            <button type="submit" className="btn btn--primary btn--sm" disabled={saving} tabIndex={11}>
              {saving ? "جاري الحفظ..." : isEditing ? "حفظ" : "إضافة"}
            </button>
            {onClose && (
              <button type="button" className="btn btn--ghost btn--sm" onClick={onClose} disabled={saving} tabIndex={12}>
                إلغاء
              </button>
            )}
          </div>
        </footer>
      </form>
    </div>
  );
}
