/**
 * Goal calculation service.
 *
 * All formulas use standard personal-finance math:
 *   FV  = PV × (1 + r)^n        — inflation-adjusted future value
 *   SIP = FV × r / ((1+r)^n - 1) — monthly SIP needed (annuity-due style)
 *
 * Step-up SIP: SIP amount increases by X% every year.
 *   Calculated iteratively — sum FV of each monthly payment with its step-up factor.
 */

/** Inflation-adjusted future cost of a present value. */
function futureValue(presentValue, annualInflationRate, years) {
  return presentValue * Math.pow(1 + annualInflationRate / 100, years);
}

/** Flat monthly SIP needed to accumulate a target corpus. */
function monthlySipNeeded(targetCorpus, annualReturnRate, years) {
  const months = years * 12;
  const r = annualReturnRate / 100 / 12;
  if (r === 0) return targetCorpus / months;
  return (targetCorpus * r) / (Math.pow(1 + r, months) - 1);
}

/**
 * Initial monthly SIP needed when SIP increases by annualStepUpRate% each year.
 * Uses iterative approach: compute FV of a unit SIP=1 under step-up, then scale.
 *
 * @param {number} targetCorpus
 * @param {number} annualReturnRate  — % p.a. (e.g. 12)
 * @param {number} years
 * @param {number} annualStepUpRate  — % p.a. (e.g. 10)
 * @returns {number} initial monthly SIP
 */
function stepUpSipNeeded(targetCorpus, annualReturnRate, years, annualStepUpRate) {
  if (!annualStepUpRate || annualStepUpRate <= 0)
    return monthlySipNeeded(targetCorpus, annualReturnRate, years);

  const r      = annualReturnRate / 100 / 12; // monthly return rate
  const stepUp = annualStepUpRate / 100;       // annual step-up as decimal
  const totalMonths = years * 12;

  // FV of a step-up SIP of ₹1/month initial, increasing by stepUp% each year
  let fvOfUnitSip = 0;
  let currentSip  = 1;
  for (let year = 0; year < years; year++) {
    for (let month = 0; month < 12; month++) {
      const monthsLeft = totalMonths - (year * 12 + month);
      fvOfUnitSip += currentSip * Math.pow(1 + r, monthsLeft);
    }
    currentSip *= (1 + stepUp);
  }

  return targetCorpus / fvOfUnitSip;
}

/**
 * Monthly SIP needed, annuity-due convention (deposit at START of each
 * month — matches real SIP debit timing). The last deposit still earns one
 * month of growth before the target date, unlike the ordinary-annuity
 * monthlySipNeeded() above (deposit at END of month, last deposit earns none).
 */
function monthlySipNeededDue(targetCorpus, annualReturnRate, years) {
  const months = years * 12;
  const r = annualReturnRate / 100 / 12;
  if (r === 0) return targetCorpus / months;
  return (targetCorpus * r) / ((Math.pow(1 + r, months) - 1) * (1 + r));
}

/**
 * Present value of a growing annuity-due: N cashflows W_1..W_N where
 * W_k = W1 × (1+g)^(k-1), each discounted at rate r, with W_1 undiscounted.
 * This is exactly the "withdraw first, then earn return on what remains"
 * depletion convention — the corpus exactly reaches zero after N withdrawals.
 */
function pvGrowingAnnuityDue(W1, g, r, n) {
  if (n <= 0) return 0;
  if (Math.abs(r - g) < 1e-9) return W1 * n;
  const q = (1 + g) / (1 + r);
  return (W1 * (1 - Math.pow(q, n))) / (1 - q);
}

/**
 * Build the SIP result object — always includes flat SIP.
 * If stepUpRate > 0, also includes stepUpSip (lower initial amount).
 */
function buildSipResult(targetAmount, annualReturnRate, years, stepUpRate) {
  const monthlySip = monthlySipNeeded(targetAmount, annualReturnRate, years);
  const result = { targetAmount, monthlySip: Math.round(monthlySip), duration: years };

  if (stepUpRate > 0) {
    result.stepUpSip  = Math.round(stepUpSipNeeded(targetAmount, annualReturnRate, years, stepUpRate));
    result.stepUpRate = stepUpRate;
  }
  return result;
}

