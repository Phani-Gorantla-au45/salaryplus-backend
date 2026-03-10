# Basket Lumpsum Purchase — Full Flow Debug Reference

**Endpoints covered:**
1. `POST /api/mf/basket-purchase` — create basket order + send OTP
2. `POST /api/mf/purchase/:id/confirm` — verify OTP → consent → payment → confirm

---

## STEP 1 — Create Basket Purchase

### Endpoint
```
POST /api/mf/basket-purchase
Authorization: Bearer <user_jwt>
Content-Type: application/json
```

### Request Body (Frontend → Backend)
```json
{
  "mf_purchases": [
    { "isin": "INF205K01DN2", "amount": 1000 },
    { "isin": "INF090I01239", "amount": 2000 }
  ],
  "payment_method": "NETBANKING"
}
```

| Field           | Type    | Required | Notes                                        |
|-----------------|---------|----------|----------------------------------------------|
| `mf_purchases`  | Array   | Yes      | Min 1 item. Each must have `isin` + `amount` |
| `payment_method`| String  | Yes      | `NETBANKING` or `UPI`                        |

### Internal — FP Batch Purchase Call
```
POST /v2/mf_purchases/batch
```

**Payload sent to FP:**
```json
{
  "mf_purchases": [
    {
      "amount": 1000,
      "mf_investment_account": "mfia_xxxxxxxxxxxxxxxxxxxxxxxx",
      "scheme": "INF205K01DN2",
      "gateway": "ondc",
      "user_ip": "103.x.x.x"
    },
    {
      "amount": 2000,
      "mf_investment_account": "mfia_xxxxxxxxxxxxxxxxxxxxxxxx",
      "scheme": "INF090I01239",
      "gateway": "ondc",
      "user_ip": "103.x.x.x"
    }
  ]
}
```

**FP Response:**
```json
{
  "object": "list",
  "data": [
    {
      "id": "mfp_xxxxxxxxxxxxxxxxxxxxxxxx",
      "old_id": 112233,
      "object": "mf_purchase",
      "state": "created",
      "scheme": "INF205K01DN2",
      "amount": 1000,
      "mf_investment_account": "mfia_xxxxxxxxxxxxxxxxxxxxxxxx"
    },
    {
      "id": "mfp_yyyyyyyyyyyyyyyyyyyyyyyy",
      "old_id": 112234,
      "object": "mf_purchase",
      "state": "created",
      "scheme": "INF090I01239",
      "amount": 2000,
      "mf_investment_account": "mfia_xxxxxxxxxxxxxxxxxxxxxxxx"
    }
  ]
}
```

> **Critical fields to capture:** `id` (fpPurchaseId), `old_id` (fpBankAccountOldId used later in payment)

### DB Record Created (MfPurchase)
```json
{
  "_id": "68xxxxxxxxxxxxxxxxxxxxxx",
  "uniqueId": "user_xxx",
  "fpPurchaseId": "mfp_xxxxxxxxxxxxxxxxxxxxxxxx",
  "fpOldId": 112233,
  "isBasketOrder": true,
  "basketFunds": [
    { "isin": "INF205K01DN2", "amount": 1000 },
    { "isin": "INF090I01239", "amount": 2000 }
  ],
  "basketOrders": [
    { "fpPurchaseId": "mfp_xxxxxxxxxxxxxxxxxxxxxxxx", "fpOldId": 112233, "isin": "INF205K01DN2", "amount": 1000, "fpState": "created" },
    { "fpPurchaseId": "mfp_yyyyyyyyyyyyyyyyyyyyyyyy", "fpOldId": 112234, "isin": "INF090I01239", "amount": 2000, "fpState": "created" }
  ],
  "fpOldIds": [112233, 112234],
  "amount": 3000,
  "paymentMethod": "NETBANKING",
  "fpState": "created",
  "otpVerified": false,
  "consentGiven": false
}
```

### Response to Frontend (201)
```json
{
  "success": true,
  "message": "Basket purchase created. OTP sent for consent.",
  "data": {
    "purchaseId": "68xxxxxxxxxxxxxxxxxxxxxx",
    "fpPurchaseId": "mfp_xxxxxxxxxxxxxxxxxxxxxxxx",
    "totalAmount": 3000,
    "funds": [
      { "isin": "INF205K01DN2", "amount": 1000 },
      { "isin": "INF090I01239", "amount": 2000 }
    ],
    "fpState": "created",
    "otpSentTo": "987****321",
    "otpExpiresAt": "2026-03-09T10:05:00.000Z"
  }
}
```

