# MF SIP — API Reference

**Base URL:** `https://api.salaryplus.club`
**Header (all endpoints):** `Authorization: Bearer <token>`

---

## MANDATE ENDPOINTS

---

### GET /api/mf/mandate

**Request**
```
Query params (optional):
  status = APPROVED | CREATED | REJECTED | CANCELLED
```

**Response**
```json
{
  "success": true,
  "count": 1,
  "data": [
    {
      "mandateId": "68abcd1234567890",
      "fpMandateId": 12345,
      "mandateType": "E_MANDATE",
      "mandateLimit": 100000,
      "mandateStatus": "APPROVED",
      "validFrom": "2026-03-07",
      "validTo": "2056-03-06",
      "mandateRef": "HDFC00123",
      "umrn": "UMRN9001",
      "authStatus": "success",
      "tokenUrl": null,
      "fpPaymentId": 99001,
      "fpApprovedAt": "2026-03-07T11:00:00.000Z",
      "fpCancelledAt": null,
      "fpRejectedAt": null,
      "fpRejectedReason": null,
      "createdAt": "2026-03-07T10:00:00.000Z"
    }
  ]
}
```

---

### POST /api/mf/mandate

**Request**
```json
{
  "mandate_type": "E_MANDATE",
  "mandate_limit": 100000
}
```

**Response `201`**
```json
{
  "success": true,
  "message": "Mandate created. Call POST /api/mf/mandate/:id/authorize to get payment URL.",
  "data": {
    "mandateId": "68abcd1234567890",
    "fpMandateId": 12345,
    "mandateType": "E_MANDATE",
    "mandateLimit": 100000,
    "mandateStatus": "CREATED",
    "validFrom": "2026-03-07",
    "validTo": "2056-03-06"
  }
}
```

**Response `400`**
```json
{ "success": false, "message": "mandate_type must be E_MANDATE or UPI" }
```

---

### POST /api/mf/mandate/:mandateId/authorize

**Request**
```
No body
```

**Response `200`**
```json
{
  "success": true,
  "message": "Mandate authorization initiated. Redirect user to tokenUrl.",
  "data": {
    "mandateId": "68abcd1234567890",
    "fpMandateId": 12345,
    "fpPaymentId": 99001,
    "tokenUrl": "https://payments.cybrilla.com/mandate/auth?token=abcxyz"
  }
}
```

**Response `400`**
```json
{ "success": false, "message": "Cannot authorize mandate in APPROVED state. Only CREATED mandates can be authorized." }
```

---

### GET /api/mf/mandate/:mandateId

**Request**
```
No body
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "mandateId": "68abcd1234567890",
    "fpMandateId": 12345,
    "mandateType": "E_MANDATE",
    "mandateLimit": 100000,
    "mandateStatus": "APPROVED",
    "validFrom": "2026-03-07",
    "validTo": "2056-03-06",
    "mandateRef": "HDFC00123",
    "umrn": "UMRN9001",
    "authStatus": "success",
    "tokenUrl": null,
    "fpPaymentId": 99001,
    "fpApprovedAt": "2026-03-07T11:00:00.000Z",
    "fpCancelledAt": null,
    "fpRejectedAt": null,
    "fpRejectedReason": null,
    "createdAt": "2026-03-07T10:00:00.000Z"
  }
}
```

**Response `404`**
```json
{ "success": false, "message": "Mandate not found" }
```

---

### POST /api/mf/mandate/:mandateId/cancel

**Request**
```
No body
```

**Response `200`**
```json
{
  "success": true,
  "message": "Mandate cancelled successfully",
  "data": {
    "mandateId": "68abcd1234567890",
    "mandateStatus": "CANCELLED"
  }
}
```

**Response `400`**
```json
{ "success": false, "message": "Only APPROVED mandates can be cancelled. Current status: CREATED" }
```

---

## INDIVIDUAL SIP ENDPOINTS

---

### POST /api/mf/sip

**Request**
```json
{
  "isin": "INF204KB14I2",
  "frequency": "monthly",
  "amount": 5000,
  "installment_day": 10,
  "payment_source": 12345,
  "number_of_installments": 120,
  "generate_first_installment_now": false
}
```

| Field | Required | Notes |
|-------|----------|-------|
| isin | ✅ | Fund ISIN |
| frequency | ✅ | `"monthly"` or `"daily"` |
| amount | ✅ | Installment amount in ₹ |
| installment_day | monthly only | 1–28 |
| payment_source | ✅ | `fpMandateId` (number) |
| number_of_installments | ❌ | Default: 120 |
| generate_first_installment_now | ❌ | Default: false |

