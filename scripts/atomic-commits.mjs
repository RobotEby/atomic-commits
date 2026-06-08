#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import { main } from "../src/cli/main.mjs";
import { EXIT } from "../src/shared/errors.mjs";

const isDirectRun =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectRun) {
  main()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      console.error(error.stack || error.message);
      process.exitCode = EXIT.fatal;
    });
}
