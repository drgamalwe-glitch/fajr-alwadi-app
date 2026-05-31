import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

interface ComboBoxProps {
  id?: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  dir?: "ltr" | "rtl";
  transformInput?: (value: string) => string;
  autoFocus?: boolean;
}

/**
 * قائمة منسدلة مع بحث:
 * - لا تقبل إلا القيم الموجودة في القائمة
 * - عند الكتابة تُصفَّى الخيارات وتُختار تلقائياً إذا بقي خيار واحد
 * - عند الخروج (blur) تُعاد القيمة الصحيحة أو تُمسح إذا لم تكن صالحة
 */
export function ComboBox({
  id, value, options, onChange,
  placeholder = "اكتب أو اختر...",
  disabled = false, required = false, dir,
  transformInput = (value) => value,
  autoFocus,
}: ComboBoxProps) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingSelectionRef = useRef<string | null>(null);
  const pointerToggleRef = useRef(false);

  /* مزامنة query مع value الخارجية */
  useEffect(() => { setQuery(value); }, [value]);

  /* إغلاق عند النقر خارج المكوّن */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setTyped(false);
        setActiveIndex(0);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  /* فتح تلقائي عند autoFocus */
  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus();
    }
  }, []);

  /* تصفية الخيارات بناءً على query */
  const filtered = !typed || query.trim() === ""
    ? options
    : options.filter((o) =>
        o.toLowerCase().includes(query.trim().toLowerCase())
      );

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = transformInput(e.target.value);
    setQuery(q);
    setTyped(true);
    setOpen(true);
    setActiveIndex(0);
  };

  const openFullList = () => {
    if (disabled) return;
    setTyped(false);
    setOpen(true);
  };

  const handleSelect = (opt: string) => {
    pendingSelectionRef.current = opt;
    onChange(opt);
    setQuery(opt);
    setTyped(false);
    setOpen(false);
    setActiveIndex(0);
    inputRef.current?.blur();
  };

  /* عند الخروج: إذا لم تكن القيمة في القائمة → امسح أو أعد القيمة القديمة */
  const handleBlur = () => {
    setTimeout(() => {
      const pendingSelection = pendingSelectionRef.current;
      if (pendingSelection) {
        pendingSelectionRef.current = null;
        setQuery(pendingSelection);
        setTyped(false);
        setOpen(false);
        setActiveIndex(0);
        return;
      }

      const exact = options.find(
        (o) => o.toLowerCase() === transformInput(query).trim().toLowerCase()
      );
      if (exact) {
        onChange(exact);
        setQuery(exact);
      } else {
        /* إذا لم تطابق أي خيار → أعد القيمة المحفوظة */
        setQuery(value);
      }
      setTyped(false);
      setOpen(false);
      setActiveIndex(0);
    }, 150);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
      setQuery(value);
      setTyped(false);
      setActiveIndex(0);
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setActiveIndex(0);
        return;
      }
      const nextIndex = Math.min(activeIndex + 1, filtered.length - 1);
      setActiveIndex(nextIndex);
      const opt = filtered[nextIndex];
      if (opt) {
        setQuery(opt);
        onChange(opt);
      }
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setActiveIndex(filtered.length - 1);
        return;
      }
      const prevIndex = Math.max(activeIndex - 1, 0);
      setActiveIndex(prevIndex);
      const opt = filtered[prevIndex];
      if (opt) {
        setQuery(opt);
        onChange(opt);
      }
    }
    if (e.key === "Enter" && open && filtered[activeIndex]) {
      e.preventDefault();
      handleSelect(filtered[activeIndex]);
    }
  };

  const toggleOpen = () => {
    if (disabled) return;
    setTyped(false);
    setOpen((current) => !current);
    setActiveIndex(0);
  };

  return (
    <div className="combo-wrap" ref={containerRef}>
      <input
        ref={inputRef}
        id={id}
        type="text"
        className="input combo-input"
        value={query}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        dir={dir}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        onChange={handleInput}
        onFocus={() => {
          if (!pointerToggleRef.current && !open) openFullList();
        }}
        onPointerDown={(e) => {
          e.preventDefault();
          pointerToggleRef.current = true;
          inputRef.current?.focus();
          toggleOpen();
          window.setTimeout(() => {
            pointerToggleRef.current = false;
          }, 0);
        }}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        onWheel={(e) => {
          if (disabled) return;
          e.preventDefault();
          const delta = e.deltaY > 0 ? 1 : -1;
          const curIdx = options.indexOf(query);
          if (curIdx === -1) {
            const first = delta > 0 ? 0 : options.length - 1;
            setQuery(options[first]);
            onChange(options[first]);
          } else {
            const next = curIdx + delta;
            if (next >= 0 && next < options.length) {
              setQuery(options[next]);
              onChange(options[next]);
            }
          }
        }}
        aria-autocomplete="list"
        aria-expanded={open}
      />
      {/* سهم */}
      <span className="combo-arrow" aria-hidden onClick={() => {
        if (!disabled) { toggleOpen(); inputRef.current?.focus(); }
      }}>▾</span>

      <AnimatePresence>
        {open && !disabled && filtered.length > 0 && (
          <motion.ul
            className="combo-list"
            role="listbox"
            initial={{ opacity: 0, y: -8, scale: 0.97, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -6, scale: 0.98, filter: "blur(4px)" }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            {filtered.map((opt, index) => (
              <li
                key={opt}
                role="option"
                aria-selected={opt === value}
                className={`combo-item${opt === value ? " combo-item--active" : ""}${index === activeIndex ? " combo-item--highlighted" : ""}`}
                onMouseEnter={() => setActiveIndex(index)}
                onPointerDown={(e) => { e.preventDefault(); handleSelect(opt); }}
              >
                {opt}
              </li>
            ))}
          </motion.ul>
        )}

        {open && !disabled && filtered.length === 0 && (
          <motion.div
            className="combo-empty"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
          >
            لا توجد نتائج
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
