import { useCallback, useEffect, useState } from "react";

export const AMOUNT_PRIVACY_STORAGE_KEY = "fajr_hide_amounts";
export const AMOUNT_PRIVACY_EVENT = "fajr-hide-amounts-change";

function readStoredAmountPrivacy(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(AMOUNT_PRIVACY_STORAGE_KEY) === "1";
}

export function getAmountPrivacyEnabled(): boolean {
  return readStoredAmountPrivacy();
}

export function setAmountPrivacyEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AMOUNT_PRIVACY_STORAGE_KEY, enabled ? "1" : "0");
  window.dispatchEvent(new CustomEvent(AMOUNT_PRIVACY_EVENT, { detail: enabled }));
}

export function useAmountPrivacy() {
  const [enabled, setEnabledState] = useState(readStoredAmountPrivacy);

  useEffect(() => {
    const handleChange = (event: Event) => {
      const custom = event as CustomEvent<boolean>;
      setEnabledState(typeof custom.detail === "boolean" ? custom.detail : readStoredAmountPrivacy());
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === AMOUNT_PRIVACY_STORAGE_KEY) {
        setEnabledState(event.newValue === "1");
      }
    };

    window.addEventListener(AMOUNT_PRIVACY_EVENT, handleChange);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(AMOUNT_PRIVACY_EVENT, handleChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const setEnabled = useCallback((next: boolean) => {
    setAmountPrivacyEnabled(next);
    setEnabledState(next);
  }, []);

  return [enabled, setEnabled] as const;
}
