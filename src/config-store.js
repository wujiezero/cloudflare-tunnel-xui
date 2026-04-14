"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const {
  decryptText,
  encryptText,
  hashPassword,
  isEncryptedPayload
} = require("./crypto-utils");

const CONFIG_PATH = path.resolve(process.cwd(), "config.json");

async function readConfig() {
  const raw = await fs.readFile(CONFIG_PATH, "utf8");
  return JSON.parse(raw);
}

async function writeConfig(config) {
  await fs.writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

async function ensureConfig() {
  const config = await readConfig();

  if (
    !config.auth?.sessionSecret ||
    config.auth.sessionSecret === "replace-this-session-secret-with-a-random-long-string"
  ) {
    config.auth.sessionSecret = crypto.randomBytes(32).toString("hex");
  }

  if (
    !config.crypto?.secretKey ||
    config.crypto.secretKey === "replace-this-encryption-key-with-a-random-long-string"
  ) {
    config.crypto = config.crypto || {};
    config.crypto.secretKey = crypto.randomBytes(32).toString("hex");
  }

  config.cloudflare = config.cloudflare || {};
  config.cloudflared = config.cloudflared || {};
  config.auth = config.auth || {};
  config.server = config.server || {};

  delete config.cloudflared.runToken;
  delete config.cloudflared.metricsPort;

  if (config.cloudflare.encryptedAccountId && !isEncryptedPayload(config.cloudflare.encryptedAccountId)) {
    config.cloudflare.encryptedAccountId = encryptText(
      config.crypto.secretKey,
      config.cloudflare.encryptedAccountId
    );
  }

  if (config.cloudflare.encryptedApiToken && !isEncryptedPayload(config.cloudflare.encryptedApiToken)) {
    config.cloudflare.encryptedApiToken = encryptText(
      config.crypto.secretKey,
      config.cloudflare.encryptedApiToken
    );
  }

  if (config.cloudflare.accountId && !config.cloudflare.encryptedAccountId) {
    config.cloudflare.encryptedAccountId = encryptText(
      config.crypto.secretKey,
      config.cloudflare.accountId
    );
    delete config.cloudflare.accountId;
  }

  await writeConfig(config);
  return config;
}

async function getPublicConfig() {
  const config = await readConfig();
  const accountId = config.cloudflare?.encryptedAccountId
    ? decryptText(config.crypto.secretKey, config.cloudflare.encryptedAccountId)
    : config.cloudflare?.accountId || "";
  const tokenConfigured = Boolean(config.cloudflare?.encryptedApiToken);

  return {
    server: config.server,
    auth: {
      username: config.auth?.username || ""
    },
    cloudflare: {
      accountId,
      tokenConfigured,
      maskedToken: tokenConfigured ? "********" : ""
    },
    cloudflared: {
      binaryPath: config.cloudflared?.binaryPath || "./bin/cloudflared",
      metricsHost: config.cloudflared?.metricsHost || "127.0.0.1"
    }
  };
}

async function getCloudflareCredentials() {
  const config = await readConfig();
  return {
    accountId: config.cloudflare?.encryptedAccountId
      ? decryptText(config.crypto.secretKey, config.cloudflare.encryptedAccountId)
      : config.cloudflare?.accountId || "",
    apiToken: config.cloudflare?.encryptedApiToken
      ? decryptText(config.crypto.secretKey, config.cloudflare.encryptedApiToken)
      : ""
  };
}

async function updateCloudflareCredentials({ accountId, apiToken }) {
  const config = await readConfig();
  if (typeof accountId === "string" && accountId.trim()) {
    config.cloudflare.encryptedAccountId = encryptText(
      config.crypto.secretKey,
      accountId.trim()
    );
    delete config.cloudflare.accountId;
  }

  if (typeof apiToken === "string" && apiToken.trim()) {
    config.cloudflare.encryptedApiToken = encryptText(
      config.crypto.secretKey,
      apiToken.trim()
    );
  }

  await writeConfig(config);
}

async function updateAuthPassword(newPassword) {
  const config = await readConfig();
  config.auth.passwordSalt = crypto.randomBytes(16).toString("hex");
  config.auth.passwordHash = hashPassword(newPassword, config.auth.passwordSalt);
  await writeConfig(config);
}

module.exports = {
  CONFIG_PATH,
  ensureConfig,
  getCloudflareCredentials,
  getPublicConfig,
  readConfig,
  updateAuthPassword,
  updateCloudflareCredentials,
  writeConfig
};
