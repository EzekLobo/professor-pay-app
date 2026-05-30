# Expo Guard Checklist

Use this checklist before Expo, React Native, `expo-sqlite`, `@expo/ui`, or dependency work.

- Confirm the exact docs consulted: https://docs.expo.dev/versions/v56.0.0/.
- Confirm package alignment with `.codex/rules/expo-v56.md`.
- Prefer `npx expo install` for Expo SDK packages.
- Prefer `npm.cmd` for npm commands in PowerShell.
- Avoid canary or beta Expo packages unless the user explicitly asks for them.
- After dependency or Expo API changes, run `npm.cmd ls --depth=0` and `npm.cmd test`.
