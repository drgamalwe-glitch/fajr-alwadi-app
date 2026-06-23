import Database from "better-sqlite3";
import * as path from "node:path";
import * as fs from "node:fs";

const TEST_DB_DIR = path.resolve(process.cwd(), ".test-dbs");

export function getTestDbPath(scenarioId: string): string {
  if (!fs.existsSync(TEST_DB_DIR)) {
    fs.mkdirSync(TEST_DB_DIR, { recursive: true });
  }
  return path.join(TEST_DB_DIR, `test-${scenarioId}.db`);
}

export function createTestDb(scenarioId: string): Database.Database {
  const dbPath = getTestDbPath(scenarioId);
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  initSchema(db);
  return db;
}

export function openTestDb(scenarioId: string): Database.Database {
  const dbPath = getTestDbPath(scenarioId);
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

function initSchema(db: Database.Database): void {
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
      purchase_time TEXT DEFAULT '00:00',
      sale_time TEXT DEFAULT '00:00',
      purchase_type TEXT DEFAULT 'كاش',
      financer_name TEXT,
      commission_type TEXT,
      commission_value REAL,
      purchase_payment_type TEXT DEFAULT 'قاصه'
    );

    CREATE TABLE IF NOT EXISTS partners (
      partner_name TEXT NOT NULL,
      phone TEXT,
      total_amount REAL DEFAULT 0.0,
      kind TEXT NOT NULL DEFAULT 'شريك',
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

    CREATE TABLE IF NOT EXISTS cash_register (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      time TEXT DEFAULT '00:00',
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      description TEXT,
      notes TEXT
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

    CREATE TABLE IF NOT EXISTS car_partners (
      car_number TEXT NOT NULL,
      partner_name TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'IQD',
      kind TEXT NOT NULL DEFAULT 'شريك',
      PRIMARY KEY (car_number, partner_name)
    );

    CREATE TABLE IF NOT EXISTS car_expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      car_number TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      currency TEXT DEFAULT 'IQD',
      time TEXT DEFAULT (strftime('%H:%M', 'now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS agencies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      old_agent_name TEXT NOT NULL,
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
      notes TEXT,
      FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS financial_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      account_type TEXT NOT NULL,
      account_id TEXT,
      debit REAL DEFAULT 0.0,
      credit REAL DEFAULT 0.0,
      currency TEXT DEFAULT 'IQD',
      reference_type TEXT,
      reference_id TEXT,
      type_ TEXT NOT NULL,
      description TEXT,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS profit_distributions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      total_profit REAL NOT NULL,
      currency TEXT DEFAULT 'IQD',
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS partner_profit_shares (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      distribution_id INTEGER NOT NULL,
      partner_name TEXT NOT NULL,
      profit_share REAL NOT NULL,
      drawings_deducted REAL DEFAULT 0.0,
      amount_reinvested REAL DEFAULT 0.0,
      amount_paid REAL DEFAULT 0.0,
      currency TEXT DEFAULT 'IQD',
      FOREIGN KEY (distribution_id) REFERENCES profit_distributions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      profile_image TEXT
    );

    CREATE TABLE IF NOT EXISTS db_version (version INTEGER PRIMARY KEY);

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      details TEXT,
      admin_name TEXT
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_partner_transactions_partner ON partner_transactions(partner_name, kind);
    CREATE INDEX IF NOT EXISTS idx_partner_transactions_date ON partner_transactions(date);
    CREATE INDEX IF NOT EXISTS idx_partner_transactions_source ON partner_transactions(source_type, source_id);
    CREATE INDEX IF NOT EXISTS idx_ledger_reference ON financial_ledger(reference_type, reference_id);
    CREATE INDEX IF NOT EXISTS idx_ledger_account ON financial_ledger(account_type, account_id);
    CREATE INDEX IF NOT EXISTS idx_car_expenses_car ON car_expenses(car_number);
    CREATE INDEX IF NOT EXISTS idx_cars_status ON cars(status);
  `);
}

export function seedPartners(db: Database.Database): void {
  const insert = db.prepare(
    "INSERT OR IGNORE INTO partners (partner_name, phone, total_amount, kind) VALUES (?, ?, 0, 'شريك')"
  );
  insert.run("أمير", "07808425228");
  insert.run("منتصر", "07812541714");
}

export function resetTestDb(db: Database.Database): void {
  db.exec(`
    DELETE FROM partner_profit_shares;
    DELETE FROM profit_distributions;
    DELETE FROM financial_ledger;
    DELETE FROM agency_transactions;
    DELETE FROM agencies;
    DELETE FROM car_expenses;
    DELETE FROM car_partners;
    DELETE FROM cash_register;
    DELETE FROM partner_transactions;
    DELETE FROM expenses;
    DELETE FROM cars;
    DELETE FROM partners;
    DELETE FROM audit_log;
  `);
  seedPartners(db);
}
