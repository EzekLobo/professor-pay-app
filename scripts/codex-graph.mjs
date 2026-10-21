#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const indexPath = resolve(".codex/graph/frontend-dependencies.json");
const query = process.argv.slice(2).join(" ").trim();

if (query === "--help" || query === "-h") {
  console.log(`Uso:
  npm run codex:graph:generate
  npm run codex:graph -- <arquivo-ou-parte-do-nome>

Exemplo:
  npm run codex:graph -- corrections-page.tsx`);
  process.exit(0);
}

if (!query) {
  console.error("Informe um arquivo ou parte do nome. Ex.: npm run codex:graph -- corrections-page.tsx");
  process.exit(1);
}

if (!existsSync(indexPath)) {
  console.error("Índice local não encontrado. Gere-o com: npm run codex:graph:generate");
  process.exit(1);
}

const report = JSON.parse(readFileSync(indexPath, "utf8"));
const modules = Array.isArray(report.modules) ? report.modules : [];
const normalizedQuery = query.replaceAll("\\", "/").toLowerCase();
const matches = modules.filter((module) => module.source.toLowerCase().includes(normalizedQuery));

if (matches.length === 0) {
  console.error(`Nenhum arquivo no grafo corresponde a "${query}".`);
  process.exit(1);
}

if (matches.length > 1) {
  console.error(`A busca por "${query}" encontrou mais de um arquivo:`);
  for (const module of matches) console.error(`  - ${module.source}`);
  console.error("Use uma parte mais específica do caminho.");
  process.exit(1);
}

const selected = matches[0];
const dependencies = Array.isArray(selected.dependencies) ? selected.dependencies : [];
const dependents = modules.filter((module) =>
  Array.isArray(module.dependencies) && module.dependencies.some((dependency) => dependency.resolved === selected.source),
);

function dependencyLabel(dependency) {
  return dependency.resolved ?? dependency.module ?? "(import não resolvido)";
}

function printList(title, entries) {
  console.log(`\n${title} (${entries.length})`);
  if (entries.length === 0) {
    console.log("  (nenhum)");
    return;
  }

  for (const entry of entries) console.log(`  - ${entry}`);
}

console.log(`Arquivo: ${selected.source}`);
const internalDependencies = dependencies.filter(
  (dependency) => !dependency.resolved || dependency.resolved.startsWith("src/"),
);
printList("Dependências diretas", internalDependencies.map(dependencyLabel));
printList("Dependentes diretos", dependents.map((module) => module.source));
