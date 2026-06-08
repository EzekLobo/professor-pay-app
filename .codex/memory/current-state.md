# Current State

Last updated: 2026-06-08

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
- Kodland review flow now uses manual class linking only: imported groups no longer auto-match local classes by name. The Kodland tab supports group -> student detail navigation, local student edit/delete/ignore, profile link copying through `expo-clipboard`, WhatsApp chat links from imported/local phone numbers, and “Cadastrar como nova turma” via the existing class form.
- Kodland sync now enriches each active group student with the read-only individual student detail endpoint, persisting only safe fields such as phone/status/email/profile URL and filtering sensitive payload fields. Linked Kodland students are visible from the local `Turmas` tab through class detail -> student detail. Top tabs scroll horizontally on narrow screens.
- Student detail actions now keep WhatsApp on the phone row and open/copy profile on the Kodland profile row. The local `Turmas` student list hides the redundant linked label, and Kodland statuses such as expelled/churned/removed/inactive show an `Expulso` badge instead of hiding the student.
- Student list rows now use compact cards with initial avatar, contact line, progress/review chips, and a detail arrow; expelled students keep the `Expulso` badge and subdued alert styling while remaining sorted after active students.
- In the local `Turmas` class detail, active students are ranked by Kodland progress points from `progressSummary`; the top three scored active students get compact `1º`, `2º`, `3º` badges, while expelled students remain at the end. The Kodland review student list still uses status/name ordering.
- Student UI now labels Kodland progress as `Pontos` and displays only the earned value before `/` (for example `480/6031` appears as `Pontos 480`). `Aulas > Turmas` now shows class-history groups first, starting collapsed, with one expandable class at a time.
- Ranking badges now appear for every active ranked student, but only the top three receive the highlighted card/badge styling. Kodland class linking lists only active local classes, and top-level tab changes reset detail selections back to main lists.
- The Kodland class-link modal now keeps manually registered local classes behind a compact expandable field; when expanded, the field shows an instruction and the selected class is marked only inside the list.
- Kodland endpoint mapping extracted from public bundles and an authenticated local HAR is documented in `docs/kodland-endpoints.md`. Current screens use backoffice API v2. The read-only sync path is SSO login, teacher groups, group general info, group students, allowed safe fields from student detail, and group schedule.
- Branch `feature/kodland-lesson-materials` adds Kodland lesson material metadata from `student_groups/{groupId}/lessons/` and study-guide material sync from `materials?lesson={lessonId}`: lesson id/number/title/date/passed state, generated aula URL, detected slide/roteiro URLs, material IDs, material titles, and recording URLs for completed lessons when available. `Resumo` shows the next Kodland lesson for each turma. `Pagamentos` owns the local lesson history behind `Pagamentos | Historico`. `Aulas` is now a compact material library by course, module, and lesson, with `Aula`, `Slide`, `Roteiro`, and manual `Editar`; it does not show dates or recordings in materials. Material fetches and manual links are shared by course lesson, so repeated turmas on the same course do not duplicate the material library.
- The `Correções` UI filters out pending review counts and lists for Kodland students whose status is treated as expelled/removed/inactive; the raw pending review snapshot remains preserved in storage.

## Known Follow-Ups

- Run `npm.cmd test` after future code changes.
- Generate a local release APK with `npm.cmd run apk`; install it on a connected emulator/device with `npm.cmd run apk:install`. Both call `scripts/build-apk.ps1`, which runs TypeScript/tests by default, builds `android/app/build/outputs/apk/release/app-release.apk`, and copies it to the repo root.
- Install `PyYAML` for the Python launcher if official skill validation is needed later, then rerun `py C:\Users\ezekl\.codex\skills\.system\skill-creator\scripts\quick_validate.py .codex\skills\professor-pay-ops`.
- Consider `npm audit` review separately before applying fixes, because automated audit fixes may alter dependency versions or behavior.
- For any Expo/RN code work, read the Expo SDK 56 docs first and use `npx expo install` for Expo SDK packages.
- If a Kodland material only returns an authenticated file ID without a public URL, AulaPay opens `materials/{materialId}/download` or the aula page as fallback; direct Google Slides/Slack/recording links are used when present in Kodland payloads.
