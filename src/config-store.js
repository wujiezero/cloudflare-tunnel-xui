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

const CONFIG_PATH = path.resolve(process.cwd(), process.env.CONFIG_PATH || "config.json");
const CONFIG_TEMPLATE_PATH = path.resolve(process.cwd(), "config.example.json");
const SESSION_SECRET_PLACEHOLDER = "replace-this-session-secret-with-a-random-long-string";
const SECRET_KEY_PLACEHOLDERS = new Set([
  "replace-this-encryption-key-with-a-random-long-string",
  "replace-with-a-random-encryption-key"
]);

let didWarnAboutDirectoryConfigPath = false;

async function resolveConfigFilePath() {
  const stat = await fs.stat(CONFIG_PATH).catch((error) => {
    if (error.code === "ENOENT") {
      return null;
    }

    throw error;
  });

  if (stat?.isDirectory()) {
    const nestedConfigPath = path.join(CONFIG_PATH, "config.json");
    if (!didWarnAboutDirectoryConfigPath) {
      console.warn(
        `[config-store] ${CONFIG_PATH} is a directory, using ${nestedConfigPath} as the config file path.`
      );
      didWarnAboutDirectoryConfigPath = true;
    }
    return nestedConfigPath;
  }

  return CONFIG_PATH;
}

async function loadTemplateConfig() {
  const raw = await fs.readFile(CONFIG_TEMPLATE_PATH, "utf8");
  return JSON.parse(raw);
}

async function ensureConfigFile() {
  const configFilePath = await resolveConfigFilePath();
  await fs.mkdir(path.dirname(configFilePath), { recursive: true });

  const exists = await fs.access(configFilePath).then(() => true).catch((error) => {
    if (error.code === "ENOENT") {
      return false;
    }

    throw error;
  });

  if (!exists) {
    const template = await loadTemplateConfig();
    await fs.writeFile(configFilePath, `${JSON.stringify(template, null, 2)}\n`, "utf8");
  }

  return configFilePath;
}

async function readConfig() {
  const configFilePath = await ensureConfigFile();
  const raw = await fs.readFile(configFilePath, "utf8");
  return JSON.parse(raw);
}

async function writeConfig(config) {
  const configFilePath = await ensureConfigFile();
  await fs.writeFile(configFilePath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

async function ensureConfig() {
  const config = await readConfig();

  if (
    !config.auth?.sessionSecret ||
    config.auth.sessionSecret === SESSION_SECRET_PLACEHOLDER
  ) {
    config.auth.sessionSecret = crypto.randomBytes(32).toString("hex");
  }

  if (
    !config.crypto?.secretKey ||
    SECRET_KEY_PLACEHOLDERS.has(config.crypto.secretKey)
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
