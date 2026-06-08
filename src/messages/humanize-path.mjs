import path from "node:path";
import { LOCKFILES } from "../config/defaults.mjs";

export function humanizePath(filePath) {
  const category = inferCategory(filePath);
  const base = path.posix.basename(filePath).replace(/\.[^.]+$/, "");
  const name = base
    .replace(/^index$/i, path.posix.basename(path.posix.dirname(filePath)))
    .replace(/[-_.]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .trim();

  if (!name || ["readme", "package", "config"].includes(name)) {
    return category;
  }
  if (category && !name.includes(category)) {
    return `${name} ${category}`;
  }
  return name;
}

export function inferCategory(filePath) {
  const lower = filePath.toLowerCase();
  if (lower.includes("/auth") || lower.includes("auth"))
    return "authentication";
  if (lower.includes("/api") || lower.includes("api")) return "API";
  if (
    lower.includes("database") ||
    lower.includes("/db") ||
    lower.includes("migration") ||
    lower.includes("schema")
  )
    return "database";
  if (lower.includes("component")) return "component";
  if (lower.includes("/page") || lower.includes("/pages/")) return "page";
  if (lower.includes("/route") || lower.includes("/routes/")) return "route";
  if (lower.includes("/service") || lower.includes("/services/"))
    return "service";
  if (lower.includes("/hook") || lower.includes("/hooks/")) return "hook";
  if (lower.includes("/util") || lower.includes("/utils/")) return "utility";
  if (lower.includes("security")) return "security";
  if (isDocsPath(filePath)) return "project";
  if (isTestPath(filePath)) return "project";
  if (isCiPath(filePath)) return "project";
  if (isBuildPath(filePath)) return "project";
  if (isConfigPath(filePath)) return "project";
  return (
    humanizeSegment(path.posix.basename(path.posix.dirname(filePath))) ||
    "project"
  );
}

export function humanizeSegment(segment) {
  if (!segment || segment === "." || segment === "/") {
    return "";
  }
  return segment.replace(/[-_.]+/g, " ").toLowerCase();
}

export function isDocsPath(filePath) {
  const lower = filePath.toLowerCase();
  return (
    lower === "readme.md" ||
    lower.startsWith("docs/") ||
    /\.(md|mdx|rst|adoc|txt)$/i.test(lower)
  );
}

export function isTestPath(filePath) {
  const lower = filePath.toLowerCase();
  return (
    lower.includes("/test/") ||
    lower.includes("/tests/") ||
    lower.includes("__tests__") ||
    /\.(test|spec)\.[cm]?[jt]sx?$/i.test(lower)
  );
}

export function isCiPath(filePath) {
  const lower = filePath.toLowerCase();
  return (
    lower.startsWith(".github/workflows/") ||
    lower.includes("/workflows/") ||
    lower.includes("gitlab-ci") ||
    lower.includes("circleci") ||
    lower.includes("jenkins")
  );
}

export function isBuildPath(filePath) {
  const lower = filePath.toLowerCase();
  const base = path.posix.basename(filePath);
  return (
    isDockerFile(base) ||
    lower.includes("docker") ||
    lower.includes("makefile") ||
    lower.endsWith("package.json") ||
    LOCKFILES.has(base)
  );
}

export function isConfigPath(filePath) {
  const lower = filePath.toLowerCase();
  const base = path.posix.basename(lower);
  return (
    base.startsWith(".") ||
    /\.(json|yaml|yml|toml|ini|conf|config|rc)$/i.test(lower) ||
    lower.includes("config")
  );
}

export function isStylePath(filePath) {
  return /\.(css|scss|sass|less|styl)$/i.test(filePath);
}

export function isSecurityPath(filePath) {
  return filePath.toLowerCase().includes("security");
}

export function isDockerFile(fileName) {
  return (
    fileName === "Dockerfile" ||
    fileName === "docker-compose.yml" ||
    fileName === "docker-compose.yaml" ||
    fileName.startsWith("Dockerfile.")
  );
}