/* ------------------------------------------------------------------ */
/*  Per-goal-type calculators                                           */
/* ------------------------------------------------------------------ */

/**
 * Generic/Custom goal:
 *   inputs: { current_cost, years_to_goal, step_up_rate? }
 */
function calcStandardGoal(inputs, assumptions) {
  const { current_cost, years_to_goal, step_up_rate = 0 } = inputs;
  const { inflationRate, returnRate } = assumptions;

  if (!current_cost || !years_to_goal)
    throw new Error("current_cost and years_to_goal are required");

  const fv = futureValue(current_cost, inflationRate, years_to_goal);
  return buildSipResult(Math.round(fv), returnRate, years_to_goal, step_up_rate);
}

/**
 * Child Education:
 *   inputs: { child_age, education_age, current_cost, step_up_rate? }
 */
function calcChildEducationGoal(inputs, assumptions) {
  const { child_age, education_age, current_cost, step_up_rate = 0 } = inputs;
  if (child_age == null || !education_age || !current_cost)
    throw new Error("child_age, education_age, and current_cost are required");
  const years_to_goal = education_age - child_age;
  if (years_to_goal <= 0)
    throw new Error("education_age must be greater than child_age");
  return calcStandardGoal({ current_cost, years_to_goal, step_up_rate }, assumptions);
}

/**
 * Child Marriage:
 *   inputs: { child_age, marriage_age, current_cost, step_up_rate? }
 */
function calcChildMarriageGoal(inputs, assumptions) {
  const { child_age, marriage_age, current_cost, step_up_rate = 0 } = inputs;
  if (child_age == null || !marriage_age || !current_cost)
    throw new Error("child_age, marriage_age, and current_cost are required");
  const years_to_goal = marriage_age - child_age;
  if (years_to_goal <= 0)
    throw new Error("marriage_age must be greater than child_age");
  return calcStandardGoal({ current_cost, years_to_goal, step_up_rate }, assumptions);
}

/**
 * Retirement goal:
 *   inputs: { current_age, retirement_age, monthly_expenses, step_up_rate? }
 */
function calcRetirementGoal(inputs, assumptions) {
  const { current_age, retirement_age, monthly_expenses, step_up_rate = 0 } = inputs;
  const {
    inflationRate,
    returnRate,
    postRetirementReturn,
    postRetirementYears,
  } = assumptions;

  if (!current_age || !retirement_age || !monthly_expenses)
    throw new Error(
      "current_age, retirement_age, and monthly_expenses are required",
    );

  const yearsToRetirement = retirement_age - current_age;
  if (yearsToRetirement <= 0)
    throw new Error("retirement_age must be greater than current_age");

  // Annual expenses at retirement (inflation-adjusted)
  const annualExpensesAtRetirement = futureValue(
    monthly_expenses * 12,
    inflationRate,
    yearsToRetirement,
  );

  // Corpus needed to sustain post-retirement expenses (present value of annuity)
  const annualPostReturnRate = postRetirementReturn / 100;
  let retirementCorpus;
  if (annualPostReturnRate === 0) {
    retirementCorpus = annualExpensesAtRetirement * postRetirementYears;
  } else {
    retirementCorpus =
      annualExpensesAtRetirement *
      ((1 - Math.pow(1 + annualPostReturnRate, -postRetirementYears)) /
        annualPostReturnRate);
  }

  return buildSipResult(Math.round(retirementCorpus), returnRate, yearsToRetirement, step_up_rate);
}

/**
 * Home Purchase:
 *   inputs: { property_value, down_payment_pct, years_to_goal, step_up_rate? }
 */
function calcHomePurchaseGoal(inputs, assumptions) {
  const { property_value, down_payment_pct, years_to_goal, step_up_rate = 0 } = inputs;
  const { inflationRate, returnRate } = assumptions;

  if (!property_value || !years_to_goal)
    throw new Error("property_value and years_to_goal are required");

  const pct = down_payment_pct ?? 20;
  const downPayment = (property_value * pct) / 100;
  const fv = futureValue(downPayment, inflationRate, years_to_goal);
  return buildSipResult(Math.round(fv), returnRate, years_to_goal, step_up_rate);
}

