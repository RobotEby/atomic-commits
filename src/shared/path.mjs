import path from "node:path";

export function normalizePath(filePath) {
  return filePath.split(path.sep).join("/");
}
