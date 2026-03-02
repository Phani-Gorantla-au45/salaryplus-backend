import MfJourney from "../../models/mf/mfJourney.model.js";
import { RISK_QUESTIONS, calculateRiskScore } from "../../utils/mf/riskProfile.utils.js";

/* ------------------------------------------------------------------ */
/*  GET /api/mf/risk-profile/questions                                  */
/*  Returns all questions with options for the frontend to render       */
/* ------------------------------------------------------------------ */
export const getQuestions = (_req, res) => {
  return res.status(200).json({
    success: true,
    totalQuestions: RISK_QUESTIONS.length,
    questions: RISK_QUESTIONS,
  });
};

/* ------------------------------------------------------------------ */
/*  POST /api/mf/risk-profile/submit                                    */
/*  Accepts answers, calculates score, stores result, updates journey   */
/* ------------------------------------------------------------------ */
export const submitRiskProfile = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { answers } = req.body;

    if (!Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({
        success: false,
        message: "answers must be a non-empty array",
      });
    }

    /* ---------- CALCULATE SCORE ---------- */
    const result = calculateRiskScore(answers);

    if (!result.valid) {
      return res.status(400).json({
        success: false,
        message: "Invalid answers",
        errors: result.errors,
      });
    }

    const { score, category } = result;

    /* ---------- UPDATE JOURNEY FLAGS ---------- */
    const journey = await MfJourney.findOneAndUpdate(
      { uniqueId },
      {
        $set: {
          "riskProfile.status":      "completed",
          "riskProfile.score":       score,
          "riskProfile.category":    category,
          "riskProfile.answers":     answers,
          "riskProfile.completedAt": new Date(),
        },
      },
      { upsert: true, new: true }
    );

    const categoryLabels = {
      conservative: "Conservative Investor",
      moderate:     "Moderate Investor",
      aggressive:   "Aggressive Investor",
    };

    const categoryDescriptions = {
      conservative: "You prefer capital protection over high returns. Suitable funds: Debt, Liquid, Ultra Short-term.",
      moderate:     "You can accept moderate risk for better returns. Suitable funds: Balanced, Hybrid, Short-term debt.",
      aggressive:   "You are comfortable with high risk for maximum growth. Suitable funds: Equity, Small-cap, Mid-cap.",
    };

    return res.status(200).json({
      success: true,
      score,
      category,
      label:       categoryLabels[category],
      description: categoryDescriptions[category],
      nextStep:    "kyc_check",  // frontend knows what to show next
    });
  } catch (err) {
    console.error("❌ [RISK PROFILE] Submit error:", err.message);
    return res.status(500).json({ success: false, message: "Failed to submit risk profile" });
  }
};

/* ------------------------------------------------------------------ */
/*  GET /api/mf/risk-profile/status                                     */
/*  Returns the user's current risk profile result                      */
/* ------------------------------------------------------------------ */
export const getRiskProfileStatus = async (req, res) => {
  try {
    const { uniqueId } = req.user;

    const journey = await MfJourney.findOne({ uniqueId });

    if (!journey || journey.riskProfile.status === "not_started") {
      return res.status(200).json({
        success: true,
        status:  "not_started",
        message: "Risk profile not completed yet",
      });
    }

    return res.status(200).json({
      success:  true,
      status:   journey.riskProfile.status,
      score:    journey.riskProfile.score,
      category: journey.riskProfile.category,
      completedAt: journey.riskProfile.completedAt,
    });
  } catch (err) {
    console.error("❌ [RISK PROFILE] Status error:", err.message);
    return res.status(500).json({ success: false, message: "Failed to fetch risk profile status" });
  }
};
