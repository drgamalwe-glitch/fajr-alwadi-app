import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd());
const read = (relativePath: string) => readFileSync(resolve(root, relativePath), "utf8");

describe("print and resize safety contracts", () => {
  it("keeps the statement on A4 with repeated headers and indivisible rows", () => {
    const pdfSource = read("src/pdf/PartnerStatementPDF.tsx");
    expect(pdfSource).toContain('<Page size="A4" orientation="portrait"');
    expect(pdfSource).toMatch(/<View style=\{styles\.header\} fixed>/);
    expect(pdfSource).toMatch(/<View style=\{styles\.tableHeader\} fixed>/);
    expect(pdfSource).toMatch(/<View style=\{styles\.footer\} fixed>/);
    expect(pdfSource).toMatch(/styles\.tableRow,[\s\S]*?wrap=\{false\}/);
  });

  it("keeps the global resize zoom bounded and responsive", () => {
    const mainSource = read("src/main.tsx");
    expect(mainSource).toContain("Math.max(0.50, Math.min(1.25, zoomFactor))");
    expect(mainSource).toContain('window.addEventListener("resize", applyAutoZoom)');
    expect(mainSource).toContain("document.documentElement.style.zoom");
  });

  it("does not define contradictory widths for partner transaction type cells", () => {
    const css = read("src/theme/globals.css");
    const block = css.match(/\.partner-tx-wrapper \.data-table \.col-type \{([\s\S]*?)\}/)?.[1];
    expect(block).toBeTruthy();
    expect(block).toContain("width: 200px !important");
    expect(block).toContain("min-width: 200px !important");
    expect(block).toContain("max-width: 200px !important");
    expect(block).not.toContain("min-width: 250px");
  });
});
