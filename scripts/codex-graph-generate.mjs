#!/usr/bin/env node

import { mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontendRoot = resolve(projectRoot, "frontend");
const indexPath = resolve(projectRoot, ".codex/graph/frontend-dependencies.json");
const cruiserPath = resolve(projectRoot, "node_modules/dependency-cruiser/bin/dependency-cruiser.mjs");

mkdirSync(dirname(indexPath), { recursive: true });

const result = spawnSync(
  process.execPath,
  [
    cruiserPath,
    "--no-config",
    "--ts-config",
    "tsconfig.json",
    "--output-type",
    "json",
    "--output-to",
    indexPath,
    "src",
  ],
  {
    cwd: frontendRoot,
    stdio: "inherit",
    windowsHide: true,
  },
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);
