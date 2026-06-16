/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * MONBATHIQA — Unified Modal/Popup System
 * ═══════════════════════════════════════════════════════════════════════════════
 * جميع النوافذ المنبثقة بتصميم عصري موحّد.
 * استيراد: import { MbConfirmDialog, MbSearchDialog, ... } from "./monbathiqa";
 * الألوان مشتقة من MASTER_COLORS عبر syncThemeToCSS()
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import { motion } from "motion/react";
import { AlertTriangle, Search, X, Check } from "lucide-react";
import { BUTTON_MOTION } from "../theme/ui/buttons";

/* ────── أنواع مشتركة ──── */

interface MbBaseProps {
  open: boolean;
  onClose: () => void;
}

interface MbFieldDef {
  key: string;
  label: string;
  type?: "text" | "number" | "select" | "textarea";
  placeholder?: string;
  options?: { value: string; label: string }[];
  defaultValue?: string | number;
  required?: boolean;
  fullWidth?: boolean;
  half?: boolean;
  dir?: "ltr" | "rtl";
}

interface MbSectionDef {
  title: string;
  fields: MbFieldDef[];
}

/* ═══════════════════════════════════════════════════════════════════════════════
   MbConfirmDialog — نافذة تأكيد الحذف
   ═══════════════════════════════════════════════════════════════════════════════ */

interface MbConfirmDialogProps extends MbBaseProps {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  onConfirm: () => void;
}

export function MbConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "نعم، احذف",
  cancelLabel = "إلغاء",
  loading = false,
  onConfirm,
  onClose,
}: MbConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="mb-overlay" onClick={onClose}>
      <div
        className="mb-dialog"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-labelledby="mb-confirm-title"
        aria-describedby="mb-confirm-msg"
      >
        <div className="mb-dialog__body">
          <div className="mb-confirm__icon">
            <AlertTriangle size={28} />
          </div>
          <h3
            id="mb-confirm-title"
            className="mb-confirm__message"
            style={{ color: "#fff", fontWeight: 800, fontSize: "var(--font-size)" }}
          >
            {title}
          </h3>
          <p id="mb-confirm-msg" className="mb-confirm__message">
            {message}
          </p>
        </div>
        <div className="mb-actions">
          <motion.button
            type="button"
            className="mb-btn mb-btn--danger"
            onClick={onConfirm}
            disabled={loading}
            whileHover={loading ? undefined : BUTTON_MOTION.hoverScale}
            whileTap={loading ? undefined : BUTTON_MOTION.tapScale}
            transition={BUTTON_MOTION.spring}
          >
            <Check size={16} className="mb-btn__icon" />
            {loading ? "جاري التنفيذ..." : confirmLabel}
          </motion.button>
          <motion.button
            type="button"
            className="mb-btn mb-btn--cancel"
            onClick={onClose}
            disabled={loading}
            whileHover={loading ? undefined : BUTTON_MOTION.hoverScale}
            whileTap={loading ? undefined : BUTTON_MOTION.tapScale}
            transition={BUTTON_MOTION.spring}
          >
            <X size={16} className="mb-btn__icon" />
            {cancelLabel}
          </motion.button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   MbFormDialog — نافذة نموذج عامة (تُستخدم لجميع النوافذ الإضافية)
   ═══════════════════════════════════════════════════════════════════════════════ */

interface MbFormDialogProps extends MbBaseProps {
  title: string;
  icon?: ReactNode;
  sections: MbSectionDef[];
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  values?: Record<string, string | number>;
  onConfirm: (values: Record<string, string | number>) => void;
}

