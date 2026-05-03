# MF KYC & Onboarding — Frontend Reference

Base URL: `https://api.salaryplus.club`  
All requests: `Authorization: Bearer <user_token>`

---

## Complete Flow Overview

```
START
  │
  ▼
GET /api/mf/journey-status  ← always call this first to know where the user is
  │
  ├─ currentStep: "risk_profile"
  │       ▼
  │   STEP 1 — Risk Profile (questions + submit)
  │
  ├─ currentStep: "kyc_check"
  │       ▼
  │   STEP 2 — PAN Verification
  │       │
  │       ├─ kra.status = "verified"  ──────────────────────────────┐
  │       │  (already KRA compliant)                                  │
  │       │                                                           │
  │       └─ kra.status ≠ "verified"                                  │
  │               ▼                                                   │
  │          STEP 3 — KYC Submission                                  │
  │               │                                                   │
  │            [3a] Create KYC Request                                │
  │            [3b] Upload Signature                                  │
  │            [3c] Patch Signature onto KYC Request                  │
  │            [3d] Create Identity Document → Redirect to DigiLocker │
  │            [3e] Poll Identity Doc status (after user returns)      │
  │            [3f] Create Esign → Redirect to Esign URL              │
  │            [3g] Poll Esign status                                  │
  │               │                                                   │
  │               ▼ KYC status = "submitted"                          │
  │          Wait for webhook → KYC becomes "successful" ─────────────┤
  │                                                                   │
  ├─ currentStep: "account_creation"  ◄──────────────────────────────┘
  │       ▼
  │   STEP 4 — Account Setup
  │       [4a] Fetch prefill data (name/pan/dob from KYC)
  │       [4b] Create Investor Profile
  │       [4c] Add Phone, Email, Address, Bank Account
  │       [4d] Create MF Investment Account
  │
  └─ currentStep: "invest"  →  User can invest 🎉
```

---

## API: Get Journey Status

### `GET /api/mf/journey-status`
**Call this on every app open / flow entry.** It tells you exactly which screen to show.

**Response**
```json
{
  "success": true,
  "canInvest": false,
  "currentStep": "kyc_check",
  "nextAction": "Verify your PAN (KRA compliance check)",
  "stages": {
    "riskProfile": {
      "status": "completed",
      "score": 28,
      "category": "moderate",
      "completedAt": "2026-05-01T10:00:00.000Z"
    },
    "kycCheck": {
      "status": "kra_not_compliant",
      "panStatus": "verified",
      "nameStatus": "verified",
      "dobStatus": "verified",
      "kra": {
        "status": "not_verified",
        "code": "not_kyc_registered",
        "reason": null
      }
    },
    "kycSubmission": {
      "status": "not_started"
    },
    "accountCreation": {
      "status": "not_started",
      "completedAt": null
    }
  }
}
```

### `currentStep` values and what to show

| `currentStep` | Screen to show |
|---|---|
| `risk_profile` | Risk profile questionnaire |
| `kyc_check` | PAN / DOB entry screen |
| `kyc_submission_start` | "Submit KYC" entry screen |
| `kyc_submission_in_progress` | KYC progress / resume screen |
| `account_creation` | Investor profile + account setup screens |
| `invest` | Home / dashboard — user is ready to invest |

### `canInvest`
`true` only when the investment account is fully created. Use this to gate the invest button.

---

## STEP 1 — Risk Profile

### `GET /api/mf/risk-profile/questions`
No auth required. Fetch the questions to render the quiz.

**Response**
```json
{
  "success": true,
  "totalQuestions": 6,
  "questions": [
    {
      "id": 1,
      "question": "What is your investment goal?",
      "options": [
        { "value": 1, "label": "Capital preservation" },
        { "value": 2, "label": "Regular income" },
        { "value": 3, "label": "Capital growth" },
        { "value": 4, "label": "Aggressive growth" }
      ]
    }
  ]
}
```

### `POST /api/mf/risk-profile/submit`
**Request**
```json
{
  "answers": [
    { "questionId": 1, "value": 3 },
    { "questionId": 2, "value": 2 }
  ]
}
```

**Response**
```json
{
  "success": true,
  "score": 28,
  "category": "moderate",
  "label": "Moderate Investor",
  "description": "You can accept moderate risk for better returns. Suitable funds: Balanced, Hybrid, Short-term debt.",
  "nextStep": "kyc_check"
}
```

**`category` values:** `conservative` | `moderate` | `aggressive`

---

## STEP 2 — PAN KYC Check

