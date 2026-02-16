import fs from "fs";
import path from "path";
import crypto from "crypto";
import { FlattenedSign } from "jose";

const generateJWS = async (payload, kid) => {
  try {
    const privateKeyPath = process.env.JUSPAY_PRIVATE_KEY;
    if (!privateKeyPath) throw new Error("Private key path missing");

    const pemKey = fs.readFileSync(path.resolve(privateKeyPath), "utf8");

    // ✅ Node handles PKCS#1 natively
    const privateKey = crypto.createPrivateKey({
      key: pemKey,
      format: "pem",
      type: "pkcs1",
    });

    const jws = await new FlattenedSign(
      new TextEncoder().encode(JSON.stringify(payload)),
    )
      .setProtectedHeader({
        alg: "RS256",
        kid,
      })
      .sign(privateKey);

    return jws;
  } catch (err) {
    console.error("❌ JWS ERROR:", err.message);
    throw err;
  }
};

export default generateJWS;
