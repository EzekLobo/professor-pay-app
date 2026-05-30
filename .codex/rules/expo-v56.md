# Expo SDK 56 Rule

Before editing Expo or React Native code, read the exact SDK 56 docs:
https://docs.expo.dev/versions/v56.0.0/

## Repo Versions

- `expo`: `~56.0.5`
- `react-native`: `0.85.3`
- `react`: `19.2.3`
- `expo-sqlite`: `^56.0.4`
- `@expo/ui`: `~56.0.14`
- `react-native-web`: `^0.21.2`
- `typescript`: `~6.0.3`

## Dependency Rules

- Use `npx expo install <package>` for Expo SDK packages so versions match SDK 56.
- Use `npm.cmd` instead of `npm` in PowerShell on this machine.
- Do not copy Expo docs into repo memory files; cite or link the versioned docs instead.
- After dependency changes, run `npm.cmd ls --depth=0` and `npm.cmd test`.

## Code Rules

- Preserve the existing Expo app entrypoint: `index.ts` registers `App.tsx`.
- Keep SQLite work compatible with the installed `expo-sqlite` SDK 56 package.
- If UI changes touch `@expo/ui` components, verify current SDK 56 behavior in the docs before editing.
