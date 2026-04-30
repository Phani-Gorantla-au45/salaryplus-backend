/**
 * Goal calculation service.
 *
 * All formulas use standard personal-finance math:
 *   FV  = PV × (1 + r)^n        — inflation-adjusted future value
 *   SIP = FV × r / ((1+r)^n - 1) — monthly SIP needed (annuity-due style)
 *
 * Rates are assumed annual; we convert to monthly for SIP.
 */

/** Inflation-adjusted future cost of a present value. */
function futureValue(presentValue, annualInflationRate, years) {
  return presentValue * Math.pow(1 + annualInflationRate / 100, years);
}

/** Monthly SIP needed to accumulate a target corpus. */
function monthlySipNeeded(targetCorpus, annualReturnRate, years) {
  const months = years * 12;
  const r = annualReturnRate / 100 / 12; // monthly rate
  if (r === 0) return targetCorpus / months;
  return (targetCorpus * r) / (Math.pow(1 + r, months) - 1);
}

/* ------------------------------------------------------------------ */
/*  Per-goal-type calculators                                           */
/* ------------------------------------------------------------------ */

/**
 * Generic/Custom goal:
 *   inputs: { current_cost, years_to_goal }
 */
function calcStandardGoal(inputs, assumptions) {
  const { current_cost, years_to_goal } = inputs;
  const { inflationRate, returnRate } = assumptions;

  if (!current_cost || !years_to_goal)
    throw new Error("current_cost and years_to_goal are required");

  const fv = futureValue(current_cost, inflationRate, years_to_goal);
  const sip = monthlySipNeeded(fv, returnRate, years_to_goal);

  return {
    targetAmount: Math.round(fv),
    monthlySip: Math.round(sip),
    duration: years_to_goal,
  };
}

/**
 * Child Education:
 *   inputs: { child_age, education_age, current_cost }
 */
function calcChildEducationGoal(inputs, assumptions) {
  const { child_age, education_age, current_cost } = inputs;
  if (child_age == null || !education_age || !current_cost)
    throw new Error("child_age, education_age, and current_cost are required");
  const years_to_goal = education_age - child_age;
  if (years_to_goal <= 0)
    throw new Error("education_age must be greater than child_age");
  return calcStandardGoal({ current_cost, years_to_goal }, assumptions);
}

/**
 * Child Marriage:
 *   inputs: { child_age, marriage_age, current_cost }
 */
function calcChildMarriageGoal(inputs, assumptions) {
  const { child_age, marriage_age, current_cost } = inputs;
  if (child_age == null || !marriage_age || !current_cost)
    throw new Error("child_age, marriage_age, and current_cost are required");
  const years_to_goal = marriage_age - child_age;
  if (years_to_goal <= 0)
    throw new Error("marriage_age must be greater than child_age");
  return calcStandardGoal({ current_cost, years_to_goal }, assumptions);
}

/**
 * Retirement goal:
 *   inputs: { current_age, retirement_age, monthly_expenses }
 */
function calcRetirementGoal(inputs, assumptions) {
  const { current_age, retirement_age, monthly_expenses } = inputs;
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

  const sip = monthlySipNeeded(retirementCorpus, returnRate, yearsToRetirement);

  return {
    targetAmount: Math.round(retirementCorpus),
    monthlySip: Math.round(sip),
    duration: yearsToRetirement,
  };
}

/**
 * Home Purchase:
 *   inputs: { property_value, down_payment_pct, years_to_goal }
 */
function calcHomePurchaseGoal(inputs, assumptions) {
  const { property_value, down_payment_pct, years_to_goal } = inputs;
  const { inflationRate, returnRate } = assumptions;

  if (!property_value || !years_to_goal)
    throw new Error("property_value and years_to_goal are required");

  const pct = down_payment_pct ?? 20;
  const downPayment = (property_value * pct) / 100;
  const fv = futureValue(downPayment, inflationRate, years_to_goal);
  const sip = monthlySipNeeded(fv, returnRate, years_to_goal);

  return {
    targetAmount: Math.round(fv),
    monthlySip: Math.round(sip),
    duration: years_to_goal,
  };
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
const CALCULATORS = {
  health_insurance: calcHealthInsuranceGoal,
  term_insurance: calcTermInsuranceGoal,
  child_education: calcChildEducationGoal,
  child_marriage: calcChildMarriageGoal,
  retirement: calcRetirementGoal,
  home_purchase: calcHomePurchaseGoal,
  emergency_fund: calcEmergencyFundGoal,
  // Any unknown type falls back to standard goal
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
