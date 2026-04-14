"use strict";

const crypto = require("node:crypto");

const ENCRYPTION_ALGORITHM = "aes-256-gcm";
const PASSWORD_ITERATIONS = 310000;
const PASSWORD_KEY_LENGTH = 32;
const PASSWORD_DIGEST = "sha256";

function deriveEncryptionKey(secretKey) {
  return crypto
    .createHash("sha256")
    .update(String(secretKey ?? ""), "utf8")
    .digest();
}

function encryptText(secretKey, plainText) {
  if (!plainText) {
    return "";
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(
    ENCRYPTION_ALGORITHM,
    deriveEncryptionKey(secretKey),
    iv
  );

  const encrypted = Buffer.concat([
    cipher.update(String(plainText), "utf8"),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();

  return JSON.stringify({
    iv: iv.toString("hex"),
    tag: authTag.toString("hex"),
    content: encrypted.toString("hex")
  });
}

function isEncryptedPayload(payload) {
  if (!payload || typeof payload !== "string") {
    return false;
  }

  try {
    const parsed = JSON.parse(payload);
    return Boolean(parsed?.iv && parsed?.tag && parsed?.content);
  } catch (_error) {
    return false;
  }
}

function decryptText(secretKey, payload) {
  if (!payload) {
    return "";
  }

  if (typeof payload === "string" && !isEncryptedPayload(payload)) {
    return payload;
  }

  const parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
  const decipher = crypto.createDecipheriv(
    ENCRYPTION_ALGORITHM,
    deriveEncryptionKey(secretKey),
    Buffer.from(parsed.iv, "hex")
  );
  decipher.setAuthTag(Buffer.from(parsed.tag, "hex"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(parsed.content, "hex")),
    decipher.final()
  ]);

  return decrypted.toString("utf8");
}

function hashPassword(password, salt) {
  return crypto
    .pbkdf2Sync(
      String(password ?? ""),
      String(salt ?? ""),
      PASSWORD_ITERATIONS,
      PASSWORD_KEY_LENGTH,
      PASSWORD_DIGEST
    )
    .toString("hex");
}

function verifyPassword(password, salt, expectedHash) {
  const actualHash = hashPassword(password, salt);
  const expected = String(expectedHash ?? "");

  if (
    actualHash.length !== expected.length ||
    actualHash.length % 2 !== 0 ||
    !/^[\da-f]+$/i.test(actualHash) ||
    !/^[\da-f]+$/i.test(expected)
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(actualHash, "hex"),
    Buffer.from(expected, "hex")
  );
}

module.exports = {
  decryptText,
  encryptText,
  hashPassword,
  isEncryptedPayload,
  verifyPassword
};
