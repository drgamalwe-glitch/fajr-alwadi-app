import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = process.cwd();

function main() {
  const lines: string[] = [];
  lines.push("# خطة اختبارات المحاسبة — فجر الوادي\n");
  lines.push(`**التاريخ:** ${new Date().toISOString()}\n`);

  lines.push(`## البنية\n`);
  lines.push(`### الطبقات الثلاث\n`);
  lines.push(`1. **ORACLE** — حسابات بحتة بدون قاعدة بيانات`);
  lines.push(`2. **BACKEND_DB** — اختبارات عبر E2E_BRIDGE (Node.js + SQLite)`);
  lines.push(`3. **CHROMIUM_UI** — اختبارات واجهة المستخدم عبر Playwright\n`);

  lines.push(`### الأوامر\n`);
  lines.push(`\`\`\``);
  lines.push(`npm run test:accounting:fast   # ORACLE + BACKEND_DB + consolidate`);
  lines.push(`npm run test:accounting:full   # ORACLE + BACKEND_DB + CHROMIUM_UI + consolidate`);
  lines.push(`\`\`\`\n`);

  lines.push(`## مجموعات السيناريوهات\n`);

  const groups = [
    { id: "CAR_PURCHASE", name: "شراء السيارات", scenarios: ["S01", "S02", "S03", "S04"] },
    { id: "CASH_SALES", name: "المبيعات النقدية", scenarios: ["S05", "S06", "S07", "S08", "S09"] },
    { id: "INSTALLMENTS", name: "الاقساط", scenarios: ["S10", "S11", "S12", "S13", "S14", "S15"] },
    { id: "TERM_SALES", name: "المبيعات بمدة", scenarios: ["S16", "S17"] },
    { id: "CAR_EXPENSES", name: "مصاريف السيارات", scenarios: ["S18", "S19", "S20", "S21"] },
    { id: "GENERAL_EXPENSES", name: "المصاريف العامة", scenarios: ["S22", "S23", "S24", "S25"] },
    { id: "INVESTORS", name: "المستثمرون", scenarios: ["S26", "S27", "S28", "S29"] },
    { id: "FUNDERS", name: "الممولون", scenarios: ["S30", "S31", "S32", "S33", "S34"] },
    { id: "COMPANIES", name: "الشركات", scenarios: ["S35", "S36", "S37", "S38"] },
    { id: "AGENCIES", name: "الوكالات", scenarios: ["S39", "S40", "S41", "S42"] },
    { id: "CUSTOMERS", name: "الزبائن", scenarios: ["S43", "S44", "S45", "S46"] },
    { id: "PARTNERS", name: "الشركاء", scenarios: ["S47", "S48", "S49", "S50"] },
    { id: "DELETE_EDIT", name: "الحذف والتعديل", scenarios: ["S51", "S52", "S53", "S54", "S55"] },
    { id: "DASHBOARD", name: "لوحة التحكم", scenarios: ["S56", "S57", "S58", "S59"] },
    { id: "CURRENCY", name: "فصل العملات", scenarios: ["S60", "S61", "S62"] },
    { id: "READ_ONLY", name: "أمان القراءة", scenarios: ["S63"] },
    { id: "PRINT", name: "الطباعة والتصدير", scenarios: ["S64", "S65", "S66"] },
    { id: "FULL_FLOWS", name: "الدورات الكاملة", scenarios: ["S67", "S68", "S69", "S70", "S71"] },
  ];

  for (const g of groups) {
    lines.push(`### ${g.name} (${g.id})\n`);
    lines.push(`السيناريوهات: ${g.scenarios.join(", ")}\n`);
  }

  lines.push(`## القواعد الذهبية\n`);
  lines.push(`1. حركة النقد ≠ الاعتراف بالربح`);
  lines.push(`2. الاعتراف بالربح لا يؤثر على القاصة`);
  lines.push(`3. الاعتراف بالربح لا يؤثر على رأس مال الشركاء`);
  lines.push(`4. تقسيم الأرباح 50/50 دائماً`);
  lines.push(`5. لا تكرار في الصفوف`);
  lines.push(`6. الدوال القرائية لا تكتب في قاعدة البيانات`);
  lines.push(`7. تكلفة السيارة = سعر الشراء + مصاريف السيارة`);
  lines.push(`8. الربح الكامل = سعر البيع - تكلفة السيارة`);
  lines.push(`9. نسبة الربح = الربح الكامل / سعر البيع`);
  lines.push(`10. ربح الدفعة = مبلغ الدفعة × نسبة الربح\n`);

  lines.push(`## التقرير النهائي\n`);
  lines.push(`يجب أن تنتج الأوامر التالية:\n`);
  lines.push(`- \`test/accounting/reports/current/ACCOUNTING_TEST_RESULTS.md\` — النتائج التفصيلية بالعربية`);
  lines.push(`- \`test/accounting/reports/current/ACCOUNTING_TEST_SUMMARY.json\` — ملخص JSON`);
  lines.push(`- \`test/accounting/reports/current/ACCOUNTING_TEST_FAILURES.md\` — تقرير الفشل`);
  lines.push(`- \`test/accounting/reports/current/ACCOUNTING_TEST_COVERAGE.md\` — مصفوفة التغطية`);
  lines.push(`- \`test/accounting/reports/current/ACCOUNTING_TEST_PLAN.md\` — هذه الخطة\n`);

  lines.push(`## قواعد الحكم\n`);
  lines.push(`- **PASS:** كل سيناريو ناجح في الطبقات الثلاث`);
  lines.push(`- **PARTIAL:** ORACLE و BACKEND ناجحان لكن CHROMIUM_UI مفقود`);
  lines.push(`- **FAIL:** أي طبقة فاشلة`);
  lines.push(`- **NOT_VALID_FOR_REAL_ACCOUNTING:** استخدام MOCK`);

  fs.writeFileSync(path.join(ROOT, "test/accounting/reports/current/ACCOUNTING_TEST_PLAN.md"), lines.join("\n"), "utf-8");
  console.log("Test plan written to test/accounting/reports/current/ACCOUNTING_TEST_PLAN.md");
}

main();
