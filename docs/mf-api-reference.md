# SalaryPlus — Mutual Fund API Reference

> Base URL: `https://salaryplus.club`
> All authenticated endpoints require `Authorization: Bearer <token>` header.
> User endpoints use **user JWT**. Admin endpoints use **admin JWT**.

---

## Table of Contents

1. [Authentication](#1-authentication)
2. [MF KYC](#2-mf-kyc)
3. [MF Onboarding](#3-mf-onboarding)
4. [MF Master Data](#4-mf-master-data)
5. [MF Mandate (eNACH / UPI Autopay)](#5-mf-mandate)
6. [MF Purchase (Lumpsum)](#6-mf-purchase-lumpsum)
7. [MF Basket Purchase](#7-mf-basket-purchase)
8. [MF SIP](#8-mf-sip)
9. [MF Basket SIP](#9-mf-basket-sip)
10. [MF Redemption (Withdraw)](#10-mf-redemption)
11. [MF Reports](#11-mf-reports)
12. [MF Smart Saving](#12-mf-smart-saving)
13. [Admin Endpoints](#13-admin-endpoints)
14. [Webhooks](#14-webhooks)

---

## 1. Authentication

### POST `/api/registration/send-otp`
**Auth:** None | **Type:** Public

Send OTP to user's phone number for login.

**Request:**
```json
{ "phone": "9940306009" }
```

**Response:**
```json
{ "message": "OTP sent successfully" }
```

---

### POST `/api/registration/verify-otp`
**Auth:** None | **Type:** Public

Verify OTP and receive JWT token.

**Request:**
```json
{ "phone": "9940306009", "otp": "1234" }
```

**Response:**
```json
{
  "token": "eyJhbGci...",
  "isNewUser": true,
  "nextStep": "REGISTRATION"
}
```

---

### POST `/api/registration/admin-login`
**Auth:** None | **Type:** Admin

Get admin JWT token.

**Request:**
```json
{ "secret": "<ADMIN_SECRET>" }
```

**Response:**
```json
{ "token": "eyJhbGci..." }
```

---

## 2. MF KYC

### GET `/api/mf/kyc/status`
**Auth:** User | **Type:** User

Check user's KYC status (pre-verification via PAN).

**Response:**
```json
{
  "success": true,
  "data": {
    "overallStatus": "verified",
    "panStatus": "valid",
    "kraStatus": "registered"
  }
}
```

---

### POST `/api/mf/kyc-request`
**Auth:** User | **Type:** User

Create a KYC request on FP.

**Response:**
```json
{
  "success": true,
  "data": {
    "fpKycRequestId": "kycr_xxx",
    "status": "pending"
  }
}
```

---

### GET `/api/mf/kyc-request`
**Auth:** User | **Type:** User

Get current KYC request status.

**Response:**
```json
{
  "success": true,
  "data": {
    "fpKycRequestId": "kycr_xxx",
    "status": "submitted",
    "pan": "ABCDE1234F"
  }
}
```

---

### POST `/api/mf/esign/initiate`
**Auth:** User | **Type:** User

Initiate eSign for KYC (when `status = esign_required`).

**Response:**
```json
{
  "success": true,
  "data": { "esignUrl": "https://..." }
}
```

---

## 3. MF Onboarding

### GET `/api/mf/journey-status`
**Auth:** User | **Type:** User

Get user's MF onboarding journey progress.

**Response:**
```json
{
  "success": true,
  "data": {
    "riskProfile": { "status": "completed", "category": "moderate" },
    "kycCheck":    { "status": "completed" },
    "kycSubmit":   { "status": "completed" },
    "account":     { "status": "completed" },
    "canInvest":   true
  }
}
```

---

### POST `/api/mf/risk-profile`
**Auth:** User | **Type:** User

Submit risk profile questionnaire answers.

**Request:**
```json
{ "answers": [1, 2, 3, 2, 1] }
```

**Response:**
```json
{
  "success": true,
  "data": { "score": 12, "category": "moderate" }
}
```

---

### POST `/api/mf/investor-profile`
**Auth:** User | **Type:** User

Create investor profile on FP.

**Request:**
```json
{
  "name": "Phani Gorantla",
  "pan": "ABCDE1234F",
  "dob": "1995-06-15",
  "gender": "male",
  "occupation": "business",
  "income_slab": "i_10_15"
}
```

---

### POST `/api/mf/phone-number`
**Auth:** User | **Type:** User

Add phone number to FP investor profile.

**Request:**
```json
{ "isd": "91", "number": "9940306009" }
```

---

### POST `/api/mf/email-address`
**Auth:** User | **Type:** User

Add email to FP investor profile.

**Request:**
```json
{ "email": "user@example.com" }
```

---

### POST `/api/mf/address`
**Auth:** User | **Type:** User

Add address to FP investor profile.

**Request:**
```json
{
  "line1": "123 Main Street",
  "city": "Chennai",
  "state": "TN",
  "postalCode": "600001",
  "country": "IN"
}
```

---

### POST `/api/mf/bank-account`
**Auth:** User | **Type:** User

Link bank account to MF profile.

**Request:**
```json
{
  "account_number": "123456789012",
  "ifsc_code": "HDFC0001234",
  "account_type": "savings"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "fpBankAccountId": "bac_xxx",
    "fpBankAccountOldId": 417,
    "bankName": "HDFC Bank",
    "verificationStatus": "pending"
  }
}
```

---

### GET `/api/mf/bank-account`
**Auth:** User | **Type:** User

Get linked bank account details. `fpBankAccountOldId` is required for payment calls.

**Response:**
```json
{
  "success": true,
  "data": {
    "fpBankAccountId": "bac_xxx",
    "fpBankAccountOldId": 417,
    "accountNumber": "XXXXXXXX9012",
    "bankName": "HDFC Bank",
    "ifscCode": "HDFC0001234",
    "verificationStatus": "completed"
  }
}
```

---

### POST `/api/mf/investment-account`
**Auth:** User | **Type:** User

Create MF investment account on FP.

**Response:**
```json
{
  "success": true,
  "data": {
    "fpInvestmentAccountId": "mfia_xxx",
    "fpInvestmentAccountOldId": 123
  }
}
```

---

## 4. MF Master Data

### GET `/api/mf/master/amcs`
**Auth:** User | **Type:** Master Data

List all AMCs.

**Response:**
```json
{
  "success": true,
  "data": [{ "id": "amc_xxx", "name": "HDFC Mutual Fund" }]
}
```

---

### GET `/api/mf/master/scheme-plans`
**Auth:** User | **Type:** Master Data

Search scheme plans by ISIN or name.

**Query:** `?isin=INF209K01RU9` or `?q=parag parikh`

**Response:**
```json
{
  "success": true,
  "data": [{
    "isin": "INF209K01RU9",
    "schemeName": "Parag Parikh Flexi Cap Fund - Direct Growth",
    "fundName": "Parag Parikh Mutual Fund",
    "type": "equity"
  }]
}
```

---

### GET `/api/mf/master/daily-sip-funds`
**Auth:** User | **Type:** Master Data

List funds available for daily SIP.

---

### GET `/api/mf/basket`
**Auth:** User | **Type:** Master Data

Get curated fund baskets (admin-configured).

---

### GET `/api/mf/curated-basket`
**Auth:** User | **Type:** Master Data

Get curated baskets for display on frontend.

---

## 5. MF Mandate

### POST `/api/mf/mandate`
**Auth:** User | **Type:** User

Create a new mandate (eNACH or UPI Autopay).

**Request:**
```json
{
  "mandate_type": "UPI",
  "mandate_limit": 100000
}
```
> `mandate_type`: `"E_MANDATE"` or `"UPI"`
> `mandate_limit`: max ₹1,00,000 for UPI | max ₹1,00,00,000 for E_MANDATE

**Response:**
```json
{
  "success": true,
  "data": {
    "mandateId": "6632abc...",
    "fpMandateId": 200,
    "mandateType": "UPI",
    "mandateLimit": 100000,
    "mandateStatus": "CREATED",
    "validFrom": "2026-04-11",
    "validTo": "2056-04-10"
  }
}
```

---

### POST `/api/mf/mandate/:id/authorize`
**Auth:** User | **Type:** User

Authorize mandate — get payment URL (eNACH) or UPI deep-link (UPI).

**Response (E_MANDATE):**
```json
{
  "success": true,
  "data": {
    "mandateType": "E_MANDATE",
    "fpPaymentId": 1030,
    "tokenUrl": "https://billdesk.com/...",
    "upiUri": null
  }
}
```

**Response (UPI):**
```json
{
  "success": true,
  "data": {
    "mandateType": "UPI",
    "fpPaymentId": 1030,
    "tokenUrl": null,
    "upiUri": "upi://mandate?pa=billuat@icici&am=100000.00..."
  }
}
```
> If `upiUri` is null, poll `GET /api/mf/mandate/:id` every 2s until it arrives.

---

### GET `/api/mf/mandate`
**Auth:** User | **Type:** User

List all mandates for the user.

**Query:** `?status=approved`

**Response:**
```json
{
  "success": true,
  "count": 1,
  "data": [{
    "mandateId": "6632abc...",
    "fpMandateId": 200,
    "mandateType": "UPI",
    "mandateLimit": 100000,
    "mandateStatus": "approved",
    "tokenUrl": null,
    "upiUri": "upi://mandate?...",
    "umrn": "UMRN123456"
  }]
}
```

---

### GET `/api/mf/mandate/:id`
**Auth:** User | **Type:** User

Get single mandate — refreshes status from FP.

---

### POST `/api/mf/mandate/:id/cancel`
**Auth:** User | **Type:** User

Cancel an approved mandate.

---

## 6. MF Purchase (Lumpsum)

### POST `/api/mf/purchase`
**Auth:** User | **Type:** User

Create a lumpsum purchase order. Sends consent OTP.

**Request:**
```json
{
  "isin": "INF209K01RU9",
  "amount": 1000,
  "payment_method": "UPI"
}
```
> `payment_method`: `"NETBANKING"` or `"UPI"`

**Response:**
```json
{
  "success": true,
  "data": {
    "purchaseId": "6632abc...",
    "fpPurchaseId": "mfp_xxx",
    "isin": "INF209K01RU9",
    "schemeName": "Parag Parikh Flexi Cap Fund",
    "amount": 1000,
    "paymentMethod": "UPI",
    "fpState": "pending",
    "otpSentTo": "880****801",
    "otpExpiresAt": "2026-04-11T10:05:00Z"
  }
}
```

---

### POST `/api/mf/purchase/:id/confirm`
**Auth:** User | **Type:** User

Verify OTP → patch consent → create payment → confirm order.

**Request:**
```json
{
  "otp": "1234",
  "bank_account_id": 417
}
```
> `bank_account_id`: numeric `fpBankAccountOldId` from `GET /api/mf/bank-account`

**Response (NETBANKING):**
```json
{
  "success": true,
  "data": {
    "purchaseId": "6632abc...",
    "fpState": "confirmed",
    "fpPaymentId": "54",
    "paymentMethod": "NETBANKING",
    "tokenUrl": "https://billdesk.com/...",
    "upiUri": null
  }
}
```

**Response (UPI):**
```json
{
  "success": true,
  "data": {
    "purchaseId": "6632abc...",
    "fpState": "confirmed",
    "fpPaymentId": "57",
    "paymentMethod": "UPI",
    "tokenUrl": null,
    "upiUri": null
  }
}
```
> `upiUri` will be null initially for UPI. Poll `GET /api/mf/purchase/:id/payment-status` every 2s until it arrives.

---

### GET `/api/mf/purchase/:id/payment-status`
**Auth:** User | **Type:** User

Poll payment status. Returns live status from FP + `upiUri` once available.

**Response:**
```json
{
  "success": true,
  "data": {
    "purchaseId": "6632abc...",
    "fpPaymentId": 57,
    "paymentMethod": "UPI",
    "status": "SUCCESS",
    "amount": 1000,
    "tokenUrl": null,
    "upiUri": "upi://pay?pa=absl.bdpg.mf@validicici&am=1000.00...",
    "failedReason": null
  }
}
```
> `status` values: `PENDING` | `SUCCESS` | `FAILED`

---

### GET `/api/mf/purchase`
**Auth:** User | **Type:** User

List all purchases for the user.

**Query:** `?state=confirmed&isin=INF209K01RU9`

---

### GET `/api/mf/purchase/:id`
**Auth:** User | **Type:** User

Get single purchase — refreshes state from FP.

---

### POST `/api/mf/purchase/:id/resend-otp`
**Auth:** User | **Type:** User

Resend consent OTP.

---

## 7. MF Basket Purchase

### POST `/api/mf/basket-purchase`
**Auth:** User | **Type:** User

Create a basket (multi-fund) lumpsum order.

**Request:**
```json
{
  "funds": [
    { "isin": "INF209K01RU9", "amount": 500 },
    { "isin": "INF846K016E3", "amount": 500 }
  ],
  "payment_method": "NETBANKING"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "purchaseId": "6632abc...",
    "isBasketOrder": true,
    "totalAmount": 1000,
    "basketOrders": [
      { "isin": "INF209K01RU9", "amount": 500, "fpState": "pending" },
      { "isin": "INF846K016E3", "amount": 500, "fpState": "pending" }
    ],
    "otpSentTo": "880****801"
  }
}
```

---

### POST `/api/mf/basket-purchase/:id/confirm`
**Auth:** User | **Type:** User

Confirm basket purchase (same as single confirm).

**Request:**
```json
{ "otp": "1234", "bank_account_id": 417 }
```

---

## 8. MF SIP

### POST `/api/mf/sip`
**Auth:** User | **Type:** User

Create a SIP purchase plan.

**Request:**
```json
{
  "isin": "INF209K01RU9",
  "frequency": "monthly",
  "amount": 1000,
  "installment_day": 10,
  "payment_source": "19",
  "number_of_installments": 120
}
```
> `frequency`: `"daily"` or `"monthly"`
> `payment_source`: numeric mandate id (from `GET /api/mf/mandate`)
> `installment_day`: required for monthly (1–28)

**Response:**
```json
{
  "success": true,
  "data": {
    "sipId": "6632abc...",
    "fpSipId": "mfpp_xxx",
    "isin": "INF209K01RU9",
    "frequency": "monthly",
    "amount": 1000,
    "fpState": "created",
    "otpSentTo": "880****801"
  }
}
```

---

### POST `/api/mf/sip/:id/confirm`
**Auth:** User | **Type:** User

Verify OTP and confirm SIP.

**Request:**
```json
{ "otp": "1234" }
```

**Response:**
```json
{
  "success": true,
  "data": {
    "sipId": "6632abc...",
    "fpSipId": "mfpp_xxx",
    "fpState": "confirmed",
    "startDate": "2026-05-10",
    "nextInstallmentDate": "2026-05-10"
  }
}
```

---

### GET `/api/mf/sip`
**Auth:** User | **Type:** User

List all SIPs for the user.

**Query:** `?state=active&frequency=monthly`

---

### GET `/api/mf/sip/:id`
**Auth:** User | **Type:** User

Get single SIP — refreshes from FP.

---

### POST `/api/mf/sip/:id/cancel`
**Auth:** User | **Type:** User

Cancel an active SIP.

---

### POST `/api/mf/sip/:id/resend-otp`
**Auth:** User | **Type:** User

Resend consent OTP for SIP.

---

## 9. MF Basket SIP

### POST `/api/mf/basket-sip`
**Auth:** User | **Type:** User

Create a basket SIP (multiple funds under one SIP group).

**Request:**
```json
{
  "funds": [
    { "isin": "INF209K01RU9", "amount": 500 },
    { "isin": "INF846K016E3", "amount": 500 }
  ],
  "frequency": "monthly",
  "installment_day": 10,
  "payment_source": "19"
}
```

---

### POST `/api/mf/basket-sip/:id/confirm`
**Auth:** User | **Type:** User

Confirm basket SIP with OTP.

**Request:**
```json
{ "otp": "1234" }
```

---

## 10. MF Redemption

### POST `/api/mf/redemption`
**Auth:** User | **Type:** User

Create a redemption (withdraw) order.

**Request:**
```json
{
  "isin": "INF209K01RU9",
  "folio_number": "1050689934",
  "amount": 500
}
```
> Use either `amount` or `units`, not both.

**Response:**
```json
{
  "success": true,
  "data": {
    "redemptionId": "6632abc...",
    "fpRedemptionId": "mfr_xxx",
    "isin": "INF209K01RU9",
    "amount": 500,
    "fpState": "under_review",
    "otpSentTo": "880****801"
  }
}
```

---

### POST `/api/mf/redemption/:id/confirm`
**Auth:** User | **Type:** User

Confirm redemption with OTP.

**Request:**
```json
{ "otp": "1234" }
```

---

### GET `/api/mf/redemption`
**Auth:** User | **Type:** User

List all redemption orders.

---

### GET `/api/mf/redemption/:id`
**Auth:** User | **Type:** User

Get single redemption — refreshes from FP.

---

## 11. MF Reports

### GET `/api/mf/reports/holdings`
**Auth:** User | **Type:** User

Get current MF portfolio holdings.

**Response:**
```json
{
  "success": true,
  "data": [{
    "isin": "INF209K01RU9",
    "schemeName": "Parag Parikh Flexi Cap Fund",
    "units": 12.345,
    "nav": 85.23,
    "currentValue": 1052.11,
    "investedAmount": 1000,
    "gain": 52.11,
    "gainPercent": 5.21
  }]
}
```

---

### GET `/api/mf/reports/returns`
**Auth:** User | **Type:** User

Get portfolio returns summary (XIRR, absolute returns).

---

### GET `/api/mf/reports/transactions`
**Auth:** User | **Type:** User

Get all MF transactions (purchases, redemptions, SIPs).

---

## 12. MF Smart Saving

### POST `/api/mf/smart-saving`
**Auth:** User | **Type:** User

Invest in instant liquid fund (smart saving).

---

### GET `/api/mf/smart-saving`
**Auth:** User | **Type:** User

Get smart saving balance and details.

---

## 13. Admin Endpoints

> All admin endpoints require admin JWT.
> `Authorization: Bearer <admin_jwt>`

---

### POST `/api/mf/admin/basket`
**Auth:** Admin | **Type:** Admin

Create/manage curated fund baskets shown to users.

---

### GET `/api/mf/admin/folios`
**Auth:** Admin | **Type:** Admin

List all MF folios from FP.

**Query:** `?mf_investment_account=mfia_xxx` or `?folio_number=1050689934`

---

### GET `/api/mf/admin/sip`
**Auth:** Admin | **Type:** Admin

List SIP plans from FP with optional filters. Filters on our side.

**Query:**
- `?states=active` — only active SIPs
- `?states=active,created` — multiple states
- `?uniqueId=Uml96hclm68g8zo` — filter by our user id
- `?mf_investment_account=mfia_xxx` — filter by FP investment account

**Response:**
```json
{
  "success": true,
  "count": 2,
  "data": [{ "id": "mfpp_xxx", "state": "active", "amount": 1000, ... }]
}
```

---

### GET `/api/mf/admin/sip/:fpSipId`
**Auth:** Admin | **Type:** Admin

Fetch single SIP plan directly from FP.

---

### GET `/api/mf/admin/investor-profiles`
**Auth:** Admin | **Type:** Admin

List all investor profiles from FP (type=individual).

**Query:** `?uniqueId=Uml96hclm68g8zo` — fetch for specific user

---

### GET `/api/mf/admin/investment-accounts`
**Auth:** Admin | **Type:** Admin

List all MF investment accounts from FP.

**Query:** `?uniqueId=Uml96hclm68g8zo` — fetch for specific user

---

### GET `/api/mf/admin/payments/:id`
**Auth:** Admin | **Type:** Admin

Fetch payment details directly from FP by payment id.

```
GET /api/mf/admin/payments/57
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 57,
    "status": "SUCCESS",
    "method": "UPI",
    "amount": 1000,
    "upi": { "uri": "upi://pay?..." },
    "amc_order_ids": [44]
  }
}
```

---

### GET `/api/mf/admin/webhook/fp`
**Auth:** Admin | **Type:** Admin

List all FP webhook registrations for the tenant.

---

### POST `/api/mf/admin/webhook/fp/setup`
**Auth:** Admin | **Type:** Admin

Register ALL required FP webhook events at once (idempotent).

**Response:**
```json
{
  "results": {
    "created": [{ "event": "mf_purchase.successful", "id": "ntwh_xxx" }],
    "skipped": [],
    "failed": []
  }
}
```

---

### POST `/api/mf/admin/webhook/fp/update-url`
**Auth:** Admin | **Type:** Admin

Bulk-update the webhook URL on all existing FP registrations.

**Request (optional):**
```json
{ "url": "https://salaryplus.club/api/mf/webhook/fp" }
```
> If body is empty, uses `APP_BASE_URL` from `.env`.

---

### POST `/api/mf/admin/webhook/fp`
**Auth:** Admin | **Type:** Admin

Register a single webhook event at FP.

**Request:**
```json
{ "event": "mf_purchase.successful" }
```

---

### PUT `/api/mf/admin/webhook/fp/:id`
**Auth:** Admin | **Type:** Admin

Update an existing FP webhook (url or status).

**Request:**
```json
{ "status": "disabled" }
```

---

### GET `/api/mf/admin/webhook/fp/events`
**Auth:** Admin | **Type:** Admin

View stored webhook event log.

**Query:** `?status=failed&eventType=mf_purchase.successful&page=1&limit=50`

**Response:**
```json
{
  "data": [{
    "fpEventId": "evt_xxx",
    "eventType": "mf_purchase.successful",
    "status": "processed",
    "fpObjectId": "mfp_xxx",
    "processedAt": "2026-04-11T10:00:00Z"
  }],
  "meta": { "total": 120, "page": 1, "limit": 50 }
}
```

---

### POST `/api/mf/admin/webhook/fp/events/:id/replay`
**Auth:** Admin | **Type:** Admin

Re-process a failed or pending webhook event.

---

## 14. Webhooks

### POST `/api/mf/webhook/fp`
**Auth:** None (FP-Signature HMAC verification) | **Type:** Public (FP → Server)

Receives all FP webhook events. Verifies signature, saves to DB, dispatches async.

**Events handled:**

| Object | Events | Action |
|---|---|---|
| `kyc_request` | submitted, successful, rejected, expired, esign_required | Update KycRequest status + email |
| `mf_purchase` | created, confirmed, submitted, successful, failed, cancelled, reversed | Update MfPurchase fpState + email |
| `mf_redemption` | same as purchase | Update MfRedemption fpState + email |
| `mf_purchase_plan` | created, activated, cancelled, failed, completed | Update MfSip fpState + email |
| `mandate` | created, submitted, approved, rejected, cancelled | Update MfMandate status + email |
| `payment` | success, failed, approved, rejected, updated | Save UPI URI + email |

**Response:** Always `{ "received": true }` with HTTP 200.

---

## Quick Reference — Payment Methods

| Flow | Method | Frontend Action |
|---|---|---|
| Lumpsum NETBANKING | Redirect to `tokenUrl` | Open in WebView/browser |
| Lumpsum UPI | Poll for `upiUri` | Open deep-link in UPI app |
| Mandate E_MANDATE | Redirect to `tokenUrl` | Open in WebView/browser |
| Mandate UPI | `upiUri` in authorize response | Open deep-link in UPI app |

---

## Quick Reference — UPI Polling Flow

```
POST /confirm  →  upiUri = null
      ↓
Poll GET /:id/payment-status every 2s
      ↓
upiUri arrives  →  open UPI deep-link
      ↓
Poll until status = SUCCESS or FAILED
```

---

*Last updated: April 2026*
