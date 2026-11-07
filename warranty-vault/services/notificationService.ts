import { StoredReceipt } from '../types/receipt';

export async function requestNotificationPermissions(): Promise<boolean> {
  return true;
}

export async function scheduleReceiptReminders(receipt: StoredReceipt): Promise<void> {
  console.log(
    `[Reminder Service] Scheduled return reminder for ${receipt.storeName} on ${receipt.returnDeadline}`
  );
}