export function MbFormDialog({
  open,
  title,
  icon,
  sections,
  confirmLabel = "حفظ",
  cancelLabel = "إلغاء",
  loading = false,
  values: externalValues,
  onConfirm,
  onClose,
}: MbFormDialogProps) {
  const buildDefaults = useCallback(() => {
    const defaults: Record<string, string | number> = {};
    for (const section of sections) {
      for (const field of section.fields) {
        defaults[field.key] = externalValues?.[field.key] ?? field.defaultValue ?? "";
      }
    }
    return defaults;
  }, [sections, externalValues]);

  const [formValues, setFormValues] = useState<Record<string, string | number>>(buildDefaults);

  useEffect(() => {
    if (open) setFormValues(buildDefaults());
  }, [open, buildDefaults]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const handleChange = (key: string, value: string) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
  };

  if (!open) return null;

  return (
    <div className="mb-overlay" onClick={onClose}>
      <div
        className="mb-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="mb-form-title"
      >
        <div className="mb-dialog__header">
          <h2 id="mb-form-title" className="mb-dialog__title">
            {icon && <span className="mb-dialog__title-icon">{icon}</span>}
            {title}
          </h2>
          <button
            type="button"
            className="mb-dialog__close"
            onClick={onClose}
            aria-label="إغلاق"
          >
            ×
          </button>
        </div>

        <div className="mb-dialog__body">
          {sections.map((section, sIdx) => (
            <div className="mb-section" key={sIdx}>
              <div className="mb-section__title">{section.title}</div>
              <div className="mb-fields">
                {section.fields.map((field) => {
                  const fieldClass = [
                    "mb-field",
                    field.fullWidth ? "mb-field--full" : "",
                    field.half ? "mb-field--half" : "",
                  ]
                    .filter(Boolean)
                    .join(" ");

                  if (field.type === "textarea") {
                    return (
                      <div className={fieldClass} key={field.key}>
                        <label className="mb-field__label">{field.label}</label>
                        <textarea
                          className="mb-field__textarea"
                          placeholder={field.placeholder}
                          value={String(formValues[field.key] ?? "")}
                          onChange={(e) => handleChange(field.key, e.target.value)}
                          onFocus={(e) => setTimeout(() => e.target.select(), 0)}
                          rows={3}
                        />
                      </div>
                    );
                  }

                  if (field.type === "select" && field.options) {
                    return (
                      <div className={fieldClass} key={field.key}>
                        <label className="mb-field__label">{field.label}</label>
                        <select
                          className="mb-field__select"
                          value={String(formValues[field.key] ?? "")}
                          onChange={(e) => handleChange(field.key, e.target.value)}
                        >
                          {field.options.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  }

                  return (
                    <div className={fieldClass} key={field.key}>
                      <label className="mb-field__label">{field.label}</label>
                      <input
                        className="mb-field__input"
                        type={field.type === "number" ? "text" : "text"}
                        inputMode={field.type === "number" ? "decimal" : "text"}
                        placeholder={field.placeholder}
                        dir={field.dir}
                        value={String(formValues[field.key] ?? "")}
                        required={field.required}
                        onChange={(e) => handleChange(field.key, e.target.value)}
                        onFocus={(e) => setTimeout(() => e.target.select(), 0)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="mb-actions">
          <motion.button
            type="button"
            className="mb-btn mb-btn--confirm"
            onClick={() => onConfirm(formValues)}
            disabled={loading}
            whileHover={loading ? undefined : BUTTON_MOTION.hoverScale}
            whileTap={loading ? undefined : BUTTON_MOTION.tapScale}
            transition={BUTTON_MOTION.spring}
          >
            <Check size={16} className="mb-btn__icon" />
            {loading ? "جاري الحفظ..." : confirmLabel}
          </motion.button>
          <motion.button
            type="button"
            className="mb-btn mb-btn--cancel"
            onClick={onClose}
            disabled={loading}
            whileHover={loading ? undefined : BUTTON_MOTION.hoverScale}
            whileTap={loading ? undefined : BUTTON_MOTION.tapScale}
            transition={BUTTON_MOTION.spring}
          >
            <X size={16} className="mb-btn__icon" />
            {cancelLabel}
          </motion.button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   MbSearchDialog — نافذة البحث المنبثقة
   ═══════════════════════════════════════════════════════════════════════════════ */

interface MbSearchResult {
  id: string | number;
  title: string;
  subtitle?: string;
  meta?: string;
  data?: unknown;
}

interface MbSearchDialogProps extends MbBaseProps {
  title: string;
  placeholder?: string;
  emptyMessage?: string;
  results: MbSearchResult[];
  onSelect: (result: MbSearchResult) => void;
  highlightIdx?: number;
}

export function MbSearchDialog({
  open,
  title,
  placeholder = "ابحث...",
  emptyMessage = "لا توجد نتائج مطابقة",
  results,
  onSelect,
  onClose,
}: MbSearchDialogProps) {
  const [query, setQuery] = useState("");
  const [highlightIdx, setHighlightIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setHighlightIdx(0);
      const t = setTimeout(() => inputRef.current?.focus(), 120);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results.length > 0) {
      e.preventDefault();
      onSelect(results[highlightIdx] ?? results[0]);
    }
  };

  const highlightText = (text: string) => {
    if (!query) return text;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="mb-search__mark">{text.slice(idx, idx + query.length)}</mark>
        {text.slice(idx + query.length)}
      </>
    );
  };

  if (!open) return null;

  return (
    <div className="mb-overlay" onClick={onClose}>
      <div
        className="mb-dialog mb-search"
        onClick={(e) => e.stopPropagation()}
        role="search"
        aria-label={title}
      >
        <div className="mb-dialog__header">
          <h2 className="mb-dialog__title">
            <span className="mb-dialog__title-icon">
              <Search size={18} />
            </span>
            {title}
          </h2>
          {query && (
            <span className="mb-search__badge">{results.length}</span>
          )}
          <button
            type="button"
            className="mb-dialog__close"
            onClick={onClose}
            aria-label="إغلاق"
          >
            ×
          </button>
        </div>

        <div className="mb-dialog__body" style={{ gap: "12px" }}>
          <div className="mb-search__input-wrap">
            <Search size={18} className="mb-search__input-icon" />
            <input
              ref={inputRef}
              type="search"
              className="mb-search__input"
              placeholder={placeholder}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHighlightIdx(0);
              }}
              onKeyDown={handleKeyDown}
              autoComplete="off"
              dir="rtl"
            />
            {query && (
              <button
                type="button"
                className="mb-search__clear"
                onClick={() => {
                  setQuery("");
                  setHighlightIdx(0);
                }}
                aria-label="مسح"
              >
                ×
              </button>
            )}
          </div>

          {query && (
            <div className="mb-search__results">
              {results.length === 0 ? (
                <div className="mb-search__empty">
                  <span className="mb-search__empty-icon">🔍</span>
                  <span>{emptyMessage}</span>
                </div>
              ) : (
                <ul className="mb-search__list" role="listbox">
                  {results.slice(0, 10).map((item, idx) => (
                    <li
                      key={item.id}
                      className={`mb-search__item${
                        idx === highlightIdx ? " mb-search__item--active" : ""
                      }`}
                      role="option"
                      aria-selected={idx === highlightIdx}
                      onMouseEnter={() => setHighlightIdx(idx)}
                      onClick={() => onSelect(item)}
                    >
                      <div className="mb-search__item-main">
                        <span className="mb-search__item-title">
                          {highlightText(item.title)}
                        </span>
                      </div>
                      {(item.subtitle || item.meta) && (
                        <div className="mb-search__item-sub">
                          {item.subtitle && <span>{item.subtitle}</span>}
                          {item.subtitle && item.meta && (
                            <span className="mb-search__item-dot">•</span>
                          )}
                          {item.meta && <span>{item.meta}</span>}
                        </div>
                      )}
                    </li>
                  ))}
                  {results.length > 10 && (
                    <li className="mb-search__more">
                      و {results.length - 10} نتيجة أخرى...
                    </li>
                  )}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   MbDeleteConfirm — نافذة تأكيد الحذف المبسّطة
   ═══════════════════════════════════════════════════════════════════════════════ */

interface MbDeleteConfirmProps extends MbBaseProps {
  itemName: string;
  loading?: boolean;
  onConfirm: () => void;
}

export function MbDeleteConfirm({
  open,
  itemName,
  loading = false,
  onConfirm,
  onClose,
}: MbDeleteConfirmProps) {
  return (
    <MbConfirmDialog
      open={open}
      title="تأكيد الحذف"
      message={
        <>
          هل أنت متأكد من حذف <strong>{itemName}</strong> نهائياً؟
          <br />
          لا يمكن التراجع عن هذا الإجراء.
        </>
      }
      confirmLabel="نعم، احذف"
      cancelLabel="إلغاء"
      loading={loading}
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}
