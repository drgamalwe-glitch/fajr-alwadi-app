import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { callTauri } from "../api/tauri";
import { normalizePhoneNumber } from "../utils/numberInput";
import { ActionButton } from "./ui/ActionButton";
import { SearchableCombobox } from "./SearchableCombobox";
import type { Partner } from "../types";

type PartnerKind = "ممول" | "شركة" | "زبون";

interface QuickAddPartnerModalProps {
  kind: PartnerKind;
  onClose: () => void;
  onSaved: (name: string, phone: string) => void;
  sessionToken?: string | null;
}

const KIND_LABEL: Record<PartnerKind, string> = {
  "ممول": "ممول",
  "شركة": "شركة",
  "زبون": "زبون",
};

export function QuickAddPartnerModal({ kind, onClose, onSaved, sessionToken }: QuickAddPartnerModalProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const [existingNames, setExistingNames] = useState<string[]>([]);

  useEffect(() => {
    callTauri<Partner[]>("get_partners")
      .then((res) => {
        setExistingNames((res || []).map((p) => p.partner_name));
      })
      .catch(console.error);
  }, []);

  const normalizeArabic = (str: string): string => {
    return str
      .trim()
      .toLowerCase()
      .replace(/[أإآ]/g, "ا")
      .replace(/ة/g, "ه")
      .replace(/ى/g, "ي")
      .replace(/[\u064B-\u0652]/g, "");
  };

  const nameExists = name.trim() !== "" && existingNames.some(
    (n) => normalizeArabic(n) === normalizeArabic(name)
  );

  useEffect(() => {
    const t = setTimeout(() => nameRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const patchPhone = (val: string) => {
    setPhone(normalizePhoneNumber(val));
  };

  const handlePhoneBeforeInput = (e: React.FormEvent<HTMLInputElement>) => {
    const data = (e.nativeEvent as InputEvent).data;
    if (!data) return;
    const normalized = normalizePhoneNumber(data);
    if (normalized === data) return;
    e.preventDefault();

    const input = e.currentTarget;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    const next = normalizePhoneNumber(
      `${input.value.slice(0, start)}${normalized}${input.value.slice(end)}`
    );
    setPhone(next);
    requestAnimationFrame(() => {
      const pos = start + normalized.length;
      input.setSelectionRange(pos, pos);
    });
  };

  const doSave = async () => {
    const nameTrim = name.trim();
    if (!nameTrim) {
      setNameError(true);
      nameRef.current?.focus();
      return;
    }
    if (nameExists) {
      return;
    }
    setSaving(true);
    try {
      const partnersList = await callTauri<Partner[]>("get_partners");
      const alreadyExists = (partnersList || []).some(
        (p) => p.partner_name.trim().toLowerCase() === nameTrim.toLowerCase()
      );
      if (alreadyExists) {
        alert("اسم الحساب موجود مسبقا الرجاء اختيار اسم آخر");
        setSaving(false);
        return;
      }

      const finalPhone = normalizePhoneNumber(phone);

      await callTauri("add_partner", {
        name: nameTrim,
        phone: finalPhone,
        kind,
        sessionToken: sessionToken || null,
      });
      onSaved(nameTrim, finalPhone);
    } catch (err) {
      console.error("QuickAddPartnerModal: failed to save", err);
      alert("تعذّر حفظ الحساب، حاول مرة أخرى.");
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void doSave();
  };

  return createPortal(
    <div
      className="modal-overlay"
      role="presentation"
      onClick={onClose}
    >
      <div
        className={`modal-dialog modal-dialog--slim modal-dialog--overflow-visible modal-dialog--kind-${kind}`}
        role="dialog"
        aria-modal="true"
        data-testid={`quick-add-${kind}-dialog`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="partner-form-panel--slim">
          <div className="partner-main-content">
            <div className="car-form-panel__header" style={{ textAlign: "center", width: "100%" }}>
              <h3 className="car-form-panel__title" style={{ margin: "0 auto" }}>
                إضافة {KIND_LABEL[kind]} جديد
              </h3>
            </div>
            <form className="form customer-form partner-identity-form" onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="label" htmlFor="partner-name" style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
                  {nameExists ? (
                    <span style={{ color: "#ef4444", fontSize: "var(--font-size)", fontWeight: "bold" }}>
                      اسم الحساب موجود!
                    </span>
                  ) : (
                    <span>اسم {KIND_LABEL[kind]}&ensp;<span style={{ color: "#ef4444" }}>*</span></span>
                  )}
                </label>
                <input
                  ref={nameRef}
                  id="partner-name"
                  data-testid="quick-add-partner-name"
                  type="text"
                  dir="rtl"
                  value={name}
                  onChange={(e) => { setName(e.target.value); setNameError(false); }}
                  placeholder={`أدخل اسم ${KIND_LABEL[kind]}`}
                  autoComplete="off"
                  className="app-input-field"
                  style={{
                    height: "var(--input-height, 48px)",
                    padding: "0 14px",
                    width: "100%",
                    boxSizing: "border-box",
                    borderRadius: "var(--input-border-radius, var(--all-radius))",
                    border: nameError ? "1px solid #ef4444" : "var(--input-border-color, 1px solid rgba(255,255,255,0.1))",
                    background: "var(--input-bg, rgba(255,255,255,0.05))",
                    color: "var(--input-text-color, #fff)",
                    outline: "none",
                    textAlign: "center",
                    transition: "border-color 0.2s",
                  }}
                />
                {nameError && (
                  <p style={{
                    margin: "5px 0 0",
                    fontSize: "calc(var(--font-size, 1.3rem) * 0.72)",
                    color: "#ef4444",
                    fontFamily: "var(--font-family, Tajawal), sans-serif",
                  }}>
                    يرجى إدخال الاسم
                  </p>
                )}
              </div>
              <div className="form-group">
                <label className="label" htmlFor="partner-phone">
                  رقم الهاتف
                </label>
                <input
                  id="partner-phone"
                  data-testid="quick-add-partner-phone"
                  type="tel"
                  inputMode="tel"
                  dir="ltr"
                  value={phone}
                  onBeforeInput={handlePhoneBeforeInput}
                  onChange={(e) => patchPhone(e.target.value)}
                  onBlur={(e) => {
                    setPhone(normalizePhoneNumber(e.target.value));
                  }}
                  placeholder="07xx xxx xxxx"
                  autoComplete="off"
                  className="app-input-field"
                  style={{
                    height: "var(--input-height, 48px)",
                    padding: "0 14px",
                    width: "100%",
                    boxSizing: "border-box",
                    borderRadius: "var(--input-border-radius, var(--all-radius))",
                    border: "var(--input-border-color, 1px solid rgba(255,255,255,0.1))",
                    background: "var(--input-bg, rgba(255,255,255,0.05))",
                    color: "var(--input-text-color, #fff)",
                    outline: "none",
                    textAlign: "center",
                    transition: "border-color 0.2s",
                  }}
                />
              </div>
              <div className="form-group" style={{ zIndex: 10 }}>
                <label className="label">نوع الحساب</label>
                <SearchableCombobox
                  value={kind}
                  onChange={() => {}}
                  disabled={true}
                  placeholder="نوع الحساب"
                  options={[
                    { label: "زبون", value: "زبون", kind: "زبون" },
                    { label: "ممول", value: "ممول", kind: "ممول" },
                    { label: "شركة", value: "شركة", kind: "شركة" },
                  ]}
                />
              </div>
              <div className="car-form-panel__actions">
                <ActionButton type="submit" variant="success" disabled={saving || nameExists} data-testid="quick-add-partner-save">
                  {saving ? "جاري الحفظ..." : `حفظ ${KIND_LABEL[kind]}`}
                </ActionButton>
                <ActionButton type="button" variant="ghost" onClick={onClose} disabled={saving} data-testid="quick-add-partner-cancel">
                  إلغاء
                </ActionButton>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