> **Frontend must save `purchaseId`** — used in Step 2 as `:id`

---

## STEP 2 — Confirm Basket Purchase (OTP → Consent → Payment → Confirm)

### Endpoint
```
POST /api/mf/purchase/:id/confirm
Authorization: Bearer <user_jwt>
Content-Type: application/json
```

> `:id` = `purchaseId` from Step 1 response (`68xxxxxxxxxxxxxxxxxxxxxx`)

### Request Body (Frontend → Backend)
```json
{
  "otp": "123456",
  "bank_account_id": 99887
}
```

| Field            | Type   | Required | Notes                                                             |
|------------------|--------|----------|-------------------------------------------------------------------|
| `otp`            | String | Yes      | 6-digit OTP received on phone                                     |
| `bank_account_id`| Number | Yes      | Numeric FP bank old_id. Get this from `GET /api/mf/bank-account` → `fpBankAccountOldId` |

### Sub-step 4A — PATCH Consent on Each Basket Order
```
PATCH /v2/mf_purchases   (called once per basket order in parallel)
```

**Payload for each order:**
```json
{
  "id": "mfp_xxxxxxxxxxxxxxxxxxxxxxxx",
  "consent": {
    "email": "user@example.com",
    "isd_code": "91",
    "mobile": "9876543210"
  }
}
```

**Expected FP Response (each order):**
```json
{
  "id": "mfp_xxxxxxxxxxxxxxxxxxxxxxxx",
  "state": "consent_received",
  "scheme": "INF205K01DN2",
  "amount": 1000
}
```

### Sub-step 5 — Create Payment (Netbanking/UPI)
```
POST /api/pg/payments/netbanking
```

**Payload sent to FP:**
```json
{
  "amc_order_ids": [112233, 112234],
  "payment_postback_url": "https://your-server.com/api/mf/purchase/payment-callback",
  "method": "NETBANKING",
  "provider_name": "ONDC",
  "bank_account_id": 99887
}
```

| Field                  | Source                                         |
|------------------------|------------------------------------------------|
| `amc_order_ids`        | `record.fpOldIds` (all basket order old_ids)   |
| `payment_postback_url` | `APP_URL` env var + `/api/mf/purchase/payment-callback` |
| `method`               | `record.paymentMethod` (NETBANKING/UPI)        |
| `bank_account_id`      | `bank_account_id` from frontend request body   |

**FP Response:**
```json
{
  "id": "pay_xxxxxxxxxxxxxxxxxxxxxxxx",
  "object": "payment",
  "state": "pending",
  "token_url": "https://pay.cybrilla.com/payment?token=abc123xyz",
  "amc_order_ids": [112233, 112234],
  "method": "NETBANKING",
  "amount": 3000
}
```

> **`token_url` is the payment link frontend must open in a WebView/browser**

### Sub-step 6 — PATCH state=confirmed on Each Basket Order
```
PATCH /v2/mf_purchases   (called once per basket order in parallel)
```

**Payload for each order:**
```json
{
  "id": "mfp_xxxxxxxxxxxxxxxxxxxxxxxx",
  "state": "confirmed"
}
```

**Expected FP Response:**
```json
{
  "id": "mfp_xxxxxxxxxxxxxxxxxxxxxxxx",
  "state": "confirmed",
  "scheme": "INF205K01DN2",
  "amount": 1000
}
```

### Final Response to Frontend (200)
```json
{
  "success": true,
  "message": "Purchase confirmed. Redirect user to payment URL.",
  "data": {
    "purchaseId": "68xxxxxxxxxxxxxxxxxxxxxx",
    "fpPurchaseId": "mfp_xxxxxxxxxxxxxxxxxxxxxxxx",
    "fpState": "confirmed",
    "fpPaymentId": "pay_xxxxxxxxxxxxxxxxxxxxxxxx",
    "tokenUrl": "https://pay.cybrilla.com/payment?token=abc123xyz"
  }
}
```

> **Frontend must open `tokenUrl` in a WebView or browser to complete payment**

---

## Common Failure Points

### 1. `bank_account_id` wrong or missing
```json
{ "success": false, "message": "bank_account_id is required (numeric FP bank old_id)" }
```
**Fix:** Call `GET /api/mf/bank-account` and use `data.fpBankAccountOldId` (numeric field, e.g. `99887`)

