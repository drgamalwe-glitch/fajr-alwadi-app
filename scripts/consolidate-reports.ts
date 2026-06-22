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

  // Overall pass/fail: all layers that were run must pass
  // If CHROMIUM_UI was not run, verdict is partial (not full PASS)
  const scenarioVerdicts = new Map<string, { overall: boolean; hasAllLayers: boolean }>();
  for (const [sid, layerMap] of scenarioMap) {
    const oracleResults = layerMap.get("ORACLE") ?? [];
    const backendResults = layerMap.get("BACKEND_DB") ?? [];
    const uiResults = layerMap.get("CHROMIUM_UI") ?? [];

    const oraclePass = oracleResults.length > 0 && oracleResults.every((r) => r.pass);
    const backendPass = backendResults.length > 0 && backendResults.every((r) => r.pass);
    const uiPass = uiResults.length > 0 && uiResults.every((r) => r.pass);
    const hasAllLayers = oracleResults.length > 0 && backendResults.length > 0 && uiResults.length > 0;
    const allRunLayersPass = oraclePass && backendPass && (uiResults.length === 0 || uiPass);

    scenarioVerdicts.set(sid, { overall: allRunLayersPass && hasAllLayers, hasAllLayers });
  }

  const allPass = [...scenarioVerdicts.values()].every((v) => v.overall);
  const anyMissingLayers = [...scenarioVerdicts.values()].some((v) => !v.hasAllLayers);
  const verdictLabel = allPass ? "ناجح" : anyMissingLayers ? "ناجح (بدون فحص الواجهة)" : "فشل";
  lines.push(`## النتيجة النهائية: ${verdictLabel}\n`);

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
    const overall = scenarioVerdicts.get(sid)?.overall ?? false;

    const oracleStatus = oracleResults.length === 0 ? "لم يتم التشغيل" : statusIcon(oraclePass);
    const backendStatus = backendResults.length === 0 ? "لم يتم التشغيل" : statusIcon(backendPass);
    const uiStatus = uiResults.length === 0 ? "لم يتم تشغيل فحص Chromium UI لهذا السيناريو" : statusIcon(uiPass);

    const scenarioName = (oracleResults[0] ?? backendResults[0] ?? uiResults[0])?.scenarioName ?? sid;
    lines.push(`| ${sid}: ${scenarioName} | ${oracleStatus} | ${backendStatus} | ${uiStatus} | ${statusIcon(overall)} |`);
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
  const passedCount = [...scenarioVerdicts.values()].filter((v) => v.overall || (!v.hasAllLayers && [...scenarioVerdicts.values()].length > 0)).length;
  const allRunPass = [...scenarioVerdicts.values()].every((v) => {
    const layerMap = scenarioMap.get([...scenarioMap.keys()][[...scenarioVerdicts.values()].indexOf(v)])!;
    const oracleResults = layerMap.get("ORACLE") ?? [];
    const backendResults = layerMap.get("BACKEND_DB") ?? [];
    const uiResults = layerMap.get("CHROMIUM_UI") ?? [];
    return (oracleResults.length === 0 || oracleResults.every(r => r.pass)) &&
           (backendResults.length === 0 || backendResults.every(r => r.pass)) &&
           (uiResults.length === 0 || uiResults.every(r => r.pass));
  });
  lines.push(`- إجمالي السيناريوهات: ${scenarioIds.length}`);
  lines.push(`- ناجح (طبقات التشغيل): ${allRunPass ? scenarioIds.length : 0}`);
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
    failedScenarios: [...scenarioVerdicts.values()].filter((v) => !v.overall).length,
    finalVerdict: allPass ? "PASS" : anyMissingLayers ? "PARTIAL" : "FAIL",
    scenarios: scenarioIds.map((sid) => {
      const layerMap = scenarioMap.get(sid)!;
      return {
        id: sid,
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
  if (failures.length === 0) {
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
  console.log(`السيناريوهات: ${scenarioIds.length}`);
  console.log(`ناجح: ${[...scenarioVerdicts.values()].filter((v) => v.overall).length}`);
  console.log(`فشل: ${[...scenarioVerdicts.values()].filter((v) => !v.overall).length}`);
  console.log(`النتيجة: ${verdictLabel}`);
  console.log(`${"═".repeat(60)}\n`);
}

main();
