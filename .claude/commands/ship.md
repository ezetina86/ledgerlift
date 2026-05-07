# /ship — Branch · Commit · Push · PR

Ship the current working changes as a pull request to `dev`.

**Usage:** `/ship <feature-name> [optional commit message]`

**Argument:** `$ARGUMENTS` — a short kebab-case feature name (e.g. `add-rest-timer`).
If a second word or more is provided it becomes the commit message body.

---

## Steps

1. **Abort if on a protected branch.** Run `git branch --show-current`. If the current branch is `master` or `dev`, stop and tell the user: "You are on a protected branch. Create a feature branch first."

2. **Determine the branch name.** Use the first word of `$ARGUMENTS` as the slug. If the current branch already starts with `feature/`, `fix/`, or `chore/`, skip branch creation and stay on it. Otherwise create and switch to `feature/<slug>`:
   ```bash
   git checkout -b feature/<slug>
   ```

3. **Stage all changes** (tracked + untracked, excluding `.env` files):
   ```bash
   git add -A -- ':!*.env' ':!.env*'
   ```

4. **Run the test suite** to catch regressions before committing:
   ```bash
   cd frontend && bun run test --run
   ```
   If tests fail, stop and report which tests failed. Do NOT commit broken code.

5. **Commit.** Use the remaining words of `$ARGUMENTS` as the commit message (or generate one from the diff if none provided). Format: conventional commits (`feat:`, `fix:`, `chore:`, etc.). Always append the co-author trailer:
   ```
   Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
   ```

6. **Push** the branch:
   ```bash
   git push -u origin HEAD
   ```

7. **Open a PR to `dev`** using the GitHub CLI:
   ```bash
   gh pr create \
     --base dev \
     --title "<conventional commit title>" \
     --body "$(cat <<'EOF'
   ## Summary
   <bullet points from the diff>

   ## Test plan
   - [ ] ESLint passes (`bun run lint`)
   - [ ] TypeScript passes (`bun run tsc --noEmit`)
   - [ ] All tests pass (`bun run test`)
   - [ ] Manual smoke test on dev server

   🤖 Generated with [Claude Code](https://claude.com/claude-code)
   EOF
   )"
   ```

8. **Print the PR URL** so the user can review it.

---

## Rules
- Never target `master` directly — always PR to `dev`.
- Never use `--no-verify` or skip hooks.
- If the branch already has an open PR, run `gh pr view` and report its URL instead of creating a duplicate.
