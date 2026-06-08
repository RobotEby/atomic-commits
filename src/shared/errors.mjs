export const EXIT = {
  success: 0,
  fatal: 1,
  safety: 2,
  invalidArgs: 3,
  noFiles: 4,
};

export class CliError extends Error {
  constructor(message, exitCode = EXIT.fatal) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}