/**
 * Health Insurance:
 *   inputs: { family_size, primary_age, annual_income, existing_coverage }
 *   targetAmount = recommended sum insured
 *   monthlySip   = estimated monthly premium
 */
function calcHealthInsuranceGoal(inputs) {
  const {
    family_size,
    primary_age,
    annual_income,
    existing_coverage = 0,
  } = inputs;

  if (!family_size || !primary_age || !annual_income)
    throw new Error("family_size, primary_age, and annual_income are required");

  // Recommended coverage: higher of income-based (50% of annual) or per-member (₹5L each)
  const rawRecommended = Math.max(annual_income * 0.5, family_size * 500000);
  // Round up to nearest ₹5L
  const recommendedCoverage = Math.ceil(rawRecommended / 500000) * 500000;

  // Age-based annual premium rate on sum insured
  let premiumRate;
  if (primary_age < 35)
    premiumRate = 0.015; // 1.5%
  else if (primary_age < 45)
    premiumRate = 0.02; // 2.0%
  else premiumRate = 0.03; // 3.0%

  // Family floater costs ~30% more than individual
  const familyMultiplier = family_size > 1 ? 1.3 : 1.0;
  const monthlyPremium =
    (recommendedCoverage * premiumRate * familyMultiplier) / 12;

  return {
    targetAmount: Math.round(recommendedCoverage),
    monthlySip: Math.round(monthlyPremium),
    duration: 1, // renews annually
  };
}

/**
 * Term Insurance:
 *   inputs: { current_age, annual_income, existing_coverage, total_liabilities, policy_term }
 *   targetAmount = recommended life cover
 *   monthlySip   = estimated monthly premium
 */
function calcTermInsuranceGoal(inputs) {
  const {
    current_age,
    annual_income,
    existing_coverage = 0,
    total_liabilities = 0,
    policy_term = 30,
  } = inputs;

  if (!current_age || !annual_income)
    throw new Error("current_age and annual_income are required");

  // Standard income-multiple rule
  let incomeMultiple;
  if (current_age < 35) incomeMultiple = 15;
  else if (current_age < 45) incomeMultiple = 12;
  else incomeMultiple = 10;

  const recommendedCover = annual_income * incomeMultiple + total_liabilities;
  const coverNeeded = Math.max(0, recommendedCover - existing_coverage);

  // Age-based premium factor (base ₹700/month per ₹1 Cr for age 30–35, non-smoker)
  let ageFactor;
  if (current_age < 30) ageFactor = 0.8;
  else if (current_age < 35) ageFactor = 1.0;
  else if (current_age < 40) ageFactor = 1.4;
  else if (current_age < 45) ageFactor = 2.0;
  else ageFactor = 2.8;

  const monthlyPremium = (coverNeeded / 10_000_000) * 700 * ageFactor;

  return {
    targetAmount: Math.round(recommendedCover),
    monthlySip: Math.round(monthlyPremium),
    duration: policy_term,
  };
}

/**
 * Emergency Fund:
 *   inputs: { monthly_expenses, months_coverage }
 */
function calcEmergencyFundGoal(inputs, assumptions) {
  const { monthly_expenses, months_coverage } = inputs;
  const { returnRate } = assumptions;

  if (!monthly_expenses || !months_coverage)
    throw new Error("monthly_expenses and months_coverage are required");

  const targetAmount = monthly_expenses * months_coverage;
  // Default 1 year build-up period for emergency fund
  const years = 2;
  const sip = monthlySipNeeded(targetAmount, returnRate, years);

  return {
    targetAmount: Math.round(targetAmount),
    monthlySip: Math.round(sip),
    duration: years,
  };
}

/* ------------------------------------------------------------------ */
/*  Main entry point                                                    */
/* ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ */
/*  New goal-type calculators (matching goalTypes.config.js inputs)    */
/* ------------------------------------------------------------------ */

/**
 * Retirement (new input shape from goalTypes.config.js)
 * inputs: { monthly_expense, current_age, retirement_age,
 *           pre_retirement_return=12, post_retirement_return=7,
 *           existing_investment=0, existing_investment_return=12, step_up_rate=10 }
 */
