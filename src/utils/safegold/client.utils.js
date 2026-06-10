import axios from "axios";
import { encryptPayload, decryptResponse } from "./encryption.utils.js";

const getBaseUrl = () => {
  const url = process.env.SAFEGOLD_BASE_URL;
  if (!url) throw new Error("SAFEGOLD_BASE_URL is not set in environment");
  return url.replace(/\/$/, ""); // strip trailing slash
};

const getAuthHeader = () => {
  const token = process.env.SAFEGOLD_ACCESS_TOKEN;
  if (!token) throw new Error("SAFEGOLD_ACCESS_TOKEN is not set in environment");
  return { Authorization: `Bearer ${token}` };
};

/**
 * POST to SafeGold — auto-encrypts body, auto-decrypts response.
 * @param {string} path   e.g. "/v1/users"
 * @param {object} body   plain JS object — will be encrypted before sending
 * @returns {object}      decrypted response body
 */
export const safegoldPost = async (path, body) => {
  const url       = `${getBaseUrl()}${path}`;
  const encrypted = encryptPayload(body);

  console.log(`[SAFEGOLD] POST ${url}`);

  const response = await axios.post(url, encrypted, {
    headers: {
      ...getAuthHeader(),
      "Content-Type": "application/json",
      Accept:         "application/json",
    },
  });

  // SafeGold returns { data: "<cipher>" } on success
  // or plain { error, code } on failure (not encrypted)
  if (response.data?.data) {
    return decryptResponse(response.data.data);
  }
  return response.data; // pass-through for non-encrypted error shapes
};

/**
 * GET from SafeGold — auto-decrypts response.
 * @param {string} path   e.g. "/v1/users/42"
 * @param {object} params optional query params
 * @returns {object}      decrypted response body
 */
export const safegoldGet = async (path, params = {}) => {
  const url = `${getBaseUrl()}${path}`;

  console.log(`[SAFEGOLD] GET ${url}`);

  const response = await axios.get(url, {
    headers: {
      ...getAuthHeader(),
      Accept: "application/json",
    },
    params,
  });

  if (response.data?.data) {
    return decryptResponse(response.data.data);
  }
  return response.data;
};

/**
 * PUT to SafeGold — auto-encrypts body, auto-decrypts response.
 */
export const safegoldPut = async (path, body) => {
  const url       = `${getBaseUrl()}${path}`;
  const encrypted = encryptPayload(body);

  console.log(`[SAFEGOLD] PUT ${url}`);

  const response = await axios.put(url, encrypted, {
    headers: {
      ...getAuthHeader(),
      "Content-Type": "application/json",
      Accept:         "application/json",
    },
  });

  if (response.data?.data) {
    return decryptResponse(response.data.data);
  }
  return response.data;
};
