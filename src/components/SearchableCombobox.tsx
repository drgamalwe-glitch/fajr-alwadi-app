import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

export interface SearchableComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: { label: string; value: string; subLabel?: string; kind?: string }[];
  placeholder?: string;
  onOpenChange?: (open: boolean) => void;
  clearOptionText?: string;
  onClear?: () => void;
  suffix?: string;
}

export function SearchableCombobox({
  value,
  onChange,
  options,
  placeholder = "",
  onOpenChange,
  clearOptionText,
  onClear,
  suffix,
}: SearchableComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const isFocusingRef = useRef(false);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setSearch("");
      setHighlightedIndex(-1);
    }
    onOpenChange?.(open);
  };

  // إغلاق عند النقر خارج
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        handleOpenChange(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const selectedOption = options.find((o) => o.value === value);
  const selectedLabel = selectedOption?.label || "";
  const selectedKind = selectedOption?.kind;
  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase())
  );

  // التمرير التلقائي للعنصر المحدد
  useEffect(() => {
    if (isOpen && highlightedIndex >= 0) {
      const el = document.getElementById(`combobox-option-${highlightedIndex}`);
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedIndex, isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "Enter") handleOpenChange(true);
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((p) => (p < filtered.length - 1 ? p + 1 : p));
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((p) => (p > 0 ? p - 1 : p === -1 ? filtered.length - 1 : 0));
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < filtered.length) {
          onChange(filtered[highlightedIndex].value);
          handleOpenChange(false);
        } else if (filtered.length === 1) {
          onChange(filtered[0].value);
          handleOpenChange(false);
        }
        break;
      case "Escape":
        e.preventDefault();
        handleOpenChange(false);
        e.currentTarget.blur();
        break;
    }
  };

  return (
    <div
      ref={containerRef}
      className="search-select"
      style={{
        position: "relative",
        width: "100%",
        // عند فتح القائمة: ارفع z-index الحاوية لتطفو فوق الجدول
        zIndex: isOpen ? 200 : "auto",
      }}
    >
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        <input
          type="text"
          dir="rtl"
          value={isOpen ? search : selectedLabel}
          onChange={(e) => {
            setSearch(e.target.value);
            setHighlightedIndex(-1);
            if (!isOpen) handleOpenChange(true);
          }}
          onFocus={() => {
            isFocusingRef.current = true;
            handleOpenChange(true);
            setTimeout(() => { isFocusingRef.current = false; }, 150);
          }}
          onClick={() => {
            if (!isFocusingRef.current) handleOpenChange(!isOpen);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          className={`combobox-trigger ${suffix ? "combobox-trigger--has-suffix" : ""}`}
          data-kind={selectedKind || ""}
        />
        {suffix && <span className="combobox-suffix">{suffix}</span>}
        <span className={`combobox-arrow ${isOpen ? "combobox-arrow--open" : ""}`}>▼</span>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -12, scaleY: 0.96 }}
            animate={{ opacity: 1, y: 0,   scaleY: 1    }}
            exit={{    opacity: 0, y: -8,  scaleY: 0.96 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="combobox-dropdown combobox-dropdown--open"
            style={{
              position: "absolute",
              top: "100%",
              right: 0,
              left: 0,
              zIndex: 200,
              marginTop: "4px",
              transformOrigin: "top center",
            }}
          >
            <div className="combobox-dropdown-inner">
              {clearOptionText && onClear && (
                <div
                  onClick={() => { onClear(); handleOpenChange(false); }}
                  className="combobox-clear"
                >
                  {clearOptionText}
                </div>
              )}
              {filtered.length === 0 ? (
                <div className="combobox-no-result">لا توجد نتائج مطابقة</div>
              ) : (
                filtered.map((opt, index) => (
                  <div
                    id={`combobox-option-${index}`}
                    key={opt.value}
                    onClick={() => { onChange(opt.value); handleOpenChange(false); }}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={`combobox-option ${value === opt.value ? "combobox-option--selected" : ""} ${highlightedIndex === index ? "combobox-option--highlighted" : ""}`}
                  >
                    {opt.kind && <span className="combobox-option-dot" data-kind={opt.kind} />}
                    <span>{opt.label}</span>
                    {opt.subLabel && <span className="combobox-option-sub">{opt.subLabel}</span>}
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
