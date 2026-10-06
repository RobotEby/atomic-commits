export const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
export const MAX_DIFF_BYTES = 256 * 1024;
// Secret scanning streams the whole file in chunks of this size.
export const SECRET_SCAN_CHUNK_BYTES = 64 * 1024;
// A line longer than this is scanned in pieces (overlapping by SECRET_SCAN_OVERLAP_BYTES).
export const SECRET_SCAN_MAX_LINE_BYTES = 1024 * 1024;
export const SECRET_SCAN_OVERLAP_BYTES = 8 * 1024;
export const DEFAULT_MAX_FILE_SIZE_KB = 2048;
