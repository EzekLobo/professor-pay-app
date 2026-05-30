# Current State

Last updated: 2026-05-30

## Project State

- Dependencies were installed with `npm.cmd install`.
- `npm.cmd ls --depth=0` passed after installation.
- `npm.cmd test -- --run` passed after the picker date guard change: 5 test files, 38 tests.
- `npx.cmd tsc --noEmit` passed after the picker date guard change.
- Android native project was generated with `npx.cmd expo prebuild --platform android --no-install`; `/android` is ignored by git.
- Java 17 and Android SDK command-line tools are installed locally; SDK path is `C:\Users\ezekl\AppData\Local\Android\Sdk`.
- `android/local.properties` points Gradle at the local SDK path.
- A debug Android APK was generated at `android/app/build/outputs/apk/debug/app-debug.apk` on 2026-05-28; it verifies with APK Signature Scheme v2, has `minSdk 24`, `targetSdk 36`, and includes `arm64-v8a`, `armeabi-v7a`, `x86`, and `x86_64`.
- A standalone release APK was generated at `android/app/build/outputs/apk/release/app-release.apk` on 2026-05-28 after the debug APK showed the expected Metro "Unable to load script" screen. Use the release APK for phone installs without Metro.
- The native Android build was bumped to `versionCode 2` / `versionName 1.0.1`, rebuilt successfully with `NODE_ENV=production`, and copied to `AulaPay-v1.0.1-INSTALE-ESTE.apk` in both the repo root and `C:\Users\ezekl\Downloads`.
- EAS cloud APK build is configured in `eas.json`, but requires `eas login` or `EXPO_TOKEN`.
- `npm.cmd install` reported 10 moderate vulnerabilities; no audit fix was run because dependency changes beyond the lockfile install were outside the requested scope.
- The repo-local skill structure was initialized with `py .../init_skill.py`; official `quick_validate.py` could not run because the local Python environment is missing `PyYAML`.
- The git worktree was clean before the Codex operational summary system was added.
- `.claude/` remains unchanged and is not part of the Codex-only workflow.

## Architecture Snapshot

- `App.tsx` is the main UI file and coordinates tabs, modals, actions, and refreshes.
- `src/calculations.ts` builds dashboard data from classes, lessons, and payment confirmations.
- `src/storage.ts` owns SQLite schema setup, seeding, loading, mutations, and reset behavior.
- `src/classEditing.ts`, `src/validation.ts`, `src/types.ts`, `src/labels.ts`, and `src/sampleData.ts` support focused domain behavior.
- Tests are colocated in `src/*.test.ts` and use Vitest.
- Lesson generation adds ISO calendar days in 7-day steps for weekly class recurrences.
- Class forms now derive `weekDay` from `firstLesson` automatically; date picker values are converted through guarded helpers in `src/calculations.ts` so UTC-midnight and local picker dates keep the selected calendar day.
- Branch `feature/kodland-sync` now has functional Kodland group/student sync: SecureStore credentials, SSO login, in-memory access token with one refresh retry, paginated API v2 group loading, active-group student loading, filtered transactional SQLite snapshots, manual remote-to-local class linking, Kodland tab summaries, and student counts on classes.
- Kodland endpoint mapping extracted from public bundles and an authenticated local HAR is documented in `docs/kodland-endpoints.md`. Current screens use backoffice API v2. The read-only sync path is SSO login, teacher groups, group general info, group students, and group schedule. The default sync must avoid individual student detail because its response contains sensitive fields that AulaPay does not need.

## Known Follow-Ups

- Run `npm.cmd test` after future code changes.
- Install `PyYAML` for the Python launcher if official skill validation is needed later, then rerun `py C:\Users\ezekl\.codex\skills\.system\skill-creator\scripts\quick_validate.py .codex\skills\professor-pay-ops`.
- Consider `npm audit` review separately before applying fixes, because automated audit fixes may alter dependency versions or behavior.
- For any Expo/RN code work, read the Expo SDK 56 docs first and use `npx expo install` for Expo SDK packages.
- Kodland schedule import remains pending until an authenticated HAR captures the schedule response shape. Group and student sync are implemented against mapped v2 read-only endpoints with synthetic parser fixtures.
