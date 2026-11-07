# 🛡️ Warranty Vault & Receipt Auditor

A mobile-first offline utility built with **React Native**, **Expo SDK 54**, and **NativeWind v5** that leverages **Google Gemini 3.8 Flash** to transform physical receipts into structured local warranty records and formal return claim drafts.

---

## Key Features

- **Multimodal Receipt Audit:** Captures store metadata, line items, VAT, return windows, and warranty durations from camera photos.
- **Local-First SQLite Persistence:** Zero cloud data exposure; all receipt images and line items remain on-device.
- **Dynamic Deadline Badges:** Visual status alerts (Green / Amber / Red) flagging items nearing expiration.
- **AI Claim & Return Drafter:** Generates professional, ready-to-send return requests and warranty claims citing exact purchase dates and terms.
- **Multi-Field Search & Filter:** Instant local filtering by merchant name, item descriptions, and category chips.

---

## Tech Stack

- **Framework:** React Native / Expo (SDK 54)
- **Styling:** NativeWind v5 (Tailwind CSS v4 engine)
- **Database:** `expo-sqlite`
- **Vision & LLM:** Google Gemini API (`gemini-3.8-flash`) via direct REST fetch
- **Device Integrations:** `expo-image-picker`, `expo-clipboard`

---

## Getting Started

### 1. Prerequisites
- Node.js (v18+)
- Expo Go installed on your iOS or Android device

### 2. Installation
```bash
# Clone the repository
git clone [https://github.com/madinatinkory/warranty-vault-auditor.git](https://github.com/madinatinkory/warranty-vault-auditor.git)
cd warranty-vault-auditor/warranty-vault

# Install dependencies
npm install --legacy-peer-deps
