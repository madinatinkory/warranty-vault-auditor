import { ReceiptData, StoredReceipt } from '../types/receipt';

export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3
): Promise<Response> {
  const retryStatuses = [503, 429, 500];

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, options);

    if (retryStatuses.includes(response.status)) {
      console.warn(`Gemini server busy (${response.status}). Retrying attempt ${attempt}...`);
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
        continue;
      }
      throw new Error(
        'Gemini servers are currently experiencing high traffic. Please try again in a few moments.'
      );
    }

    return response;
  }

  throw new Error(
    'Gemini servers are currently experiencing high traffic. Please try again in a few moments.'
  );
}

export async function parseReceiptImage(base64Data: string): Promise<ReceiptData> {
  const API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;

  if (!API_KEY) {
    throw new Error(
      'EXPO_PUBLIC_GEMINI_API_KEY is missing. Check your .env and restart Expo.'
    );
  }

  if (!base64Data) {
    throw new Error('Image data is empty or unreadable.');
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${API_KEY}`;

  const promptText =
    "Extract structured receipt and warranty data from this receipt.\nImportant currency rule: Detect the actual currency symbol on the receipt. If you see 'Rs', 'MUR', or Mauritian retail receipts, set currency to 'Rs'. Do not default to '$' or 'USD' unless explicitly written as '$' or 'USD'.\nReturn ONLY a valid JSON object matching this schema: { storeName: string, purchaseDate: string (YYYY-MM-DD), currency: string, items: [{name: string, price: number, quantity: number}], subtotal: number, tax: number, total: number, category: string, returnWindowDays: number, warrantyMonths: number }";

  const body = {
    contents: [
      {
        parts: [
          {
            text: promptText,
          },
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: base64Data,
            },
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1,
    },
  };

  try {
    const response = await fetchWithRetry(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API Error Response:', errorText);
      throw new Error(`Gemini API request failed (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const rawJson = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawJson) {
      throw new Error('Received empty response from Gemini model.');
    }

    const parsedData = JSON.parse(rawJson) as ReceiptData;

    // Validate required fields exist in parsed data
    if (
      !parsedData ||
      typeof parsedData.storeName !== 'string' ||
      typeof parsedData.purchaseDate !== 'string' ||
      typeof parsedData.total !== 'number'
    ) {
      throw new Error('Invalid or incomplete receipt data received from Gemini.');
    }

    return {
      storeName: parsedData.storeName,
      purchaseDate: parsedData.purchaseDate,
      currency: parsedData.currency || 'USD',
      items: Array.isArray(parsedData.items) ? parsedData.items : [],
      subtotal:
        typeof parsedData.subtotal === 'number'
          ? parsedData.subtotal
          : parsedData.total - (parsedData.tax || 0),
      tax: typeof parsedData.tax === 'number' ? parsedData.tax : 0,
      total: parsedData.total,
      category: parsedData.category || 'Other',
      returnWindowDays:
        typeof parsedData.returnWindowDays === 'number' ? parsedData.returnWindowDays : 30,
      warrantyMonths:
        typeof parsedData.warrantyMonths === 'number' ? parsedData.warrantyMonths : 0,
      notes: parsedData.notes,
    };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        'Gemini servers are currently experiencing high traffic. Please try again in a few moments.'
    ) {
      throw error;
    }
    if (error instanceof SyntaxError) {
      throw new Error(`Failed to parse Gemini response as JSON: ${error.message}`);
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Gemini receipt parsing failed: ${message}`);
  }
}

export async function generateClaimEmail(
  receipt: StoredReceipt,
  claimType: 'warranty' | 'return',
  userReason: string
): Promise<string> {
  const API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;

  if (!API_KEY) {
    throw new Error(
      'EXPO_PUBLIC_GEMINI_API_KEY is missing. Check your .env and restart Expo.'
    );
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${API_KEY}`;

  const promptText = `Write a polite, formal, and assertive ${
    claimType === 'warranty' ? 'warranty service request' : 'refund/return request'
  } email to the customer support team at "${receipt.storeName}".
Details:
- Purchase Date: ${receipt.purchaseDate}
- Items: ${(receipt.items || []).map((i) => `${i.name} (Qty: ${i.quantity})`).join(', ')}
- Total Paid: ${receipt.currency || 'Rs'} ${receipt.total}
- User Reason/Issue: "${userReason}"
- Reference return deadline: ${receipt.returnDeadline}
- Reference warranty deadline: ${receipt.warrantyDeadline || 'N/A'}

Include placeholder for user name and contact info at the bottom. Return ONLY the drafted email text without markdown backticks or commentary.`;

  const body = {
    contents: [
      {
        parts: [
          {
            text: promptText,
          },
        ],
      },
    ],
  };

  try {
    const response = await fetchWithRetry(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API Error Response:', errorText);
      throw new Error(`Gemini API request failed (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      throw new Error('Received empty response from Gemini model.');
    }

    return rawText.trim();
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        'Gemini servers are currently experiencing high traffic. Please try again in a few moments.'
    ) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to generate claim email: ${message}`);
  }
}
