# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: accounting-ui.spec.ts >> السيناريو ج: مصروف عام — فحص الواجهة >> مصروف عام: التحقق من تاثيره على القاصة
- Location: tests/e2e/accounting-ui.spec.ts:288:3

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - complementary [ref=e4]:
    - img "شعار شركة فجر الوادي لتجارة السيارات" [ref=e6]
    - navigation "التنقل الرئيسي" [ref=e7]:
      - button "لوحــــــــة التحكــــــــــم" [ref=e8] [cursor=pointer]:
        - generic [ref=e9]: ✦
        - generic [ref=e10]: لوحــــــــة التحكــــــــــم
      - button "المعــــــــــــــــــــــــــــــرض" [ref=e11] [cursor=pointer]:
        - generic [ref=e12]: ◈
        - generic [ref=e13]: المعــــــــــــــــــــــــــــــرض
      - button "حسابات العمــلاء" [ref=e14] [cursor=pointer]:
        - generic [ref=e15]: ❖
        - generic [ref=e16]: حسابات العمــلاء
      - button "الوكـــــــــــــــــــــــــــالات" [ref=e17] [cursor=pointer]:
        - generic [ref=e18]: ✉
        - generic [ref=e19]: الوكـــــــــــــــــــــــــــالات
      - button "المصروفــــــــــــــــــات" [ref=e20] [cursor=pointer]:
        - generic [ref=e21]: ◉
        - generic [ref=e22]: المصروفــــــــــــــــــات
      - button "الأربــــــــــــــــــــــــــــــــــاح" [ref=e23] [cursor=pointer]:
        - generic [ref=e24]: ⚖
        - generic [ref=e25]: الأربــــــــــــــــــــــــــــــــــاح
      - button "القاصــــــــــــــــــــــــــــــــة" [ref=e26] [cursor=pointer]:
        - generic [ref=e27]: ♢
        - generic [ref=e28]: القاصــــــــــــــــــــــــــــــــة
      - button "سجــل المعاملات" [ref=e29] [cursor=pointer]:
        - generic [ref=e30]: ⇄
        - generic [ref=e31]: سجــل المعاملات
      - button "المستخدميـــــــــــــن" [ref=e32] [cursor=pointer]:
        - generic [ref=e33]: ⚙
        - generic [ref=e34]: المستخدميـــــــــــــن
  - main [ref=e36]:
    - generic [ref=e38]:
      - generic [ref=e39]:
        - generic [ref=e41]:
          - button "لوحة التحكم" [ref=e42] [cursor=pointer]
          - button "وضع الشركة" [ref=e43] [cursor=pointer]
        - generic [ref=e44]:
          - heading "البرنامج الحسابي لشركة فجر الوادي" [level=2] [ref=e45]
          - generic [ref=e46]: بإدارة امير الزجراوي ومنتصر الحيدري
      - generic [ref=e47]:
        - generic [ref=e50]:
          - generic [ref=e52]: رصيد القاصة
          - generic [ref=e53]:
            - generic [ref=e55]: 0 IQ
            - generic [ref=e58]: 0 USD
        - generic [ref=e61]:
          - generic [ref=e62]:
            - generic [ref=e63]: رصيد المعرض
            - generic [ref=e64]: 0 سيارة
          - generic [ref=e65]:
            - generic [ref=e67]: 0 IQ
            - generic [ref=e70]: 0 USD
        - generic [ref=e73]:
          - generic [ref=e75]: الكاش
          - generic [ref=e76]:
            - generic [ref=e78]: 0 IQ
            - generic [ref=e81]: 0 USD
        - generic [ref=e84]:
          - generic [ref=e86]: صافي الأرباح حزيران ٢٠٢٦
          - generic [ref=e87]:
            - generic [ref=e89]: 1,000,000 IQ
            - generic [ref=e92]: 0 USD
      - generic [ref=e93]:
        - generic [ref=e94]:
          - generic [ref=e95]:
            - generic [ref=e97]: نطلب
            - generic [ref=e98]: 0 إجمالي
          - generic [ref=e100]:
            - img [ref=e101]
            - generic [ref=e104]: لا توجد مبالغ نطلبها حالياً
        - generic [ref=e105]:
          - generic [ref=e108]: مطلوبين
          - generic [ref=e110]:
            - img [ref=e111]
            - generic [ref=e117]: لا توجد مطلوبين بها حالياً
  - contentinfo [ref=e118]:
    - generic [ref=e119]:
      - button "تصدير اكسل" [ref=e120] [cursor=pointer]
      - generic [ref=e121]: شركة فجر الوادي | امير الزجراوي - منتصر الحيدري
    - generic [ref=e123]: "VERSION: 1.34 | DEVELOPED BY DHRUGHAM ALALAWI: 07806539291"
