import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = process.cwd();

interface CoverageEntry {
  id: string;
  group: string;
  name: string;
  nameAr: string;
  oracle: boolean;
  backend: boolean;
  chromiumUi: boolean;
  status: string;
}

const ALL_SCENARIOS: CoverageEntry[] = [
  { id: "S01", group: "CAR_PURCHASE", name: "Cash car purchase", nameAr: "شراء سيارة كاش", oracle: true, backend: true, chromiumUi: true, status: "implemented" },
  { id: "S02", group: "CAR_PURCHASE", name: "Funded car purchase", nameAr: "شراء سيارة بالتمويل", oracle: false, backend: false, chromiumUi: false, status: "planned" },
  { id: "S03", group: "CAR_PURCHASE", name: "Company car purchase", nameAr: "شراء سيارة عن طريق شركة", oracle: false, backend: false, chromiumUi: false, status: "planned" },
  { id: "S04", group: "CAR_PURCHASE", name: "USD cash car purchase", nameAr: "شراء سيارة بالدولار", oracle: false, backend: false, chromiumUi: false, status: "planned" },
  { id: "S05", group: "CASH_SALES", name: "Cash sale after cash purchase", nameAr: "بيع كاش بعد شراء كاش", oracle: true, backend: true, chromiumUi: true, status: "implemented" },
  { id: "S06", group: "CASH_SALES", name: "Cash sale after funded purchase", nameAr: "بيع كاش بعد شراء بالتمويل", oracle: false, backend: false, chromiumUi: false, status: "planned" },
  { id: "S07", group: "CASH_SALES", name: "Cash sale after company purchase", nameAr: "بيع كاش بعد شراء عن طريق شركة", oracle: false, backend: false, chromiumUi: false, status: "planned" },
  { id: "S08", group: "CASH_SALES", name: "Cash sale with car expense", nameAr: "بيع كاش مع مصروف سيارة", oracle: true, backend: true, chromiumUi: false, status: "implemented" },
  { id: "S09", group: "CASH_SALES", name: "Cash sale at loss", nameAr: "بيع كاش بخسارة", oracle: true, backend: true, chromiumUi: false, status: "implemented" },
  { id: "S10", group: "INSTALLMENTS", name: "Installment - after down payment", nameAr: "بيع بالاقساط — بعد المقدمة", oracle: true, backend: true, chromiumUi: false, status: "implemented" },
  { id: "S11", group: "INSTALLMENTS", name: "Installment - after one installment", nameAr: "بيع بالاقساط — بعد قسط واحد", oracle: true, backend: true, chromiumUi: false, status: "implemented" },
  { id: "S12", group: "INSTALLMENTS", name: "Installment - after all payments", nameAr: "بيع بالاقساط — بعد كل الدفعات", oracle: true, backend: true, chromiumUi: false, status: "implemented" },
  { id: "S13", group: "INSTALLMENTS", name: "Installment overpayment", nameAr: "دفع زائد في الاقساط", oracle: false, backend: false, chromiumUi: false, status: "planned" },
  { id: "S14", group: "INSTALLMENTS", name: "Final installment exact close", nameAr: "إقفال القسط الأخير", oracle: false, backend: false, chromiumUi: false, status: "planned" },
  { id: "S15", group: "INSTALLMENTS", name: "Installment with car expense", nameAr: "اقساط مع مصروف سيارة", oracle: false, backend: false, chromiumUi: false, status: "planned" },
  { id: "S16", group: "TERM_SALES", name: "Term sale with down payment", nameAr: "بيع بمدة — مع مقدمة", oracle: false, backend: false, chromiumUi: false, status: "planned" },
  { id: "S17", group: "TERM_SALES", name: "Term sale final payment", nameAr: "بيع بمدة — الدفعة الأخيرة", oracle: false, backend: false, chromiumUi: false, status: "planned" },
  { id: "S18", group: "CAR_EXPENSES", name: "Car expense before sale", nameAr: "مصروف سيارة قبل البيع", oracle: false, backend: false, chromiumUi: false, status: "planned" },
  { id: "S19", group: "CAR_EXPENSES", name: "Car expense after sale", nameAr: "مصروف سيارة بعد البيع", oracle: false, backend: false, chromiumUi: false, status: "planned" },
  { id: "S20", group: "CAR_EXPENSES", name: "Edit car expense", nameAr: "تعديل مصروف سيارة", oracle: false, backend: false, chromiumUi: false, status: "planned" },
  { id: "S21", group: "CAR_EXPENSES", name: "Delete car expense", nameAr: "حذف مصروف سيارة", oracle: false, backend: false, chromiumUi: false, status: "planned" },
  { id: "S22", group: "GENERAL_EXPENSES", name: "General expense", nameAr: "مصروف عام", oracle: true, backend: true, chromiumUi: true, status: "implemented" },
  { id: "S23", group: "GENERAL_EXPENSES", name: "General expense after car profit", nameAr: "مصروف عام بعد ربح سيارة", oracle: true, backend: true, chromiumUi: false, status: "implemented" },
  { id: "S24", group: "GENERAL_EXPENSES", name: "Edit general expense", nameAr: "تعديل مصروف عام", oracle: false, backend: false, chromiumUi: false, status: "planned" },
  { id: "S25", group: "GENERAL_EXPENSES", name: "Delete general expense", nameAr: "حذف مصروف عام", oracle: false, backend: true, chromiumUi: false, status: "implemented" },
  { id: "S26", group: "INVESTORS", name: "Investor deposit", nameAr: "إيداع مستثمر", oracle: false, backend: false, chromiumUi: false, status: "planned" },
  { id: "S27", group: "INVESTORS", name: "Investor withdrawal", nameAr: "سحب مستثمر", oracle: false, backend: false, chromiumUi: false, status: "planned" },
  { id: "S28", group: "INVESTORS", name: "Investor + car purchase", nameAr: "مستثمر + شراء سيارة", oracle: false, backend: false, chromiumUi: false, status: "planned" },
  { id: "S29", group: "INVESTORS", name: "Delete investor with balance", nameAr: "حذف مستثمر برصيد", oracle: false, backend: false, chromiumUi: false, status: "planned" },
  { id: "S30", group: "FUNDERS", name: "Funder financing", nameAr: "تمويل ممول", oracle: false, backend: false, chromiumUi: false, status: "planned" },
  { id: "S31", group: "FUNDERS", name: "Funder repayment", nameAr: "سداد ممول", oracle: false, backend: false, chromiumUi: false, status: "planned" },
  { id: "S32", group: "FUNDERS", name: "Partial funder repayment", nameAr: "سداد جزئي لممول", oracle: false, backend: false, chromiumUi: false, status: "planned" },
  { id: "S33", group: "FUNDERS", name: "Funder repayment with commission", nameAr: "سداد ممول مع عمولة", oracle: false, backend: false, chromiumUi: false, status: "planned" },
  { id: "S34", group: "FUNDERS", name: "Delete funder with balance", nameAr: "حذف ممول برصيد", oracle: false, backend: false, chromiumUi: false, status: "planned" },
  { id: "S35", group: "COMPANIES", name: "Company purchase", nameAr: "شراء عن طريق شركة", oracle: false, backend: false, chromiumUi: false, status: "planned" },
  { id: "S36", group: "COMPANIES", name: "Company repayment", nameAr: "سداد شركة", oracle: false, backend: false, chromiumUi: false, status: "planned" },
  { id: "S37", group: "COMPANIES", name: "Partial company repayment", nameAr: "سداد جزئي لشركة", oracle: false, backend: false, chromiumUi: false, status: "planned" },
  { id: "S38", group: "COMPANIES", name: "Delete company with balance", nameAr: "حذف شركة برصيد", oracle: false, backend: false, chromiumUi: false, status: "planned" },
  { id: "S39", group: "AGENCIES", name: "Agency profit IQD", nameAr: "ربح وكالة بالدينار", oracle: false, backend: false, chromiumUi: false, status: "planned" },
  { id: "S40", group: "AGENCIES", name: "Agency profit USD", nameAr: "ربح وكالة بالدولار", oracle: false, backend: false, chromiumUi: false, status: "planned" },
  { id: "S41", group: "AGENCIES", name: "Two agencies same names/date", nameAr: "وكالتان بنفس الاسم والتاريخ", oracle: false, backend: false, chromiumUi: false, status: "planned" },
  { id: "S42", group: "AGENCIES", name: "Delete one agency transaction", nameAr: "حذف معاملة وكالة واحدة", oracle: false, backend: false, chromiumUi: false, status: "planned" },
  { id: "S43", group: "CUSTOMERS", name: "Customer balance after installment", nameAr: "رصيد الزبون بعد الاقساط", oracle: false, backend: false, chromiumUi: false, status: "planned" },
  { id: "S44", group: "CUSTOMERS", name: "Customer pays one installment", nameAr: "الزبون يدفع قسطاً", oracle: false, backend: false, chromiumUi: false, status: "planned" },
  { id: "S45", group: "CUSTOMERS", name: "Customer pays all installments", nameAr: "الزبون يدفع كل الاقساط", oracle: false, backend: false, chromiumUi: false, status: "planned" },
  { id: "S46", group: "CUSTOMERS", name: "Print customer statement", nameAr: "طباعة كشف حساب زبون", oracle: false, backend: false, chromiumUi: false, status: "planned" },
  { id: "S47", group: "PARTNERS", name: "Partner deposits", nameAr: "إيداع الشركاء", oracle: true, backend: true, chromiumUi: false, status: "implemented" },
  { id: "S48", group: "PARTNERS", name: "Partner withdrawal", nameAr: "سحب شريك", oracle: false, backend: false, chromiumUi: false, status: "planned" },
  { id: "S49", group: "PARTNERS", name: "Block third partner", nameAr: "منع شريك ثالث", oracle: true, backend: true, chromiumUi: false, status: "implemented" },
  { id: "S50", group: "PARTNERS", name: "Block partner deletion", nameAr: "منع حذف شريك", oracle: true, backend: true, chromiumUi: false, status: "implemented" },
  { id: "S51", group: "DELETE_EDIT", name: "Edit available car purchase", nameAr: "تعديل شراء سيارة متوفرة", oracle: false, backend: false, chromiumUi: false, status: "planned" },
  { id: "S52", group: "DELETE_EDIT", name: "Edit sold car sale price", nameAr: "تعديل سعر بيع سيارة مبيوعة", oracle: false, backend: false, chromiumUi: false, status: "planned" },
  { id: "S53", group: "DELETE_EDIT", name: "Delete available car", nameAr: "حذف سيارة متوفرة", oracle: false, backend: true, chromiumUi: false, status: "implemented" },
  { id: "S54", group: "DELETE_EDIT", name: "Delete sold cash car", nameAr: "حذف سيارة مبيوعة كاش", oracle: false, backend: true, chromiumUi: false, status: "implemented" },
  { id: "S55", group: "DELETE_EDIT", name: "Delete sold installment car", nameAr: "حذف سيارة مبيوعة بالاقساط", oracle: false, backend: false, chromiumUi: false, status: "planned" },
  { id: "S56", group: "DASHBOARD", name: "Company status mixed ops", nameAr: "حالة الشركة — عمليات مختلطة", oracle: true, backend: true, chromiumUi: true, status: "implemented" },
  { id: "S57", group: "DASHBOARD", name: "Qasa tab = Qasa card", nameAr: "قاصة = بطاقة القاصة", oracle: false, backend: false, chromiumUi: false, status: "planned" },
  { id: "S58", group: "DASHBOARD", name: "Cash tab = partner cash card", nameAr: "الكاش = بطاقة رأس المال", oracle: false, backend: false, chromiumUi: false, status: "planned" },
  { id: "S59", group: "DASHBOARD", name: "Profit tab = profit card", nameAr: "الربح = بطاقة الربح", oracle: true, backend: true, chromiumUi: false, status: "implemented" },
  { id: "S60", group: "CURRENCY", name: "IQD/USD separation", nameAr: "فصل الدينار والدولار", oracle: false, backend: true, chromiumUi: false, status: "implemented" },
  { id: "S61", group: "CURRENCY", name: "USD general expense", nameAr: "مصروف عام بالدولار", oracle: false, backend: true, chromiumUi: false, status: "implemented" },
  { id: "S62", group: "CURRENCY", name: "Mixed currency blocked", nameAr: "منع خلط العملات", oracle: false, backend: false, chromiumUi: false, status: "planned" },
  { id: "S63", group: "READ_ONLY", name: "Read-only safety", nameAr: "أمان الدوال القرائية", oracle: true, backend: true, chromiumUi: false, status: "implemented" },
  { id: "S64", group: "PRINT", name: "Print partner statement", nameAr: "طباعة كشف حساب شريك", oracle: false, backend: false, chromiumUi: false, status: "planned" },
  { id: "S65", group: "PRINT", name: "Print customer statement", nameAr: "طباعة كشف حساب زبون", oracle: false, backend: false, chromiumUi: false, status: "planned" },
  { id: "S66", group: "PRINT", name: "Export database", nameAr: "تصدير قاعدة البيانات", oracle: false, backend: false, chromiumUi: false, status: "planned" },
  { id: "S67", group: "FULL_FLOWS", name: "Full cash business cycle", nameAr: "دورة عمل كاش كاملة", oracle: false, backend: false, chromiumUi: false, status: "planned" },
  { id: "S68", group: "FULL_FLOWS", name: "Full installment cycle", nameAr: "دورة اقساط كاملة", oracle: false, backend: false, chromiumUi: false, status: "planned" },
  { id: "S69", group: "FULL_FLOWS", name: "Funder cycle", nameAr: "دورة تمويل", oracle: false, backend: false, chromiumUi: false, status: "planned" },
  { id: "S70", group: "FULL_FLOWS", name: "Company cycle", nameAr: "دورة شركة", oracle: false, backend: false, chromiumUi: false, status: "planned" },
  { id: "S71", group: "FULL_FLOWS", name: "Investor cycle", nameAr: "دورة مستثمر", oracle: false, backend: false, chromiumUi: false, status: "planned" },
];

