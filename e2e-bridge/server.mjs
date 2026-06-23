import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";

const PORT = parseInt(process.env.E2E_BRIDGE_PORT || "3899");
const DB_PATH = process.env.E2E_DB_PATH || ":memory:";
const VERBOSE = process.env.E2E_VERBOSE === "1";

const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

// ─── helpers ────────────────────────────────────────────────────────

function sha256(s) {
  return createHash("sha256").update(s).digest("hex");
}

function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isDepositType(t) {
  return (
    t.startsWith("ايداع") ||
    t.startsWith("إيداع") ||
    t.startsWith("مقدمة") ||
    t.startsWith("استلام") ||
    t.startsWith("إستلام") ||
    t.startsWith("إعادة استثمار") ||
    t.startsWith("تسوية") ||
    t.startsWith("تسديد")
  );
}

function isWithdrawalType(t) {
  return t.startsWith("سحب") || t.startsWith("باقي");
}

// ─── schema ─────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS cars (
    car_number TEXT PRIMARY KEY,
    car_plate_num TEXT,
    chassis_number TEXT,
    car_model TEXT,
    car_year TEXT,
    car_name TEXT NOT NULL,
    color TEXT,
    details TEXT,
    purchase_price REAL DEFAULT 0.0,
    currency TEXT DEFAULT 'IQD',
    sale_currency TEXT DEFAULT 'IQD',
    selling_price REAL DEFAULT 0.0,
    status TEXT NOT NULL,
    payment_type TEXT,
    cash_price REAL,
    amount_paid REAL,
    amount_remaining REAL,
    installment_months INTEGER,
    monthly_payment REAL,
    buyer_name TEXT,
    buyer_phone TEXT,
    purchase_date TEXT,
    sale_date TEXT,
    delivery_date TEXT,
    first_payment_date TEXT,
    purchase_payment_type TEXT DEFAULT 'قاصه',
    purchase_type TEXT DEFAULT 'كاش',
    financer_name TEXT,
    commission_type TEXT,
    commission_value REAL,
    purchase_time TEXT DEFAULT '00:00',
    sale_time TEXT DEFAULT '00:00'
  );

  CREATE TABLE IF NOT EXISTS partners (
    partner_name TEXT NOT NULL,
    phone TEXT,
    total_amount REAL DEFAULT 0.0,
    kind TEXT NOT NULL DEFAULT 'شريك',
    iqd_balance REAL DEFAULT 0.0,
    usd_balance REAL DEFAULT 0.0,
    PRIMARY KEY (partner_name, kind)
  );

  CREATE TABLE IF NOT EXISTS partner_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    partner_name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'شريك',
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    date TEXT NOT NULL,
    notes TEXT,
    currency TEXT DEFAULT 'IQD',
    payment_type TEXT DEFAULT 'قاصه',
    time TEXT DEFAULT '00:00',
    source_type TEXT,
    source_id TEXT,
    source_role TEXT,
    affects_qasa INTEGER DEFAULT 1,
    affects_partner_cash INTEGER DEFAULT 1,
    affects_profit INTEGER DEFAULT 0,
    related_source_type TEXT,
    related_source_id TEXT
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    date TEXT NOT NULL,
    time TEXT DEFAULT '00:00',
    notes TEXT,
    currency TEXT DEFAULT 'IQD',
    car_number TEXT
  );

  CREATE TABLE IF NOT EXISTS car_expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    car_number TEXT NOT NULL,
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    date TEXT NOT NULL,
    currency TEXT DEFAULT 'IQD',
    time TEXT DEFAULT '00:00'
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    profile_image TEXT,
    password_hash TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS financial_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    account_type TEXT NOT NULL,
    account_id TEXT,
    debit REAL NOT NULL,
    credit REAL NOT NULL,
    currency TEXT NOT NULL,
    reference_type TEXT NOT NULL,
    reference_id TEXT NOT NULL,
    type_ TEXT NOT NULL,
    description TEXT NOT NULL,
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS cash_register (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    time TEXT DEFAULT '00:00',
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    description TEXT,
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS profit_distributions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    total_profit REAL NOT NULL,
    currency TEXT NOT NULL,
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS partner_profit_shares (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    distribution_id INTEGER NOT NULL,
    partner_name TEXT NOT NULL,
    profit_share REAL NOT NULL,
    drawings_deducted REAL NOT NULL,
    amount_reinvested REAL NOT NULL,
    amount_paid REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS agencies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    old_agent_name TEXT NOT NULL,
    car_type TEXT NOT NULL DEFAULT '',
    car_number TEXT NOT NULL DEFAULT '',
    car_model TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '',
    new_agent_name TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    amount_usd REAL NOT NULL DEFAULT 0.0,
    amount_iqd REAL NOT NULL DEFAULT 0.0,
    notes TEXT NOT NULL DEFAULT '',
    date TEXT NOT NULL,
    time TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS agency_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agency_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    time TEXT NOT NULL DEFAULT '00:00',
    type_ TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'IQD',
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS car_partners (
    car_number TEXT NOT NULL,
    partner_name TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'IQD',
    kind TEXT NOT NULL DEFAULT 'شريك',
    PRIMARY KEY (car_number, partner_name)
  );

  CREATE TABLE IF NOT EXISTS db_version (version INTEGER PRIMARY KEY);
`);

// ─── seed ───────────────────────────────────────────────────────────

db.prepare(
  "INSERT OR REPLACE INTO partners (partner_name, phone, total_amount, kind, iqd_balance, usd_balance) VALUES (?, '', 0, 'شريك', 0, 0)",
).run("أمير");
db.prepare(
  "INSERT OR REPLACE INTO partners (partner_name, phone, total_amount, kind, iqd_balance, usd_balance) VALUES (?, '', 0, 'شريك', 0, 0)",
).run("منتصر");
db.prepare(
  "INSERT OR REPLACE INTO users (username, display_name, password_hash) VALUES (?, ?, ?)",
).run("admin", "مدير النظام", sha256("admin"));

// ─── partner helpers ────────────────────────────────────────────────

function insertPartnerTx(
  partnerName,
  kind,
  type_,
  amount,
  date,
  paymentType,
  notes,
  currency,
  sourceType,
  sourceId,
  sourceRole,
  affectsQasa,
  affectsPartnerCash,
  affectsProfit,
  relatedSourceType,
  relatedSourceId,
) {
  if (amount <= 0) return 0;
  const t = nowTime();
  db.prepare(
    `INSERT INTO partner_transactions
       (partner_name, kind, type, amount, date, time, notes, currency, payment_type,
        source_type, source_id, source_role, affects_qasa, affects_partner_cash, affects_profit,
        related_source_type, related_source_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    partnerName.trim(),
    kind.trim(),
    type_.trim(),
    amount,
    date.trim(),
    t,
    (notes || "").trim(),
    (currency || "IQD").trim(),
    (paymentType || "قاصه").trim(),
    (sourceType || "").trim(),
    (sourceId || "").trim(),
    (sourceRole || "").trim(),
    affectsQasa ? 1 : 0,
    affectsPartnerCash ? 1 : 0,
    affectsProfit ? 1 : 0,
    (relatedSourceType || "").trim(),
    (relatedSourceId || "").trim(),
  );
  const txId = db.prepare("SELECT last_insert_rowid() AS id").get().id;
  recalcPartnerTotal(partnerName.trim(), kind.trim());
  return txId;
}

function distribute50(
  amount,
  currency,
  date,
  paymentType,
  txType,
  notes,
  sourceType,
  sourceId,
  sourceRole,
  affectsQasa,
  affectsPartnerCash,
  affectsProfit,
  relatedSourceType,
  relatedSourceId,
) {
  if (amount <= 0) return;
  const half = amount / 2;
  for (const p of ["أمير", "منتصر"]) {
    insertPartnerTx(
      p,
      "شريك",
      txType,
      half,
      date,
      paymentType,
      notes,
      currency,
      sourceType,
      sourceId,
      sourceRole,
      affectsQasa,
      affectsPartnerCash,
      affectsProfit,
      relatedSourceType,
      relatedSourceId,
    );
  }
}

function getCarExpensesSum(carNum) {
  return db
    .prepare("SELECT COALESCE(SUM(amount),0) AS v FROM car_expenses WHERE car_number=?")
    .get(carNum).v;
}

function getCarFullProfit(carNum) {
  const car = db
    .prepare("SELECT purchase_price, selling_price FROM cars WHERE car_number=?")
    .get(carNum);
  if (!car) return 0;
  return Math.max(
    0,
    (Number(car.selling_price) || 0) -
      (Number(car.purchase_price) || 0) -
      getCarExpensesSum(carNum),
  );
}

function getCarProfitRatio(carNum) {
  const car = db.prepare("SELECT selling_price FROM cars WHERE car_number=?").get(carNum);
  const selling = Number(car?.selling_price) || 0;
  if (selling <= 0) return 0;
  return getCarFullProfit(carNum) / selling;
}

function getRecognizedProfitForCar(carNum) {
  return db
    .prepare(
      `SELECT COALESCE(SUM(amount),0) AS v FROM partner_transactions
       WHERE kind='شريك' AND affects_profit=1
       AND (
         (source_type IN ('car_sale','customer_installment') AND source_id=?)
         OR (related_source_type='car' AND related_source_id=?)
       )`,
    )
    .get(carNum, carNum).v;
}

function calculatePaymentProfitCapped(carNum, paymentAmount) {
  const theoretical = paymentAmount * getCarProfitRatio(carNum);
  if (theoretical <= 0) return 0;
  const remaining = getCarFullProfit(carNum) - getRecognizedProfitForCar(carNum);
  if (remaining <= 0) return 0;
  return Math.min(theoretical, remaining);
}

function rebuildInstallmentProfitsAfterCostChange(carNum) {
  const car = db.prepare("SELECT * FROM cars WHERE car_number=?").get(carNum);
  if (!car || car.status !== "مبيوعة") return;
  const paymentType = car.payment_type || "";
  if (paymentType !== "اقساط" && paymentType !== "موعد") return;

  db.prepare(
    `DELETE FROM partner_transactions
     WHERE kind='شريك' AND affects_profit=1
     AND source_type IN ('car_sale','customer_installment') AND source_id=?`,
  ).run(carNum);

  const ratio = getCarProfitRatio(carNum);
  const fullProfit = getCarFullProfit(carNum);
  let recognized = 0;
  const currency = car.sale_currency || car.currency || "IQD";
  const saleDate = car.sale_date || todayIso();

  function addProfit(paymentAmount, sourceType, note) {
    const theoretical = paymentAmount * ratio;
    const remaining = fullProfit - recognized;
    const profit = Math.min(theoretical, Math.max(0, remaining));
    if (profit > 0) {
      distribute50(
        profit,
        currency,
        saleDate,
        "قاصه",
        "ايداع ارباح سيارة",
        note,
        sourceType,
        carNum,
        "profit_recognition",
        false,
        false,
        true,
        "car",
        carNum,
      );
      recognized += profit;
    }
  }

  const amountPaid = Number(car.amount_paid) || 0;
  if (amountPaid > 0) {
    addProfit(amountPaid, "car_sale", `ارباح مقدمة سيارة ${carNum}`);
  }

  const payments = db
    .prepare(
      `SELECT amount FROM partner_transactions
       WHERE kind='زبون' AND type LIKE 'تسديد قسط%' AND notes LIKE ?
       ORDER BY id`,
    )
    .all(`%${carNum}%`);
  for (const pmt of payments) {
    addProfit(Number(pmt.amount) || 0, "customer_installment", `ارباح قسط — سيارة ${carNum}`);
  }
}

function recalcPartnerTotal(name, kind) {
  if (kind === "شريك") {
    const depIqd = db
      .prepare(
        `SELECT COALESCE(SUM(amount),0) AS val FROM partner_transactions
         WHERE partner_name=? AND kind='شريك' AND COALESCE(currency,'IQD')='IQD'
           AND affects_partner_cash=1
           AND (type LIKE 'ايداع%' OR type LIKE 'إيداع%' OR type LIKE 'مقدمة%'
                OR type LIKE 'استلام%' OR type LIKE 'إستلام%' OR type LIKE 'إعادة استثمار%'
                OR type LIKE 'تسوية%' OR type LIKE 'تسديد%')
           AND type NOT LIKE 'تحويل%'`,
      )
      .get(name).val;
    const wdrIqd = db
      .prepare(
        `SELECT COALESCE(SUM(amount),0) AS val FROM partner_transactions
         WHERE partner_name=? AND kind='شريك' AND COALESCE(currency,'IQD')='IQD'
           AND affects_partner_cash=1
           AND (type LIKE 'سحب%' OR type LIKE 'باقي%')
           AND type NOT LIKE 'تحويل%'`,
      )
      .get(name).val;
    const depUsd = db
      .prepare(
        `SELECT COALESCE(SUM(amount),0) AS val FROM partner_transactions
         WHERE partner_name=? AND kind='شريك' AND COALESCE(currency,'IQD')='USD'
           AND affects_partner_cash=1
           AND (type LIKE 'ايداع%' OR type LIKE 'إيداع%' OR type LIKE 'مقدمة%'
                OR type LIKE 'استلام%' OR type LIKE 'إستلام%' OR type LIKE 'إعادة استثمار%'
                OR type LIKE 'تسوية%' OR type LIKE 'تسديد%')
           AND type NOT LIKE 'تحويل%'`,
      )
      .get(name).val;
    const wdrUsd = db
      .prepare(
        `SELECT COALESCE(SUM(amount),0) AS val FROM partner_transactions
         WHERE partner_name=? AND kind='شريك' AND COALESCE(currency,'IQD')='USD'
           AND affects_partner_cash=1
           AND (type LIKE 'سحب%' OR type LIKE 'باقي%')
           AND type NOT LIKE 'تحويل%'`,
      )
      .get(name).val;
    const iqd = depIqd - wdrIqd;
    const usd = depUsd - wdrUsd;
    db.prepare(
      "UPDATE partners SET total_amount=?, iqd_balance=?, usd_balance=? WHERE partner_name=? AND kind=?",
    ).run(iqd + usd, iqd, usd, name, kind);
  } else if (kind === "مستثمر" || kind === "ممول" || kind === "شركة") {
    const depIqd = db
      .prepare(
        `SELECT COALESCE(SUM(amount),0) AS val FROM partner_transactions
         WHERE partner_name=? AND kind=? AND COALESCE(currency,'IQD')='IQD'
           AND (type LIKE 'ايداع%' OR type LIKE 'إيداع%' OR type LIKE 'مقدمة%'
                OR type LIKE 'استلام%' OR type LIKE 'إستلام%' OR type LIKE 'إعادة استثمار%'
                OR type LIKE 'تسوية%' OR type LIKE 'تسديد%')
           AND type NOT LIKE 'تحويل%'`,
      )
      .get(name, kind).val;
    const wdrIqd = db
      .prepare(
        `SELECT COALESCE(SUM(amount),0) AS val FROM partner_transactions
         WHERE partner_name=? AND kind=? AND COALESCE(currency,'IQD')='IQD'
           AND (type LIKE 'سحب%' OR type LIKE 'باقي%')
           AND type NOT LIKE 'تحويل%'`,
      )
      .get(name, kind).val;
    const depUsd = db
      .prepare(
        `SELECT COALESCE(SUM(amount),0) AS val FROM partner_transactions
         WHERE partner_name=? AND kind=? AND COALESCE(currency,'IQD')='USD'
           AND (type LIKE 'ايداع%' OR type LIKE 'إيداع%' OR type LIKE 'مقدمة%'
                OR type LIKE 'استلام%' OR type LIKE 'إستلام%' OR type LIKE 'إعادة استثمار%'
                OR type LIKE 'تسوية%' OR type LIKE 'تسديد%')
           AND type NOT LIKE 'تحويل%'`,
      )
      .get(name, kind).val;
    const wdrUsd = db
      .prepare(
        `SELECT COALESCE(SUM(amount),0) AS val FROM partner_transactions
         WHERE partner_name=? AND kind=? AND COALESCE(currency,'IQD')='USD'
           AND (type LIKE 'سحب%' OR type LIKE 'باقي%')
           AND type NOT LIKE 'تحويل%'`,
      )
      .get(name, kind).val;
    const iqd = depIqd - wdrIqd;
    const usd = depUsd - wdrUsd;
    db.prepare(
      "UPDATE partners SET total_amount=?, iqd_balance=?, usd_balance=? WHERE partner_name=? AND kind=?",
    ).run(iqd + usd, iqd, usd, name, kind);
  }
}

function recalcAllPartners() {
  const rows = db.prepare("SELECT partner_name, kind FROM partners").all();
  for (const r of rows) recalcPartnerTotal(r.partner_name, r.kind);
}

// ─── command: login ─────────────────────────────────────────────────

function cmdLogin(args) {
  const u = String(args.username || "").trim();
  const p = String(args.password || "").trim();
  if (!u || !p)
    return { success: false, user: null, error: "اسم المستخدم أو كلمة المرور فارغة" };
  const row = db
    .prepare("SELECT id, username, display_name, profile_image, password_hash FROM users WHERE username=?")
    .get(u);
  if (!row)
    return { success: false, user: null, error: "اسم المستخدم غير موجود" };
  if (sha256(p) !== row.password_hash)
    return { success: false, user: null, error: "كلمة المرور غير صحيحة" };
  return {
    success: true,
    user: { id: row.id, username: row.username, display_name: row.display_name, profile_image: row.profile_image },
    error: null,
  };
}

// ─── command: add_car ───────────────────────────────────────────────

function cmdAddCar(args) {
  const num = String(args.num || "").trim();
  const chassis = String(args.chassis || "").trim();
  const model = String(args.model || "").trim();
  const year = String(args.year || "").trim();
  const name = String(args.name || "").trim();
  const color = String(args.color || "").trim();
  const details = String(args.details || "").trim();
  const purchase = Number(args.purchase) || 0;
  const currency = String(args.currency || "IQD");
  const saleCurrency = String(args.saleCurrency || "IQD");
  const selling = Number(args.selling) || 0;
  const status = String(args.status || "متوفرة");
  const paymentType = args.paymentType ? String(args.paymentType) : null;
  const cashPrice = args.cashPrice != null ? Number(args.cashPrice) : null;
  const amountPaid = args.amountPaid != null ? Number(args.amountPaid) : null;
  const amountRemaining = args.amountRemaining != null ? Number(args.amountRemaining) : null;
  const installmentMonths = args.installmentMonths != null ? Number(args.installmentMonths) : null;
  const monthlyPayment = args.monthlyPayment != null ? Number(args.monthlyPayment) : null;
  const buyerName = args.buyerName ? String(args.buyerName).trim() : null;
  const buyerPhone = args.buyerPhone ? String(args.buyerPhone).trim() : null;
  const purchaseDate = args.purchaseDate ? String(args.purchaseDate) : null;
  const saleDate = args.saleDate ? String(args.saleDate) : null;
  const deliveryDate = args.deliveryDate ? String(args.deliveryDate) : null;
  const firstPaymentDate = args.firstPaymentDate ? String(args.firstPaymentDate) : null;
  const purchasePaymentType = args.purchasePaymentType ? String(args.purchasePaymentType) : "قاصه";
  const purchaseType = args.purchaseType ? String(args.purchaseType) : "كاش";
  const financerName = args.financerName ? String(args.financerName) : null;
  const skipSale = !!args.skipSaleAccounting;

  const oldNum = args.oldNum ? String(args.oldNum).trim() : "";
  const queryNum = oldNum || num;
  const existing = db.prepare("SELECT status, purchase_price, purchase_type, selling_price, payment_type FROM cars WHERE car_number=?").get(queryNum);
  const isNew = !existing;

  // INSERT car
  db.prepare(
    `INSERT OR REPLACE INTO cars
       (car_number, car_plate_num, chassis_number, car_model, car_year, car_name, color, details,
        purchase_price, currency, sale_currency, selling_price, status, payment_type, cash_price,
        amount_paid, amount_remaining, installment_months, monthly_payment,
        purchase_payment_type, purchase_type, financer_name)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    num, num, chassis, model, year, name, color, details,
    purchase, currency, saleCurrency, selling, status, paymentType, cashPrice,
    amountPaid, amountRemaining, installmentMonths, monthlyPayment,
    purchasePaymentType, purchaseType, financerName,
  );

  // Update extra fields
  db.prepare(
    "UPDATE cars SET buyer_name=?, buyer_phone=?, purchase_date=?, sale_date=?, delivery_date=?, first_payment_date=?, purchase_time=?, sale_time=? WHERE car_number=?",
  ).run(
    buyerName, buyerPhone, purchaseDate, saleDate, deliveryDate, firstPaymentDate,
    purchaseDate ? nowTime() : "00:00", saleDate ? nowTime() : "00:00", num,
  );

  if (oldNum && oldNum !== num) {
    db.prepare("DELETE FROM cars WHERE car_number=?").run(oldNum);
    db.prepare("UPDATE partner_transactions SET notes=REPLACE(notes,?,?) WHERE notes LIKE ?").run(
      oldNum, num, `%${oldNum}%`,
    );
  }

  // Purchase partner transactions (new car only, cash purchase)
  if (isNew && purchaseType === "كاش" && purchase > 0) {
    const pDate = purchaseDate || todayIso();
    const note = `سحب شراء سيارة ${name} (شاصي: ${chassis})`;
    distribute50(
      purchase, currency, pDate, purchasePaymentType,
      "سحب شراء سيارة", note,
      "car_purchase", num, "cash_payment",
      true, true, false,
      "car", num,
    );
  } else if (
    !isNew &&
    existing &&
    existing.status === "متوفرة" &&
    purchaseType === "كاش" &&
    purchase > 0 &&
    existing.purchase_price !== purchase
  ) {
    db.prepare(
      "DELETE FROM partner_transactions WHERE source_type='car_purchase' AND source_id=?",
    ).run(num);
    const pDate = purchaseDate || todayIso();
    const note = `سحب شراء سيارة ${name} (شاصي: ${chassis})`;
    distribute50(
      purchase, currency, pDate, purchasePaymentType,
      "سحب شراء سيارة", note,
      "car_purchase", num, "cash_payment",
      true, true, false,
      "car", num,
    );
  }

  // Sale partner transactions (if sold and not skip)
  if (status === "مبيوعة" && !skipSale && selling > 0) {
    const sDate = saleDate || todayIso();
    const isInstallment = paymentType === "اقساط" || paymentType === "موعد";
    const saleAmount = isInstallment ? (amountPaid || 0) : selling;
    const expensesSum = db
      .prepare("SELECT COALESCE(SUM(amount),0) AS v FROM car_expenses WHERE car_number=?")
      .get(num).v;
    const profitRatio = selling > 0 ? (selling - purchase - expensesSum) / selling : 0;

    if (saleAmount > 0) {
      const saleNote = `ايداع بيع سيارة ${name} ${chassis}`;
      distribute50(
        saleAmount, saleCurrency || currency, sDate, "قاصه",
        "ايداع بيع سيارة", saleNote,
        "car_sale", num, "cash_movement",
        true, true, false,
        "car", num,
      );
      // Profit recognition
      const fullProfit = selling - purchase - expensesSum;
      const profit = Math.min(saleAmount * profitRatio, Math.max(0, fullProfit));
      if (profit > 0) {
        const profitNote = `ايداع ارباح سيارة ${name} ${chassis}`;
        distribute50(
          profit, saleCurrency || currency, sDate, "قاصه",
          "ايداع ارباح سيارة", profitNote,
          "car_sale", num, "profit_recognition",
          false, false, true,
          "car", num,
        );
      }
    }
  }

  recalcAllPartners();
  return undefined;
}

// ─── command: sell_car_with_accounting ──────────────────────────────

function cmdSellCarWithAccounting(args) {
  const carNumber = String(args.carNumber || args.car_number || "").trim();
  const buyerName = String(args.buyerName || args.buyer_name || "").trim();
  const buyerPhone = String(args.buyerPhone || args.buyer_phone || "").trim();
  const sellingPrice = Number(args.sellingPrice ?? args.selling_price) || 0;
  const saleCurrency = String(args.saleCurrency ?? args.sale_currency ?? "IQD");
  const saleDate = String(args.saleDate ?? args.sale_date ?? todayIso());
  const paymentType = String(args.paymentType ?? args.payment_type ?? "كاش");
  const amountPaid = Number(args.amountPaid ?? args.amount_paid) || 0;
  const amountRemaining = Number(args.amountRemaining ?? args.amount_remaining) || 0;
  const installmentMonths = args.installmentMonths ?? args.installment_months;
  const firstPaymentDate = args.firstPaymentDate ?? args.first_payment_date;
  const deliveryDate = args.deliveryDate ?? args.delivery_date;
  const chassisNumber = args.chassisNumber ?? args.chassis_number;

  // Get car info
  const car = db
    .prepare("SELECT car_name, chassis_number, purchase_price, COALESCE(currency,'IQD') AS currency FROM cars WHERE car_number=?")
    .get(carNumber);
  if (!car) throw new Error(`السيارة رقم ${carNumber} غير موجودة`);

  const carLabel = car.car_name || "سيارة";
  const chassisLabel = chassisNumber || car.chassis_number || "";
  const purchasePrice = car.purchase_price;
  const carCurrency = car.currency;

  // Update car
  const t = nowTime();
  db.prepare(
    `UPDATE cars SET status='مبيوعة', selling_price=?, sale_currency=?, payment_type=?,
        amount_paid=?, amount_remaining=?, installment_months=?,
        buyer_name=?, buyer_phone=?, sale_date=?, sale_time=?,
        delivery_date=?, first_payment_date=?
     WHERE car_number=?`,
  ).run(
    sellingPrice, saleCurrency, paymentType,
    amountPaid, amountRemaining, installmentMonths || 1,
    buyerName, buyerPhone, saleDate, t,
    deliveryDate || null, firstPaymentDate || null,
    carNumber,
  );

  // Delete existing sale partner transactions for this car
  db.prepare(
    "DELETE FROM partner_transactions WHERE source_type='car_sale' AND source_id=?",
  ).run(carNumber);

  if (paymentType === "كاش") {
    // Cash movement
    const cashNote = `ايداع بيع سيارة ${carLabel} (${carNumber}) إلى ${buyerName}`;
    distribute50(
      sellingPrice, saleCurrency, saleDate, "قاصه",
      "ايداع بيع سيارة", cashNote,
      "car_sale", carNumber, "cash_movement",
      true, true, false,
      "car", carNumber,
    );

    // Profit recognition
    const expensesSum = db
      .prepare("SELECT COALESCE(SUM(amount),0) AS v FROM car_expenses WHERE car_number=?")
      .get(carNumber).v;
    const profit = sellingPrice - purchasePrice - expensesSum;
    if (profit > 0) {
      const profitNote = `ايداع ارباح سيارة ${carLabel} (${carNumber})`;
      distribute50(
        profit, saleCurrency, saleDate, "قاصه",
        "ايداع ارباح سيارة", profitNote,
        "car_sale", carNumber, "profit_recognition",
        false, false, true,
        "car", carNumber,
      );
    }
  }

  recalcAllPartners();
  return undefined;
}

// ─── command: save_and_sell_car_with_accounting ─────────────────────

function cmdSaveAndSell(args) {
  cmdAddCar({ ...args, skipSaleAccounting: true });
  cmdSellCarWithAccounting(args);
  return undefined;
}

// ─── command: update_sold_car_with_accounting ───────────────────────

function cmdUpdateSoldCar(args) {
  cmdSellCarWithAccounting(args);
  return undefined;
}

// ─── command: get_cars ──────────────────────────────────────────────

function cmdGetCars() {
  const cars = db.prepare("SELECT * FROM cars ORDER BY car_name").all();
  const carExpenses = db.prepare("SELECT * FROM car_expenses").all();
  return cars.map((c) => {
    const exps = carExpenses.filter((e) => e.car_number === c.car_number);
    return {
      ...c,
      car_partners: null,
      expenses_sum: exps.reduce((s, e) => s + e.amount, 0) || null,
    };
  });
}

// ─── command: get_partners ──────────────────────────────────────────

function cmdGetPartners() {
  return db
    .prepare(
      `SELECT p.partner_name, p.phone, p.total_amount, p.kind,
              COALESCE((SELECT SUM(amount) FROM partner_transactions
                        WHERE partner_name=p.partner_name AND kind=p.kind AND type LIKE 'سحب%'),0) AS total_withdrawals,
              COALESCE(p.iqd_balance,0) AS iqd_balance,
              COALESCE(p.usd_balance,0) AS usd_balance
       FROM partners p ORDER BY p.partner_name`,
    )
    .all();
}

// ─── command: get_partner_transactions ──────────────────────────────

function cmdGetPartnerTransactions(args) {
  const name = String(args.partner_name || args.partnerName || "").trim();
  const kind = String(args.kind || "شريك").trim();
  return db
    .prepare(
      `SELECT id, partner_name, kind, type AS type_, amount, date, notes, currency,
              payment_type, time, source_type, source_id, source_role,
              COALESCE(affects_qasa,1) AS affects_qasa,
              COALESCE(affects_partner_cash,1) AS affects_partner_cash,
              COALESCE(affects_profit,0) AS affects_profit,
              related_source_type, related_source_id
       FROM partner_transactions WHERE partner_name=? AND kind=? ORDER BY id`,
    )
    .all(name, kind);
}

// ─── command: get_profit_distribution_summary ──────────────────────

function cmdGetProfitDistributionSummary() {
  const partners = db
    .prepare("SELECT partner_name FROM partners WHERE kind='شريك' ORDER BY partner_name")
    .all()
    .map((r) => r.partner_name);

  const partnerInfos = partners.map((name) => {
    const piq = db
      .prepare(
        `SELECT COALESCE(SUM(amount),0) AS v FROM partner_transactions
         WHERE kind='شريك' AND partner_name=? AND COALESCE(currency,'IQD')='IQD' AND affects_profit=1`,
      )
      .get(name).v;
    const pusd = db
      .prepare(
        `SELECT COALESCE(SUM(amount),0) AS v FROM partner_transactions
         WHERE kind='شريك' AND partner_name=? AND COALESCE(currency,'IQD')='USD' AND affects_profit=1`,
      )
      .get(name).v;
    const diq = db
      .prepare(
        `SELECT COALESCE(SUM(amount),0) AS v FROM partner_transactions
         WHERE kind='شريك' AND partner_name=? AND COALESCE(currency,'IQD')='IQD' AND type='سحب شريك'`,
      )
      .get(name).v;
    const dusd = db
      .prepare(
        `SELECT COALESCE(SUM(amount),0) AS v FROM partner_transactions
         WHERE kind='شريك' AND partner_name=? AND COALESCE(currency,'IQD')='USD' AND type='سحب شريك'`,
      )
      .get(name).v;
    return {
      partner_name: name,
      profit_iqd: piq,
      profit_usd: pusd,
      drawings_iqd: diq,
      drawings_usd: dusd,
    };
  });

  const expIqd = db
    .prepare(
      `SELECT COALESCE(SUM(amount),0) AS v FROM expenses
       WHERE COALESCE(currency,'IQD')='IQD' AND (car_number IS NULL OR car_number='')`,
    )
    .get().v;
  const expUsd = db
    .prepare(
      `SELECT COALESCE(SUM(amount),0) AS v FROM expenses
       WHERE COALESCE(currency,'IQD')='USD' AND (car_number IS NULL OR car_number='')`,
    )
    .get().v;

  let undIqd = 0;
  let undUsd = 0;
  for (const p of partnerInfos) {
    undIqd += p.profit_iqd - p.drawings_iqd;
    undUsd += p.profit_usd - p.drawings_usd;
  }
  undIqd -= expIqd;
  undUsd -= expUsd;

  return {
    undistributed_iqd: undIqd,
    undistributed_usd: undUsd,
    partners: partnerInfos,
    expenses_iqd: expIqd,
    expenses_usd: expUsd,
  };
}

// ─── command: get_financial_summary ─────────────────────────────────

function cmdGetFinancialSummary(args) {
  const paymentType = args.payment_type ? String(args.payment_type).trim() : null;

  // Qasa (affects_qasa=1, kind IN شريك/مستثمر)
  const qasaIqd = db
    .prepare(
      `SELECT COALESCE(SUM(
         CASE WHEN (type LIKE 'ايداع%' OR type LIKE 'إيداع%' OR type LIKE 'مقدمة%'
                     OR type LIKE 'استلام%' OR type LIKE 'إستلام%' OR type LIKE 'إعادة استثمار%'
                     OR type LIKE 'تسوية%' OR type LIKE 'تسديد%')
                    AND type NOT LIKE 'تحويل%' THEN amount
              WHEN (type LIKE 'سحب%' OR type LIKE 'باقي%')
                    AND type NOT LIKE 'تحويل%' THEN -amount
              ELSE 0 END), 0) AS val
       FROM partner_transactions
       WHERE affects_qasa=1 AND kind IN ('شريك','مستثمر') AND COALESCE(currency,'IQD')='IQD'`,
    )
    .get().val;
  const qasaUsd = db
    .prepare(
      `SELECT COALESCE(SUM(
         CASE WHEN (type LIKE 'ايداع%' OR type LIKE 'إيداع%' OR type LIKE 'مقدمة%'
                     OR type LIKE 'استلام%' OR type LIKE 'إستلام%' OR type LIKE 'إعادة استثمار%'
                     OR type LIKE 'تسوية%' OR type LIKE 'تسديد%')
                    AND type NOT LIKE 'تحويل%' THEN amount
              WHEN (type LIKE 'سحب%' OR type LIKE 'باقي%')
                    AND type NOT LIKE 'تحويل%' THEN -amount
              ELSE 0 END), 0) AS val
       FROM partner_transactions
       WHERE affects_qasa=1 AND kind IN ('شريك','مستثمر') AND COALESCE(currency,'IQD')='USD'`,
    )
    .get().val;

  // Cash (affects_partner_cash=1, kind=شريك)
  const cashIqd = db
    .prepare(
      `SELECT COALESCE(SUM(
         CASE WHEN (type LIKE 'ايداع%' OR type LIKE 'إيداع%' OR type LIKE 'مقدمة%'
                     OR type LIKE 'استلام%' OR type LIKE 'إستلام%' OR type LIKE 'إعادة استثمار%'
                     OR type LIKE 'تسوية%' OR type LIKE 'تسديد%')
                    AND type NOT LIKE 'تحويل%' THEN amount
              WHEN (type LIKE 'سحب%' OR type LIKE 'باقي%')
                    AND type NOT LIKE 'تحويل%' THEN -amount
              ELSE 0 END), 0) AS val
       FROM partner_transactions
       WHERE affects_partner_cash=1 AND kind='شريك' AND COALESCE(currency,'IQD')='IQD'`,
    )
    .get().val;
  const cashUsd = db
    .prepare(
      `SELECT COALESCE(SUM(
         CASE WHEN (type LIKE 'ايداع%' OR type LIKE 'إيداع%' OR type LIKE 'مقدمة%'
                     OR type LIKE 'استلام%' OR type LIKE 'إستلام%' OR type LIKE 'إعادة استثمار%'
                     OR type LIKE 'تسوية%' OR type LIKE 'تسديد%')
                    AND type NOT LIKE 'تحويل%' THEN amount
              WHEN (type LIKE 'سحب%' OR type LIKE 'باقي%')
                    AND type NOT LIKE 'تحويل%' THEN -amount
              ELSE 0 END), 0) AS val
       FROM partner_transactions
       WHERE affects_partner_cash=1 AND kind='شريك' AND COALESCE(currency,'IQD')='USD'`,
    )
    .get().val;

  // Inventory: available cars only
  const allCars = db.prepare("SELECT * FROM cars").all();
  const allCarExpenses = db.prepare("SELECT * FROM car_expenses").all();
  const invIqd = allCars
    .filter((c) => c.status === "متوفرة" && (c.currency || "IQD") === "IQD")
    .reduce((sum, c) => {
      const exp = allCarExpenses
        .filter((e) => e.car_number === c.car_number)
        .reduce((s, e) => s + e.amount, 0);
      return sum + c.purchase_price + exp;
    }, 0);
  const invUsd = allCars
    .filter((c) => c.status === "متوفرة" && (c.currency || "IQD") === "USD")
    .reduce((sum, c) => {
      const exp = allCarExpenses
        .filter((e) => e.car_number === c.car_number && (e.currency || "IQD") === "USD")
        .reduce((s, e) => s + e.amount, 0);
      return sum + c.purchase_price + exp;
    }, 0);

  // Partner capital
  const capIqd = db
    .prepare(
      "SELECT COALESCE(SUM(iqd_balance),0) AS v FROM partners WHERE kind='شريك'",
    )
    .get().v;
  const capUsd = db
    .prepare(
      "SELECT COALESCE(SUM(usd_balance),0) AS v FROM partners WHERE kind='شريك'",
    )
    .get().v;

  // Investments: net investor liability from transactions
  const invtIqd = db
    .prepare(
      `SELECT COALESCE(SUM(
         CASE WHEN (type LIKE 'ايداع%' OR type LIKE 'إيداع%' OR type LIKE 'مقدمة%'
                     OR type LIKE 'استلام%' OR type LIKE 'إستلام%' OR type LIKE 'إعادة استثمار%'
                     OR type LIKE 'تسوية%' OR type LIKE 'تسديد%')
                    AND type NOT LIKE 'تحويل%' THEN amount
              WHEN (type LIKE 'سحب%' OR type LIKE 'باقي%')
                    AND type NOT LIKE 'تحويل%' THEN -amount
              ELSE 0 END), 0) AS v
       FROM partner_transactions
       WHERE kind='مستثمر' AND COALESCE(currency,'IQD')='IQD'`,
    )
    .get().v;
  const invtUsd = db
    .prepare(
      `SELECT COALESCE(SUM(
         CASE WHEN (type LIKE 'ايداع%' OR type LIKE 'إيداع%' OR type LIKE 'مقدمة%'
                     OR type LIKE 'استلام%' OR type LIKE 'إستلام%' OR type LIKE 'إعادة استثمار%'
                     OR type LIKE 'تسوية%' OR type LIKE 'تسديد%')
                    AND type NOT LIKE 'تحويل%' THEN amount
              WHEN (type LIKE 'سحب%' OR type LIKE 'باقي%')
                    AND type NOT LIKE 'تحويل%' THEN -amount
              ELSE 0 END), 0) AS v
       FROM partner_transactions
       WHERE kind='مستثمر' AND COALESCE(currency,'IQD')='USD'`,
    )
    .get().v;

  // Debtors (customers)
  const debtIqd = db
    .prepare(
      "SELECT COALESCE(SUM(iqd_balance),0) AS v FROM partners WHERE kind='زبون'",
    )
    .get().v;

  // Expenses
  const expIqd = db
    .prepare(
      "SELECT COALESCE(SUM(amount),0) AS v FROM expenses WHERE COALESCE(currency,'IQD')='IQD'",
    )
    .get().v;

  // Monthly profits (affects_profit=1 - general expenses)
  const profitIqd = db
    .prepare(
      `SELECT COALESCE(SUM(amount),0) AS v FROM partner_transactions
       WHERE kind='شريك' AND COALESCE(currency,'IQD')='IQD' AND affects_profit=1`,
    )
    .get().v;
  const genExpIqd = db
    .prepare(
      `SELECT COALESCE(SUM(amount),0) AS v FROM expenses
       WHERE COALESCE(currency,'IQD')='IQD' AND (car_number IS NULL OR car_number='')`,
    )
    .get().v;
  const profitUsd = db
    .prepare(
      `SELECT COALESCE(SUM(amount),0) AS v FROM partner_transactions
       WHERE kind='شريك' AND COALESCE(currency,'IQD')='USD' AND affects_profit=1`,
    )
    .get().v;
  const genExpUsd = db
    .prepare(
      `SELECT COALESCE(SUM(amount),0) AS v FROM expenses
       WHERE COALESCE(currency,'IQD')='USD' AND (car_number IS NULL OR car_number='')`,
    )
    .get().v;

  const netCap = cashIqd + invIqd + debtIqd - invtIqd;

  return {
    cash_iqd: cashIqd,
    cash_usd: cashUsd,
    qasa_iqd: qasaIqd,
    qasa_usd: qasaUsd,
    inventory_value_iqd: invIqd,
    inventory_value_usd: invUsd,
    total_investments_iqd: invtIqd,
    total_investments_usd: invtUsd,
    total_partner_capital_iqd: capIqd,
    total_partner_capital_usd: capUsd,
    total_debtors_iqd: debtIqd,
    total_debtors_usd: 0,
    total_expenses_iqd: expIqd,
    total_expenses_usd: 0,
    net_capital_iqd: netCap,
    net_capital_usd: 0,
    monthly_profits_iqd: profitIqd - genExpIqd,
    monthly_profits_usd: profitUsd - genExpUsd,
  };
}

// ─── command: get_cash_register_entries ─────────────────────────────

function cmdGetCashRegisterEntries(args) {
  const filterType = args.payment_type ? String(args.payment_type).trim() : null;
  const isCashFilter = filterType === "الكاش";

  if (isCashFilter) {
    // Partner cash only
    const allTx = db.prepare("SELECT * FROM partner_transactions").all();
    const entries = [];
    for (const tx of allTx) {
      if (tx.kind !== "شريك") continue;
      if (tx.type.includes("تحويل")) continue;
      if ((tx.affects_partner_cash ?? 1) !== 1) continue;
      const isDep = isDepositType(tx.type);
      const isWdr = isWithdrawalType(tx.type);
      if (!isDep && !isWdr) continue;
      const amount = isDep ? tx.amount : -tx.amount;
      entries.push({
        id: 0,
        date: tx.date,
        time: tx.time || "00:00",
        type_: isDep ? "ايداع شريك" : "سحب شريك",
        amount,
        description: tx.partner_name,
        notes: tx.notes || null,
        balance: 0,
        currency: tx.currency || "IQD",
      });
    }
    entries.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
    let runIqd = 0;
    let runUsd = 0;
    for (const e of entries) {
      if (e.currency === "USD") {
        runUsd += e.amount;
        e.balance = runUsd;
      } else {
        runIqd += e.amount;
        e.balance = runIqd;
      }
    }
    entries.forEach((e, i) => (e.id = i + 1));
    return entries;
  }

  // Full Qasa
  const allCars = db.prepare("SELECT * FROM cars").all();
  let cars = filterType
    ? filterType === "قاصه" || filterType === "قاصة"
      ? allCars.filter(
          (c) =>
            c.purchase_payment_type === "قاصه" ||
            c.purchase_payment_type === "قاصة" ||
            !c.purchase_payment_type,
        )
      : allCars.filter((c) => c.purchase_payment_type === filterType)
    : allCars;

  if (filterType) cars = cars.filter((c) => c.purchase_type !== "دين");

  const allTx = db.prepare("SELECT * FROM partner_transactions").all();
  const entries = [];

  // Car purchases
  for (const c of cars) {
    if (c.purchase_date && c.purchase_price > 0) {
      const pt = c.purchase_type || "كاش";
      let type_, amount;
      if (pt === "دين" || pt === "تمويل") {
        type_ = "شراء بالتمويل";
        amount = c.purchase_price;
      } else if (pt === "شركة") {
        type_ = "شراء عن طريق شركة";
        amount = c.purchase_price;
      } else {
        type_ = "شراء سيارة";
        amount = -c.purchase_price;
      }
      entries.push({
        id: 0,
        date: c.purchase_date,
        time: c.purchase_time || "00:00",
        type_,
        amount,
        description: `${c.car_name} - ${c.car_number}`,
        notes: null,
        balance: 0,
        currency: c.currency || "IQD",
      });
    }
  }

  // Car sales (cash)
  for (const c of cars) {
    if (c.status === "مبيوعة" && c.payment_type === "كاش" && c.sale_date) {
      entries.push({
        id: 0,
        date: c.sale_date,
        time: c.sale_time || "00:00",
        type_: "بيع سيارة",
        amount: c.selling_price,
        description: `${c.car_name} - ${c.car_number}`,
        notes: null,
        balance: 0,
        currency: c.sale_currency || "IQD",
      });
    }
  }

  const includeOthers =
    filterType === null || filterType === "قاصه" || filterType === "قاصة";

  if (includeOthers) {
    for (const tx of allTx) {
      if (
        tx.type.startsWith("سحب شراء سيارة") ||
        tx.type.startsWith("ايداع بيع سيارة") ||
        tx.type.startsWith("سحب مصروف") ||
        tx.type.startsWith("ايداع ارباح وكالة")
      )
        continue;

      if (filterType) {
        const isQasa =
          filterType === "قاصه" || filterType === "قاصة";
        const txPt = tx.payment_type || tx.paymentType || "قاصه";
        const isTxQasa = txPt === "قاصه" || txPt === "قاصة";
        if (isQasa) {
          if (!isTxQasa) continue;
          if ((tx.affects_qasa ?? 1) !== 1) continue;
        } else {
          if (txPt !== filterType) continue;
        }
      }

      let type_, amount;
      switch (tx.kind) {
        case "شريك":
          type_ = isDepositType(tx.type) ? "ايداع شريك" : "سحب شريك";
          amount = isDepositType(tx.type) ? tx.amount : -tx.amount;
          break;
        case "مستثمر":
          type_ = isDepositType(tx.type) ? "ايداع مستثمر" : "سحب مستثمر";
          amount = isDepositType(tx.type) ? tx.amount : -tx.amount;
          break;
        default:
          continue;
      }
      entries.push({
        id: 0,
        date: tx.date,
        time: tx.time || "00:00",
        type_,
        amount,
        description: tx.partner_name,
        notes: tx.notes,
        balance: 0,
        currency: tx.currency || "IQD",
      });
    }

    // Expenses
    const expenses = db.prepare("SELECT * FROM expenses").all();
    for (const e of expenses) {
      entries.push({
        id: 0,
        date: e.date,
        time: e.time || "00:00",
        type_: "مصروف",
        amount: -e.amount,
        description: e.description,
        notes: e.notes,
        balance: 0,
        currency: e.currency || "IQD",
      });
    }
  }

  entries.sort(
    (a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time),
  );
  let runIqd = 0;
  let runUsd = 0;
  for (const e of entries) {
    if (e.currency === "USD") {
      runUsd += e.amount;
      e.balance = runUsd;
    } else {
      runIqd += e.amount;
      e.balance = runIqd;
    }
  }
  entries.forEach((e, i) => (e.id = i + 1));
  return entries;
}

// ─── command: get_partners_totals ───────────────────────────────────

function cmdGetPartnersTotals(args) {
  const kind = String(args.kind || "شريك").trim();
  let iqd = 0;
  let usd = 0;

  if (kind === "partners-only" || kind === "شريك") {
    const rows = db
      .prepare(
        "SELECT COALESCE(SUM(iqd_balance),0) AS i, COALESCE(SUM(usd_balance),0) AS u FROM partners WHERE kind='شريك'",
      )
      .get();
    return [rows.i, rows.u];
  }

  const kinds =
    kind === "partners-financial"
      ? ["شريك", "مستثمر", "ممول", "زبون", "شركة"]
      : kind === "customers-only"
        ? ["مستثمر", "ممول", "زبون", "شركة"]
        : [kind];

  for (const k of kinds) {
    const row = db
      .prepare(
        "SELECT COALESCE(SUM(iqd_balance),0) AS i, COALESCE(SUM(usd_balance),0) AS u FROM partners WHERE kind=?",
      )
      .get(k);
    iqd += row.i;
    usd += row.u;
  }
  return [iqd, usd];
}

// ─── command: get_unified_accounts ─────────────────────────────────

function cmdGetUnifiedAccounts() {
  const partners = db
    .prepare(
      "SELECT partner_name, phone, kind FROM partners WHERE kind IN ('ممول','شركة','مستثمر','زبون') ORDER BY partner_name",
    )
    .all();
  return partners.map((p) => ({
    partner_name: p.partner_name,
    phone: p.phone,
    iqd_balance: db
      .prepare(
        "SELECT COALESCE(SUM(iqd_balance),0) AS v FROM partners WHERE partner_name=? AND kind=?",
      )
      .get(p.partner_name, p.kind).v,
    usd_balance: db
      .prepare(
        "SELECT COALESCE(SUM(usd_balance),0) AS v FROM partners WHERE partner_name=? AND kind=?",
      )
      .get(p.partner_name, p.kind).v,
    kind: p.kind,
  }));
}

// ─── command: get_expenses ──────────────────────────────────────────

function cmdGetExpenses() {
  return db.prepare("SELECT * FROM expenses ORDER BY date, time").all();
}

// ─── command: get_car_expense_records ──────────────────────────────

function cmdGetCarExpenseRecords(args) {
  const cn = String(args.carNumber || args.car_number || "");
  return db
    .prepare("SELECT * FROM car_expenses WHERE car_number=?")
    .all(cn);
}

// ─── command: get_backgrounds / get_users / noop ────────────────────

function cmdGetBackgrounds() {
  return ["/backgrounds/bg.jpg"];
}

function cmdGetUsers() {
  return db
    .prepare("SELECT id, username, display_name, profile_image FROM users")
    .all();
}

function cmdGetAgencies() {
  return db.prepare("SELECT * FROM agencies").all();
}

// ─── command: add_expense ───────────────────────────────────────────

function cmdAddExpense(args) {
  const carNumber = args.carNumber || args.car_number || null;
  const amount = Number(args.amount) || 0;
  const currency = String(args.currency || "IQD");
  const date = String(args.date || todayIso());
  if (carNumber) {
    db.prepare(
      "INSERT INTO car_expenses (car_number, description, amount, date, currency) VALUES (?,?,?,?,?)",
    ).run(
      String(carNumber),
      String(args.description || ""),
      amount,
      date,
      currency,
    );
    const expId = db.prepare("SELECT last_insert_rowid() AS id").get().id;
    if (amount > 0) {
      distribute50(
        amount, currency, date, "قاصه",
        "سحب مصروف سيارة", `مصروف سيارة ${carNumber}`,
        "car_expense", String(expId), "cash_payment",
        true, true, false,
        "car", String(carNumber),
      );
    }
  } else {
    db.prepare(
      "INSERT INTO expenses (description, amount, date, time, notes, currency) VALUES (?,?,?,?,?,?)",
    ).run(
      String(args.description || ""),
      amount,
      date,
      nowTime(),
      args.notes ? String(args.notes) : null,
      currency,
    );
    const expId = db.prepare("SELECT last_insert_rowid() AS id").get().id;
    if (amount > 0) {
      distribute50(
        amount, currency, date, "قاصه",
        "سحب مصروف عام", String(args.description || ""),
        "expense", String(expId), "cash_payment",
        true, true, false,
        "expense", String(expId),
      );
    }
  }
  return undefined;
}

// ─── command: add_partner / update_partner / delete_partner ─────────

function cmdAddPartner(args) {
  const name = String(args.name || "").trim();
  const kind = String(args.kind || "شريك").trim();
  if (kind === "شريك") throw new Error("لا يمكن إنشاء حساب شريك جديد");
  const phone = String(args.phone || "").trim();
  db.prepare(
    "INSERT OR REPLACE INTO partners (partner_name, phone, total_amount, kind, iqd_balance, usd_balance) VALUES (?,?,0,?,0,0)",
  ).run(name, phone, kind);
  return undefined;
}

function cmdDeletePartner(args) {
  const name = String(args.name || "").trim();
  const kind = String(args.kind || "شريك").trim();
  if (kind === "شريك") throw new Error("لا يمكن حذف حساب شريك");
  db.prepare("DELETE FROM partners WHERE partner_name=? AND kind=?").run(name, kind);
  db.prepare("DELETE FROM partner_transactions WHERE partner_name=? AND kind=?").run(name, kind);
  return undefined;
}

// ─── command: add_partner_transaction / delete / update ─────────────

function cmdAddPartnerTransaction(args) {
  const name = String(args.partner_name || args.partnerName || "").trim();
  const kind = String(args.kind || "شريك").trim();
  const type = String(args.type || args.type_ || "");
  const amount = Number(args.amount) || 0;
  const date = String(args.date || "");
  const notes = args.notes ? String(args.notes) : null;
  const currency = String(args.currency || "IQD");
  const paymentType = String(args.payment_type || args.paymentType || "قاصه");
  const isInvestor = kind === "مستثمر";
  const isCustomerInstallment = kind === "زبون" && type.startsWith("تسديد قسط") && amount > 0;

  const txId = insertPartnerTx(
    name, kind, type, amount, date, paymentType, notes, currency,
    isInvestor ? "investor_transaction" : "",
    "",
    isInvestor ? (isDepositType(type) ? "deposit" : "withdrawal") : "",
    true, !isInvestor, false, "", "",
  );

  if (isInvestor && txId) {
    db.prepare("UPDATE partner_transactions SET source_id=? WHERE id=?").run(String(txId), txId);
    recalcPartnerTotal(name, kind);
  }

  // If this is a customer installment payment, create partner cash_movement + profit_recognition
  if (isCustomerInstallment) {
    // Extract car number from notes (format: "تسديد قسط سيارة <carNum>")
    const match = notes?.match(/تسديد قسط سيارة\s+(.+)/);
    if (match) {
      const carNum = match[1].trim();
      const car = db.prepare("SELECT * FROM cars WHERE car_number = ?").get(carNum);
      if (car) {
        // Partner cash movement (the payment enters partner cash)
        distribute50(
          amount, currency, date, "قاصه",
          "ايداع بيع سيارة", `تسديد قسط من ${name} — سيارة ${carNum}`,
          "customer_installment", carNum, "cash_movement",
          true, true, false,
          "car", carNum,
        );

        // Partner profit recognition (capped)
        const profit = calculatePaymentProfitCapped(carNum, amount);
        if (profit > 0) {
          distribute50(
            profit, currency, date, "قاصه",
            "ايداع ارباح سيارة", `ارباح قسط من ${name} — سيارة ${carNum}`,
            "customer_installment", carNum, "profit_recognition",
            false, false, true,
            "car", carNum,
          );
        }
      }
    }
  }

  return undefined;
}

function cmdDeletePartnerTransaction(args) {
  const id = Number(args.id);
  const name = String(args.partner_name || args.partnerName || "").trim();
  const kind = String(args.kind || "شريك").trim();
  db.prepare("DELETE FROM partner_transactions WHERE id=?").run(id);
  recalcPartnerTotal(name, kind);
  return undefined;
}

function cmdUpdatePartnerTransaction(args) {
  const id = Number(args.id);
  const name = String(args.partner_name || args.partnerName || "").trim();
  const kind = String(args.kind || "شريك").trim();
  const type = String(args.type || args.type_ || "");
  const amount = Number(args.amount) || 0;
  const date = String(args.date || "");
  const notes = args.notes ? String(args.notes) : null;
  const currency = String(args.currency || "IQD");

  db.prepare(
    "UPDATE partner_transactions SET type=?, amount=?, date=?, notes=?, currency=? WHERE id=?",
  ).run(type, amount, date, notes, currency, id);
  recalcPartnerTotal(name, kind);
  return undefined;
}

// ─── command: delete_car ───────────────────────────────────────────

function cmdDeleteCar(args) {
  const num = String(args.num || "").trim();
  db.prepare(
    "DELETE FROM partner_transactions WHERE source_type IN ('car_purchase','car_sale') AND source_id=?",
  ).run(num);
  db.prepare(
    `DELETE FROM partner_transactions
     WHERE source_type IN ('customer_installment','customer_payment')
       AND (source_id=? OR related_source_id=?)`,
  ).run(num, num);
  db.prepare(
    "DELETE FROM partner_transactions WHERE kind='زبون' AND notes LIKE ?",
  ).run(`%${num}%`);
  const carExpenses = db.prepare("SELECT id FROM car_expenses WHERE car_number=?").all(num);
  for (const exp of carExpenses) {
    db.prepare(
      "DELETE FROM partner_transactions WHERE source_type='car_expense' AND source_id=?",
    ).run(String(exp.id));
  }
  db.prepare("DELETE FROM car_expenses WHERE car_number=?").run(num);
  db.prepare("DELETE FROM cars WHERE car_number=?").run(num);
  recalcAllPartners();
  return undefined;
}

// ─── command: delete_expense / update_expense ──────────────────────

function cmdDeleteExpense(args) {
  const id = Number(args.id);
  db.prepare("DELETE FROM partner_transactions WHERE source_type='expense' AND source_id=?").run(String(id));
  db.prepare("DELETE FROM expenses WHERE id=?").run(id);
  recalcAllPartners();
  return undefined;
}

function cmdUpdateExpense(args) {
  const id = Number(args.id);
  db.prepare(
    "DELETE FROM partner_transactions WHERE source_type='expense' AND source_id=? AND source_role='cash_payment'",
  ).run(String(id));
  db.prepare(
    "UPDATE expenses SET description=?, amount=?, date=?, notes=?, currency=? WHERE id=?",
  ).run(
    String(args.description || ""),
    Number(args.amount) || 0,
    String(args.date || ""),
    args.notes ? String(args.notes) : null,
    String(args.currency || "IQD"),
    id,
  );
  const amount = Number(args.amount) || 0;
  const currency = String(args.currency || "IQD");
  const date = String(args.date || todayIso());
  if (amount > 0) {
    distribute50(
      amount, currency, date, "قاصه",
      "سحب مصروف عام", String(args.description || ""),
      "expense", String(id), "cash_payment",
      true, true, false,
      "expense", String(id),
    );
  }
  recalcAllPartners();
  return undefined;
}

// ─── command: add_car_expense_record / delete_car_expense_record ───

function cmdAddCarExpenseRecord(args) {
  const cn = String(args.carNumber || args.car_number || "");
  const amount = Number(args.amount) || 0;
  const currency = String(args.currency || "IQD");
  const date = String(args.date || todayIso());
  db.prepare(
    "INSERT INTO car_expenses (car_number, description, amount, date, currency) VALUES (?,?,?,?,?)",
  ).run(
    cn,
    String(args.description || ""),
    amount,
    date,
    currency,
  );
  const expId = db.prepare("SELECT last_insert_rowid() AS id").get().id;
  if (amount > 0) {
    distribute50(
      amount, currency, date, "قاصه",
      "سحب مصروف سيارة", `مصروف سيارة ${cn}`,
      "car_expense", String(expId), "cash_payment",
      true, true, false,
      "car", cn,
    );
  }
  rebuildInstallmentProfitsAfterCostChange(cn);
  return expId;
}

function cmdDeleteCarExpenseRecord(args) {
  const id = Number(args.id);
  db.prepare("DELETE FROM partner_transactions WHERE source_type='car_expense' AND source_id=?").run(String(id));
  db.prepare("DELETE FROM car_expenses WHERE id=?").run(id);
  recalcAllPartners();
  return undefined;
}

// ─── command: pay_financier_from_partners ───────────────────────────

function cmdPayFinancierFromPartners(args) {
  const name = String(args.financier_name || args.financierName || "").trim();
  const kind = String(args.financier_kind || args.financierKind || "ممول").trim();
  const amount = Number(args.amount) || 0;
  const date = String(args.date || todayIso());
  const currency = String(args.currency || "IQD");
  const notes = args.notes ? String(args.notes) : null;

  const srcType =
    kind === "مستثمر"
      ? "investor_transaction"
      : kind === "شركة"
        ? "company_transaction"
        : "funder_transaction";
  const affectsQasa = kind === "مستثمر" ? 1 : 0;

  const txId = insertPartnerTx(
    name,
    kind,
    "سحب",
    amount,
    date,
    "قاصه",
    notes,
    currency,
    srcType,
    "",
    "repayment_account_movement",
    affectsQasa,
    0,
    0,
    "",
    "",
  );
  db.prepare("UPDATE partner_transactions SET source_id=? WHERE id=?").run(String(txId), txId);

  recalcPartnerTotal(name, kind);

  const partnerSourceType =
    kind === "شركة" ? "company_payment" : kind === "مستثمر" ? "investor_transaction" : "funder_payment";
  const accountLabel =
    kind === "شركة" ? "الشركة" : kind === "مستثمر" ? "المستثمر" : "الممول";
  distribute50(
    amount,
    currency,
    date,
    "قاصه",
    "سحب تسديد",
    `سحب لتسديد ${accountLabel} ${name}`,
    partnerSourceType,
    String(txId),
    "partner_cash_payment",
    true,
    true,
    false,
    "",
    "",
  );

  recalcAllPartners();
  return undefined;
}

// ─── command: settle_company_through_funder ─────────────────────────

function cmdSettleCompanyThroughFunder() {
  return undefined;
}

// ─── command: add_user / update_user / change_password / delete_user ──

function cmdUserManagement() {
  return undefined;
}

// ─── command: rename_background ─────────────────────────────────────

function cmdRenameBackground() {
  return "/backgrounds/bg.jpg";
}

// ─── command: export_database_to_excel ──────────────────────────────

function cmdExportDatabaseToExcel() {
  return "تصدير تجريبي";
}

// ─── command: open_whatsapp ─────────────────────────────────────────

function cmdOpenWhatsapp() {
  return undefined;
}

// ─── agency stubs ───────────────────────────────────────────────────

function cmdAddAgency(args) {
  const date = args.date ? String(args.date) : todayIso();
  const time = args.time ? String(args.time) : nowTime();
  db.prepare(
    `INSERT INTO agencies
       (old_agent_name, car_type, car_number, car_model, color, new_agent_name, phone, amount_usd, amount_iqd, notes, date, time)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    String(args.old_agent_name || ""),
    String(args.car_type || ""),
    String(args.car_number || ""),
    String(args.car_model || ""),
    String(args.color || ""),
    String(args.new_agent_name || ""),
    String(args.phone || ""),
    Number(args.amount_usd) || 0,
    Number(args.amount_iqd) || 0,
    String(args.notes || ""),
    date,
    time,
  );
  return db.prepare("SELECT last_insert_rowid() AS id").get().id;
}
function cmdUpdateAgency(args) {
  const id = Number(args.id);
  db.prepare(
    `UPDATE agencies SET old_agent_name=?, car_type=?, car_number=?, car_model=?, color=?,
        new_agent_name=?, phone=?, amount_usd=?, amount_iqd=?, notes=?
     WHERE id=?`,
  ).run(
    String(args.old_agent_name || ""),
    String(args.car_type || ""),
    String(args.car_number || ""),
    String(args.car_model || ""),
    String(args.color || ""),
    String(args.new_agent_name || ""),
    String(args.phone || ""),
    Number(args.amount_usd) || 0,
    Number(args.amount_iqd) || 0,
    String(args.notes || ""),
    id,
  );
  return undefined;
}
function cmdDeleteAgency(args) {
  const id = Number(args.id);
  db.prepare("DELETE FROM partner_transactions WHERE source_type='agency' AND source_id=?").run(String(id));
  db.prepare("DELETE FROM agency_transactions WHERE agency_id=?").run(id);
  db.prepare("DELETE FROM agencies WHERE id=?").run(id);
  return undefined;
}
function cmdGetAgencyTransactions(args) {
  const agencyId = args.agency_id ?? args.agencyId;
  if (agencyId != null) {
    return db
      .prepare("SELECT * FROM agency_transactions WHERE agency_id=? ORDER BY id")
      .all(Number(agencyId));
  }
  return db.prepare("SELECT * FROM agency_transactions ORDER BY id").all();
}
function cmdAddAgencyTransaction(args) {
  db.prepare(
    "INSERT INTO agency_transactions (agency_id, date, time, type_, amount, currency, notes) VALUES (?,?,?,?,?,?,?)",
  ).run(
    Number(args.agency_id ?? args.agencyId),
    String(args.date || todayIso()),
    String(args.time || nowTime()),
    String(args.type_ || args.type || ""),
    Number(args.amount) || 0,
    String(args.currency || "IQD"),
    args.notes ? String(args.notes) : null,
  );
  return db.prepare("SELECT last_insert_rowid() AS id").get().id;
}
function cmdDeleteAgencyTransaction(args) {
  const id = Number(args.id);
  db.prepare(
    "DELETE FROM partner_transactions WHERE source_type='agency_transaction' AND source_id=?",
  ).run(String(id));
  db.prepare("DELETE FROM agency_transactions WHERE id=?").run(id);
  return undefined;
}

// ─── command: get_financial_transactions (legacy name) ──────────────

function cmdGetFinancialTransactions() {
  return [];
}

// ─── dispatch ───────────────────────────────────────────────────────

const HANDLERS = {
  login: cmdLogin,
  add_car: cmdAddCar,
  sell_car_with_accounting: cmdSellCarWithAccounting,
  save_and_sell_car_with_accounting: cmdSaveAndSell,
  update_sold_car_with_accounting: cmdUpdateSoldCar,
  get_cars: cmdGetCars,
  get_partners: cmdGetPartners,
  get_partner_transactions: cmdGetPartnerTransactions,
  get_profit_distribution_summary: cmdGetProfitDistributionSummary,
  get_financial_summary: cmdGetFinancialSummary,
  get_cash_register_entries: cmdGetCashRegisterEntries,
  get_partners_totals: cmdGetPartnersTotals,
  get_unified_accounts: cmdGetUnifiedAccounts,
  get_expenses: cmdGetExpenses,
  get_car_expense_records: cmdGetCarExpenseRecords,
  get_backgrounds: cmdGetBackgrounds,
  get_users: cmdGetUsers,
  get_agencies: cmdGetAgencies,
  get_agency_transactions: cmdGetAgencyTransactions,
  get_financial_transactions: cmdGetFinancialTransactions,
  add_expense: cmdAddExpense,
  add_partner: cmdAddPartner,
  delete_partner: cmdDeletePartner,
  add_partner_transaction: cmdAddPartnerTransaction,
  delete_partner_transaction: cmdDeletePartnerTransaction,
  update_partner_transaction: cmdUpdatePartnerTransaction,
  delete_car: cmdDeleteCar,
  delete_expense: cmdDeleteExpense,
  update_expense: cmdUpdateExpense,
  add_car_expense_record: cmdAddCarExpenseRecord,
  delete_car_expense_record: cmdDeleteCarExpenseRecord,
  pay_financier_from_partners: cmdPayFinancierFromPartners,
  settle_company_through_funder: cmdSettleCompanyThroughFunder,
  add_user: cmdUserManagement,
  update_user: cmdUserManagement,
  change_password: cmdUserManagement,
  delete_user: cmdUserManagement,
  rename_background: cmdRenameBackground,
  export_database_to_excel: cmdExportDatabaseToExcel,
  open_whatsapp: cmdOpenWhatsapp,
  add_agency: cmdAddAgency,
  update_agency: cmdUpdateAgency,
  delete_agency: cmdDeleteAgency,
  add_agency_transaction: cmdAddAgencyTransaction,
  delete_agency_transaction: cmdDeleteAgencyTransaction,
};

function dispatch(command, args) {
  const handler = HANDLERS[command];
  if (!handler) {
    if (VERBOSE) console.warn(`[E2E Bridge] Unknown command: ${command}`);
    throw new Error(`أمر غير معروف: ${command}`);
  }
  if (VERBOSE) console.log(`[E2E Bridge] ${command}`, JSON.stringify(args).slice(0, 200));
  return handler(args);
}

// ─── HTTP server ────────────────────────────────────────────────────

const server = createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  if (req.method === "POST" && req.url === "/invoke") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const { command, args } = JSON.parse(body);
        const result = dispatch(command, args || {});
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        });
        res.end(JSON.stringify({ result }));
      } catch (err) {
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (req.method === "POST" && req.url === "/__e2e/invoke") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const { command, args } = JSON.parse(body);
        const result = dispatch(command, args || {});
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        });
        res.end(JSON.stringify({ ok: true, data: result }));
      } catch (err) {
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  if (req.method === "POST" && req.url === "/__e2e/reset") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const tables = [
          "partner_transactions", "partner_profit_shares", "profit_distributions",
          "financial_ledger", "cash_register", "car_expenses", "car_partners",
          "expenses", "cars", "agencies", "agency_transactions",
        ];
        for (const t of tables) {
          db.exec(`DELETE FROM ${t}`);
        }
        db.prepare("DELETE FROM partners").run();
        db.prepare(
          "INSERT OR REPLACE INTO partners (partner_name, phone, total_amount, kind, iqd_balance, usd_balance) VALUES (?, '', 0, 'شريك', 0, 0)",
        ).run("أمير");
        db.prepare(
          "INSERT OR REPLACE INTO partners (partner_name, phone, total_amount, kind, iqd_balance, usd_balance) VALUES (?, '', 0, 'شريك', 0, 0)",
        ).run("منتصر");
        db.prepare("DELETE FROM users").run();
        db.prepare(
          "INSERT OR REPLACE INTO users (username, display_name, password_hash) VALUES (?, ?, ?)",
        ).run("admin", "مدير النظام", sha256("admin"));
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  if (req.method === "GET" && req.url === "/__e2e/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, () => {
  console.log(`[E2E Bridge] listening on http://localhost:${PORT}`);
  console.log(`[E2E Bridge] database: ${DB_PATH}`);
  console.log(`[E2E Bridge] partners seeded: أمير, منتصر (50/50)`);
});
