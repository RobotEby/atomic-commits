import { ALLOWED_TYPES } from "../config/defaults.mjs";

export function limitMessage(message) {
  if (message.length <= 100) {
    return message;
  }
  return message
    .slice(0, 100)
    .replace(/\s+\S*$/, "")
    .replace(/[.,;:!?-]+$/, "");
}

export function ensureUniqueMessage(message, usedMessages, options) {
  let candidate = message;
  let counter = 2;
  while (usedMessages.has(candidate)) {
    const suffix = ` ${counter}`;
    candidate = limitMessage(`${message}${suffix}`);
    counter += 1;
  }
  const validation = validateCommitMessage(candidate, options);
  if (!validation.valid) {
    candidate = fallbackMessage(usedMessages, options);
  }
  usedMessages.add(candidate);
  return candidate;
}

export function fallbackMessage(usedMessages, options) {
  let candidate =
    options.allowScopes && options.scope
      ? `chore(${options.scope}): update project files`
      : "chore: update project files";
  let counter = 2;
  while (usedMessages.has(candidate)) {
    candidate =
      options.allowScopes && options.scope
        ? `chore(${options.scope}): update project files ${counter}`
        : `chore: update project files ${counter}`;
    counter += 1;
  }
  return candidate;
}

export function validateCommitMessage(message, options) {
  const errors = [];
  if (message.length > 100) {
    errors.push("message must be 100 characters or fewer");
  }

  const pattern = options.allowScopes
    ? /^([a-z]+)(?:\(([a-z0-9-]+)\))?: (.+)$/
    : /^([a-z]+): (.+)$/;
  const match = pattern.exec(message);
  if (!match) {
    errors.push(
      options.allowScopes
        ? "message must match <type>[(scope)]: <description>"
        : "message must match <type>: <description>",
    );
    return { valid: false, errors };
  }

  const type = match[1];
  const subject = match[options.allowScopes ? 3 : 2];
  if (!ALLOWED_TYPES.has(type)) {
    errors.push(`unsupported type: ${type}`);
  }
  if (!subject || subject.trim().length < 8) {
    errors.push("description must be descriptive");
  }
  if (isGenericSubject(subject)) {
    errors.push("description is too generic");
  }
  if (/[\r\n]/.test(message)) {
    errors.push("message must be a single line");
  }
  if (!options.allowScopes && /^[a-z]+\([^)]+\): /.test(message)) {
    errors.push("scope is not allowed unless --scope is used");
  }
  return { valid: errors.length === 0, errors };
}

export function isGenericSubject(subject) {
  const normalized = subject.trim().toLowerCase();
  return [
    "update file",
    "fix issue",
    "changes",
    "change",
    "wip",
    "misc",
    "updates",
    "update files",
  ].includes(normalized);
}
