/**
 * Predefined goal types shown to the user.
 * Each type defines the form fields and default values.
 * The frontend renders the form from this config and does live calculation.
 * The backend uses the same config to validate and calculate server-side.
 */

export const GOAL_TYPES = [
  {
    key:         "retirement",
    label:       "Retirement Planning",
    icon:        "retirement",
    displayOrder: 1,
    fields: [
      { key: "monthly_expense",           label: "Monthly Expense",                  type: "number", unit: "₹",      required: true  },
      { key: "current_age",               label: "Current Age",                      type: "number", unit: "years",  required: true  },
      { key: "retirement_age",            label: "Retirement Age",                   type: "number", unit: "years",  required: true  },
      { key: "inflation",                 label: "Inflation Rate",                   type: "number", unit: "%",      required: false, default: 6   },
      { key: "pre_retirement_return",     label: "Expected Return till Retirement",  type: "number", unit: "%",      required: false, default: 12  },
      { key: "post_retirement_return",    label: "Expected Return in Retirement",    type: "number", unit: "%",      required: false, default: 7   },
      { key: "capital_gains_tax_rate",    label: "Capital Gains Tax Rate",           type: "number", unit: "%",      required: false, default: 12.5},
      { key: "existing_investment",       label: "Existing Investment",              type: "number", unit: "₹",      required: false, default: 0   },
      { key: "existing_investment_return",label: "Existing Investment Return",       type: "number", unit: "%",      required: false, default: 12  },
      { key: "step_up_rate",              label: "Annual Step-up Rate",              type: "number", unit: "%",      required: false, default: 10  },
    ],
  },
  {
    key:         "kids_education",
    label:       "Kids Education",
    icon:        "education",
    displayOrder: 2,
    fields: [
      { key: "kid_name",           label: "Kid's Name",                  type: "text",   unit: null,    required: true  },
      { key: "education_fee_today",label: "Education Fee (Today's Cost)",type: "number", unit: "₹",     required: true  },
      { key: "timeline",           label: "Timeline",                    type: "number", unit: "years", required: true  },
      { key: "inflation",          label: "Inflation Rate",              type: "number", unit: "%",     required: false, default: 10 },
      { key: "return_expectation", label: "Return Expectation",          type: "number", unit: "%",     required: false, default: 12 },
      { key: "step_up_rate",       label: "Annual Step-up Rate",         type: "number", unit: "%",     required: false, default: 10 },
    ],
  },
  {
    key:         "car",
    label:       "Buy a Car",
    icon:        "car",
    displayOrder: 3,
    fields: [
      { key: "car_cost",           label: "Car Cost",           type: "number", unit: "₹",     required: true  },
      { key: "timeline",           label: "Timeline",           type: "number", unit: "years", required: true  },
      { key: "inflation",          label: "Inflation Rate",     type: "number", unit: "%",     required: false, default: 6  },
      { key: "return_expectation", label: "Return Expectation", type: "number", unit: "%",     required: false, default: 12 },
      { key: "step_up_rate",       label: "Annual Step-up Rate",type: "number", unit: "%",     required: false, default: 10 },
    ],
  },
  {
    key:         "vacation",
    label:       "Vacation",
    icon:        "vacation",
    displayOrder: 4,
    fields: [
      { key: "vacation_budget",    label: "Vacation Budget",    type: "number", unit: "₹",     required: true  },
      { key: "timeline",           label: "Timeline",           type: "number", unit: "years", required: true  },
      { key: "inflation",          label: "Inflation Rate",     type: "number", unit: "%",     required: false, default: 6  },
      { key: "return_expectation", label: "Return Expectation", type: "number", unit: "%",     required: false, default: 12 },
      { key: "step_up_rate",       label: "Annual Step-up Rate",type: "number", unit: "%",     required: false, default: 10 },
    ],
  },
  {
    key:         "marriage",
    label:       "Marriage",
    icon:        "marriage",
    displayOrder: 5,
    fields: [
      { key: "wedding_budget",     label: "Wedding Budget",     type: "number", unit: "₹",     required: true  },
      { key: "timeline",           label: "Timeline",           type: "number", unit: "years", required: true  },
      { key: "inflation",          label: "Inflation Rate",     type: "number", unit: "%",     required: false, default: 6  },
      { key: "return_expectation", label: "Return Expectation", type: "number", unit: "%",     required: false, default: 12 },
      { key: "step_up_rate",       label: "Annual Step-up Rate",type: "number", unit: "%",     required: false, default: 10 },
    ],
  },
  {
    key:         "emergency",
    label:       "Emergency Fund",
    icon:        "emergency",
    displayOrder: 6,
    fields: [
      { key: "monthly_expenses",   label: "Current Monthly Expenses",     type: "number", unit: "₹",      required: true  },
      { key: "months_to_save",     label: "Months of Expenses to Save",   type: "number", unit: "months", required: false, default: 3  },
      { key: "investment_horizon", label: "Time to Build This Fund",      type: "number", unit: "years",  required: true  },
      { key: "inflation",          label: "Inflation Rate",               type: "number", unit: "%",      required: false, default: 6  },
      { key: "return_expectation", label: "Return Expectation",           type: "number", unit: "%",      required: false, default: 6  },
      { key: "step_up_rate",       label: "Annual Step-up Rate",          type: "number", unit: "%",      required: false, default: 10 },
    ],
  },
  {
    key:         "other",
    label:       "Other",
    icon:        "other",
    displayOrder: 7,
    fields: [
      { key: "goal_name",          label: "Goal Name",          type: "text",   unit: null,    required: true  },
      { key: "target_amount_today",label: "Target Amount",       type: "number", unit: "₹",     required: true  },
      { key: "timeline",           label: "Timeline",            type: "number", unit: "years", required: true  },
      { key: "inflation",          label: "Inflation Rate",      type: "number", unit: "%",     required: false, default: 6  },
      { key: "return_expectation", label: "Return Expectation",  type: "number", unit: "%",     required: false, default: 12 },
      { key: "step_up_rate",       label: "Annual Step-up Rate", type: "number", unit: "%",     required: false, default: 10 },
    ],
  },
];

export const GOAL_TYPE_KEYS = GOAL_TYPES.map((g) => g.key);

export const getGoalType = (key) => GOAL_TYPES.find((g) => g.key === key) ?? null;
