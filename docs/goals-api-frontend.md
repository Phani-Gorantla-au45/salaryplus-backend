# Goals API — Frontend Reference

Base URL: `https://api.salaryplus.club` (or your dev server)  
All authenticated requests require: `Authorization: Bearer <user_token>`

---

## Overview — How the flow works

```
App opens Goals tab
        │
        ▼
GET /api/goals   ← returns all goal cards (both set-up and not set-up)
        │
        ├─ isSetup: false  →  Show "Set Up" button
        │                         │
        │                         ▼
        │                  GET /api/goals/templates/:templateId
        │                  (get the form fields to render)
        │                         │
        │                         ▼
        │                  User fills form
        │                         │
        │                         ▼
        │                  POST /api/goals/calculate   ← live preview (no save)
        │                         │
        │                         ▼
        │                  POST /api/goals             ← save goal
        │
        └─ isSetup: true   →  Show goal card (targetAmount, monthlySip)
                                  │
                                  ▼
                           GET /api/goals/:userGoalId   ← detail screen
                           PATCH /api/goals/:userGoalId ← edit inputs
                           DELETE /api/goals/:userGoalId ← remove goal
```

---

## 1. Home Screen — Get All Goals

### `GET /api/goals`
**Auth:** User token required

Returns every active goal template merged with the user's saved goals. Use this to render the goals home screen.

**Response**
```json
{
  "goals": [
    {
      "templateId": "664f1a2b3c4d5e6f7a8b9c0d",
      "name": "Health Insurance",
      "type": "health_insurance",
      "description": "Find out how much health coverage your family needs.",
      "icon": "health_insurance",
      "displayOrder": 1,
      "isSetup": false,
      "userGoalId": null,
      "targetAmount": null,
      "monthlySip": null,
      "duration": null,
      "status": null,
      "linkedSipId": null
    },
    {
      "templateId": "664f1a2b3c4d5e6f7a8b9c0e",
      "name": "Term Insurance",
      "type": "term_insurance",
      "description": "Calculate the life cover your family needs.",
      "icon": "term_insurance",
      "displayOrder": 2,
      "isSetup": true,
      "userGoalId": "664f9a2b3c4d5e6f7a8b9c11",
      "targetAmount": 19000000,
      "monthlySip": 1330,
      "duration": 30,
      "status": "active",
      "linkedSipId": null
    },
    {
      "templateId": "664f1a2b3c4d5e6f7a8b9c0f",
      "name": "Emergency Fund",
      "type": "emergency_fund",
      "description": "Build a safety net of at least 6 months of your expenses.",
      "icon": "emergency_fund",
      "displayOrder": 3,
      "isSetup": true,
      "userGoalId": "664f9a2b3c4d5e6f7a8b9c12",
      "targetAmount": 300000,
      "monthlySip": 24060,
      "duration": 1,
      "status": "active",
      "linkedSipId": null
    }
  ]
}
```

**Field reference**

| Field | Type | Description |
|---|---|---|
| `templateId` | string | Use this when calling calculate / save |
| `type` | string | Goal type identifier (see types table below) |
| `icon` | string | Icon name/key for your asset map |
| `isSetup` | boolean | `false` = show "Set Up" CTA. `true` = show goal summary card |
| `userGoalId` | string \| null | Use this for GET detail / PATCH / DELETE |
| `targetAmount` | number \| null | Rupees — null until set up |
| `monthlySip` | number \| null | Monthly SIP / premium in Rupees |
| `duration` | number \| null | Years to goal |
| `status` | `"active"` \| `"completed"` \| `"paused"` \| `"abandoned"` \| null | |

---

## 2. Get Template (to render the form)

### `GET /api/goals/templates/:templateId`
**Auth:** Not required

Call this when the user taps "Set Up" on a goal card. Use the `fields` array to dynamically render the input form.

