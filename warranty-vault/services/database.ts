import * as SQLite from 'expo-sqlite';
import { StoredReceipt, LineItem, ReceiptCategory } from '../types/receipt';

export const db = SQLite.openDatabaseSync('warranty_vault.db');

interface ReceiptRow {
  id: string;
  storeName: string;
  purchaseDate: string;
  currency: string;
  items: string;
  subtotal: number | null;
  tax: number | null;
  total: number;
  category: ReceiptCategory;
  returnWindowDays: number;
  warrantyMonths: number;
  imageUri: string;
  returnDeadline: string;
  warrantyDeadline: string | null;
  notes: string | null;
  createdAt: number;
}

function mapRowToReceipt(row: ReceiptRow): StoredReceipt {
  let items: LineItem[] = [];
  try {
    items = typeof row.items === 'string' ? JSON.parse(row.items) : row.items;
  } catch (error) {
    console.error(`Failed to parse items JSON for receipt ${row.id}:`, error);
    items = [];
  }

  return {
    id: row.id,
    storeName: row.storeName,
    purchaseDate: row.purchaseDate,
    currency: row.currency,
    items,
    subtotal: row.subtotal ?? (row.total - (row.tax ?? 0)),
    tax: row.tax ?? 0,
    total: row.total,
    category: row.category,
    returnWindowDays: row.returnWindowDays,
    warrantyMonths: row.warrantyMonths,
    imageUri: row.imageUri,
    returnDeadline: row.returnDeadline,
    warrantyDeadline: row.warrantyDeadline,
    notes: row.notes ?? undefined,
    createdAt: row.createdAt,
  };
}

export function initDatabase(): void {
  try {
    db.execSync(`
      CREATE TABLE IF NOT EXISTS receipts (
        id TEXT PRIMARY KEY NOT NULL,
        storeName TEXT NOT NULL,
        purchaseDate TEXT NOT NULL,
        currency TEXT NOT NULL,
        items TEXT NOT NULL,
        subtotal REAL,
        tax REAL,
        total REAL NOT NULL,
        category TEXT NOT NULL,
        returnWindowDays INTEGER NOT NULL,
        warrantyMonths INTEGER NOT NULL,
        imageUri TEXT NOT NULL,
        returnDeadline TEXT NOT NULL,
        warrantyDeadline TEXT,
        notes TEXT,
        createdAt INTEGER NOT NULL
      );
    `);
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
}

export function insertReceipt(receipt: StoredReceipt): void {
  try {
    const serializedItems = JSON.stringify(receipt.items || []);
    db.runSync(
      `INSERT OR REPLACE INTO receipts (
        id,
        storeName,
        purchaseDate,
        currency,
        items,
        subtotal,
        tax,
        total,
        category,
        returnWindowDays,
        warrantyMonths,
        imageUri,
        returnDeadline,
        warrantyDeadline,
        notes,
        createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        receipt.id,
        receipt.storeName,
        receipt.purchaseDate,
        receipt.currency,
        serializedItems,
        receipt.subtotal ?? null,
        receipt.tax ?? null,
        receipt.total,
        receipt.category,
        receipt.returnWindowDays,
        receipt.warrantyMonths,
        receipt.imageUri,
        receipt.returnDeadline,
        receipt.warrantyDeadline ?? null,
        receipt.notes ?? null,
        receipt.createdAt,
      ]
    );
  } catch (error) {
    console.error(`Error inserting receipt with id ${receipt.id}:`, error);
    throw error;
  }
}

export function getAllReceipts(): StoredReceipt[] {
  try {
    const rows = db.getAllSync<ReceiptRow>(
      'SELECT * FROM receipts ORDER BY createdAt DESC;'
    );
    return rows.map(mapRowToReceipt);
  } catch (error) {
    console.error('Error fetching all receipts:', error);
    return [];
  }
}

export function getReceiptById(id: string): StoredReceipt | null {
  try {
    const row = db.getFirstSync<ReceiptRow>(
      'SELECT * FROM receipts WHERE id = ?;',
      [id]
    );
    return row ? mapRowToReceipt(row) : null;
  } catch (error) {
    console.error(`Error fetching receipt with id ${id}:`, error);
    return null;
  }
}

export function deleteReceipt(id: string): void {
  try {
    db.runSync('DELETE FROM receipts WHERE id = ?;', [id]);
  } catch (error) {
    console.error(`Error deleting receipt with id ${id}:`, error);
    throw error;
  }
}

export function getExpiringReceipts(daysThreshold: number): StoredReceipt[] {
  try {
    const now = new Date();
    const targetDate = new Date();
    targetDate.setDate(now.getDate() + daysThreshold);

    const formatLocalDate = (d: Date): string => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const todayStr = formatLocalDate(now);
    const targetDateStr = formatLocalDate(targetDate);

    const rows = db.getAllSync<ReceiptRow>(
      `SELECT * FROM receipts 
       WHERE (returnDeadline BETWEEN ? AND ?) 
          OR (warrantyDeadline IS NOT NULL AND warrantyDeadline BETWEEN ? AND ?)
       ORDER BY purchaseDate DESC;`,
      [todayStr, targetDateStr, todayStr, targetDateStr]
    );

    return rows.map(mapRowToReceipt);
  } catch (error) {
    console.error(
      `Error fetching expiring receipts within ${daysThreshold} days:`,
      error
    );
    return [];
  }
}
