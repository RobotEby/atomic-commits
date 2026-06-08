import { TEXT_SCAN_BYTES } from "../shared/limits.mjs";
import { readFileChunk } from "./binary.mjs";

const SECRET_PATTERNS = [
  { name: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  {
    name: "GitHub token",
    pattern: /\b(?:ghp|gho|ghu|ghs)_[A-Za-z0-9_]{20,}\b/,
  },
  {
    name: "GitHub fine-grained token",
    pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  },
  { name: "Slack token", pattern: /\bxox[bp]-[A-Za-z0-9-]{20,}\b/ },
  {
    name: "JWT-like token",
    pattern:
      /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  },
  {
    name: "credential assignment",
    pattern:
      /\b(?:PASSWORD|PASSWD|SECRET|TOKEN|API_KEY|PRIVATE_KEY|DATABASE_URL|DB_URL|JWT_SECRET|ACCESS_TOKEN|REFRESH_TOKEN)\b\s*[:=]\s*['"]?([^'"\s#]+)['"]?/,
    valueGroup: 1,
  },
];

const PLACEHOLDER_VALUES = [
  "example",
  "placeholder",
  "changeme",
  "change-me",
  "your_key",
  "your-key",
  "your_token",
  "your-token",
  "localhost",
  "127.0.0.1",
  "process.env",
  "test-",
  "dev-",
  "dummy",
  "mock",
  "<",
  "${",
];

export function scanFileForSecrets(absolutePath) {
  const buffer = readFileChunk(absolutePath, TEXT_SCAN_BYTES);
  if (buffer.includes(0)) {
    return { detected: false };
  }

  const text = buffer.toString("utf8");
  if (
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/i.test(text) &&
    /-----END [A-Z ]*PRIVATE KEY-----/i.test(text)
  ) {
    return { detected: true, reason: "private key block" };
  }

  for (const secret of SECRET_PATTERNS) {
    const match = secret.pattern.exec(text);
    if (!match) {
      continue;
    }
    const value = secret.valueGroup ? match[secret.valueGroup] : match[0];
    if (isPlaceholderSecretValue(value)) {
      continue;
    }
    return { detected: true, reason: secret.name };
  }

  return { detected: false };
}

export function isPlaceholderSecretValue(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (!normalized) {
    return true;
  }
  if (normalized.length < 8 || /^[\[{(/]/.test(normalized)) {
    return true;
  }
  return PLACEHOLDER_VALUES.some((placeholder) =>
    normalized.includes(placeholder),
  );
}
