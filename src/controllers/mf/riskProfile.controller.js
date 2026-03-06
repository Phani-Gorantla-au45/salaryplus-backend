import MfUserData from "../../models/mf/mfUserData.model.js";
import { RISK_QUESTIONS, calculateRiskScore } from "../../utils/mf/riskProfile.utils.js";

/* ------------------------------------------------------------------ */
/*  GET /api/mf/risk-profile/questions                                  */
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
/* ------------------------------------------------------------------ */
export const submitRiskProfile = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const { answers }  = req.body;

    if (!Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({
        success: false,
        message: "answers must be a non-empty array",
      });
    }

    const result = calculateRiskScore(answers);

    if (!result.valid) {
      return res.status(400).json({
        success: false,
        message: "Invalid answers",
        errors:  result.errors,
      });
    }

    const { score, category } = result;

    await MfUserData.findOneAndUpdate(
      { uniqueId },
      {
        $set: {
          "journey.riskProfile.status":      "completed",
          "journey.riskProfile.score":       score,
          "journey.riskProfile.category":    category,
          "journey.riskProfile.answers":     answers,
          "journey.riskProfile.completedAt": new Date(),
        },
      },
      { upsert: true }
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
      success:     true,
      score,
      category,
      label:       categoryLabels[category],
      description: categoryDescriptions[category],
      nextStep:    "kyc_check",
    });
  } catch (err) {
    console.error("❌ [RISK PROFILE] Submit error:", err.message);
    return res.status(500).json({ success: false, message: "Failed to submit risk profile" });
  }
};

/* ------------------------------------------------------------------ */
/*  GET /api/mf/risk-profile/status                                     */
/* ------------------------------------------------------------------ */
export const getRiskProfileStatus = async (req, res) => {
  try {
    const { uniqueId } = req.user;
    const record = await MfUserData.findOne({ uniqueId });
    const rp     = record?.journey?.riskProfile;

    if (!rp || rp.status === "not_started") {
      return res.status(200).json({
        success: true,
        status:  "not_started",
        message: "Risk profile not completed yet",
      });
    }

    return res.status(200).json({
      success:     true,
      status:      rp.status,
      score:       rp.score,
      category:    rp.category,
      completedAt: rp.completedAt,
    });
  } catch (err) {
    console.error("❌ [RISK PROFILE] Status error:", err.message);
    return res.status(500).json({ success: false, message: "Failed to fetch risk profile status" });
  }
};
