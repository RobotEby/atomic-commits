import { closeSync, openSync, readSync } from "node:fs";
import {
  SECRET_SCAN_CHUNK_BYTES,
  SECRET_SCAN_MAX_LINE_BYTES,
  SECRET_SCAN_OVERLAP_BYTES,
} from "../shared/limits.mjs";

const BINARY_PROBE_BYTES = 8192;
const PRIVATE_KEY_BEGIN = /-----BEGIN [A-Z ]*PRIVATE KEY-----/i;
const PRIVATE_KEY_END = /-----END [A-Z ]*PRIVATE KEY-----/i;

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

/**
 * Scans the entire file (not just a prefix) for secrets. The file is streamed
 * in chunks that are cut at newline boundaries, so memory stays bounded and no
 * match is split across two chunks. Every match of every pattern is checked,
 * so a placeholder value earlier in the file cannot hide a real one later.
 */
export function scanFileForSecrets(absolutePath) {
  const fd = openSync(absolutePath, "r");
  try {
    const read = Buffer.alloc(SECRET_SCAN_CHUNK_BYTES);
    let carry = Buffer.alloc(0);
    let first = true;
    let sawBegin = false;
    let sawEnd = false;

    const scan = (buffer) => {
      const text = buffer.toString("utf8");
      sawBegin ||= PRIVATE_KEY_BEGIN.test(text);
      sawEnd ||= PRIVATE_KEY_END.test(text);
      return findSecret(text);
    };

    while (true) {
      const bytesRead = readSync(fd, read, 0, read.length, null);
      if (bytesRead === 0) {
        break;
      }
      if (first) {
        first = false;
        if (read.subarray(0, Math.min(bytesRead, BINARY_PROBE_BYTES)).includes(0)) {
          return { detected: false };
        }
      }

      let buffer = Buffer.concat([carry, read.subarray(0, bytesRead)]);
      const lastNewline = buffer.lastIndexOf(0x0a);
      if (lastNewline === -1 && buffer.length < SECRET_SCAN_MAX_LINE_BYTES) {
        carry = buffer;
        continue;
      }

      let scanEnd = lastNewline + 1;
      if (lastNewline === -1) {
        // Pathological single line (e.g. minified bundle): scan it in pieces,
        // keeping an overlap so a token on the cut is seen whole next time.
        scanEnd = buffer.length;
        carry = buffer.subarray(Math.max(0, scanEnd - SECRET_SCAN_OVERLAP_BYTES));
      } else {
        carry = buffer.subarray(scanEnd);
      }
      const found = scan(buffer.subarray(0, scanEnd));
      if (found) {
        return found;
      }
      buffer = null;
    }

    if (carry.length > 0) {
      const found = scan(carry);
      if (found) {
        return found;
      }
    }
    if (sawBegin && sawEnd) {
      return { detected: true, reason: "private key block" };
    }
    return { detected: false };
  } finally {
    closeSync(fd);
  }
}

function findSecret(text) {
  for (const secret of SECRET_PATTERNS) {
    const pattern = new RegExp(secret.pattern.source, "g");
    for (const match of text.matchAll(pattern)) {
      const value = secret.valueGroup ? match[secret.valueGroup] : match[0];
      if (!isPlaceholderSecretValue(value)) {
        return { detected: true, reason: secret.name };
      }
    }
  }
  return null;
}

export function isPlaceholderSecretValue(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (!normalized) {
    return true;
  }
  if (normalized.length < 8 || /^[[{(/]/.test(normalized)) {
    return true;
  }
  return PLACEHOLDER_VALUES.some((placeholder) =>
    normalized.includes(placeholder),
  );
}