function main() {
  const lines: string[] = [];
  lines.push("# مصفوفة التغطية — اختبارات المحاسبة\n");
  lines.push(`**التاريخ:** ${new Date().toISOString()}\n`);

  const implemented = ALL_SCENARIOS.filter((s) => s.status === "implemented");
  const planned = ALL_SCENARIOS.filter((s) => s.status === "planned");

  lines.push(`## ملخص\n`);
  lines.push(`- إجمالي السيناريوهات: ${ALL_SCENARIOS.length}`);
  lines.push(`- مُنفذ: ${implemented.length}`);
  lines.push(`- مخطط: ${planned.length}`);
  lines.push(`- نسبة التغطية: ${Math.round((implemented.length / ALL_SCENARIOS.length) * 100)}%\n`);

  lines.push(`## مصفوفة التغطية\n`);
  lines.push("| المعرف | المجموعة | الاسم | ORACLE | BACKEND_DB | CHROMIUM_UI | الحالة |");
  lines.push("|---|---|---|---|---|---|---|");

  for (const s of ALL_SCENARIOS) {
    const o = s.oracle ? "✅" : "❌";
    const b = s.backend ? "✅" : "❌";
    const u = s.chromiumUi ? "✅" : "❌";
    const st = s.status === "implemented" ? "مُنفذ" : "مخطط";
    lines.push(`| ${s.id} | ${s.group} | ${s.nameAr} | ${o} | ${b} | ${u} | ${st} |`);
  }

  lines.push(`\n## السيناريوهات المُنفذة\n`);
  for (const s of implemented) {
    lines.push(`### ${s.id}: ${s.nameAr}\n`);
    lines.push(`- **المجموعة:** ${s.group}`);
    lines.push(`- **الاسم:** ${s.name}`);
    lines.push(`- **ORACLE:** ${s.oracle ? "نعم" : "لا"}`);
    lines.push(`- **BACKEND_DB:** ${s.backend ? "نعم" : "لا"}`);
    lines.push(`- **CHROMIUM_UI:** ${s.chromiumUi ? "نعم" : "لا"}`);
    lines.push("");
  }

  lines.push(`\n## السيناريوهات المخطط لها\n`);
  for (const s of planned) {
    lines.push(`- **${s.id}:** ${s.nameAr} (${s.group})`);
  }

  fs.writeFileSync(path.join(ROOT, "ACCOUNTING_TEST_COVERAGE.md"), lines.join("\n"), "utf-8");
  console.log("Coverage report written to ACCOUNTING_TEST_COVERAGE.md");
}

main();
