import MfSchemePlan from "../../models/mf/master/mfSchemePlan.model.js";

/* ------------------------------------------------------------------ */
/*  Internal helper — derive min amounts from thresholds array          */
/* ------------------------------------------------------------------ */
const extractThresholdAmounts = (thresholds = []) => {
  const lumpsum    = thresholds.find((t) => t.type === "lumpsum");
  const sipMonthly = thresholds.find((t) => t.type === "sip" && t.frequency === "monthly");
  const sipAny     = thresholds.find((t) => t.type === "sip");

  const sip = sipMonthly || sipAny;

  return {
    min_lumpsum_amount:            lumpsum?.amount_min                   ?? null,
    lumpsum_amount_multiples:      lumpsum?.amount_multiples             ?? null,
    min_sip_amount:                sip?.amount_min                      ?? null,
    sip_amount_multiples:          sip?.amount_multiples                 ?? null,
    min_sip_installments:          sip?.installments_min                 ?? null,
    sip_dates:                     sip?.dates?.length ? sip.dates : null,
  };
};

/* ------------------------------------------------------------------ */
/*  GET /api/mf/basket                                                  */
/*  Lists all active MF schemes available for investment.               */
/*                                                                      */
/*  Query params:                                                       */
/*    ?type=direct|regular                                              */
/*    ?option=growth|idcw                                               */
/*    ?search=<text>   (searches schemeName, fundName, isin)            */
/*    ?fundName=<text> (exact / partial fund name filter)               */
/*    ?page=1  &limit=20                                                */
/* ------------------------------------------------------------------ */
export const listBasket = async (req, res) => {
  try {
    const {
      type,
      option,
      search,
      fundName,
      page  = 1,
      limit = 20,
    } = req.query;

    /* ---------- BUILD FILTER ---------- */
    const filter = { active: true };

    if (type)   filter.type   = type;
    if (option) filter.option = option;

    if (search) {
      const regex = new RegExp(search, "i");
      filter.$or = [
        { schemeName: regex },
        { fundName:   regex },
        { isin:       regex },
      ];
    } else if (fundName) {
      filter.fundName = new RegExp(fundName, "i");
    }

    /* ---------- PAGINATION ---------- */
    const pageNum  = Math.max(1, parseInt(page, 10)  || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip     = (pageNum - 1) * limitNum;

    /* ---------- QUERY ---------- */
    const [schemes, total] = await Promise.all([
      MfSchemePlan.find(filter)
        .sort({ fundName: 1, schemeName: 1 })
        .skip(skip)
        .limit(limitNum),   // include thresholds for amount extraction
      MfSchemePlan.countDocuments(filter),
    ]);

    /* ---------- FORMAT RESPONSE ---------- */
    const data = schemes.map((s) => {
      const amounts = extractThresholdAmounts(s.thresholds);
      return {
        isin:            s.isin,
        fpSchemePlanId:  s.fpSchemePlanId,
        schemeName:      s.schemeName,
        fundName:        s.fundName,
        type:            s.type,       // regular | direct
        option:          s.option,     // growth | idcw
        idcwOption:      s.idcwOption, // payout | reinvestment (null if growth)
        // Investment amounts derived from thresholds
        ...amounts,
      };
    });

    return res.status(200).json({
      success: true,
      total,
      page:      pageNum,
      limit:     limitNum,
      totalPages: Math.ceil(total / limitNum),
      count:     data.length,
      data,
    });
  } catch (err) {
    console.error("❌ [BASKET] List error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  GET /api/mf/basket/:isin                                            */
/*  Get full details of a single scheme by ISIN.                        */
/* ------------------------------------------------------------------ */
export const getSchemeByIsin = async (req, res) => {
  try {
    const isin = req.params.isin?.toUpperCase().trim();

    const scheme = await MfSchemePlan.findOne({ isin, active: true });
    if (!scheme) {
      return res.status(404).json({
        success: false,
        message: `Scheme with ISIN ${isin} not found or inactive`,
      });
    }

    const amounts = extractThresholdAmounts(scheme.thresholds);

    return res.status(200).json({
      success: true,
      data: {
        isin:           scheme.isin,
        fpSchemePlanId: scheme.fpSchemePlanId,
        schemeName:     scheme.schemeName,
        fundName:       scheme.fundName,
        type:           scheme.type,
        option:         scheme.option,
        idcwOption:     scheme.idcwOption,
        ...amounts,
        // Full threshold breakdown (for advanced UI display)
        thresholds:     scheme.thresholds,
        syncedAt:       scheme.syncedAt,
      },
    });
  } catch (err) {
    console.error("❌ [BASKET] Get scheme error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  GET /api/mf/basket/fund-list                                        */
/*  Returns distinct fund names for filter dropdowns on frontend.       */
/* ------------------------------------------------------------------ */
export const listFunds = async (req, res) => {
  try {
    const funds = await MfSchemePlan.distinct("fundName", { active: true, fundName: { $ne: null } });
    funds.sort();

    return res.status(200).json({
      success: true,
      count: funds.length,
      data: funds,
    });
  } catch (err) {
    console.error("❌ [BASKET] Fund list error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};
