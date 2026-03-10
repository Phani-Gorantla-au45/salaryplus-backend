# MF SIP — Frontend API Documentation

All requests require the `Authorization: Bearer <token>` header unless noted otherwise.
Base URL: `https://<your-api>/api/mf`

---

## Table of Contents

1. [Overview & Flow](#1-overview--flow)
2. [Mandate APIs](#2-mandate-apis)
   - [Check existing mandates](#21-check-existing-mandates)
   - [Create mandate](#22-create-mandate)
   - [Authorize mandate (get payment URL)](#23-authorize-mandate)
   - [Cancel mandate](#24-cancel-mandate)
3. [Individual SIP APIs](#3-individual-sip-apis)
   - [Create SIP](#31-create-sip)
   - [Confirm SIP (OTP)](#32-confirm-sip)
   - [Resend OTP](#33-resend-otp)
   - [Get SIP](#34-get-sip)
   - [List SIPs](#35-list-sips)
   - [Cancel SIP](#36-cancel-sip)
4. [Basket SIP APIs](#4-basket-sip-apis)
   - [Create basket SIP](#41-create-basket-sip)
   - [Confirm basket SIP (OTP)](#42-confirm-basket-sip)
   - [Resend OTP](#43-resend-otp)
   - [Get basket SIP](#44-get-basket-sip)
   - [List basket SIPs](#45-list-basket-sips)
   - [Cancel basket SIP](#46-cancel-basket-sip)
5. [State Reference](#5-state-reference)
6. [UI Flow Checklist](#6-ui-flow-checklist)

---

## 1. Overview & Flow

### High-level SIP setup journey

```
User taps "Start SIP"
       │
       ▼
[GET /api/mf/mandate?status=APPROVED]
       │
       ├─ Has APPROVED mandate(s) ──► Show list, let user pick one
       │
       └─ No mandate ──► "Set up auto-pay first"
              │
              ▼
       [POST /api/mf/mandate]        ← Create mandate
              │
              ▼
       [POST /api/mf/mandate/:id/authorize]   ← Get payment URL (no body needed)
              │
              ▼
       Open tokenUrl in WebView
              │
              ▼
       User completes bank auth on FP's page
              │
              ▼
       FP redirects WebView → https://www.salaryplus.club/mandate/callback
       (monitor WebView URL → detect this → close WebView)
              │
              ▼
       [GET /api/mf/mandate/:id]  ← check final status once
       mandateStatus == "APPROVED" ✅
              │
              ▼
       Mandate ready — proceed to SIP creation
              │
              ▼
  ┌────────────────────────────┐
  │ Individual SIP             │   Basket SIP
  │ POST /api/mf/sip           │   POST /api/mf/basket-sip
  └────────────────────────────┘
              │
              ▼
       OTP sent to user's phone
              │
              ▼
       User enters OTP
              │
              ▼
  POST /api/mf/sip/:id/confirm   or   POST /api/mf/basket-sip/:id/confirm
              │
              ├─ 202 → FP still reviewing, retry after 3-5 seconds
              │
              └─ 200 → SIP confirmed ✅
```

---

## 2. Mandate APIs

### 2.1 Check existing mandates

```
GET /api/mf/mandate
```

**Query params (optional)**

| Param  | Values                                   |
|--------|------------------------------------------|
| status | `CREATED`, `APPROVED`, `REJECTED`, `CANCELLED` |

**Response**
```json
{
  "success": true,
  "count": 2,
  "data": [
    {
      "mandateId": "68abcd...",
      "fpMandateId": 12345,
      "mandateType": "E_MANDATE",
      "mandateLimit": 100000,
      "mandateStatus": "APPROVED",
      "providerName": "CYBRILLAPOA",
      "validFrom": "2026-03-07",
      "validTo": "2056-03-06",
      "mandateRef": "HDFCXXX",
      "umrn": "UMRN001",
      "authStatus": "success",
      "tokenUrl": null,
      "fpPaymentId": null,
      "fpApprovedAt": "2026-03-07T10:30:00.000Z",
      "fpCancelledAt": null,
      "fpRejectedAt": null,
      "fpRejectedReason": null,
      "createdAt": "2026-03-07T10:00:00.000Z"
    }
  ]
}
```

> **Frontend logic:** Filter `data` where `mandateStatus === "APPROVED"` and show those for SIP payment source selection. If none exist, prompt mandate creation.

---

### 2.2 Create mandate

```
POST /api/mf/mandate
```

**Body**
```json
{
  "mandate_type": "E_MANDATE",
  "mandate_limit": 100000
}
```

| Field          | Type   | Required | Notes                                                |
|----------------|--------|----------|------------------------------------------------------|
| mandate_type   | string | ✅       | `E_MANDATE` (eNACH) or `UPI` (UPI Autopay)          |
| mandate_limit  | number | ✅       | Max ₹1,00,00,000 for E_MANDATE; ₹1,00,000 for UPI   |

**Response `201`**
```json
{
  "success": true,
  "message": "Mandate created. Call POST /api/mf/mandate/:id/authorize to get payment URL.",
  "data": {
    "mandateId": "68abcd...",
    "fpMandateId": 12345,
    "mandateType": "E_MANDATE",
    "mandateLimit": 100000,
    "mandateStatus": "CREATED",
    "validFrom": "2026-03-07",
    "validTo": "2056-03-06"
  }
}
```

> Save `mandateId` — needed for the authorize call.

---

### 2.3 Authorize mandate

```
POST /api/mf/mandate/:id/authorize
```

`:id` = `mandateId` from the create response.

**No body required.**

**Response `200`**
```json
{
  "success": true,
  "message": "Mandate authorization initiated. Redirect user to tokenUrl.",
  "data": {
    "mandateId": "68abcd...",
    "fpMandateId": 12345,
    "fpPaymentId": 99001,
    "tokenUrl": "https://payments.cybrilla.com/mandate/auth?token=xyz"
  }
}
```

**How frontend detects completion:**

After the user completes (or abandons) auth on FP's payment page, FP redirects their browser/WebView to:

```
https://www.salaryplus.club/mandate/callback
```

This is hardcoded on the backend — frontend doesn't need to pass anything.

**Frontend flow:**
1. Call `POST /api/mf/mandate/:id/authorize` (no body needed)
2. Open `tokenUrl` in a WebView
3. Monitor the WebView URL — when it navigates to `https://www.salaryplus.club/mandate/callback`, auth is done
4. Close the WebView
5. Call `GET /api/mf/mandate/:id` once to get the final `mandateStatus`

> The `mandate/callback` page on your frontend doesn't need to do anything special — it just needs to exist (even a blank page works). The WebView URL change is the signal.

**Polling GET /api/mf/mandate/:id**
```json
{
  "success": true,
  "data": {
    "mandateId": "68abcd...",
    "mandateStatus": "APPROVED",   // ← wait for this
    ...
  }
}
```

| mandateStatus | Meaning                            | UI action                        |
|---------------|------------------------------------|----------------------------------|
| `CREATED`     | Created, not yet submitted to bank | Still authorizing                |
| `APPROVED`    | Bank approved ✅                   | Ready for SIP                    |
| `REJECTED`    | Bank rejected                      | Show `fpRejectedReason`, retry   |
| `CANCELLED`   | Cancelled                          | Ask user to create a new mandate |

---

### 2.4 Cancel mandate

```
POST /api/mf/mandate/:id/cancel
```

Only `APPROVED` mandates can be cancelled.

**Response `200`**
```json
{
  "success": true,
  "message": "Mandate cancelled successfully",
  "data": {
    "mandateId": "68abcd...",
    "mandateStatus": "CANCELLED"
  }
}
```

---

## 3. Individual SIP APIs

Use these when the user is investing in a **single fund** via SIP.

### 3.1 Create SIP

```
POST /api/mf/sip
```

**Body**
```json
{
  "isin": "INF204KB14I2",
  "frequency": "monthly",
  "amount": 5000,
  "installment_day": 10,
  "payment_source": 12345,
  "number_of_installments": 120,
  "generate_first_installment_now": false,
  "folio_number": null
}
```

| Field                          | Type    | Required | Notes                                            |
|--------------------------------|---------|----------|--------------------------------------------------|
| isin                           | string  | ✅       | Fund ISIN                                        |
| frequency                      | string  | ✅       | `"monthly"` or `"daily"`                         |
| amount                         | number  | ✅       | Installment amount in ₹                          |
| installment_day                | number  | monthly only | Day of month to debit (1–28)               |
| payment_source                 | number  | ✅       | `fpMandateId` from the mandate (numeric)         |
| number_of_installments         | number  | ❌       | Default: 120                                     |
| generate_first_installment_now | boolean | ❌       | Default: false. Set true to trigger first installment immediately |
| folio_number                   | string  | ❌       | Existing folio; null = new folio created         |

**Response `201`**
```json
{
  "success": true,
  "message": "SIP created. OTP sent for consent. Call POST /api/mf/sip/:id/confirm with OTP.",
  "data": {
    "sipId": "68xyz...",
    "fpSipId": "mfpp_xxx",
    "isin": "INF204KB14I2",
    "schemeName": "Axis Bluechip Fund - Growth",
    "frequency": "monthly",
    "amount": 5000,
    "fpState": "created",
    "otpSentTo": "989****432",
    "otpExpiresAt": "2026-03-07T10:10:00.000Z"
  }
}
```

> Save `sipId`. An OTP is sent to the user's registered phone.

---

### 3.2 Confirm SIP

```
POST /api/mf/sip/:id/confirm
```

`:id` = `sipId` from the create response.

**Body**
```json
{
  "otp": "123456"
}
```

**Response `200` — Success**
```json
{
  "success": true,
  "message": "SIP confirmed successfully.",
  "data": {
    "sipId": "68xyz...",
    "fpSipId": "mfpp_xxx",
    "isBasketSip": false,
    "isin": "INF204KB14I2",
    "schemeName": "Axis Bluechip Fund - Growth",
    "frequency": "monthly",
    "amount": 5000,
    "installmentDay": 10,
    "numberOfInstallments": 120,
    "paymentMethod": "mandate",
    "paymentSource": "12345",
    "fpState": "confirmed",
    "consentGiven": true,
    "startDate": null,
    "nextInstallmentDate": null,
    "remainingInstallments": null,
    "createdAt": "2026-03-07T10:00:00.000Z"
  }
}
```

**Response `202` — FP still reviewing (retry)**
```json
{
  "success": false,
  "message": "OTP verified. SIP is still under FP review. Please retry confirm in a few seconds.",
  "fpState": "created"
}
```

> **Frontend:** If status is `202`, show a loading state and retry the same confirm call after 3–5 seconds. The OTP is already verified — just resend the same request (no need to re-enter OTP).

---

### 3.3 Resend OTP

```
POST /api/mf/sip/:id/resend-otp
```

**Response `200`**
```json
{
  "success": true,
  "message": "OTP resent successfully",
  "otpExpiresAt": "2026-03-07T10:15:00.000Z"
}
```

---

### 3.4 Get SIP

```
GET /api/mf/sip/:id
```

Fetches the latest state from FP before returning.

**Response `200`** — same shape as confirm response `data`.

---

### 3.5 List SIPs

```
GET /api/mf/sip
```

**Query params (optional)**

| Param     | Example    |
|-----------|------------|
| state     | `active`   |
| frequency | `monthly`  |

**Response `200`**
```json
{
  "success": true,
  "count": 3,
  "data": [ /* array of SIP objects */ ]
}
```

---

### 3.6 Cancel SIP

```
POST /api/mf/sip/:id/cancel
```

**Response `200`**
```json
{
  "success": true,
  "message": "SIP cancelled successfully",
  "data": {
    "sipId": "68xyz...",
    "fpState": "cancelled"
  }
}
```

---

## 4. Basket SIP APIs

Use these when the user is investing in **multiple funds** as a single SIP basket (one OTP covers all).

### 4.1 Create basket SIP

```
POST /api/mf/basket-sip
```

**Body**
```json
{
  "frequency": "monthly",
  "installment_day": 10,
  "payment_source": 12345,
  "number_of_installments": 120,
  "generate_first_installment_now": false,
  "sip_plans": [
    { "isin": "INF204KB14I2", "amount": 2000 },
    { "isin": "INF109K01VQ1", "amount": 1500 },
    { "isin": "INF846K01EW2", "amount": 1000 }
  ]
}
```

| Field                          | Type    | Required | Notes                                              |
|--------------------------------|---------|----------|----------------------------------------------------|
| frequency                      | string  | ✅       | `"monthly"` or `"daily"`                           |
| installment_day                | number  | monthly only | Day of month (1–28)                          |
| payment_source                 | number  | ✅       | `fpMandateId` (numeric)                            |
| number_of_installments         | number  | ❌       | Default: 120                                       |
| generate_first_installment_now | boolean | ❌       | Default: false                                     |
| sip_plans                      | array   | ✅       | Min 2 funds. Each: `{ isin: string, amount: number }` |

**Response `201`**
```json
{
  "success": true,
  "message": "Basket SIP created (3 plans). OTP sent. Call POST /api/mf/basket-sip/:id/confirm with OTP.",
  "data": {
    "sipId": "68abc...",
    "totalAmount": 4500,
    "frequency": "monthly",
    "basketPlans": [
      { "fpSipId": "mfpp_aaa", "isin": "INF204KB14I2", "amount": 2000, "fpState": "created" },
      { "fpSipId": "mfpp_bbb", "isin": "INF109K01VQ1", "amount": 1500, "fpState": "created" },
      { "fpSipId": "mfpp_ccc", "isin": "INF846K01EW2", "amount": 1000, "fpState": "created" }
    ],
    "fpState": "created",
    "otpSentTo": "989****432",
    "otpExpiresAt": "2026-03-07T10:10:00.000Z"
  }
}
```

---

### 4.2 Confirm basket SIP

```
POST /api/mf/basket-sip/:id/confirm
```

**Body**
```json
{
  "otp": "123456"
}
```

**Response `200` — Success**
```json
{
  "success": true,
  "message": "Basket SIP confirmed successfully.",
  "data": {
    "sipId": "68abc...",
    "isBasketSip": true,
    "totalAmount": 4500,
    "frequency": "monthly",
    "basketPlans": [
      { "fpSipId": "mfpp_aaa", "isin": "INF204KB14I2", "amount": 2000, "fpState": "confirmed" },
      { "fpSipId": "mfpp_bbb", "isin": "INF109K01VQ1", "amount": 1500, "fpState": "confirmed" },
      { "fpSipId": "mfpp_ccc", "isin": "INF846K01EW2", "amount": 1000, "fpState": "confirmed" }
    ],
    "fpState": "confirmed",
    "consentGiven": true,
    "createdAt": "2026-03-07T10:00:00.000Z"
  }
}
```

**Response `202` — FP still reviewing (retry)**
```json
{
  "success": false,
  "message": "OTP verified. Some SIP plans are still under FP review. Please retry confirm in a few seconds.",
  "fpState": "created",
  "planStates": {
    "mfpp_aaa": "review_completed",
    "mfpp_bbb": "created",
    "mfpp_ccc": "review_completed"
  }
}
```

> Same as individual: retry after 3–5 seconds on `202`.

---

### 4.3 Resend OTP

```
POST /api/mf/basket-sip/:id/resend-otp
```

Same response as individual SIP resend.

---

### 4.4 Get basket SIP

```
GET /api/mf/basket-sip/:id
```

Refreshes each plan's state from FP.

---

### 4.5 List basket SIPs

```
GET /api/mf/basket-sip
```

Query params: `?state=active&frequency=monthly`

---

### 4.6 Cancel basket SIP

```
POST /api/mf/basket-sip/:id/cancel
```

Cancels all plans in the basket in one call.

**Response `200`**
```json
{
  "success": true,
  "message": "Basket SIP cancelled successfully",
  "data": {
    "sipId": "68abc...",
    "fpState": "cancelled"
  }
}
```

---

## 5. State Reference

### Mandate states

| mandateStatus | Meaning                                                |
|---------------|--------------------------------------------------------|
| `CREATED`     | Mandate created, pending user authorization            |
| `APPROVED`    | Active — can be used as `payment_source` for SIP       |
| `REJECTED`    | Bank rejected — show `fpRejectedReason`, create new    |
| `CANCELLED`   | Cancelled — cannot be used for new SIPs                |

### SIP states (`fpState`)

| fpState           | Meaning                                                    |
|-------------------|------------------------------------------------------------|
| `created`         | FP plan created, async review in progress                  |
| `review_completed`| FP review done — ready for consent PATCH (backend handles) |
| `confirmed`       | User consented — backend sent consent to FP                |
| `submitted`       | Sent to exchange                                           |
| `active`          | Live SIP — installments will be deducted                   |
| `cancelled`       | Cancelled by user                                          |
| `completed`       | All installments done                                      |
| `failed`          | Plan failed — create a new SIP                             |

---

## 6. UI Flow Checklist

### Mandate setup screen

```
1. GET /api/mf/mandate?status=APPROVED
   ├─ count > 0  → go to mandate selection (step 2)
   └─ count == 0 → show "Set up auto-pay" button

2. Mandate selection screen
   - Show list of APPROVED mandates
   - Display: mandateType, mandateLimit (formatted ₹), validFrom–validTo
   - "Use this mandate" → store fpMandateId for SIP creation
   - "Add new mandate" → go to mandate creation

3. Mandate creation screen
   - Input: mandate_type (E_MANDATE / UPI toggle), mandate_limit
   - POST /api/mf/mandate
   - On success → POST /api/mf/mandate/:id/authorize
   - Open tokenUrl in WebView

4. After WebView closes
   - Poll GET /api/mf/mandate/:id every 3 seconds (max 10 times)
   - mandateStatus == "APPROVED" → proceed to SIP creation
   - mandateStatus == "REJECTED" → show error, offer retry
```

### SIP creation screen

```
5. User fills SIP details
   - Fund(s), amount, frequency, installment day, installments count
   - payment_source = fpMandateId selected in step 2/4

6. POST /api/mf/sip  or  POST /api/mf/basket-sip
   - On 201 → show OTP screen (display otpSentTo, otpExpiresAt countdown)

7. OTP screen
   - User enters 6-digit OTP
   - POST /api/mf/sip/:id/confirm
     - 400 (invalid/expired) → show error, offer resend
     - 202 → show "Processing..." spinner, auto-retry after 4 seconds
     - 200 → SIP confirmed ✅ → success screen

8. Success screen
   - Show: fund name, amount, frequency, next installment date (if available)
   - "View my SIPs" → GET /api/mf/sip (list screen)
```

### Important notes for frontend

- `payment_source` must be the **numeric** `fpMandateId`, not our DB `mandateId`.
- On `202` from confirm, **do not** ask the user to re-enter OTP. Just retry the same confirm call silently.
- OTP expires in **10 minutes**. Show a countdown and surface the resend button after 30 seconds.
- For basket SIP, `amount` in the response body is the **total** across all funds. Show per-fund amounts from `basketPlans[]`.
- A mandate can be reused across unlimited SIPs as long as `mandateStatus == "APPROVED"`.
