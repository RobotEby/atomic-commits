import { readFileSync } from "node:fs";
import path from "node:path";

const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".pdf",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".mp3",
  ".mp4",
  ".mov",
  ".avi",
  ".wasm",
  ".class",
]);

export function isBinaryFile(absolutePath) {
  const extension = path.extname(absolutePath).toLowerCase();
  if (BINARY_EXTENSIONS.has(extension)) {
    return true;
  }

  const buffer = readFileChunk(absolutePath, 8192);
  if (buffer.includes(0)) {
    return true;
  }

  let suspicious = 0;
  for (const byte of buffer) {
    if (byte < 7 || (byte > 14 && byte < 32)) {
      suspicious += 1;
    }
  }
  return buffer.length > 0 && suspicious / buffer.length > 0.3;
}

export function readFileChunk(absolutePath, limit) {
  const buffer = readFileSync(absolutePath);
  return buffer.length > limit ? buffer.subarray(0, limit) : buffer;
}
