# Reviewer Checklist

Use this checklist after changes or when asked for review.

- Lead with bugs, regressions, missing tests, or stale assumptions.
- Check whether touched behavior has focused Vitest coverage.
- For UI changes, check likely mobile layout constraints and text overflow risks.
- For storage changes, check migration/seed/reset impact and whether existing data is preserved.
- For calculation changes, check date boundaries, canceled lessons, extras, and payment grouping.
- Verify `.codex/memory/current-state.md` and `.codex/memory/decisions.md` only changed when the change is durable enough to matter later.
- Do not include large test output dumps in summaries.