### `POST /api/mf/kyc/check-pan`
Verifies PAN + name + DOB against NSDL and checks KRA compliance.  
This call takes ~5–10 seconds (polls internally). Show a loading screen.

**Request**
```json
{
  "pan": "ABCDE1234F",
  "name": "Phani Kumar",
  "dob": "1995-06-15"
}
```
> `dob` format: `YYYY-MM-DD`

**Response — success (KRA compliant, can skip KYC submission)**
```json
{
  "success": true,
  "overallStatus": "VERIFIED",
  "message": "PAN, name, and date of birth are verified",
  "pan": { "status": "verified", "code": null },
  "name": { "status": "verified", "code": null },
  "date_of_birth": { "status": "verified", "code": null },
  "kra": {
    "status": "verified",
    "code": "compliant",
    "reason": null
  }
}
```

**Response — PAN verified but KRA not compliant (must submit KYC)**
```json
{
  "success": true,
  "overallStatus": "VERIFIED",
  "kra": {
    "status": "not_verified",
    "code": "not_kyc_registered",
    "reason": null
  }
}
```

### `overallStatus` values and what to do

| `overallStatus` | What happened | Next screen |
|---|---|---|
| `VERIFIED` + `kra.status = "verified"` | Fully compliant | → Account Creation (Step 4) |
| `VERIFIED` + `kra.status ≠ "verified"` | PAN OK but not KRA registered | → KYC Submission (Step 3) |
| `PAN_FAILED` | PAN is invalid or Aadhaar not linked | Show error, ask user to recheck |
| `NAME_MISMATCH` | Name doesn't match PAN records | Show error, ask to correct name |
| `DOB_MISMATCH` | DOB doesn't match PAN records | Show error, ask to correct DOB |
| `UPSTREAM_ERROR` | External error | Show retry button |
| `PENDING` | Still processing | Retry after a few seconds |

---

## STEP 3 — KYC Submission (only if KRA not compliant)

Only needed when `kra.status ≠ "verified"` from Step 2. Follow sub-steps in order.

---

### 3a. Create KYC Request

### `POST /api/mf/kyc-request`

**Request**
```json
{
  "name": "Phani Kumar",
  "pan": "ABCDE1234F",
  "email": "phani@example.com",
  "dob": "1995-06-15",
  "mobile": {
    "isd": "+91",
    "number": "9876543210"
  }
}
```

**Response `201`**
```json
{
  "success": true,
  "message": "KYC request created",
  "fpKycRequestId": "kyc_req_abc123",
  "status": "pending",
  "fieldsNeeded": ["identity_proof", "signature"],
  "expiresAt": "2026-05-10T10:00:00.000Z"
}
```

> **Save `fpKycRequestId`** — you need it for all next steps.

**`fieldsNeeded` tells you what's still missing:**
- `identity_proof` → user must complete Aadhaar via DigiLocker (Step 3c)
- `signature` → user must upload signature (Step 3b)

**Error — already has active request**
```json
{
  "success": false,
  "message": "You already have an active KYC request (status: pending)",
  "fpKycRequestId": "kyc_req_abc123",
  "status": "pending"
}
```
→ In this case, use the returned `fpKycRequestId` and resume from Step 3b/3c.

---

### 3b. Upload Signature

### `POST /api/mf/file/upload`
Send as `multipart/form-data`. Field name must be `file`.

**Request**
- Field `file`: image (JPG/PNG/PDF/TIFF, max 10MB)
- Field `purpose`: `"signature"` (optional, defaults to signature)

**Response `201`**
```json
{
  "success": true,
  "fpFileId": "file_sig_xyz789",
  "filename": "signature.png",
  "url": "https://...",
  "createdAt": "2026-05-03T10:00:00.000Z"
}
```

> **Save `fpFileId`** — needed in Step 3c.

---

### 3c. Patch Signature onto KYC Request

### `PATCH /api/mf/kyc-request/:fpKycRequestId`

**Request**
```json
{
  "signature": "file_sig_xyz789"
}
```
> Use the `fpFileId` from Step 3b.

**Response**
```json
{
  "success": true,
  "fpKycRequestId": "kyc_req_abc123",
  "status": "pending",
  "fieldsNeeded": ["identity_proof"]
}
```

---

### 3d. Create Identity Document (Aadhaar via DigiLocker)

### `POST /api/mf/identity-document`

**Request**
```json
{
  "fpKycRequestId": "kyc_req_abc123"
}
```

