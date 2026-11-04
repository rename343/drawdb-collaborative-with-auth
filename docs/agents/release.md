# Updating the production branch

`production` is the deployed branch. Every push to it runs the **Docker Build
and Push** workflow, which publishes
`ghcr.io/rename343/drawdb-collaborative-with-auth:production` and an image
tagged with the merge commit SHA. Routine updates reach `production` only
through a pull request from `main`; urgent fixes branch from `production` and
are merged back to `main` (see [Hotfixes](#hotfixes)).

Use non-destructive git commands throughout (`git merge --ff-only`,
`git reset --keep`). Never force-push and never use `git reset --hard`.

## CI tiers

The repository has two CI tiers:

- **Light** — the `Build` workflow. Runs on every pull request to `main` and
  every push to `main`. It runs `check:server`, lint, the production build,
  every Node test suite, the deployment script tests, and finally
  `npm audit --omit=dev --audit-level=high`. It never publishes an image.
- **Heavy** — the `validate` job in the `Docker Build and Push` workflow. Runs
  on every pull request to `production`, on a pull request to `main` only when
  it carries the `ci:heavy` label, on manual `workflow_dispatch`, and on pushes
  to `production` or release tags. It runs every light check on Node 22 and is
  the place where Playwright E2E checks will run once they land. The `docker`
  job needs `validate`, so no image is published until heavy passes.

Both workflows also listen for `edited` pull-request events, so retargeting a
stacked pull request to `main` or `production` starts the checks for its new
base. The heavy workflow listens for `labeled`/`unlabeled` as well, which is
what makes the label opt-in work.

### Requesting heavy CI on a pull request to `main`

Add the `ci:heavy` label:

```bash
gh pr edit <number> \
  --repo rename343/drawdb-collaborative-with-auth \
  --add-label "ci:heavy"
```

Adding the label starts a new heavy run for the current head. Pull requests to
`production` do not need the label: heavy runs automatically.

## Branch protection

Configure these expectations in GitHub branch protection:

- `main` requires the light `Build` checks and a pull request before merging.
- `production` requires a pull request and the heavy `validate` check. Heavy
  includes every light check, so a separate light run on `production` pull
  requests is not required.

Branch protection is a repository setting, not something these workflows can
enforce by themselves.

## 1. Make sure `main` is current

```bash
git fetch origin
git switch main
git merge --ff-only origin/main
```

If local `main` has diverged from `origin/main`, move it without discarding
work:

```bash
git reset --keep origin/main
```

## 2. Open a PR from `main` to `production`

Review what will ship:

```bash
git log production..main --oneline
```

Open the PR and merge it once the heavy `validate` check passes:

```bash
PR_URL=$(gh pr create \
  --repo rename343/drawdb-collaborative-with-auth \
  --base production --head main \
  --title "Update production" \
  --body "Promote main to production.")
gh pr merge "$PR_URL" \
  --repo rename343/drawdb-collaborative-with-auth --merge
```

A pull request into `production` always runs the heavy tier; the `ci:heavy`
label is only needed to request heavy checks on a pull request to `main`.

## 3. Verify tree parity

After the merge, bring the local branches up to date and compare them:

```bash
git fetch origin
git switch main && git merge --ff-only origin/main
git switch production && git merge --ff-only origin/production
git switch main
git diff main production
```

The last command must print nothing. This is the invariant to check.

`git log main..production` may **not** be empty. `production` can carry merge
commits that do not exist on `main` (for example, the merge commit created by
the PR). Those commits change history, not content, so they do not indicate a
problem. Only a non-empty `git diff` means the branches have diverged in
content.

## 4. Wait for the Docker workflow

Find the run for the merge commit and watch it:

```bash
PROD_SHA=$(git rev-parse production)
RUN_ID=$(gh run list \
  --repo rename343/drawdb-collaborative-with-auth \
  --branch production --commit "$PROD_SHA" \
  --workflow "Docker Build and Push" --json databaseId \
  --jq '.[0].databaseId')
gh run watch "$RUN_ID" \
  --repo rename343/drawdb-collaborative-with-auth --exit-status
```

If the run has not appeared yet, wait a few seconds and query again.

The run must pass both the heavy `validate` job and the `docker` job. Confirm
that the image for the merge commit was published:

```bash
docker manifest inspect \
  ghcr.io/rename343/drawdb-collaborative-with-auth:"$PROD_SHA"
```

If the package is private, authenticate first with
`echo "$GH_TOKEN" | docker login ghcr.io -u <user> --password-stdin`.

## 5. Run the manual two-browser check

CI does not replace a real collaborative session. Before publishing a release
tag and before closing the update issue, open the deployed app in two separate
browsers (or one normal and one private window), sign in as two different
users, and open the same diagram. Confirm that:

- both users appear as present and see each other's cursor or selection;
- edits from one browser appear in the other without a reload;
- the edit lock is acquired and released as expected;
- reconnecting one browser restores the session without losing changes.

This two-browser check is the final acceptance gate for a release.

## 6. Publish a release tag

Create release tags from the verified `production` commit. Pushing the tag runs
the heavy workflow again and, only after `validate` passes, publishes three
image tags:

- the tag name (for example `v1.2.3`),
- `latest`,
- the full commit SHA.

```bash
git fetch origin
git switch production
git merge --ff-only origin/production
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin vX.Y.Z
```

Do not name a release tag `production`; that name is reserved for the branch
image. Confirm the published tags with `docker manifest inspect`.

## 7. Close the update issue

Close the update issue only after the workflow has passed, the manual
two-browser check has passed, and (when releasing) the image tags for the
release exist. Link the successful run in the closing comment:

```bash
gh issue close <number> \
  --repo rename343/drawdb-collaborative-with-auth \
  --comment "Production updated to $PROD_SHA; Docker Build and Push passed: <run-url>"
```

## Hotfixes

A hotfix starts from `production`, not from `main`, so the deployed code is the
base:

```bash
git fetch origin
git switch -c hotfix/<name> origin/production
# make and commit the fix
git push -u origin hotfix/<name>
```

Open a pull request from `hotfix/<name>` to `production`. Heavy CI runs
automatically; merge only after `validate` passes. Then bring the same fix back
to `main` with a pull request from the hotfix branch (or by merging
`production` back into `main`) and confirm the tree-parity check from step 3
still prints nothing. Merging a hotfix only into `production` leaves `main`
behind and breaks the next release.

## If something fails

Fix forward with a new PR. Do not rewrite `production` history: no force-push,
no `git reset --hard`, no branch deletion to "retry" the workflow. A failed
`validate` job ships no image, so `production` can stay as is until a follow-up
PR passes.