/**
 * Retirement — timing-aware cashflow model.
 *
 * Conventions (matches standard retirement-planning portal methodology):
 *  - You retire at the END of retirement_age; first withdrawal is at the
 *    START of (retirement_age + 1).
 *  - Expenses are entered in today's value, inflated for
 *    (retirement_age - current_age) years to reach the first-withdrawal value,
 *    then continue inflating every year through retirement.
 *  - Corpus required = NPV of all retirement withdrawals, "withdraw first,
 *    then earn return on what remains" each year (growing annuity-due).
 *  - Post-tax retirement return = post_retirement_return × (1 - capital_gains_tax_rate).
 *  - SIP assumes deposits at the START of every month from age
 *    (current_age+1) through the last month of retirement_age —
 *    (retirement_age - current_age) × 12 deposits, annuity-due timing.
 *  - You're assumed to live till LIFE_EXPECTANCY_AGE (fixed at 80) regardless
 *    of the chosen retirement age — so the withdrawal period is
 *    (80 - retirement_age) years.
 */
function calcRetirementNew(inputs) {
  const {
    monthly_expense,
    current_age,
    retirement_age,
    inflation                  = 6,
    pre_retirement_return      = 12,
    post_retirement_return     = 7,
    capital_gains_tax_rate     = 12.5,
    existing_investment        = 0,
    existing_investment_return = 12,
    step_up_rate                = 10,
  } = inputs;

  if (!monthly_expense || !current_age || !retirement_age)
    throw new Error("monthly_expense, current_age and retirement_age are required");

  const yearsToRetirement = retirement_age - current_age;
  if (yearsToRetirement <= 0) throw new Error("retirement_age must be greater than current_age");

  const LIFE_EXPECTANCY_AGE = 80;
  const withdrawalYears = LIFE_EXPECTANCY_AGE - retirement_age;
  if (withdrawalYears <= 0) throw new Error(`retirement_age must be less than ${LIFE_EXPECTANCY_AGE}`);

  const inflationDecimal = inflation / 100;

  // Annual expense at the first withdrawal (start of retirement_age + 1),
  // inflated from today's value for (retirement_age - current_age) years.
  const annualExpenseAtFirstWithdrawal =
    monthly_expense * 12 * Math.pow(1 + inflationDecimal, yearsToRetirement);

  // Post-tax retirement return — discount rate for the withdrawal phase.
  const postTaxReturn = (post_retirement_return / 100) * (1 - capital_gains_tax_rate / 100);

  // Corpus required at retirement = NPV of withdrawalYears annual
  // withdrawals (each year's expense grows with inflation), using the
  // "withdraw first, then grow" convention — a growing annuity-due.
  const retirementCorpus = pvGrowingAnnuityDue(
    annualExpenseAtFirstWithdrawal,
    inflationDecimal,
    postTaxReturn,
    withdrawalYears,
  );

  // Subtract future value of existing investment
  const existingInvestmentFV = existing_investment > 0
    ? futureValue(existing_investment, existing_investment_return, yearsToRetirement)
    : 0;

  const additionalCorpusNeeded = Math.max(0, Math.round(retirementCorpus) - Math.round(existingInvestmentFV));

  // SIP — deposits at the start of every month (annuity-due), for
  // (retirement_age - current_age) × 12 months.
  const monthlySip = monthlySipNeededDue(additionalCorpusNeeded, pre_retirement_return, yearsToRetirement);

  const result = {
    targetAmount: additionalCorpusNeeded,
    monthlySip: Math.round(monthlySip),
    duration: yearsToRetirement,
  };

  if (step_up_rate > 0) {
    result.stepUpSip  = Math.round(stepUpSipNeeded(additionalCorpusNeeded, pre_retirement_return, yearsToRetirement, step_up_rate));
    result.stepUpRate = step_up_rate;
  }

  return result;
}

/**
 * Kids Education (new input shape)
 * inputs: { kid_name, education_fee_today, timeline, inflation=10, return_expectation=12, step_up_rate=10 }
 */
function calcKidsEducation(inputs) {
  const {
    education_fee_today,
    timeline,
    inflation        = 10,
    return_expectation = 12,
    step_up_rate     = 10,
  } = inputs;

  if (!education_fee_today || !timeline)
    throw new Error("education_fee_today and timeline are required");

  const fv = futureValue(education_fee_today, inflation, timeline);
  return buildSipResult(Math.round(fv), return_expectation, timeline, step_up_rate);
}