**Response `201`**
```json
{
  "success": true,
  "fpIdDocId": "iddoc_aaa111",
  "fetchStatus": "pending",
  "redirectUrl": "https://digilocker.meity.gov.in/...",
  "expiresAt": "2026-05-03T10:30:00.000Z"
}
```

> **Redirect the user to `redirectUrl`** (open in in-app browser / WebView).  
> When the user closes the browser / is redirected back to your app, proceed to Step 3e.

---

### 3e. Poll Identity Document Status

### `GET /api/mf/identity-document/:fpIdDocId`
Call after user returns from DigiLocker. Retry every 3 seconds until `fetchStatus = "successful"`.

**Response**
```json
{
  "success": true,
  "data": {
    "fpIdDocId": "iddoc_aaa111",
    "fpKycRequestId": "kyc_req_abc123",
    "fetchStatus": "successful",
    "fetchReason": null,
    "aadhaarLastFour": "5678",
    "city": "Hyderabad",
    "pincode": "500001",
    "country": "IN"
  }
}
```

**`fetchStatus` values:**

| Value | Meaning |
|---|---|
| `pending` | User hasn't completed DigiLocker yet — keep polling |
| `successful` | Aadhaar fetched → proceed to Esign (Step 3f) |
| `failed` | User denied / failed — show retry option |
| `expired` | Link expired — create a new identity document |

---

### 3f. Create Esign

Only needed when KYC request status becomes `esign_required`.  
Check by calling `GET /api/mf/kyc-request/:fpKycRequestId` after identity doc is successful.

### `POST /api/mf/esign`

**Request**
```json
{
  "fpKycRequestId": "kyc_req_abc123"
}
```

**Response `201`**
```json
{
  "success": true,
  "fpEsignId": "esign_bbb222",
  "status": "pending",
  "redirectUrl": "https://esign.provider.in/..."
}
```

> **Redirect the user to `redirectUrl`** (open in in-app browser / WebView).  
> When user returns, proceed to Step 3g.

If esign already exists and is reusable, the response is `200` with the same `redirectUrl`.

---

### 3g. Poll Esign Status

### `GET /api/mf/esign/:fpEsignId`
Call after user returns from Esign page. Retry every 3 seconds.

**Response**
```json
{
  "success": true,
  "data": {
    "fpEsignId": "esign_bbb222",
    "fpKycRequestId": "kyc_req_abc123",
    "status": "successful",
    "redirectUrl": "..."
  }
}
```

**`status` values:** `pending` | `successful`

When `status = "successful"`:
- KYC request automatically moves to `submitted`
- Show "KYC Submitted — under review" screen
- KYC becomes `successful` via webhook (no further polling needed)

---

### Resume Mid-Flow

If the user drops off and comes back, call this instead of reconstructing state:

### `GET /api/mf/kyc-request/resume`

**Response — active request exists**
```json
{
  "success": true,
  "hasActiveRequest": true,
  "currentSection": "identity_proof",
  "kycRequest": {
    "fpKycRequestId": "kyc_req_abc123",
    "status": "pending",
    "pan": "ABCDE1234F",
    "name": "Phani Kumar",
    "email": "phani@example.com",
    "dob": "1995-06-15",
    "fieldsNeeded": ["identity_proof"],
    "expiresAt": "2026-05-10T10:00:00.000Z"
  },
  "identityDocument": {
    "fpIdDocId": "iddoc_aaa111",
    "fetchStatus": "pending",
    "redirectUrl": "https://digilocker...",
    "aadhaarLastFour": null,
    "fetchExpiresAt": "2026-05-03T10:30:00.000Z"
  },
  "esign": null
}
```

**`currentSection` values and screen to show:**

| `currentSection` | Screen |
|---|---|
| `not_started` | KYC entry — no active request yet |
| `basic_details` | Fill/fix remaining KYC fields |
| `signature` | Signature upload |
| `identity_proof` | DigiLocker / Aadhaar fetch |
| `esign` | Esign redirect |
| `submitted` | "Under review" waiting screen |

**Response — no active request**
```json
{
  "success": true,
  "hasActiveRequest": false,
  "currentSection": "not_started",
  "message": "No active KYC request found. Start a new one."
}
```

---

### KYC Request statuses

| Status | Meaning |
|---|---|
| `pending` | Created, fields being filled |
| `esign_required` | All fields done, needs esign |
| `submitted` | Esign done, waiting for FP to verify |
| `successful` | KYC verified ✅ — proceed to account creation |
| `rejected` | KYC rejected ❌ — show reason, allow retry |
| `expired` | Expired — start new KYC request |

