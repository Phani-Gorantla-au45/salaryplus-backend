import AppVersion from "../../models/app/appVersion.model.js";

/* ------------------------------------------------------------------ */
/*  GET /api/app/version-check?platform=android&version=1.0.4          */
/*  Called by the app on every launch. No auth required.               */
/*                                                                      */
/*  Logic: if app version != configured latestVersion → notify user.   */
/*    forceUpdate=true  → must update before using the app             */
/*    forceUpdate=false → soft nudge, can dismiss                      */
/* ------------------------------------------------------------------ */
export const checkVersion = async (req, res) => {
  try {
    const { platform, version } = req.query;

    if (!platform || !["ios", "android"].includes(platform)) {
      return res.status(400).json({
        success: false,
        message: "platform must be ios or android",
      });
    }
    if (!version) {
      return res.status(400).json({
        success: false,
        message: "version is required (e.g. 1.2.0)",
      });
    }

    const config = await AppVersion.findOne({ platform });

    // No config set yet, or check explicitly disabled — let all users through
    if (!config || config.disabled) {
      return res.status(200).json({
        success:        true,
        updateRequired: false,
        forceUpdate:    false,
        softUpdate:     false,
        latestVersion:  config?.latestVersion ?? null,
        storeUrl:       config?.storeUrl ?? null,
        message:        null,
      });
    }

    const isOutdated = version.trim() !== config.latestVersion.trim();

    const forceUpdate = isOutdated && config.forceUpdate;
    const softUpdate  = isOutdated && !config.forceUpdate;

    const defaultMessage = forceUpdate
      ? "A required update is available. Please update the app to continue."
      : "A new version is available. Update now for the best experience.";

    return res.status(200).json({
      success:        true,
      updateRequired: isOutdated,
      forceUpdate,
      softUpdate,
      latestVersion:  config.latestVersion,
      storeUrl:       config.storeUrl ?? null,
      message:        isOutdated
                        ? (config.updateMessage ?? defaultMessage)
                        : null,
    });
  } catch (err) {
    console.error("❌ [VERSION CHECK] Error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  POST /api/app/admin/version                                         */
/*  Admin — set the current latest version for a platform.             */
/*                                                                      */
/*  Body: {                                                             */
/*    platform:      "android" | "ios"     (required)                  */
/*    version:       "1.0.5"               (required — new latest)     */
/*    forceUpdate:   true | false          (required)                  */
/*    storeUrl?:     "https://..."         (optional, keep if omitted) */
/*    updateMessage?: "..."               (optional)                   */
/*  }                                                                   */
/* ------------------------------------------------------------------ */
export const upsertVersionConfig = async (req, res) => {
  try {
    const { platform, version, forceUpdate, storeUrl, updateMessage, disabled } = req.body;

    if (!platform || !["ios", "android"].includes(platform)) {
      return res.status(400).json({
        success: false,
        message: "platform must be ios or android",
      });
    }
    if (!version) {
      return res.status(400).json({
        success: false,
        message: "version is required (e.g. 1.0.5)",
      });
    }
    if (forceUpdate === undefined || forceUpdate === null) {
      return res.status(400).json({
        success: false,
        message: "forceUpdate (true or false) is required",
      });
    }

    // Build update — only overwrite storeUrl if explicitly provided
    const setFields = {
      platform,
      latestVersion: version.trim(),
      forceUpdate:   Boolean(forceUpdate),
      updatedBy:     req.admin?.email ?? req.admin?.id ?? null,
    };
    if (updateMessage !== undefined) setFields.updateMessage = updateMessage ?? null;
    if (storeUrl      !== undefined) setFields.storeUrl      = storeUrl      ?? null;
    if (disabled      !== undefined) setFields.disabled      = Boolean(disabled);

    const config = await AppVersion.findOneAndUpdate(
      { platform },
      { $set: setFields },
      { upsert: true, new: true }
    );

    return res.status(200).json({
      success: true,
      message: `Version config updated for ${platform}`,
      data: {
        platform:      config.platform,
        latestVersion: config.latestVersion,
        disabled:      config.disabled,
        forceUpdate:   config.forceUpdate,
        storeUrl:      config.storeUrl,
        updateMessage: config.updateMessage,
        updatedAt:     config.updatedAt,
      },
    });
  } catch (err) {
    console.error("❌ [VERSION CONFIG] Upsert error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  GET /api/app/admin/version                                          */
/*  Admin — view current config for all platforms.                     */
/* ------------------------------------------------------------------ */
export const getVersionConfigs = async (req, res) => {
  try {
    const configs = await AppVersion.find().sort({ platform: 1 });
    return res.status(200).json({ success: true, data: configs });
  } catch (err) {
    console.error("❌ [VERSION CONFIG] Get error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};
