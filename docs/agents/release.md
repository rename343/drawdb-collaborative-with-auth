# Updating the production branch

`production` is the deployed branch. Every push to it runs the **Docker Build
and Push** workflow, which publishes
`ghcr.io/rename343/drawdb-collaborative-with-auth:production` and an image
tagged with the merge commit SHA. Updates reach `production` only through a
pull request from `main`.

Use non-destructive git commands throughout (`git merge --ff-only`,
`git reset --keep`). Never force-push and never use `git reset --hard`.

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

Open the PR and merge it once checks pass:

```bash
PR_URL=$(gh pr create \
  --repo rename343/drawdb-collaborative-with-auth \
  --base production --head main \
  --title "Update production" \
  --body "Promote main to production.")
gh pr merge "$PR_URL" \
  --repo rename343/drawdb-collaborative-with-auth --merge
```

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

The run must pass both the `validate` and `docker` jobs. Confirm that the
image for the merge commit was published:

```bash
docker manifest inspect \
  ghcr.io/rename343/drawdb-collaborative-with-auth:"$PROD_SHA"
```

If the package is private, authenticate first with
`echo "$GH_TOKEN" | docker login ghcr.io -u <user> --password-stdin`.

## 5. Close the update issue

Close the update issue only after the workflow has passed and the image tag
for the merge commit exists. Link the successful run in the closing comment:

```bash
gh issue close <number> \
  --repo rename343/drawdb-collaborative-with-auth \
  --comment "Production updated to $PROD_SHA; Docker Build and Push passed: <run-url>"
```

## If something fails

Fix forward with a new PR. Do not rewrite `production` history: no force-push,
no `git reset --hard`, no branch deletion to "retry" the workflow. A failed
`validate` job ships no image, so `production` can stay as is until a follow-up
PR passes.
