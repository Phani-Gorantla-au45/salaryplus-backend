import AppVersion from "../../models/app/appVersion.model.js";

/* ------------------------------------------------------------------ */
/*  Helper — compare semver strings "1.2.3"                            */
/*  Returns: -1 if a < b, 0 if equal, 1 if a > b                      */
/* ------------------------------------------------------------------ */
const compareVersions = (a, b) => {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
};

/* ------------------------------------------------------------------ */
/*  GET /api/app/version-check?platform=android&version=1.0.0          */
/*  Called by the app on every launch. No auth required.               */
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
    if (!config) {
      // No config set yet — let the app through
      return res.status(200).json({
        success:     true,
        forceUpdate: false,
        softUpdate:  false,
        message:     null,
        storeUrl:    null,
      });
    }

    const isForceUpdate =
      config.forceUpdate ||
      compareVersions(version, config.minRequiredVersion) < 0;

    const isSoftUpdate =
      !isForceUpdate &&
      compareVersions(version, config.latestVersion) < 0;

    const defaultMessage = isForceUpdate
      ? "A required update is available. Please update the app to continue."
      : "A new version is available. Update now for the best experience.";

    return res.status(200).json({
      success:      true,
      forceUpdate:  isForceUpdate,
      softUpdate:   isSoftUpdate,
      message:      config.updateMessage ?? (isForceUpdate || isSoftUpdate ? defaultMessage : null),
      storeUrl:     config.storeUrl,
      latestVersion: config.latestVersion,
    });
  } catch (err) {
    console.error("❌ [VERSION CHECK] Error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  POST /api/admin/app/version                                         */
/*  Admin — create or update version config for a platform.           */
/*  Body: { platform, minRequiredVersion, latestVersion,               */
/*          forceUpdate?, updateMessage?, storeUrl }                   */
/* ------------------------------------------------------------------ */
export const upsertVersionConfig = async (req, res) => {
  try {
    const {
      platform, minRequiredVersion, latestVersion,
      forceUpdate, updateMessage, storeUrl,
    } = req.body;

    if (!platform || !["ios", "android"].includes(platform)) {
      return res.status(400).json({
        success: false,
        message: "platform must be ios or android",
      });
    }
    if (!minRequiredVersion || !latestVersion || !storeUrl) {
      return res.status(400).json({
        success: false,
        message: "minRequiredVersion, latestVersion, and storeUrl are required",
      });
    }

    const config = await AppVersion.findOneAndUpdate(
      { platform },
      {
        $set: {
          platform,
          minRequiredVersion,
          latestVersion,
          forceUpdate:   forceUpdate   ?? false,
          updateMessage: updateMessage ?? null,
          storeUrl,
          updatedBy:     req.admin?.email ?? req.admin?.id ?? null,
        },
      },
      { upsert: true, new: true }
    );

    return res.status(200).json({
      success: true,
      message: `Version config updated for ${platform}`,
      data:    config,
    });
  } catch (err) {
    console.error("❌ [VERSION CONFIG] Upsert error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ------------------------------------------------------------------ */
/*  GET /api/admin/app/version                                          */
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