/**
 * Standard cost-based goal (Car, Vacation, Marriage)
 * inputs: { <cost_field>, timeline, inflation=6, return_expectation=12, step_up_rate=10 }
 */
function calcCostGoal(inputs) {
  const {
    car_cost, vacation_budget, wedding_budget,
    timeline,
    inflation          = 6,
    return_expectation = 12,
    step_up_rate       = 10,
  } = inputs;

  const currentCost = car_cost ?? vacation_budget ?? wedding_budget;
  if (!currentCost || !timeline)
    throw new Error("Cost and timeline are required");

  const fv = futureValue(currentCost, inflation, timeline);
  return buildSipResult(Math.round(fv), return_expectation, timeline, step_up_rate);
}

/**
 * Emergency Fund (new input shape)
 * inputs: { monthly_expenses, months_to_save=3, inflation=6, return_expectation=6 }
 */
function calcEmergencyNew(inputs) {
  const {
    monthly_expenses,
    months_to_save     = 3,
    investment_horizon,
    inflation          = 6,
    return_expectation = 6,
    step_up_rate       = 10,
  } = inputs;

  if (!monthly_expenses) throw new Error("monthly_expenses is required");
  if (!investment_horizon) throw new Error("investment_horizon is required");

  // Target = monthly expense inflated to the end of the horizon, × months to save
  const targetAmount = Math.round(futureValue(monthly_expenses, inflation, investment_horizon) * months_to_save);

  return buildSipResult(targetAmount, return_expectation, investment_horizon, step_up_rate);
}

const CALCULATORS = {
  // Legacy calculators (used by GoalTemplate system)
  health_insurance: calcHealthInsuranceGoal,
  term_insurance: calcTermInsuranceGoal,
  child_education: calcChildEducationGoal,
  child_marriage: calcChildMarriageGoal,
  retirement: calcRetirementGoal,
  home_purchase: calcHomePurchaseGoal,
  emergency_fund: calcEmergencyFundGoal,

  // New calculators (used by UserCustomGoal / goalTypes.config.js)
  retirement_new:   calcRetirementNew,
  kids_education:   calcKidsEducation,
  car:              calcCostGoal,
  vacation:         calcCostGoal,
  marriage:         calcCostGoal,
  emergency:        calcEmergencyNew,
};

/**
 * @param {string} goalType  — e.g. "child_education"
 * @param {object} inputs    — user-provided form values
 * @param {object} assumptions — from GoalTemplate.assumptions
 * @returns {{ targetAmount, monthlySip, duration }}
 */
export function calculateGoal(goalType, inputs, assumptions) {
  const calculator = CALCULATORS[goalType] ?? calcStandardGoal;
  return calculator(inputs, assumptions);
}

/**
 * Other / custom user-defined goal
 * inputs: { target_amount_today, timeline, inflation=6, return_expectation=12, step_up_rate=10 }
 */
function calcOtherGoal(inputs) {
  const {
    target_amount_today,
    timeline,
    inflation          = 6,
    return_expectation = 12,
    step_up_rate       = 10,
  } = inputs;

  if (!target_amount_today || !timeline)
    throw new Error("target_amount_today and timeline are required");

  const fv = futureValue(target_amount_today, inflation, timeline);
  return buildSipResult(Math.round(fv), return_expectation, timeline, step_up_rate);
}

/**
 * Calculate for custom goal types (goalTypes.config.js).
 * These calculators derive everything from inputs — no assumptions object needed.
 */
export function calculateCustomGoal(goalType, inputs) {
  const CUSTOM_CALCULATORS = {
    retirement:   calcRetirementNew,
    kids_education: calcKidsEducation,
    car:          calcCostGoal,
    vacation:     calcCostGoal,
    marriage:     calcCostGoal,
    emergency:    calcEmergencyNew,
    other:        calcOtherGoal,
  };
  const calc = CUSTOM_CALCULATORS[goalType];
  if (!calc) throw new Error(`Unknown goal type: ${goalType}`);
  return calc(inputs);
}
