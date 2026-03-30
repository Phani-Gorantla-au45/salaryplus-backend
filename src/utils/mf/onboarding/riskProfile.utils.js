/* ------------------------------------------------------------------ */
/*  RISK PROFILE — Questions, Scoring, and Category                    */
/* ------------------------------------------------------------------ */

export const RISK_QUESTIONS = [
  {
    id: 1,
    question: "What is your age group?",
    type: "single",
    options: [
      { id: "A", text: "Above 60 years" },
      { id: "B", text: "45–60 years" },
      { id: "C", text: "30–45 years" },
      { id: "D", text: "Below 30 years" },
    ],
  },
  {
    id: 2,
    question: "How many family members depend on your income?",
    type: "single",
    options: [
      { id: "A", text: "3 or more" },
      { id: "B", text: "2" },
      { id: "C", text: "1" },
      { id: "D", text: "None" },
    ],
  },
  {
    id: 3,
    question: "What is your primary source of income?",
    type: "single",
    options: [
      { id: "A", text: "Irregular income (freelance/business with fluctuations)" },
      { id: "B", text: "Fixed monthly salary" },
      { id: "C", text: "Salary + additional income" },
      { id: "D", text: "Multiple stable income sources" },
    ],
  },
  {
    id: 4,
    question: "Do you have an emergency fund (at least 6 months of expenses saved)?",
    type: "single",
    options: [
      { id: "A", text: "No emergency savings" },
      { id: "B", text: "Less than 3 months of savings" },
      { id: "C", text: "3–6 months of savings" },
      { id: "D", text: "More than 6 months of savings" },
    ],
  },
  {
    id: 5,
    question: "Do you have children?",
    type: "conditional",
    options: [
      { id: "A", text: "Yes" },
      { id: "B", text: "No" },
    ],
    // shown only when answer is "A"
    subQuestion: {
      id: "5b",
      question: "Is your children's education or future fund already planned and invested?",
      type: "single",
      options: [
        { id: "A", text: "No planning yet" },
        { id: "B", text: "Partially planned" },
        { id: "C", text: "Fully planned and invested" },
      ],
    },
  },
  {
    id: 6,
    question: "What is your current housing status?",
    type: "single",
    options: [
      { id: "A", text: "Living in rented house" },
      { id: "B", text: "Own house with loan" },
      { id: "C", text: "Own house without loan" },
    ],
  },
  {
    id: 7,
    question: "Have you started building your retirement portfolio?",
    type: "single",
    options: [
      { id: "A", text: "No" },
      { id: "B", text: "Just started recently" },
      { id: "C", text: "Actively investing for retirement" },
      { id: "D", text: "Retirement portfolio well structured" },
    ],
  },
  {
    id: 8,
    question: "What is your primary purpose of investing now?",
    type: "single",
    options: [
      { id: "A", text: "Short-term savings (within 1 year)" },
      { id: "B", text: "Medium-term goals (1–3 years)" },
      { id: "C", text: "Long-term wealth building (3–7 years)" },
      { id: "D", text: "Long-term wealth creation (7+ years)" },
    ],
  },
  {
    id: 9,
    question: "If your investment falls by 20%, what will you do?",
    type: "single",
    options: [
      { id: "A", text: "Sell immediately" },
      { id: "B", text: "Wait for recovery" },
      { id: "C", text: "Stay invested calmly" },
      { id: "D", text: "Invest more at lower prices" },
    ],
  },
  {
    id: 10,
    question: "How comfortable are you with market ups and downs?",
    type: "single",
    options: [
      { id: "A", text: "I prefer guaranteed returns only" },
      { id: "B", text: "I can tolerate small fluctuations" },
      { id: "C", text: "I can handle moderate volatility" },
      { id: "D", text: "I am comfortable with high volatility for higher returns" },
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  SCORING MAP                                                         */
/* ------------------------------------------------------------------ */
const SCORE_MAP = {
  1: { A: 1, B: 2, C: 3, D: 4 },
  2: { A: 1, B: 2, C: 3, D: 4 },
  3: { A: 1, B: 2, C: 3, D: 4 },
  4: { A: 1, B: 2, C: 3, D: 4 },
  // Q5: handled separately (conditional)
  6: { A: 2, B: 2, C: 4 },
  7: { A: 1, B: 2, C: 3, D: 4 },
  8: { A: 1, B: 2, C: 3, D: 4 },
  9: { A: 1, B: 2, C: 3, D: 4 },
  10: { A: 1, B: 2, C: 3, D: 4 },
};

/* ------------------------------------------------------------------ */
/*  calculateRiskScore                                                   */
/*  answers: [{ questionId: 1, answer: "D" }, ...]                     */
/*  For Q5 with children: { questionId: 5, answer: "A", subAnswer: "C" } */
/* ------------------------------------------------------------------ */
export const calculateRiskScore = (answers) => {
  const errors = [];
  let totalScore = 0;

  const answerMap = {};
  for (const a of answers) {
    answerMap[a.questionId] = a;
  }

  // Validate all 10 questions are present
  const REQUIRED_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  for (const id of REQUIRED_IDS) {
    if (!answerMap[id]) errors.push(`Missing answer for question ${id}`);
  }

  if (errors.length > 0) return { valid: false, errors };

  // Score Q1–Q4, Q6–Q10 using SCORE_MAP
  for (const [qId, optionMap] of Object.entries(SCORE_MAP)) {
    const id = parseInt(qId);
    const ans = answerMap[id];
    const score = optionMap[ans.answer];
    if (score === undefined) {
      errors.push(`Invalid answer '${ans.answer}' for question ${id}`);
    } else {
      totalScore += score;
    }
  }

  // Score Q5 (conditional)
  const q5 = answerMap[5];
  if (q5.answer === "B") {
    // No children → 4 points
    totalScore += 4;
  } else if (q5.answer === "A") {
    // Has children → depends on sub-answer
    if (!q5.subAnswer) {
      errors.push("Question 5: subAnswer required when answer is 'A' (has children)");
    } else {
      const subScoreMap = { A: 1, B: 2, C: 3 };
      const subScore = subScoreMap[q5.subAnswer];
      if (subScore === undefined) {
        errors.push(`Invalid subAnswer '${q5.subAnswer}' for question 5`);
      } else {
        totalScore += subScore;
      }
    }
  } else {
    errors.push(`Invalid answer '${q5.answer}' for question 5`);
  }

  if (errors.length > 0) return { valid: false, errors };

  // Determine category
  let category;
  if (totalScore <= 18)      category = "conservative";
  else if (totalScore <= 28) category = "moderate";
  else                       category = "aggressive";

  return { valid: true, score: totalScore, category };
};
