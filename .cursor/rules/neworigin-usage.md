## NewOrigin Usage (Git Remotes)

- Primary remote: `neworigin` → `https://github.com/EZ-Attendance/EZ-Attendance-Web.git`.
- Keep the old `origin` remote intact but **do not push/pull** from it going forward.

### Pushing
- Push current branch to neworigin main:
  - `git push neworigin HEAD:main` (or `git push -u neworigin HEAD:main` when setting upstream).
- Create/push a new branch:
  - `git push -u neworigin <local-branch>` (tracks the same branch name on remote).
- Avoid creating extra remote branches by always specifying the target ref if you intend to update `main`.

### Upstream Tracking
- After the first push, set upstream to neworigin:
  - `git branch --set-upstream-to=neworigin/<branch>` (if not already set via `-u`).

### Auth / Tokens
- PAT must include **repo** and **workflow** scopes (required because the repo contains GitHub Actions workflows).
- If upstream shows a tokenized URL, you can reset it after authenticating neworigin:
  - `git branch --set-upstream-to=neworigin/<branch> <branch>`

### Current branches (reference)
- `feature-cleanup-web` (tracks neworigin/feature-cleanup-web)
- `feature-otp-sequencing` (tracks neworigin/main)

### House rules
- Do not remove the old remote; just avoid using it.
- Ensure working tree is clean before push; commit pending changes first.
