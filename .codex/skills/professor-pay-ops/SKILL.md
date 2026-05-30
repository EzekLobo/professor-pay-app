---
name: professor-pay-ops
description: Repo-local operational guidance for Codex work in professor-pay-app / AulaPay. Use when working in this Expo SDK 56 repository, optimizing token use with repo memory, planning or reviewing changes, using role checklists, preserving AGENTS.md rules, or updating Codex summaries.
---

# Professor Pay Ops

## Overview

Use the repo-local `.codex/` files as progressive context for AulaPay work. Load only the files needed for the task instead of re-reading the whole project.

## Workflow

1. Start with `AGENTS.md`.
2. For broad orientation, read `.codex/memory/repo-map.md`.
3. For resumed or stateful work, read `.codex/memory/current-state.md`.
4. For Expo or React Native changes, read `.codex/rules/expo-v56.md` and consult the linked Expo SDK 56 docs before editing.
5. For planning, reviewing, or Expo validation, use the matching checklist in `.codex/agents/`.

## Updating Memory

- Update `.codex/memory/current-state.md` after meaningful structural, dependency, workflow, or product-state changes.
- Add to `.codex/memory/decisions.md` only when a decision is likely to matter in a future session.
- Keep updates short, factual, and navigational.
- Do not summarize `node_modules`, generated outputs, lockfile internals, or raw test dumps.

## Verification Defaults

- Install dependencies with `npm.cmd install`.
- Check packages with `npm.cmd ls --depth=0`.
- Run tests with `npm.cmd test`.
- Use `npx expo install` for Expo SDK packages.
