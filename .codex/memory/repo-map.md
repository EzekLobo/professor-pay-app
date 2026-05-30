# Professor Pay App Repo Map

## Shape

- Expo SDK 56 React Native app for AulaPay, a teacher payment and lesson tracker.
- Entry points: `index.ts` registers `App.tsx`; `App.tsx` contains the current UI surface and local state orchestration.
- Domain logic lives under `src/`, with focused Vitest coverage beside the implementation files.
- Persistence uses `expo-sqlite` through synchronous APIs in `src/storage.ts`.

## Where To Look First

- UI, screens, modals, styles, and user actions: `App.tsx`.
- Dashboard totals, payment grouping, dates, lesson filtering, and currency/date helpers: `src/calculations.ts`.
- SQLite schema, seed flow, CRUD actions, reset behavior, and app settings: `src/storage.ts` and `src/storageSql.ts`.
- Class edit/deactivate lesson preservation rules: `src/classEditing.ts`.
- Form validation and parsing: `src/validation.ts`.
- Shared types: `src/types.ts`.
- Portuguese labels: `src/labels.ts`.
- Initial sample data: `src/sampleData.ts`.
- Tests: `src/*.test.ts`.

## Commands

- Install dependencies on this Windows setup: `npm.cmd install`.
- Check installed top-level packages: `npm.cmd ls --depth=0`.
- Run tests: `npm.cmd test`.
- Start Expo: `npm.cmd start`.
- Start web: `npm.cmd run web`.

## Working Notes

- PowerShell blocks `npm.ps1`; prefer `npm.cmd` for npm scripts.
- Before Expo or React Native code changes, consult the SDK 56 docs at https://docs.expo.dev/versions/v56.0.0/.
- Keep summaries navigational. The goal is to avoid re-reading large files unless the task actually needs them.