**Response `201`**
```json
{
  "success": true,
  "message": "SIP created. OTP sent for consent. Call POST /api/mf/sip/:id/confirm with OTP.",
  "data": {
    "sipId": "68xyz111222333",
    "fpSipId": "mfpp_abc123",
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

**Response `400`**
```json
{ "success": false, "message": "installment_day (1-28) is required for monthly SIP" }
```

---

### POST /api/mf/sip/:sipId/confirm

**Request**
```json
{ "otp": "123456" }
```

**Response `200`**
```json
{
  "success": true,
  "message": "SIP confirmed successfully.",
  "data": {
    "sipId": "68xyz111222333",
    "fpSipId": "mfpp_abc123",
    "isBasketSip": false,
    "isin": "INF204KB14I2",
    "schemeName": "Axis Bluechip Fund - Growth",
    "fundName": "Axis Mutual Fund",
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
    "otpExpiresAt": null,
    "createdAt": "2026-03-07T10:00:00.000Z"
  }
}
```

**Response `202` — FP still reviewing, call again after 4 seconds**
```json
{
  "success": false,
  "message": "OTP verified. SIP is still under FP review. Please retry confirm in a few seconds.",
  "fpState": "created"
}
```

**Response `400` — wrong OTP**
```json
{ "success": false, "message": "Invalid OTP" }
```

**Response `400` — OTP expired**
```json
{ "success": false, "message": "OTP has expired" }
```

**Response `400` — already confirmed**
```json
{ "success": false, "message": "Consent already given for this SIP" }
```

---

### POST /api/mf/sip/:sipId/resend-otp

**Request**
```
No body
```

**Response `200`**
```json
{
  "success": true,
  "message": "OTP resent successfully",
  "otpExpiresAt": "2026-03-07T10:20:00.000Z"
}
```

---

### GET /api/mf/sip/:sipId

**Request**
```
No body
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "sipId": "68xyz111222333",
    "fpSipId": "mfpp_abc123",
    "isBasketSip": false,
    "isin": "INF204KB14I2",
    "schemeName": "Axis Bluechip Fund - Growth",
    "fundName": "Axis Mutual Fund",
    "frequency": "monthly",
    "amount": 5000,
    "installmentDay": 10,
    "numberOfInstallments": 120,
    "paymentMethod": "mandate",
    "paymentSource": "12345",
    "fpState": "active",
    "consentGiven": true,
    "startDate": "2026-04-10",
    "nextInstallmentDate": "2026-04-10",
    "remainingInstallments": 120,
    "otpExpiresAt": null,
    "createdAt": "2026-03-07T10:00:00.000Z"
  }
}
```

**Response `404`**
```json
{ "success": false, "message": "SIP not found" }
```

---

### GET /api/mf/sip

**Request**
```
Query params (optional):
  state     = created | confirmed | submitted | active | cancelled | completed | failed
  frequency = monthly | daily