**Response**
```json
{
  "template": {
    "_id": "664f1a2b3c4d5e6f7a8b9c0d",
    "name": "Health Insurance",
    "type": "health_insurance",
    "description": "Find out how much health coverage your family needs.",
    "icon": "health_insurance",
    "fields": [
      {
        "key": "family_size",
        "label": "Number of Family Members to Cover",
        "type": "number",
        "unit": "members",
        "min": 1,
        "max": 10,
        "defaultValue": 3,
        "required": true
      },
      {
        "key": "primary_age",
        "label": "Age of Eldest Member",
        "type": "number",
        "unit": "years",
        "min": 18,
        "max": 70,
        "defaultValue": null,
        "required": true
      },
      {
        "key": "annual_income",
        "label": "Annual Household Income",
        "type": "number",
        "unit": "₹",
        "min": 100000,
        "defaultValue": null,
        "required": true
      },
      {
        "key": "existing_coverage",
        "label": "Existing Health Cover (if any)",
        "type": "number",
        "unit": "₹",
        "min": 0,
        "defaultValue": 0,
        "required": false
      }
    ],
    "assumptions": {
      "inflationRate": 0,
      "returnRate": 0
    },
    "displayOrder": 1,
    "isActive": true
  }
}
```

### Field schema — how to render

| Field property | How to use on frontend |
|---|---|
| `key` | Use as the object key when building the `inputs` object to POST |
| `label` | Display as the field label |
| `type` | `"number"` → numeric input, `"text"` → text input, `"dropdown"` → picker |
| `unit` | Show as suffix/prefix (₹, years, months, %) |
| `min` / `max` | Input validation range |
| `defaultValue` | Pre-fill the field; `null` means leave blank |
| `required` | Show * and validate before submit |
| `options` | Only present for `type: "dropdown"` — array of strings to show in picker |

---

## 3. Live Calculation Preview (no save)

### `POST /api/goals/calculate`
**Auth:** Not required

Call this on every form input change to show a live preview of the result before the user saves.

**Request**
```json
{
  "templateId": "664f1a2b3c4d5e6f7a8b9c0d",
  "inputs": {
    "family_size": 4,
    "primary_age": 38,
    "annual_income": 1200000,
    "existing_coverage": 0
  }
}
```

**Response**
```json
{
  "targetAmount": 2000000,
  "monthlySip": 4333,
  "duration": 1
}
```

**Per goal type — what these numbers mean**

| Goal type | `targetAmount` | `monthlySip` | `duration` |
|---|---|---|---|
| `health_insurance` | Recommended sum insured | Estimated monthly premium | 1 (renews yearly) |
| `term_insurance` | Recommended life cover | Estimated monthly premium | Policy term (years) |
| `emergency_fund` | Target corpus (expenses × months) | Monthly SIP to build it in 1 year | 1 |
| `child_education` | Inflation-adjusted future education cost | Monthly SIP needed | Years until education starts |
| `child_marriage` | Inflation-adjusted future wedding cost | Monthly SIP needed | Years until marriage |
| `retirement` | Retirement corpus needed | Monthly SIP needed | Years to retirement |
| `home_purchase` | Inflation-adjusted down payment | Monthly SIP needed | Years to purchase |

**Error response (invalid inputs)**
```json
{
  "message": "child_age, education_age, and current_cost are required"
}
```

---

## 4. Save a Goal

### `POST /api/goals`
**Auth:** User token required

Saves and calculates the goal. If the user has already set up this goal type before, it **updates** it (upsert — no duplicates).

**Request**
```json
{
  "templateId": "664f1a2b3c4d5e6f7a8b9c0d",
  "inputs": {
    "family_size": 4,
    "primary_age": 38,
    "annual_income": 1200000,
    "existing_coverage": 0
  }
}
```

**Response `201`**
```json
{
  "goal": {
    "_id": "664f9a2b3c4d5e6f7a8b9c11",
    "templateId": "664f1a2b3c4d5e6f7a8b9c0d",
    "templateType": "health_insurance",
    "inputs": {
      "family_size": 4,
      "primary_age": 38,
      "annual_income": 1200000,
      "existing_coverage": 0
    },
    "targetAmount": 2000000,
    "monthlySip": 4333,
    "duration": 1,
    "status": "active",
    "linkedSipId": null,
    "createdAt": "2026-04-30T10:00:00.000Z",
    "updatedAt": "2026-04-30T10:00:00.000Z"
  }
}
```

---

## 5. Goal Detail Screen