### 2. `fpOldIds` empty — payment fails with no amc_order_ids
This happens if FP batch response didn't return `old_id` for some orders.
**Check in logs:**
```
[5/7] isBasketOrder=true amcOrderIds=[112233, 112234] bank_account_id=99887
```
If `amcOrderIds=[]`, basket orders were stored without `fpOldId`.

### 3. Consent PATCH fails
FP may reject consent if orders are already past `consent_received`.
**Check in logs:**
```
[4/7] basketOrders: [{ fpPurchaseId, fpOldId, isin }, ...]
[4/7] consentPayload: { email, isd_code, mobile }
```

### 4. Confirm PATCH fails after payment created
If `state=confirmed` PATCH fails on any order, `fpState` in DB may be stale.
**Check in logs:**
```
[6/7] Confirm results: [{ status: "rejected", reason: "..." }, ...]
```

### 5. `tokenUrl` is null in response
If payment creation succeeded but `token_url` missing in FP response.
**Check in logs:**
```
[FP PAYMENT] Created — id: pay_xxx, token_url: undefined
```

---

## How to Get `bank_account_id` (Frontend Flow)

```
GET /api/mf/bank-account
→ response.data.fpBankAccountOldId   ← pass this as bank_account_id in confirm
```

Example:
```json
{
  "success": true,
  "data": {
    "fpBankAccountId": "bac_xxxxxxxxxxxxxxxxxxxxxxxx",
    "fpBankAccountOldId": 99887,
    "accountNumber": "XXXX1234",
    "bankName": "HDFC Bank",
    ...
  }
}
```

---

## State Machine Summary

```
basket-purchase created
   → fpState: "created"            (Step 1 complete, OTP pending)
   → consent patched               (Step 2 sub-step 4)
   → fpState: "consent_received"   (after consent PATCH)
   → payment created               (Step 2 sub-step 5 — token_url generated here)
   → fpState: "confirmed"          (Step 2 sub-step 6)
   → fpState: "submitted"          (after payment captured — async, via payment callback)
```

---

## Server Log Sequence (Expected)

```
🗂️  [BASKET PURCHASE] user=xxx funds=2

  [1/4] ✅ investmentAccount=mfia_xxx

📤 [FP BATCH] Creating 2 order(s): { mf_purchases: [...] }
basket order resp { object: "list", data: [...] }
✅ [FP BATCH] Created 2 order(s) — ids: mfp_xxx, mfp_yyy

  [3/4] Sending OTP to 987****321...
  [3/4] ✅ OTP sent

  [4/4] Saving to DB...
  [4/4] ✅ purchaseId=68xxx (2 FP orders stored)

---

✅ [CONFIRM PURCHASE] purchaseId=68xxx user=xxx

  [1/7] ✅ basket (2 orders) state=created
  [2/7] ✅ OTP valid
  [3/7] ✅ phone=987****321 email=user@example.com

  [4/7] Patching consent on 2 basket order(s) in parallel...
  [4/7] basketOrders: [{ fpPurchaseId, fpOldId, isin }, ...]
  [4/7] consentPayload: { email, isd_code, mobile }
  [4/7] ✅ Consent patched

  [5/7] isBasketOrder=true amcOrderIds=[112233, 112234] bank_account_id=99887

📤 [FP PAYMENT] Create netbanking payload: { amc_order_ids, method, bank_account_id, ... }
After payment success { id: "pay_xxx", token_url: "https://pay.cybrilla.com/..." }
✅ [FP PAYMENT] Created — id: pay_xxx, token_url: https://pay.cybrilla.com/...

  [6/7] [BASKET] Patching state=confirmed on 2 order(s): ["mfp_xxx","mfp_yyy"]
  [6/7] Confirm results: [{ status: "fulfilled", state: "confirmed" }, ...]
  [6/7] ✅ Basket orders confirmed — state=confirmed

  [7/7] ✅ Done — tokenUrl=https://pay.cybrilla.com/payment?token=abc123xyz
```

---

## Quick Checklist for Debug Call

- [ ] Step 1 response has `purchaseId` (DB `_id`)
- [ ] FP batch response has `old_id` on each order (check `fpOldIds` array in DB)
- [ ] `GET /api/mf/bank-account` returns `fpBankAccountOldId` (number, not null)
- [ ] Step 2 request body has `bank_account_id` = that number
- [ ] Log line `[5/7] amcOrderIds=[...]` shows non-empty array
- [ ] Log line `[FP PAYMENT] Created — token_url:` shows a valid URL
- [ ] Step 2 response has `tokenUrl` set
- [ ] Frontend opens `tokenUrl` in WebView/browser
