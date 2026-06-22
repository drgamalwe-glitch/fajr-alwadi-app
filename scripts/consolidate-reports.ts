import * as fs from "node:fs";
import * as path from "node:path";
import { readAllResults, type LayerResult } from "../tests/shared/result-collector";

const ROOT = process.cwd();

function num(v: number | string): string {
  if (typeof v === "number") return v.toLocaleString("en");
  return String(v);
}

function statusIcon(pass: boolean): string {
  return pass ? "ناجح" : "فشل";
}

function main() {
  const results = readAllResults();

  if (results.length === 0) {
    console.log("No test results found. Run tests first.");
    process.exit(1);
  }

  // Group by scenario ID (first character: A, B, C)
  const scenarioIds = [...new Set(results.map((r) => r.scenarioId.replace(/-\d+$/, "")))];

  // Build per-scenario, per-layer map
  const scenarioMap = new Map<string, Map<string, LayerResult[]>>();
  for (const r of results) {
    const sid = r.scenarioId.replace(/-\d+$/, "");
    if (!scenarioMap.has(sid)) scenarioMap.set(sid, new Map());
    const layerMap = scenarioMap.get(sid)!;
    if (!layerMap.has(r.layer)) layerMap.set(r.layer, []);
    layerMap.get(r.layer)!.push(r);
  }

  const lines: string[] = [];

  // Header
  lines.push("# نتائج اختبارات المحاسبة — فجر الوادي\n");
  lines.push(`**التاريخ:** ${new Date().toISOString()}\n`);

  // Detect backend mode
  const usesBridge = results.some((r) => r.backendMode === "E2E_BRIDGE");
  const usesRealBackend = results.some((r) => r.backendMode === "REAL_BACKEND");
  const backendLabel = usesRealBackend
    ? "REAL_BACKEND (Tauri)"
    : usesBridge
      ? "E2E_BRIDGE (ليس Tauri الحقيقي — محاكاة Node.js فقط)"
      : "MOCK";

  lines.push(`**وضع الخلفية:** ${backendLabel}\n`);

  if (usesBridge) {
    lines.push("> **تحذير:** وضع E2E_BRIDGE يستخدم محاكاة Node.js مع SQLite ولا يمثل تشغيل Tauri الحقيقي.");
    lines.push("> النتائج مفيدة للاختبار السريع لكنها ليست مصدراً نهائياً للتحقق المحاسبي.\n");
  }

  // Overall pass/fail
  const scenarioVerdicts = new Map<string, { overall: boolean; hasAllLayers: boolean; anyFail: boolean }>();
  for (const [sid, layerMap] of scenarioMap) {
    const oracleResults = layerMap.get("ORACLE") ?? [];
    const backendResults = layerMap.get("BACKEND_DB") ?? [];
    const uiResults = layerMap.get("CHROMIUM_UI") ?? [];

    const oraclePass = oracleResults.length > 0 && oracleResults.every((r) => r.pass);
    const backendPass = backendResults.length > 0 && backendResults.every((r) => r.pass);
    const uiPass = uiResults.length > 0 && uiResults.every((r) => r.pass);
    const hasAllLayers = oracleResults.length > 0 && backendResults.length > 0 && uiResults.length > 0;
    const anyFail = !oraclePass || !backendPass || (uiResults.length > 0 && !uiPass);
    const allRunLayersPass = oraclePass && backendPass && (uiResults.length === 0 || uiPass);

    scenarioVerdicts.set(sid, { overall: allRunLayersPass && hasAllLayers, hasAllLayers, anyFail });
  }

  const allPass = [...scenarioVerdicts.values()].every((v) => v.overall);
  const anyFail = [...scenarioVerdicts.values()].some((v) => v.anyFail);
  const anyMissingLayers = [...scenarioVerdicts.values()].some((v) => !v.hasAllLayers);

  let verdictLabel: string;
  let verdictStatus: string;
  if (allPass) {
    verdictLabel = "ناجح";
    verdictStatus = "PASS";
  } else if (anyFail) {
    verdictLabel = "فشل";
    verdictStatus = "FAIL";
  } else if (anyMissingLayers && !anyFail) {
    verdictLabel = "ناجح جزئياً (طبقات ناقصة)";
    verdictStatus = "PARTIAL";
  } else {
    verdictLabel = "غير صالح للتحقق المحاسبي";
    verdictStatus = "NOT_VALID_FOR_REAL_ACCOUNTING";
  }

  if (usesBridge && verdictStatus === "PASS") {
    verdictStatus = "NOT_VALID_FOR_REAL_ACCOUNTING";
    verdictLabel = "ناجح — لكن غير صالح للتحقق المحاسبي النهائي (E2E_BRIDGE فقط)";
  }

  lines.push(`## النتيجة النهائية: ${verdictLabel}\n`);
  lines.push(`**الحالة:** ${verdictStatus}\n`);

  // Summary table
  lines.push("## ملخص السيناريوهات\n");
  lines.push("| السيناريو | ORACLE | BACKEND_DB | CHROMIUM_UI | النتيجة |");
  lines.push("|---|---|---|---|---|");

  for (const [sid, layerMap] of scenarioMap) {
    const oracleResults = layerMap.get("ORACLE") ?? [];
    const backendResults = layerMap.get("BACKEND_DB") ?? [];
    const uiResults = layerMap.get("CHROMIUM_UI") ?? [];

    const oraclePass = oracleResults.length > 0 && oracleResults.every((r) => r.pass);
    const backendPass = backendResults.length > 0 && backendResults.every((r) => r.pass);
    const uiPass = uiResults.length > 0 && uiResults.every((r) => r.pass);
    const verdict = scenarioVerdicts.get(sid)!;

    const oracleStatus = oracleResults.length === 0 ? "لم يتم التشغيل" : statusIcon(oraclePass);
    const backendStatus = backendResults.length === 0 ? "لم يتم التشغيل" : statusIcon(backendPass);
    const uiStatus = uiResults.length === 0 ? "لم يتم تشغيل فحص Chromium UI لهذا السيناريو" : statusIcon(uiPass);

    let scenarioStatus: string;
    if (verdict.overall) {
      scenarioStatus = "ناجح";
    } else if (verdict.anyFail) {
      scenarioStatus = "فشل";
    } else if (!verdict.hasAllLayers) {
      scenarioStatus = "جزئي";
    } else {
      scenarioStatus = "غير صالح";
    }

    const scenarioName = (oracleResults[0] ?? backendResults[0] ?? uiResults[0])?.scenarioName ?? sid;
    lines.push(`| ${sid}: ${scenarioName} | ${oracleStatus} | ${backendStatus} | ${uiStatus} | ${scenarioStatus} |`);
  }

  lines.push("");

  // Detailed results per scenario
  lines.push("---\n");
  lines.push("## تفاصيل السيناريوهات\n");

  for (const [sid, layerMap] of scenarioMap) {
    const scenarioName = ([...layerMap.values()].flat()[0])?.scenarioName ?? sid;
    lines.push(`### السيناريو ${sid}: ${scenarioName}\n`);

    // ORACLE section
    const oracleResults = layerMap.get("ORACLE") ?? [];
    if (oracleResults.length > 0) {
      lines.push("#### الطبقة 1: ORACLE (حسابات بحتة)\n");
      for (const r of oracleResults) {
        lines.push(`- **النتيجة:** ${statusIcon(r.pass)}`);
        lines.push(`- **وقت التنفيذ:** ${r.executionTimeMs}ms`);
        if (r.failureReason) lines.push(`- **سبب الفشل:** ${r.failureReason}`);

        lines.push("\n| الحقل | القيمة المتوقعة | القيمة الفعلية | الحالة |");
        lines.push("|---|---|---|---|");
        const allKeys = new Set([...Object.keys(r.expected), ...Object.keys(r.actual)]);
        for (const k of allKeys) {
          const exp = r.expected[k] ?? "N/A";
          const act = r.actual[k] ?? "N/A";
          const pass = String(exp) === String(act);
          lines.push(`| ${k} | ${num(exp as number)} | ${num(act as number)} | ${statusIcon(pass)} |`);
        }
        lines.push("");
      }
    } else {
      lines.push("#### الطبقة 1: ORACLE\n");
      lines.push("لم يتم تشغيل فحص ORACLE لهذا السيناريو\n");
    }

    // BACKEND_DB section
    const backendResults = layerMap.get("BACKEND_DB") ?? [];
    if (backendResults.length > 0) {
      lines.push("#### الطبقة 2: BACKEND_DB (قاعدة البيانات)\n");
      for (const r of backendResults) {
        lines.push(`- **الوضع:** ${r.backendMode}`);
        lines.push(`- **النتيجة:** ${statusIcon(r.pass)}`);
        lines.push(`- **وقت التنفيذ:** ${r.executionTimeMs}ms`);
        if (r.failureReason) lines.push(`- **سبب الفشل:** ${r.failureReason}`);

        lines.push("\n| الحقل | القيمة المتوقعة | القيمة الفعلية | الحالة |");
        lines.push("|---|---|---|---|");
        const allKeys = new Set([...Object.keys(r.expected), ...Object.keys(r.actual)]);
        for (const k of allKeys) {
          const exp = r.expected[k] ?? "N/A";
          const act = r.actual[k] ?? "N/A";
          const pass = String(exp) === String(act);
          lines.push(`| ${k} | ${num(exp as number)} | ${num(act as number)} | ${statusIcon(pass)} |`);
        }
        lines.push("");
      }
    } else {
      lines.push("#### الطبقة 2: BACKEND_DB\n");
      lines.push("لم يتم تشغيل فحص BACKEND_DB لهذا السيناريو\n");
    }

    // CHROMIUM_UI section
    const uiResults = layerMap.get("CHROMIUM_UI") ?? [];
    if (uiResults.length > 0) {
      lines.push("#### الطبقة 3: CHROMIUM_UI (واجهة المستخدم)\n");
      for (const r of uiResults) {
        lines.push(`- **المتصفح:** Chromium (Playwright)`);
        lines.push(`- **النتيجة:** ${statusIcon(r.pass)}`);
        lines.push(`- **وقت التنفيذ:** ${r.executionTimeMs}ms`);
        if (r.failureReason) lines.push(`- **سبب الفشل:** ${r.failureReason}`);

        if (r.uiChecks && r.uiChecks.length > 0) {
          lines.push("\n| التبويب المفحوص | العنصر المقروء | القيمة المتوقعة | القيمة الفعلية من الواجهة | الحالة |");
          lines.push("|---|---|---|---|---|");
          for (const check of r.uiChecks) {
            lines.push(`| ${check.tab} | ${check.element} | ${check.expected} | ${check.actual} | ${statusIcon(check.pass)} |`);
          }
        }
        lines.push("");
      }
    } else {
      lines.push("#### الطبقة 3: CHROMIUM_UI\n");
      lines.push("لم يتم تشغيل فحص Chromium UI لهذا السيناريو\n");
    }

    lines.push("---\n");
  }

  // Warnings
  const warnings: string[] = [];
  for (const [sid, layerMap] of scenarioMap) {
    if (!layerMap.has("CHROMIUM_UI")) {
      warnings.push(`السيناريو ${sid}: لم يتم تشغيل فحص Chromium UI`);
    }
    if (!layerMap.has("ORACLE")) {
      warnings.push(`السيناريو ${sid}: لم يتم تشغيل فحص ORACLE`);
    }
    if (!layerMap.has("BACKEND_DB")) {
      warnings.push(`السيناريو ${sid}: لم يتم تشغيل فحص BACKEND_DB`);
    }
  }

  if (warnings.length > 0) {
    lines.push("## تحذيرات\n");
    for (const w of warnings) lines.push(`- ${w}`);
    lines.push("");
  }

  // Final verdict
  lines.push("## النتيجة النهائية\n");
  lines.push(`### النتيجة: ${verdictLabel}\n`);
  lines.push(`**الحالة:** ${verdictStatus}\n`);
  lines.push(`- إجمالي السيناريوهات: ${scenarioIds.length}`);
  lines.push(`- ناجح: ${[...scenarioVerdicts.values()].filter((v) => v.overall).length}`);
  lines.push(`- فشل: ${[...scenarioVerdicts.values()].filter((v) => v.anyFail).length}`);
  lines.push(`- جزئي: ${[...scenarioVerdicts.values()].filter((v) => !v.hasAllLayers && !v.anyFail).length}`);
  if (usesBridge) {
    lines.push(`- **ملاحظة:** وضع E2E_BRIDGE ليس Tauri الحقيقي — لا يصلح للتحقق المحاسبي النهائي`);
  }
  if (anyMissingLayers) {
    lines.push(`- تحذير: لم يتم تشغيل فحص Chromium UI — النتيجة النهائية تتطلب جميع الطبقات`);
  }
  lines.push("");

  if (!allPass) {
    lines.push("### أسباب الفشل\n");
    for (const [sid, verdict] of scenarioVerdicts) {
      if (!verdict.overall) {
        const layerMap = scenarioMap.get(sid)!;
        for (const [layer, layerResults] of layerMap) {
          for (const r of layerResults) {
            if (!r.pass) {
              lines.push(`- **${sid} / ${layer}:** ${r.failureReason}`);
            }
          }
        }
      }
    }
    lines.push("");
  }

  // Write reports
  const resultsMd = lines.join("\n");
  fs.writeFileSync(path.join(ROOT, "ACCOUNTING_TEST_RESULTS.md"), resultsMd, "utf-8");

  // Summary JSON
  const summary = {
    timestamp: new Date().toISOString(),
    totalScenarios: scenarioIds.length,
    passedScenarios: [...scenarioVerdicts.values()].filter((v) => v.overall).length,
    failedScenarios: [...scenarioVerdicts.values()].filter((v) => v.anyFail).length,
    partialScenarios: [...scenarioVerdicts.values()].filter((v) => !v.hasAllLayers && !v.anyFail).length,
    finalVerdict: verdictStatus,
    backendMode: usesRealBackend ? "REAL_BACKEND" : usesBridge ? "E2E_BRIDGE" : "MOCK",
    backendNote: usesBridge ? "E2E_BRIDGE uses Node.js SQLite mock, not real Tauri backend" : undefined,
    scenarios: scenarioIds.map((sid) => {
      const layerMap = scenarioMap.get(sid)!;
      const v = scenarioVerdicts.get(sid)!;
      return {
        id: sid,
        verdict: v.overall ? "PASS" : v.anyFail ? "FAIL" : "PARTIAL",
        oracle: (layerMap.get("ORACLE") ?? []).map((r) => ({ pass: r.pass, failureReason: r.failureReason })),
        backend: (layerMap.get("BACKEND_DB") ?? []).map((r) => ({ pass: r.pass, failureReason: r.failureReason, backendMode: r.backendMode })),
        chromiumUi: (layerMap.get("CHROMIUM_UI") ?? []).map((r) => ({ pass: r.pass, failureReason: r.failureReason, uiChecks: r.uiChecks })),
      };
    }),
  };
  fs.writeFileSync(path.join(ROOT, "ACCOUNTING_TEST_SUMMARY.json"), JSON.stringify(summary, null, 2), "utf-8");

  // Failures MD
  const failLines: string[] = [];
  failLines.push("# تقرير حالات الفشل\n");
  failLines.push(`**التاريخ:** ${new Date().toISOString()}\n`);
  const failures = results.filter((r) => !r.pass);
  if (verdictStatus === "PARTIAL") {
    failLines.push("الفحص غير مكتمل لأن طبقة Chromium UI لم تعمل أو لم تسجل نتائجها.\n");
  } else if (failures.length === 0) {
    failLines.push("لا توجد حالات فشل. جميع الاختبارات ناجحة.\n");
  } else {
    for (const r of failures) {
      failLines.push(`### ${r.scenarioId}: ${r.scenarioName} — ${r.layer}\n`);
      failLines.push(`- **السبب:** ${r.failureReason}`);
      if (r.uiChecks) {
        const failedChecks = r.uiChecks.filter((c) => !c.pass);
        for (const c of failedChecks) {
          failLines.push(`- **${c.tab} / ${c.element}:** متوقع "${c.expected}"، فعلي "${c.actual}"`);
        }
      }
      failLines.push("");
    }
  }
  fs.writeFileSync(path.join(ROOT, "ACCOUNTING_TEST_FAILURES.md"), failLines.join("\n"), "utf-8");

  console.log(`\n${"═".repeat(60)}`);
  console.log("  تقرير اختبارات المحاسبة — فجر الوادي");
  console.log(`${"═".repeat(60)}`);
  console.log(`الوضع: ${backendLabel}`);
  console.log(`السيناريوهات: ${scenarioIds.length}`);
  console.log(`ناجح: ${[...scenarioVerdicts.values()].filter((v) => v.overall).length}`);
  console.log(`فشل: ${[...scenarioVerdicts.values()].filter((v) => v.anyFail).length}`);
  console.log(`جزئي: ${[...scenarioVerdicts.values()].filter((v) => !v.hasAllLayers && !v.anyFail).length}`);
  console.log(`النتيجة: ${verdictLabel}`);
  console.log(`الحالة: ${verdictStatus}`);
  console.log(`${"═".repeat(60)}\n`);
}

main();
