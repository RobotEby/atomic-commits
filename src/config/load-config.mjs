import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { DEFAULT_CONFIG } from "./defaults.mjs";
import { CliError, EXIT } from "../shared/errors.mjs";

export function loadConfig(repoRoot) {
  const configPath = path.join(repoRoot, ".atomiccommitsrc.json");
  if (!existsSync(configPath)) {
    return {};
  }

  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("config root must be an object");
    }
    return parsed;
  } catch (error) {
    throw new CliError(
      `Invalid .atomiccommitsrc.json: ${error.message}`,
      EXIT.invalidArgs,
    );
  }
}

export function mergeOptions(config, parsedArgs) {
  const configOptions = normalizeConfig(config);
  const options = {
    ...DEFAULT_CONFIG,
    ...configOptions,
    ...parsedArgs.flags,
  };

  if (options.language !== "en") {
    throw new CliError(
      "--language currently only supports en. pt-BR is planned but not yet implemented.",
      EXIT.invalidArgs,
    );
  }
  if (!Number.isInteger(options.maxFileSizeKb) || options.maxFileSizeKb <= 0) {
    throw new CliError(
      "maxFileSizeKb must be a positive integer.",
      EXIT.invalidArgs,
    );
  }
  if (options.scope) {
    options.scope = sanitizeScope(String(options.scope));
    options.allowScopes = true;
  }
  options.protectedBranches = Array.isArray(options.protectedBranches)
    ? options.protectedBranches.map(String)
    : DEFAULT_CONFIG.protectedBranches;
  options.ignore = Array.isArray(options.ignore)
    ? options.ignore.map(String)
    : DEFAULT_CONFIG.ignore;
  options.isInteractive = !options.dryRun && !options.check && !options.yes;
  return options;
}

function normalizeConfig(config) {
  const normalized = {};
  for (const key of Object.keys(DEFAULT_CONFIG)) {
    if (Object.hasOwn(config, key)) {
      normalized[key] = config[key];
    }
  }
  return normalized;
}

function sanitizeScope(scope) {
  const cleaned = scope
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (!cleaned) {
    throw new CliError(
      "Scope must contain letters or numbers.",
      EXIT.invalidArgs,
    );
  }
  return cleaned;
}
