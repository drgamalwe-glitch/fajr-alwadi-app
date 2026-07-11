import { createElement } from "react";
import { Font, renderToFile } from "@react-pdf/renderer";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PartnerStatementPDF } from "../src/pdf/PartnerStatementPDF";
import type { Partner, PartnerTransaction } from "../src/types";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const outputPath = resolve(process.argv[2] || "print-layout-fixture.pdf");

Font.register({
  family: "Tajawal",
  fonts: [
    { src: resolve(projectRoot, "public/fonts/Tajawal-Regular.ttf"), fontWeight: 400 },
    { src: resolve(projectRoot, "public/fonts/Tajawal-Medium.ttf"), fontWeight: 500 },
    { src: resolve(projectRoot, "public/fonts/Tajawal-Bold.ttf"), fontWeight: 700 },
    { src: resolve(projectRoot, "public/fonts/Tajawal-ExtraBold.ttf"), fontWeight: 900 },
  ],
});

const partner: Partner = {
  partner_name: "زبون اختبار الطباعة الطويل جداً للتحقق من عدم قص البيانات",
  phone: "07800000000",
  total_amount: "98500000",
  iqd_balance: "24500000",
  usd_balance: "0",
  kind: "زبون",
  total_withdrawals: "0",
};

const transactions: PartnerTransaction[] = Array.from({ length: 96 }, (_, index) => {
  const id = index + 1;
  const month = String((index % 12) + 1).padStart(2, "0");
  const day = String((index % 28) + 1).padStart(2, "0");
  const paid = index < 48;
  return {
    id,
    partner_name: partner.partner_name,
    kind: "زبون",
    type_: paid ? "واصل قسط" : "باقي قسط",
    amount: String(750000 + ((index % 5) * 125000)),
    date: `2026-${month}-${day}`,
    notes: `قسط#${id} - سيارة اختبار رقم ${String(index + 1).padStart(3, "0")} - ملاحظة طويلة للتحقق من الاقتصاص المنضبط وعدم تجاوز حدود ورقة A4`,
    currency: "IQD",
    source_type: "customer_installment_schedule",
    source_id: String(id),
    source_role: "installment_schedule",
    affects_partner_cash: 1,
    paid_event_id: paid ? 1000 + id : null,
  };
});

const paidTransactionIds = new Set(
  transactions.filter((tx) => tx.paid_event_id != null).map((tx) => tx.id),
);

await renderToFile(
  createElement(PartnerStatementPDF, {
    partner,
    transactions,
    printMode: "all",
    printFromDate: "",
    printToDate: "",
    muntasirPhone: "07811111111",
    amirPhone: "07822222222",
    paidTransactionIds,
    logoSrc: resolve(projectRoot, "public/logo.png"),
  }),
  outputPath,
);

console.log(outputPath);
