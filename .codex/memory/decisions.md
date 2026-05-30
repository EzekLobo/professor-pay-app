# Decisions

## 2026-05-28 - Repo-local Codex operational memory

- Decision: Keep the summarization system inside `.codex/` in this repo instead of installing a global Codex skill.
- Reason: The workflow should be portable with the project and avoid hidden user-machine state.
- Affected areas: `AGENTS.md`, `.codex/memory/`, `.codex/rules/`, `.codex/agents/`, `.codex/skills/`.

## 2026-05-28 - Leave Claude configuration unchanged

- Decision: Do not expand `.claude/` for this system.
- Reason: The requested target is Codex-only, and parallel agent systems would add maintenance cost.
- Affected areas: `.claude/` intentionally unchanged.

## 2026-05-28 - Keep Expo docs linked, not copied

- Decision: Require reading Expo SDK 56 docs before Expo/RN code changes, but do not vendor documentation into the repo.
- Reason: Links keep context small and reduce stale copied documentation.
- Affected areas: `AGENTS.md`, `.codex/rules/expo-v56.md`.

## 2026-05-30 - Keep Kodland sync read-only and minimal

- Decision: Use only mapped read endpoints during AulaPay sync, keep session tokens in memory, and exclude individual student detail from the default flow.
- Reason: The student detail response contains sensitive fields that AulaPay does not need, including a student platform password.
- Affected areas: `src/kodlandClient.ts`, `src/kodland.ts`, `src/storage.ts`, `docs/kodland-endpoints.md`.
