# Planner Checklist

Use this checklist before medium or large changes.

- Read `AGENTS.md` and `.codex/memory/repo-map.md`.
- If continuing work, read `.codex/memory/current-state.md`.
- Identify the smallest touched surface: UI, calculations, storage, validation, tests, docs, or dependencies.
- For Expo/RN work, read `.codex/rules/expo-v56.md` and the linked Expo SDK 56 docs before editing.
- Name the likely files to inspect before making changes.
- Decide verification commands before implementation, usually `npm.cmd test`.
- Plan summary updates only if the change affects architecture, workflow, dependencies, or durable decisions.