```

**Response `200`**
```json
{
  "success": true,
  "count": 2,
  "data": [
    {
      "sipId": "68xyz111222333",
      "fpSipId": "mfpp_abc123",
      "isBasketSip": false,
      "isin": "INF204KB14I2",
      "schemeName": "Axis Bluechip Fund - Growth",
      "fundName": "Axis Mutual Fund",
      "frequency": "monthly",
      "amount": 5000,
      "installmentDay": 10,
      "numberOfInstallments": 120,
      "paymentMethod": "mandate",
      "paymentSource": "12345",
      "fpState": "active",
      "consentGiven": true,
      "startDate": "2026-04-10",
      "nextInstallmentDate": "2026-04-10",
      "remainingInstallments": 120,
      "otpExpiresAt": null,
      "createdAt": "2026-03-07T10:00:00.000Z"
    }
  ]
}
```

---

### POST /api/mf/sip/:sipId/cancel

**Request**
```
No body
```

**Response `200`**
```json
{
  "success": true,
  "message": "SIP cancelled successfully",
  "data": {
    "sipId": "68xyz111222333",
    "fpState": "cancelled"
  }
}
```

**Response `400`**
```json
{ "success": false, "message": "SIP in 'completed' state cannot be cancelled" }
```

---

## BASKET SIP ENDPOINTS

---

### POST /api/mf/basket-sip

**Request**
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

| Field | Required | Notes |
|-------|----------|-------|
| frequency | ✅ | `"monthly"` or `"daily"` |
| installment_day | monthly only | 1–28 |
| payment_source | ✅ | `fpMandateId` (number) |
| number_of_installments | ❌ | Default: 120 |
| generate_first_installment_now | ❌ | Default: false |
| sip_plans | ✅ min 2 | `[{ isin: string, amount: number }]` |

**Response `201`**
```json
{
  "success": true,
  "message": "Basket SIP created (3 plans). OTP sent. Call POST /api/mf/basket-sip/:id/confirm with OTP.",
  "data": {
    "sipId": "68abc444555666",
    "totalAmount": 4500,
    "frequency": "monthly",
    "fpState": "created",
    "basketPlans": [
      { "fpSipId": "mfpp_aaa", "isin": "INF204KB14I2", "amount": 2000, "fpState": "created" },
      { "fpSipId": "mfpp_bbb", "isin": "INF109K01VQ1", "amount": 1500, "fpState": "created" },
      { "fpSipId": "mfpp_ccc", "isin": "INF846K01EW2", "amount": 1000, "fpState": "created" }
    ],
    "otpSentTo": "989****432",
    "otpExpiresAt": "2026-03-07T10:10:00.000Z"
  }
}
```

**Response `400`**
```json
{ "success": false, "message": "sip_plans must be an array of at least 2 funds" }
```

---

### POST /api/mf/basket-sip/:sipId/confirm

**Request**
```json
{ "otp": "123456" }
```

**Response `200`**
```json
{
  "success": true,
  "message": "Basket SIP confirmed successfully.",
  "data": {
    "sipId": "68abc444555666",
    "isBasketSip": true,
    "frequency": "monthly",
    "amount": 4500,
    "fpState": "confirmed",
    "consentGiven": true,
    "basketPlans": [
      { "fpSipId": "mfpp_aaa", "isin": "INF204KB14I2", "amount": 2000, "fpState": "confirmed" },
      { "fpSipId": "mfpp_bbb", "isin": "INF109K01VQ1", "amount": 1500, "fpState": "confirmed" },
      { "fpSipId": "mfpp_ccc", "isin": "INF846K01EW2", "amount": 1000, "fpState": "confirmed" }
    ],
    "otpExpiresAt": null,
    "createdAt": "2026-03-07T10:00:00.000Z"
  }
}
```

**Response `202` — retry after 4 seconds**
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

**Response `400` — wrong OTP**
```json
{ "success": false, "message": "Invalid OTP" }
```

**Response `400` — OTP expired**
```json
{ "success": false, "message": "OTP has expired" }
```

---

### POST /api/mf/basket-sip/:sipId/resend-otp

**Request**
```
No body
```

**Response `200`**
```json
{
  "success": true,
  "message": "OTP resent successfully",
  "otpExpiresAt": "2026-03-07T10:20:00.000Z"
}
```

---

### GET /api/mf/basket-sip/:sipId

**Request**
```
No body
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "sipId": "68abc444555666",
    "isBasketSip": true,
    "frequency": "monthly",
    "amount": 4500,
    "installmentDay": 10,
    "numberOfInstallments": 120,
    "paymentMethod": "mandate",
    "paymentSource": "12345",
    "fpState": "active",
    "consentGiven": true,
    "basketPlans": [
      { "fpSipId": "mfpp_aaa", "isin": "INF204KB14I2", "amount": 2000, "fpState": "active" },
      { "fpSipId": "mfpp_bbb", "isin": "INF109K01VQ1", "amount": 1500, "fpState": "active" },
      { "fpSipId": "mfpp_ccc", "isin": "INF846K01EW2", "amount": 1000, "fpState": "active" }
    ],
    "startDate": "2026-04-10",
    "nextInstallmentDate": "2026-04-10",
    "remainingInstallments": 120,
    "createdAt": "2026-03-07T10:00:00.000Z"
  }
}
```

---

### GET /api/mf/basket-sip

**Request**
```
Query params (optional):
  state     = created | confirmed | submitted | active | cancelled | completed | failed
  frequency = monthly | daily
```

**Response `200`**
```json
{
  "success": true,
  "count": 1,
  "data": [ /* array of basket SIP objects */ ]
}
```

---

### POST /api/mf/basket-sip/:sipId/cancel

**Request**
```
No body
```

**Response `200`**
```json
{
  "success": true,
  "message": "Basket SIP cancelled successfully",
  "data": {
    "sipId": "68abc444555666",
    "fpState": "cancelled"
  }
}
```

**Response `400`**
```json
{ "success": false, "message": "Basket SIP in 'completed' state cannot be cancelled" }
```
