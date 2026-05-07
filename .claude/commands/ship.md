# /ship — Branch · Version · Changelog · Commit · Push · PR

Ship the current working changes as a pull request to `dev`.

**Usage:** `/ship <feature-name> [commit message]`

**Argument:** `$ARGUMENTS` — a short kebab-case slug (e.g. `add-rest-timer`). Optional extra words become the commit message title.

---

## Steps

### 1 — Guard: no direct shipping from protected branches
Run `git branch --show-current`. If the result is `master` or `dev`, stop:
> "You are on a protected branch. Create a feature branch first, or I can create one — what should it be called?"

### 2 — Create or reuse feature branch
- If already on `feature/*`, `fix/*`, or `chore/*` — stay on it.
- Otherwise create and switch:
  ```bash
  git checkout -b feature/<slug>
  ```

### 3 — Determine version bump type
Inspect all staged/unstaged changes plus the intended commit message to classify:

| Commit prefix | Bump | When |
|---|---|---|
| `feat:` | **minor** `0.x.0 → 0.(x+1).0` | new user-facing feature |
| `fix:` | **patch** `0.x.y → 0.x.(y+1)` | bug fix, ESLint error, crash |
| `chore:` / `docs:` / `refactor:` / `test:` | **none** | tooling, CI, tests, docs |
| `BREAKING CHANGE:` in body | **major** `x.0.0 → (x+1).0.0` | incompatible API/DB change |

Read the current version from `frontend/package.json`.

- For `minor` or `major` bumps: **ask the user to confirm** before proceeding:
  > "This looks like a **minor** bump: `0.7.0 → 0.8.0`. Confirm? (yes / patch / skip)"
- For `patch` bumps: apply automatically, mention it in the summary.
- For `chore`/`docs`/`test`: skip entirely without asking.

### 4 — Bump version in package.json (if applicable)
Edit the `"version"` field in `frontend/package.json` using string replacement.
Do NOT use `npm version` — this project uses bun.

### 5 — Update CHANGELOG.md
File is at the repo root. Format follows [Keep a Changelog](https://keepachangelog.com).

**If bumping version:**
1. Replace the `## [Unreleased]` heading with `## [X.Y.Z] - YYYY-MM-DD` (today's date).
2. Insert a fresh `## [Unreleased]\n\n---\n` block above it.
3. Update the compare link at the bottom:
   ```
   [Unreleased]: https://github.com/ezetina86/ledgerlift/compare/vX.Y.Z...HEAD
   [X.Y.Z]: https://github.com/ezetina86/ledgerlift/compare/vPREV...vX.Y.Z
   ```

**If NOT bumping (chore/docs/test):**
Append a concise bullet to the `[Unreleased]` section under the correct heading
(`Added` / `Changed` / `Fixed` / `Removed`). Create the heading if it doesn't exist.

### 6 — Stage everything
```bash
git add -A -- ':!*.env' ':!.env*'
```

### 7 — Run tests (frontend)
```bash
cd frontend && bun run test --run
```
If any tests fail → **stop and report**. Do NOT commit broken code.

### 8 — Commit
Use conventional commit format. Include version bump in the message if applicable.
Always append the co-author trailer:
```
feat(plan): add mesocycle management and fatigue detection

Bumps version 0.7.0 → 0.8.0.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

### 9 — Push
```bash
git push -u origin HEAD
```

### 10 — Open PR to `dev`
```bash
gh pr create \
  --base dev \
  --title "<conventional commit title>" \
  --body "..."
```

PR body must include:
- **Summary** — bullet list of what changed
- **Version** — `0.7.0 → 0.8.0` or `no version bump (chore)`
- **Test plan** checklist:
  - [ ] ESLint (`bun run lint`)
  - [ ] TypeScript (`bun run tsc --noEmit`)
  - [ ] Tests (`bun run test`)
  - [ ] Manual smoke test
- `🤖 Generated with [Claude Code](https://claude.com/claude-code)`

If an open PR already exists for this branch, print its URL instead of creating a duplicate.

### 11 — Print the PR URL

---

## Rules
- Never target `master` directly — always PR to `dev`.
- Never use `--no-verify`.
- `chore:` / `test:` / `docs:` commits never bump the version.
- Always update CHANGELOG.md — even for patch fixes.
- Version bumps follow semver strictly (`major.minor.patch`).
