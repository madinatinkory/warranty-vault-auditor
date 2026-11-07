export type ReceiptCategory =
  | 'Electronics'
  | 'Groceries'
  | 'Apparel'
  | 'Home'
  | 'Other';

export interface LineItem {
  name: string;
  price: number;
  quantity: number;
}

export interface ReceiptData {
  storeName: string;
  purchaseDate: string; // YYYY-MM-DD
  currency: string;
  items: LineItem[];
  subtotal: number;
  tax: number;
  total: number;
  category: ReceiptCategory;
  returnWindowDays: number;
  warrantyMonths: number;
  notes?: string;
}

export interface StoredReceipt extends ReceiptData {
  id: string;
  imageUri: string;
  createdAt: number;
  returnDeadline: string;
  warrantyDeadline: string | null;
}
