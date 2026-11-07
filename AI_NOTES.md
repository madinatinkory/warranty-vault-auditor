# AI Collaboration & System Engineering Log

## Executive Summary
Warranty Vault is an offline-capable, multimodal expense and warranty tracker built using an agent-directed engineering workflow. Development was orchestrated using JetBrains Junie (autonomous IDE agent) and Google Gemini 3.8 Flash (multimodal parsing & generative synthesis).

---

## 1. Multi-Agent & LLM Role Distribution

| Role / Entity | Responsibility | Engineering Artifacts |
| :--- | :--- | :--- |
| **Lead Engineer** | System design, architectural guardrails, edge-case debugging, Git governance | Directory scaffolding, API contract, review |
| **Junie (JetBrains Agent)** | Modular service generation, refactoring, UI implementation | `services/database.ts`, `HomeScreen.tsx`, `ReceiptDetailModal.tsx` |
| **Google Gemini 3.8 Flash** | Multimodal OCR data extraction, structured JSON inference, claim synthesis | `services/geminiParser.ts` REST pipeline |

---

## 2. Technical Hurdles & Autonomous Resolution

### A. Android Scoped Storage Cache Failures
- **Symptom:** Image analysis failed with `failed to read receipt image file at cache/ImagePicker`.
- **Root Cause:** Android scoped storage prevents unauthorized file reads from temporary cache directories via `expo-file-system`.
- **Fix:** Refactored `ScanReceiptScreen` to capture photos directly as base64 byte streams (`base64: true`), piping payloads straight to the multimodal endpoint without temporary disk reads.

### B. Upstream HTTP 503 Traffic Spikes
- **Symptom:** Intermittent API failures during high-traffic spikes on `gemini-3.8-flash`.
- **Fix:** Implemented an automated exponential backoff mechanism in `fetchWithRetry` that transparently retries requests up to 3 times before surfacing errors to the UI.

### C. Native Module Sandbox in Expo Go (SDK 54)
- **Symptom:** Android push notification binaries were deprecated in Expo Go starting in SDK 53+.
- **Fix:** Built an environment-aware scheduling abstraction (`services/notificationService.ts`). In Expo Go, reminders operate via structured console telemetry; in standalone production builds, native OS handlers activate automatically.

---

## 3. Gemini Schema & Prompt Governance
To guarantee zero hallucinations and enforce valid math across all line items, Gemini is constrained via strict schema enforcement:
- **Zero-default currency detection:** Biased toward local Mauritian Rupee (`Rs`/`MUR`) formats over default `$`.
- **Date Normalization:** ISO `YYYY-MM-DD` conversion for accurate day-offset calculations in SQLite queries.