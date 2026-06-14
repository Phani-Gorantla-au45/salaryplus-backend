import { v2 as cloudinary } from "cloudinary";

// Config is applied lazily inside the function — dotenv must load before
// this is called, but ES module hoisting means top-level config() fires
// before dotenv.config() in server.js, leaving env vars undefined.
const configureCloudinary = () => {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey    = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    console.error("❌ [Cloudinary] Missing env vars:", {
      CLOUDINARY_CLOUD_NAME: cloudName ?? "MISSING",
      CLOUDINARY_API_KEY:    apiKey    ?? "MISSING",
      CLOUDINARY_API_SECRET: apiSecret ? "set" : "MISSING",
    });
    throw new Error("Cloudinary credentials not configured. Check CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET in .env");
  }

  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
};

/**
 * Upload a file buffer to Cloudinary.
 * Returns { url, publicId }.
 */
export const uploadToCloudinary = (buffer, { folder, resourceType = "auto" } = {}) => {
  configureCloudinary();

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: resourceType },
      (error, result) => {
        if (error) {
          console.error("❌ [Cloudinary] Upload failed:", error.message);
          return reject(new Error(error.message));
        }
        console.log(`✅ [Cloudinary] Uploaded → ${result.secure_url}`);
        resolve({ url: result.secure_url, publicId: result.public_id });
      },
    );
    stream.end(buffer);
  });
};
