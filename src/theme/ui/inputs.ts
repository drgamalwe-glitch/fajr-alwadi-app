import { COLORS } from "../tokens/colors";
import { RADIUS } from "../tokens/radius";

/**
 * Unified input system — All input variants (base, focus, disabled, select, search, textarea) with glass backgrounds.
 */
const base = `
  width: 100%;
  height: 42px;
  padding: 0 14px;
  background: ${COLORS.background.input};
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid ${COLORS.border.DEFAULT};
  border-radius: ${RADIUS.md};
  color: ${COLORS.text.primary};
  font-size: inherit;
  font-family: inherit;
  outline: none;
  transition: border-color 200ms ease, box-shadow 200ms ease;
  box-sizing: border-box;
`.trim();

export const INPUTS = {
  base,

  focus: `
    border-color: ${COLORS.border.focus};
    box-shadow: 0 0 0 3px rgba(97, 3, 11, 0.12);
  `.trim(),

  disabled: `
    background: ${COLORS.background.subtle};
    color: ${COLORS.text.muted};
    cursor: not-allowed;
  `.trim(),

  label: `
    font-size: 0.88em;
    color: ${COLORS.text.muted};
    font-weight: 700;
    font-family: inherit;
    display: block;
    margin-bottom: 6px;
  `.trim(),

  textarea: `
    min-height: 88px;
    padding: 11px 14px;
    resize: vertical;
    width: 100%;
    background: ${COLORS.background.input};
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border: 1px solid ${COLORS.border.DEFAULT};
    border-radius: ${RADIUS.md};
    color: ${COLORS.text.primary};
    font-size: inherit;
    font-family: inherit;
    outline: none;
    transition: border-color 200ms ease, box-shadow 200ms ease;
  `.trim(),

  select: `
    ${base}
    appearance: none;
    background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e");
    background-position: left 10px center;
    background-repeat: no-repeat;
    background-size: 1.5em 1.5em;
    padding-right: 2.5rem;
  `.trim(),

  search: `
    ${base}
    min-width: 215px;
    max-width: 295px;
  `.trim(),
} as const;

export type InputToken = typeof INPUTS;
