import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { callTauri } from "../api/tauri";
import { toEnglishDigits } from "../utils/numberInput";
import { ActionButton } from "./ui/ActionButton";

type PartnerKind = "ممول" | "شركة";

interface QuickAddPartnerModalProps {
  kind: PartnerKind;
  onClose: () => void;
  onSaved: (name: string) => void;
}

const KIND_LABEL: Record<PartnerKind, string> = {
  "ممول": "ممول",
  "شركة": "شركة",
};

export function QuickAddPartnerModal({ kind, onClose, onSaved }: QuickAddPartnerModalProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

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
    const normalized = toEnglishDigits(val);
    const cleaned = normalized.replace(/[^\d+\s()-]/g, "");
    setPhone(cleaned);
  };

  const doSave = async () => {
    const nameTrim = name.trim();
    if (!nameTrim) {
      setNameError(true);
      nameRef.current?.focus();
      return;
    }
    setSaving(true);
    try {
      await callTauri("add_partner", {
        name: nameTrim,
        phone: phone.trim(),
        kind,
      });
      onSaved(nameTrim);
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
                <label className="label" htmlFor="partner-name">
                  اسم {KIND_LABEL[kind]}&ensp;<span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  ref={nameRef}
                  id="partner-name"
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
                    borderRadius: "var(--input-border-radius, 12px)",
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
                  type="text"
                  inputMode="tel"
                  dir="ltr"
                  value={phone}
                  onChange={(e) => patchPhone(e.target.value)}
                  placeholder="07xx xxx xxxx"
                  autoComplete="off"
                  className="app-input-field"
                  style={{
                    height: "var(--input-height, 48px)",
                    padding: "0 14px",
                    width: "100%",
                    boxSizing: "border-box",
                    borderRadius: "var(--input-border-radius, 12px)",
                    border: "var(--input-border-color, 1px solid rgba(255,255,255,0.1))",
                    background: "var(--input-bg, rgba(255,255,255,0.05))",
                    color: "var(--input-text-color, #fff)",
                    outline: "none",
                    textAlign: "center",
                    transition: "border-color 0.2s",
                  }}
                />
              </div>
              <div className="car-form-panel__actions">
                <ActionButton type="submit" variant="success" disabled={saving}>
                  {saving ? "جاري الحفظ..." : `حفظ ${KIND_LABEL[kind]}`}
                </ActionButton>
                <ActionButton type="button" variant="ghost" onClick={onClose} disabled={saving}>
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
