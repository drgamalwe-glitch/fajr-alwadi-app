import { useEffect, type ReactNode } from "react";
import { ActionButton } from "./ui/ActionButton";
import { GoldFxButton } from "./ui/GoldFxButton";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "تأكيد",
  cancelLabel = "إلغاء",
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !loading) {
        // F11: don't trigger confirm when the user is typing in an input/textarea/contenteditable.
        const active = document.activeElement;
        const tag = (active?.tagName ?? "").toLowerCase();
        if (tag === "input" || tag === "textarea" || (active as HTMLElement)?.isContentEditable) {
          return; // don't trigger on Enter while typing
        }
        e.preventDefault();
        onConfirm();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, loading, onConfirm]);

  if (!open) return null;

  return (
    <div className="fx-confirm-overlay" role="presentation" onClick={onCancel}>
      <div
        className="fx-confirm-dialog"
        role="alertdialog"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="confirm-title" className="fx-confirm-title">
          {title}
        </h3>
        <p id="confirm-message" className="fx-confirm-message">
          {message}
        </p>
        <div className="fx-confirm-actions">
          <GoldFxButton
            type="button"
            variant={danger ? "red" : "green"}
            onClick={onConfirm}
            disabled={loading}
          >
            <span className="gold-fx-btn__label">{loading ? "جاري التنفيذ..." : confirmLabel}</span>
          </GoldFxButton>
          <ActionButton
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={loading}
          >
            {cancelLabel}
          </ActionButton>
        </div>
      </div>
    </div>
  );
}