### `GET /api/goals/:userGoalId`
**Auth:** User token required

Returns the saved goal with the full template (fields array included). Use this for the goal detail / edit screen — you can use `goal.templateId.fields` to re-render the form pre-filled with `goal.inputs`.

**Response**
```json
{
  "goal": {
    "_id": "664f9a2b3c4d5e6f7a8b9c11",
    "templateId": {
      "_id": "664f1a2b3c4d5e6f7a8b9c0d",
      "name": "Health Insurance",
      "type": "health_insurance",
      "description": "...",
      "icon": "health_insurance",
      "fields": [ ... ],
      "assumptions": { ... }
    },
    "templateType": "health_insurance",
    "inputs": {
      "family_size": 4,
      "primary_age": 38,
      "annual_income": 1200000,
      "existing_coverage": 0
    },
    "targetAmount": 2000000,
    "monthlySip": 4333,
    "duration": 1,
    "status": "active",
    "linkedSipId": null
  }
}
```

---

## 6. Edit a Goal

### `PATCH /api/goals/:userGoalId`
**Auth:** User token required

Send only what changed. Re-calculates automatically.

**Request — update inputs only**
```json
{
  "inputs": {
    "family_size": 5,
    "primary_age": 38,
    "annual_income": 1500000,
    "existing_coverage": 500000
  }
}
```

**Request — update status only**
```json
{
  "status": "completed"
}
```

**Request — link a SIP investment to this goal**
```json
{
  "linkedSipId": "SIP_FP_ID_HERE"
}
```

**Response** — same shape as `GET /api/goals/:id` (without populated template)

---

## 7. Delete a Goal

### `DELETE /api/goals/:userGoalId`
**Auth:** User token required

**Response**
```json
{
  "message": "Goal deleted"
}
```

---

## All Goal Types — Required Inputs

### `health_insurance`
```json
{
  "family_size": 4,
  "primary_age": 38,
  "annual_income": 1200000,
  "existing_coverage": 0
}
```

### `term_insurance`
```json
{
  "current_age": 32,
  "annual_income": 1000000,
  "total_liabilities": 4000000,
  "existing_coverage": 0,
  "policy_term": 30
}
```

### `emergency_fund`
```json
{
  "monthly_expenses": 50000,
  "months_coverage": 6
}
```

### `child_education`
```json
{
  "child_age": 3,
  "education_age": 18,
  "current_cost": 10000000
}
```

### `child_marriage`
```json
{
  "child_age": 5,
  "marriage_age": 25,
  "current_cost": 3000000
}
```

### `retirement`
```json
{
  "current_age": 30,
  "retirement_age": 60,
  "monthly_expenses": 50000
}
```

### `home_purchase`
```json
{
  "property_value": 8000000,
  "down_payment_pct": 20,
  "years_to_goal": 5
}
```

---

## Typical Screen Flows

### Goals Home Screen
1. Call `GET /api/goals`
2. Render one card per item in `goals[]`
3. If `isSetup: false` → show name, description, icon + "Set Up" button
4. If `isSetup: true` → show name, icon, `targetAmount` (formatted), `monthlySip` and `status` badge

### Set Up a Goal (new)
1. User taps "Set Up" on a card → you have `templateId` from the home screen response
2. Call `GET /api/goals/templates/:templateId`
3. Render a form dynamically using `template.fields[]`
4. On any input change → call `POST /api/goals/calculate` to show live preview
5. User taps "Save" → call `POST /api/goals`
6. On success → navigate back and refresh `GET /api/goals`

### Edit an Existing Goal
1. User taps a set-up goal card → you have `userGoalId`
2. Call `GET /api/goals/:userGoalId`
3. Render form using `goal.templateId.fields[]` pre-filled with `goal.inputs`
4. On any change → call `POST /api/goals/calculate` for live preview
5. User taps "Update" → call `PATCH /api/goals/:userGoalId`

---

## Error Responses

| Status | When |
|---|---|
| `400` | Missing required fields or invalid inputs |
| `401` | Missing or invalid token |
| `404` | Template or goal not found |
| `500` | Server error |

```json
{ "message": "child_age, education_age, and current_cost are required" }
```