---

## STEP 4 — Account Creation (after KYC is successful/compliant)

### 4a. Get Prefill Data + Enums

These two calls in parallel to pre-fill the form:

**`GET /api/mf/investor-profile`** — returns `name`, `pan`, `dob` from KYC (even before profile exists)

```json
{
  "success": true,
  "created": false,
  "data": {
    "fpInvestorProfileId": null,
    "name": "Phani Kumar",
    "pan": "ABCDE1234F",
    "dob": "1995-06-15",
    "gender": null,
    "occupation": null,
    "taxStatus": null,
    "sourceOfWealth": null,
    "incomeSlab": null,
    "pepDetails": null
  }
}
```

**`GET /api/mf/investor-profile/enums`** — dropdown options for form fields

```json
{
  "success": true,
  "data": {
    "occupation": [
      { "value": "private_sector_service", "label": "Private Sector Service" },
      { "value": "business", "label": "Business" }
    ],
    "source_of_wealth": [
      { "value": "salary", "label": "Salary" },
      { "value": "business", "label": "Business" }
    ],
    "income_slab": [
      { "value": "above_5lakh_upto_10lakh", "label": "₹5 Lakh – ₹10 Lakh" }
    ],
    "pep_details": [
      { "value": "not_applicable", "label": "Not Applicable" }
    ],
    "gender": [
      { "value": "male", "label": "Male" },
      { "value": "female", "label": "Female" },
      { "value": "transgender", "label": "Transgender" }
    ],
    "tax_status": [
      { "value": "resident_individual", "label": "Resident Individual" },
      { "value": "nri", "label": "NRI" }
    ]
  }
}
```

---

### 4b. Create Investor Profile

### `POST /api/mf/investor-profile`

**Request**
```json
{
  "name": "Phani Kumar",
  "pan": "ABCDE1234F",
  "dob": "1995-06-15",
  "gender": "male",
  "occupation": "private_sector_service",
  "tax_status": "resident_individual",
  "source_of_wealth": "salary",
  "income_slab": "above_5lakh_upto_10lakh",
  "pep_details": "not_applicable"
}
```

**Response `201`**
```json
{
  "success": true,
  "message": "Investor profile created",
  "data": {
    "fpInvestorProfileId": "invp_ccc333",
    "name": "Phani Kumar",
    "pan": "ABCDE1234F",
    "taxStatus": "resident_individual",
    "gender": "male",
    "occupation": "private_sector_service",
    "sourceOfWealth": "salary",
    "incomeSlab": "above_5lakh_upto_10lakh",
    "pepDetails": "not_applicable"
  }
}
```

---

### 4c. Add Phone, Email, Address, Bank Account

These are required before creating the investment account. Call them in any order.

| Step | Method | URL |
|---|---|---|
| Phone | `POST` | `/api/mf/phone-number` |
| Email | `POST` | `/api/mf/email-address` |
| Address | `POST` | `/api/mf/address` |
| Bank Account | `POST` | `/api/mf/bank-account` |

---

### 4d. Create MF Investment Account

### `POST /api/mf/investment-account`
No body needed — server auto-links all saved data (profile, phone, email, address, bank).

**Response `201`**
```json
{
  "success": true,
  "message": "MF investment account created successfully",
  "data": {
    "fpInvestmentAccountId": "mfia_ddd444",
    "primaryInvestorPan": "ABCDE1234F",
    "holdingPattern": "single",
    "linkedData": {
      "investorProfile": "invp_ccc333",
      "phone": "ph_xxx",
      "email": "em_xxx",
      "address": "addr_xxx",
      "bankAccount": "bank_xxx",
      "nominee": null
    }
  }
}
```

After this, `canInvest = true` in the journey status. User can now invest.

---

## State Summary for Frontend

```
journey-status.currentStep          What to render
────────────────────────────────────────────────────
risk_profile                        Risk quiz screen
kyc_check                           PAN + DOB entry
kyc_submission_start                "Let's complete your KYC" screen
kyc_submission_in_progress          Resume from kyc-request/resume
account_creation                    Investor profile + account form
invest                              Home / invest dashboard
```

## Error Handling

All error responses follow:
```json
{ "success": false, "message": "Human readable error" }
```

| Status | Meaning |
|---|---|
| `400` | Bad request / validation failed |
| `401` | Token missing or expired |
| `404` | Resource not found |
| `409` | Conflict — resource already exists (use returned ID) |
| `500` | Server error — show generic retry message |
