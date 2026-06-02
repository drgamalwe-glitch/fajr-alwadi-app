import { useEffect, useRef, useState } from "react";
import { cn } from "../lib/utils";
import { toEnglishDigits } from "../utils/numberInput";
import {
  bumpYearLastTwo,
  combineIsoDate,
  daysInMonth,
  getDay,
  getMonth,
  getYear,
  normalizeIsoDate,
  todayIsoDate,
} from "../utils/dateSegments";

type DateSegment = "day" | "month" | "year";

const SEGMENT_TAB_ORDER: DateSegment[] = ["day", "month", "year"];

const SEGMENT_RANGE: Record<DateSegment, [number, number]> = {
  year: [0, 4],
  month: [5, 7],
  day: [8, 10],
};

const SEGMENT_MAX: Record<DateSegment, number> = {
  year: 4,
  month: 2,
  day: 2,
};

interface UnifiedDateFieldProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
  tabIndex?: number;
}

function nextSegment(current: DateSegment, backward: boolean): DateSegment {
  const index = SEGMENT_TAB_ORDER.indexOf(current);
  if (backward) {
    return SEGMENT_TAB_ORDER[Math.max(0, index - 1)];
  }
  return SEGMENT_TAB_ORDER[Math.min(SEGMENT_TAB_ORDER.length - 1, index + 1)];
}

function bumpSegment(iso: string, segment: DateSegment, delta: number): string {
  const year = parseInt(getYear(iso), 10) || new Date().getFullYear();
  let month = parseInt(getMonth(iso), 10) || 1;
  let day = parseInt(getDay(iso), 10) || 1;

  if (segment === "year") {
    const nextYear = bumpYearLastTwo(year, delta);
    const maxDay = daysInMonth(nextYear, month);
    if (day > maxDay) day = maxDay;
    return combineIsoDate(String(nextYear), String(month).padStart(2, "0"), String(day).padStart(2, "0"));
  }

  if (segment === "month") {
    month += delta;
    if (month < 1) month = 12;
    if (month > 12) month = 1;
    const maxDay = daysInMonth(year, month);
    if (day > maxDay) day = maxDay;
    return combineIsoDate(String(year), String(month).padStart(2, "0"), String(day).padStart(2, "0"));
  }

  const maxDay = daysInMonth(year, month);
  day += delta;
  if (day < 1) day = maxDay;
  if (day > maxDay) day = 1;
  return combineIsoDate(String(year), String(month).padStart(2, "0"), String(day).padStart(2, "0"));
}

function segmentFromPos(pos: number): DateSegment {
  if (pos <= 4) return "year";
  if (pos <= 7) return "month";
  return "day";
}

export function UnifiedDateField({ value, onChange, disabled, id, tabIndex }: UnifiedDateFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [segment, setSegment] = useState<DateSegment>("day");
  const [digitBuf, setDigitBuf] = useState("");
  const digitBufRef = useRef("");
  const iso = normalizeIsoDate(value || todayIsoDate());
  const display = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : todayIsoDate();

  digitBufRef.current = digitBuf;

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const [start] = SEGMENT_RANGE[segment];
    if (digitBuf) {
      const pos = start + digitBuf.length;
      input.setSelectionRange(pos, pos);
    } else {
      input.setSelectionRange(start, start + SEGMENT_MAX[segment]);
    }
  }, [segment, display, digitBuf]);

  const applyDelta = (delta: number) => {
    onChange(bumpSegment(display, segment, delta));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const key = toEnglishDigits(e.key);
    if (key >= "0" && key <= "9" && key.length === 1) {
      e.preventDefault();
      const nextBuf = (digitBuf + key).slice(0, SEGMENT_MAX[segment]);
      setDigitBuf(nextBuf);

      let y = getYear(display);
      let m = getMonth(display);
      let d = getDay(display);

      if (segment === "year") y = nextBuf.padStart(4, "0");
      else if (segment === "month") m = nextBuf.padStart(2, "0");
      else d = nextBuf.padStart(2, "0");

      const next = combineIsoDate(y, m, d);
      if (/^\d{4}-\d{2}-\d{2}$/.test(next)) {
        onChange(next);
      }

      if (nextBuf.length === SEGMENT_MAX[segment]) {
        setDigitBuf("");
        setSegment(nextSegment(segment, false));
      }
      return;
    }

    if (e.key === "Backspace" && digitBuf.length > 0) {
      e.preventDefault();
      setDigitBuf(digitBuf.slice(0, -1));
      return;
    }

    if (digitBuf) setDigitBuf("");

    if (e.key === "Tab") {
      const next = nextSegment(segment, e.shiftKey);
      if (next === segment) return; // exit the field
      e.preventDefault();
      setSegment(next);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      applyDelta(1);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      applyDelta(-1);
    }
  };

  return (
    <div className="relative flex items-center w-full">
      {/* Glow الخلفية المحيطة — تدار بالكامل بالـ CSS لضمان انطفائها فور خروج التركيز */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-xl">
        <div
          className="input-glow absolute w-[500px] h-[500px] rounded-full top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 pointer-events-none"
          style={{
            background: "radial-gradient(circle, rgba(216, 168, 90, 0.08), transparent 70%)",
          }}
        />
      </div>

      <div
        className={cn(
          "relative flex items-center w-full rounded-xl border px-3 py-2 unified-date-field-wrapper",
          "bg-white/[0.03] backdrop-blur-xl",
          "transition-all duration-300",
          "border-white/10",
          disabled && "opacity-48 pointer-events-none",
        )}
      >
        <input
          ref={inputRef}
          id={id}
          type="text"
          className="w-full min-w-0 bg-transparent text-xl font-bold text-white placeholder:text-white/35 outline-none text-center flex-1 unified-date-field"
          dir="ltr"
          disabled={disabled}
          tabIndex={tabIndex}
          value={display}
          placeholder="YYYY-MM-DD"
          autoComplete="off"
          inputMode="decimal"
          onFocus={(e) => {
            const el = e.currentTarget;
            setSegment("day");
            setDigitBuf("");
            requestAnimationFrame(() => {
              if (el && typeof el.setSelectionRange === "function") {
                const [start] = SEGMENT_RANGE["day"];
                el.setSelectionRange(start, start + SEGMENT_MAX["day"]);
              }
            });
          }}
          onClick={(e) => {
            const el = e.currentTarget;
            const part = segmentFromPos(el.selectionStart ?? 0);
            setSegment(part);
            setDigitBuf("");
            requestAnimationFrame(() => {
              if (el && typeof el.setSelectionRange === "function") {
                const [start] = SEGMENT_RANGE[part];
                el.setSelectionRange(start, start + SEGMENT_MAX[part]);
              }
            });
          }}
          onChange={(e) => {
            const next = normalizeIsoDate(e.target.value);
            if (/^\d{4}-\d{2}-\d{2}$/.test(next)) {
              onChange(next);
            }
          }}
          onBlur={(e) => {
            setDigitBuf("");
            const next = normalizeIsoDate(e.target.value);
            onChange(/^\d{4}-\d{2}-\d{2}$/.test(next) ? next : display);
          }}
          onKeyDown={onKeyDown}
          onWheel={(e) => {
            e.preventDefault();
            applyDelta(e.deltaY > 0 ? -1 : 1);
          }}
        />
      </div>
    </div>
  );
}