```

# Test source

```ts
  254 |       tab: "توزيع الارباح",
  255 |       element: "اجمالي الارباح (IQD)",
  256 |       expected: String(expectedProfit),
  257 |       actual: String(profitDistVal),
  258 |       pass: !isNaN(profitDistVal) && Math.abs(profitDistVal - expectedProfit) < 1000,
  259 |     });
  260 | 
  261 |     // Write result
  262 |     const pass = uiChecks.every((c) => c.pass);
  263 |     if (!pass) {
  264 |       failureReason = uiChecks.filter((c) => !c.pass).map((c) => `${c.tab}/${c.element}: متوقع ${c.expected}، فعلي ${c.actual}`).join("; ");
  265 |     }
  266 | 
  267 |     appendResult({
  268 |       scenarioId: "B",
  269 |       scenarioName: "بيع بالاقساط — مقدمة وقسط واحد",
  270 |       layer: "CHROMIUM_UI",
  271 |       backendMode: "E2E_BRIDGE",
  272 |       executionTimeMs: Date.now() - t0,
  273 |       pass,
  274 |       failureReason,
  275 |       uiChecks,
  276 |       expected: { profitTotal: expectedProfit },
  277 |       actual: { profitTotal: profitDistVal },
  278 |       rows: [],
  279 |     });
  280 | 
  281 |     expect(pass).toBe(true);
  282 |   });
  283 | });
  284 | 
  285 | // ─── Scenario C: General Expense UI ───────────────────────────────
  286 | 
  287 | test.describe("السيناريو ج: مصروف عام — فحص الواجهة", () => {
  288 |   test("مصروف عام: التحقق من تاثيره على القاصة", async ({ page }) => {
  289 |     test.setTimeout(120_000);
  290 |     const t0 = Date.now();
  291 |     const uiChecks: UiCheck[] = [];
  292 |     let failureReason = "";
  293 | 
  294 |     // Seed via bridge — expense only, no cars
  295 |     await bridgeReset();
  296 |     await bridgeInvoke("add_expense", {
  297 |       description: "ايجار",
  298 |       amount: 1_000_000,
  299 |       date: "2024-02-01",
  300 |       currency: "IQD",
  301 |     });
  302 | 
  303 |     // Get backend values
  304 |     const summary = await bridgeInvoke<any>("get_financial_summary", {});
  305 |     const expectedQasa = summary.qasa_iqd;
  306 |     const expectedProfit = summary.monthly_profits_iqd;
  307 | 
  308 |     // Login
  309 |     await setupAndLogin(page);
  310 | 
  311 |     // 1. Dashboard — Qasa card
  312 |     const qasaText = await safeText(page.locator(".qasa-iqd span").first());
  313 |     const qasaVal = parseMoney(qasaText);
  314 |     uiChecks.push({
  315 |       tab: "لوحة التحكم",
  316 |       element: "بطاقة القاصة (IQD)",
  317 |       expected: String(expectedQasa),
  318 |       actual: String(qasaVal),
  319 |       pass: !isNaN(qasaVal) && Math.abs(qasaVal - expectedQasa) < 1,
  320 |     });
  321 | 
  322 |     // 2. Dashboard — Profit card
  323 |     const profitText = await safeText(page.locator(".profit-iqd span").first());
  324 |     const profitVal = parseMoney(profitText);
  325 |     // Strict signed comparison — do NOT accept absolute value fallback
  326 |     uiChecks.push({
  327 |       tab: "لوحة التحكم",
  328 |       element: "بطاقة الربح (IQD)",
  329 |       expected: String(expectedProfit),
  330 |       actual: String(profitVal),
  331 |       pass: !isNaN(profitVal) && Math.abs(profitVal - expectedProfit) < 1,
  332 |     });
  333 | 
  334 |     // Write result
  335 |     const pass = uiChecks.every((c) => c.pass);
  336 |     if (!pass) {
  337 |       failureReason = uiChecks.filter((c) => !c.pass).map((c) => `${c.tab}/${c.element}: متوقع ${c.expected}، فعلي ${c.actual}`).join("; ");
  338 |     }
  339 | 
  340 |     appendResult({
  341 |       scenarioId: "C",
  342 |       scenarioName: "مصروف عام — ايجار",
  343 |       layer: "CHROMIUM_UI",
  344 |       backendMode: "E2E_BRIDGE",
  345 |       executionTimeMs: Date.now() - t0,
  346 |       pass,
  347 |       failureReason,
  348 |       uiChecks,
  349 |       expected: { qasa: expectedQasa, profit: expectedProfit },
  350 |       actual: { qasa: qasaVal, profit: profitVal },
  351 |       rows: [],
  352 |     });
  353 | 
> 354 |     expect(pass).toBe(true);
      |                  ^ Error: expect(received).toBe(expected) // Object.is equality
  355 |   });
  356 | });
  357 | 
```