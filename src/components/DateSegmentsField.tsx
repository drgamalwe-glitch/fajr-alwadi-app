import { toEnglishDigits } from "../utils/numberInput";
import {
  bumpYearLastTwo,
  combineIsoDate,
  daysInMonth,
  getDay,
  getMonth,
  getYear,
  selectYearLastTwoDigits,
  todayIsoDate,
} from "../utils/dateSegments";

interface DateSegmentsFieldProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function DateSegmentsField({ value, onChange, disabled }: DateSegmentsFieldProps) {
  const iso = value || todayIsoDate();
  const y = parseInt(getYear(iso)) || new Date().getFullYear();
  const m = parseInt(getMonth(iso)) || 1;

  const patch = (year: string, month: string, day: string) => {
    onChange(combineIsoDate(year, month, day));
  };

  return (
    <div className={`date-segments${disabled ? " date-segments--disabled" : ""}`} dir="ltr">
      <input
        className="input date-seg date-seg--year"
        type="text"
        inputMode="decimal"
        disabled={disabled}
        value={getYear(iso)}
        onFocus={(e) => selectYearLastTwoDigits(e.target)}
        onClick={(e) => selectYearLastTwoDigits(e.currentTarget)}
        onMouseUp={(e) => e.preventDefault()}
        onChange={(e) => {
          const raw = toEnglishDigits(e.target.value).replace(/\D/g, "").slice(0, 4);
          patch(raw || String(y), getMonth(iso) || "01", getDay(iso) || "01");
        }}
        onWheel={(e) => {
          e.preventDefault();
          const cur = parseInt(getYear(iso)) || y;
          const delta = e.deltaY > 0 ? -1 : 1;
          patch(
            String(bumpYearLastTwo(cur, delta)),
            getMonth(iso) || "01",
            getDay(iso) || "01",
          );
        }}
        onBlur={(e) => {
          const v = toEnglishDigits(e.currentTarget.value).replace(/\D/g, "").slice(0, 4);
          patch(v.padStart(4, "0") || String(y), getMonth(iso) || "01", getDay(iso) || "01");
        }}
        placeholder="سنة"
        aria-label="السنة"
      />
      <span className="date-sep" aria-hidden>-</span>
      <input
        className="input date-seg"
        type="text"
        inputMode="decimal"
        disabled={disabled}
        value={getMonth(iso)}
        onFocus={(e) => e.target.select()}
        onClick={(e) => e.currentTarget.select()}
        onMouseUp={(e) => e.preventDefault()}
        onChange={(e) => {
          const raw = toEnglishDigits(e.target.value).replace(/\D/g, "").slice(0, 2);
          const next = Math.min(12, Math.max(1, parseInt(raw) || 0));
          patch(getYear(iso) || String(y), next ? String(next).padStart(2, "0") : "", getDay(iso) || "01");
        }}
        onWheel={(e) => {
          e.preventDefault();
          const cur = parseInt(getMonth(iso)) || m;
          let next = cur + (e.deltaY > 0 ? -1 : 1);
          if (next < 1) next = 12;
          if (next > 12) next = 1;
          let d = parseInt(getDay(iso)) || 1;
          const max = daysInMonth(parseInt(getYear(iso)) || y, next);
          if (d > max) d = max;
          patch(getYear(iso) || String(y), String(next).padStart(2, "0"), String(d).padStart(2, "0"));
        }}
        onBlur={(e) => {
          const raw = toEnglishDigits(e.currentTarget.value).replace(/\D/g, "").slice(0, 2);
          const next = Math.min(12, Math.max(1, parseInt(raw) || 1));
          patch(getYear(iso) || String(y), String(next).padStart(2, "0"), getDay(iso) || "01");
        }}
        placeholder="شهر"
        aria-label="الشهر"
      />
      <span className="date-sep" aria-hidden>-</span>
      <input
        className="input date-seg"
        type="text"
        inputMode="decimal"
        disabled={disabled}
        value={getDay(iso)}
        onFocus={(e) => e.target.select()}
        onClick={(e) => e.currentTarget.select()}
        onMouseUp={(e) => e.preventDefault()}
        onChange={(e) => {
          const raw = toEnglishDigits(e.target.value).replace(/\D/g, "").slice(0, 2);
          const max = daysInMonth(y, m);
          const next = Math.min(max, Math.max(1, parseInt(raw) || 0));
          patch(getYear(iso) || String(y), getMonth(iso) || "01", next ? String(next).padStart(2, "0") : "");
        }}
        onWheel={(e) => {
          e.preventDefault();
          const max = daysInMonth(y, m);
          let d = parseInt(getDay(iso)) || 1;
          d += e.deltaY > 0 ? -1 : 1;
          if (d < 1) d = max;
          if (d > max) d = 1;
          patch(getYear(iso) || String(y), getMonth(iso) || "01", String(d).padStart(2, "0"));
        }}
        onBlur={(e) => {
          const raw = toEnglishDigits(e.currentTarget.value).replace(/\D/g, "").slice(0, 2);
          const max = daysInMonth(y, m);
          const next = Math.min(max, Math.max(1, parseInt(raw) || 1));
          patch(getYear(iso) || String(y), getMonth(iso) || "01", String(next).padStart(2, "0"));
        }}
        placeholder="يوم"
        aria-label="اليوم"
      />
    </div>
  );
}
