<div align="center">
    <img width="64" alt="drawDB logo" src="./src/assets/icon-dark.png">
    <h1>drawDB Collaborative</h1>
</div>

<h3 align="center">A self-hosted, real-time collaborative database schema editor.</h3>

<div align="center" style="margin-bottom:12px;">
    <a href="https://github.com/rename343/drawdb-collaborative-with-auth" style="display: flex; align-items: center;">
        <img src="https://img.shields.io/badge/Source-GitHub-grey?logo=github" alt="Source code"/>
    </a>
    <a href="./LICENSE" style="display: flex; align-items: center;">
        <img src="https://img.shields.io/badge/License-AGPL--3.0-blue" alt="AGPL-3.0 license"/>
    </a>
</div>

<h3 align="center"><img width="700" style="border-radius:5px;" alt="drawDB screenshot demo" src="drawdb.png"></h3>

This repository is the `rename343` fork of **drawDB Collaborative**: drawDB's
browser-based ERD editor with centralized storage, real-time collaboration,
accounts and a production deployment that runs the app in a single application
container behind Caddy.

## Project lineage

Four layers meet in this repository. Knowing which one owns a feature makes the
history and the code much easier to follow.

| Layer             | Repository                                                                                            | Contributed here                                                                                                                                                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Original project  | [drawdb-io/drawdb](https://github.com/drawdb-io/drawdb)                                               | The editor itself: diagram canvas, tables, relationships, SQL import/export, templates, internationalisation                                                                                                                     |
| Intermediate fork | [yms2772/drawdb-collaborative](https://github.com/yms2772/drawdb-collaborative)                       | SQLite diagram persistence, the WebSocket collaboration layer, and the single container running frontend, API and storage                                                                                                        |
| Intermediate fork | [artempas/drawdb-collaborative-with-auth](https://github.com/artempas/drawdb-collaborative-with-auth) | Invite-only accounts and administrator management, session cookies, Git sync for diagrams                                                                                                                                        |
| **This fork**     | **rename343/drawdb-collaborative-with-auth**                                                          | Snapshot-authoritative collaboration and the lease registry, diagram edit lock and table locks, editable DBML with Apply, the diagram share button, and the production VM deployment (Caddy, systemd updater, backups, rollback) |

This fork is independently maintained and is not affiliated with or endorsed by
the original drawDB maintainers or by the intermediate forks.

## What this fork changes

### Collaboration is snapshot-authoritative

A complete diagram document at one version is the only authoritative unit of
synchronisation. Per-entity deltas are gone; ephemeral awareness (cursors and
table-move previews) is the only state that travels outside a snapshot. Saves are
debounced and guarded by an optimistic `baseVersion`, so a stale client receives
the current snapshot instead of overwriting it, and reconnects converge on the
server snapshot.

The client is a framework-agnostic collaboration session behind small ports
(transport, clock, document, snapshot writer), with a thin React adapter. See
[ADR 0003](docs/adr/0003-snapshot-authoritative-collaboration.md).

### One lease registry for every lock

Table locks and the diagram edit lock share a single server-side registry with
the same lease, fencing and expiry logic. One `checkWrite` gate covers WebSocket
`snapshot.replace`, HTTP `PUT /api/diagrams/:id` and Git pull, so no write path
can bypass a held diagram lock.

### Diagram edit lock, table locks and editable DBML

The DBML panel is read-only by default. Pressing **Edit** acquires a diagram-wide
lock; while it is held, GUI editing is disabled for everyone, including the lock
holder. **Apply** flushes pending saves, sends one snapshot and releases the lock
only after the server acknowledges it. **Cancel**, closing the panel,
disconnecting or lease expiry also release it. A crashed tab blocks editing only
until the lease expires.

Table locks remain the finer-grained coordination for editing a single table,
and they enforce table-move previews. A table lock cannot be acquired while the
diagram lock is held, and vice versa. See
[ADR 0002](docs/adr/0002-dbml-exclusive-edit-lock.md).

### Invite-only accounts, sessions and the share button

The first account claims an empty instance with a one-time `BOOTSTRAP_SECRET` and
becomes the administrator. After that, registration is closed and the
administrator creates accounts from the editor toolbar (or
`POST /api/admin/users`). Sessions are server-side, referenced by an `HttpOnly`
cookie.

The editor header has a **Share** button that copies the canonical
`/diagrams/:id` URL, because access is link-based: anyone signed in who has the
link can open and edit the diagram.

### Production deployment

`compose.production.yml`, `Caddyfile` and `deploy/` provide the deployment: Caddy
terminates TLS in front of one application container that serves the frontend,
API, WebSocket endpoint and SQLite. A systemd oneshot unit pulls new images and
rolls back unhealthy ones, and scripts back up, verify and restore `/data`.

## Getting started

### Requirements

- Node.js 20 or 22 and npm (the same versions CI builds).
- Optional: `git` and an SSH client for Git sync, and Docker with the Compose
  plugin for the containerised setup.

### Local development

```bash
git clone https://github.com/rename343/drawdb-collaborative-with-auth.git
cd drawdb-collaborative-with-auth
npm install
export APP_ORIGIN=http://localhost:5173
export BOOTSTRAP_SECRET="$(openssl rand -hex 32)"
npm run dev
```

`npm run dev` starts the Vite dev server on port `5173` and the API/WebSocket
server on port `3000`. Vite proxies `/api` and `/ws` to the server, so open
`http://localhost:5173`. Use `npm run dev:client` or `npm run dev:server` when
only one side is needed.

Print the bootstrap secret with `printf '%s\n' "$BOOTSTRAP_SECRET"` in the same
terminal and enter it on `/register` to create the administrator account. Without
a configured secret, registration is rejected.

The SQLite database defaults to `./data/drawdb.sqlite`; override it with
`DATABASE_PATH`.

### Build

```bash
npm install
npm run build
npm start
```

`npm run build` builds the client into `dist/` and precompresses assets with
`scripts/precompress.mjs`. `npm start` serves the built client and the API from
the same Node process on `PORT` (default `3000`). `npm run preview` only previews
the Vite build and has no API or WebSocket backend.

### Docker Compose

```bash
openssl rand -hex 32
# Put the output in the ignored .env file as BOOTSTRAP_SECRET=<value>
docker compose up --build
```

Open `http://localhost:3333`. `compose.yml` publishes the app on
`127.0.0.1:3333` and persists SQLite in the `drawdb-data` volume. The single
container runs under `NODE_ENV=development` with `APP_ORIGIN=http://localhost:3333`
and `DATABASE_PATH=/data/drawdb.sqlite`. `BOOTSTRAP_SECRET` is required by the
Compose file.

### Browser routes

| Route                                           | Purpose                                  |
| ----------------------------------------------- | ---------------------------------------- |
| `/`                                             | Landing page                             |
| `/login`, `/register`                           | Sign in, and claim an empty instance     |
| `/editor`                                       | New diagram in the editor                |
| `/editor/diagrams/:id`, `/editor/templates/:id` | Editor for a saved diagram or a template |
| `/diagrams/:id`                                 | Canonical shared diagram URL             |
| `/templates`                                    | Template gallery                         |
| `/bug-report`                                   | Bug report page                          |

All editor routes require a signed-in user; `/diagrams/:id` redirects unauthenticated
visitors to the login page.

### API and WebSocket endpoints

Every endpoint below except `/api/auth/status`, `/api/auth/login`,
`/api/auth/logout` and the bootstrap registration requires a signed-in user. The
WebSocket handshake also requires a session cookie.

- `GET /api/auth/status` — whether the instance still needs its first account
- `POST /api/auth/register` — bootstrap-only registration, requires
  `BOOTSTRAP_SECRET`
- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- `GET /api/admin/users`, `POST /api/admin/users` — administrator only
- `GET /api/diagrams`, `POST /api/diagrams`
- `GET|PUT|DELETE /api/diagrams/:id`
- `GET|PUT|DELETE /api/diagrams/:id/git`
- `POST /api/diagrams/:id/git/push`, `POST /api/diagrams/:id/git/pull`,
  `POST /api/diagrams/:id/git/test`, `GET /api/diagrams/:id/git/history`
- `GET /ws/diagrams/:id` — WebSocket upgrade for collaboration

Request bodies are JSON and limited to 2 MB. `PUT /api/diagrams/:id` requires a
`baseVersion` and returns `409` with the current diagram when it is stale.

### Environment variables

| Variable           | Default                                 | Meaning                                                                                                           |
| ------------------ | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`         | unset                                   | `production` requires an HTTPS `APP_ORIGIN`                                                                       |
| `PORT`             | `3000`                                  | HTTP and WebSocket port                                                                                           |
| `DATABASE_PATH`    | `./data/drawdb.sqlite`                  | SQLite file; `/data/drawdb.sqlite` in the container                                                               |
| `APP_ORIGIN`       | unset                                   | Exact public HTTP(S) origin. Required in production, must be HTTPS there, and is enforced on WebSocket handshakes |
| `BOOTSTRAP_SECRET` | unset                                   | One-time secret for claiming an empty instance; remove after setup                                                |
| `GIT_SECRET_KEY`   | unset                                   | Optional key for encrypting stored Git access tokens; otherwise a key is generated and kept in SQLite             |
| `GIT_WORKDIR`      | sibling `git` directory of the database | Working copies for Git sync; `/data/git` in the container                                                         |
| `GIT_SSH_COMMAND`  | `ssh -o BatchMode=yes`                  | SSH command used for `ssh://` and `git@host:path` remotes                                                         |

## Collaborative self-hosting

Diagrams are stored centrally in SQLite; IndexedDB is not used for diagram
storage, only for templates. `DATABASE_PATH` controls the database location and
defaults to `./data/drawdb.sqlite` outside the container. Diagram URLs use
`/diagrams/:id`, and everyone opening the same URL joins the same live session
automatically.

## Accounts and access

There is no open registration. On an empty instance `/register` asks for the
one-time `BOOTSTRAP_SECRET`. The first account claims the instance and becomes
its administrator. Remove the secret from the runtime configuration afterwards;
from then on `/register` returns `403` and accounts are created only by the
administrator, through the people icon in the editor toolbar (or
`POST /api/admin/users`). Accounts created that way are always regular users —
the administrator role cannot be granted over the API, so an instance has exactly
one administrator. Upgrading an instance that already had accounts promotes its
earliest account.

If the administrator account is lost, recover it with direct SQL:
`UPDATE users SET is_admin = 1 WHERE username = '<name>';`.

Passwords are hashed with scrypt and sessions are stored in SQLite, referenced by
the `drawdb_session` cookie. The cookie is `HttpOnly` and `SameSite=Lax`, and
marked `Secure` when the request arrives over HTTPS. Sessions last 30 days and
slide forward as they are used, so make sure the reverse proxy forwards
`X-Forwarded-Proto` (see below) for the `Secure` flag to be set correctly.

Access follows an owner-plus-link model:

- The creator owns a diagram, sees it in their list, and is the only one who can
  delete it or change its Git settings.
- Any signed-in user who has the diagram URL can open, edit and collaborate on
  it. Treat diagram URLs as shareable secrets; the **Share** button copies that
  URL.
- Diagrams created before authentication was added have no owner. They stay
  visible and deletable for every signed-in user so no data is stranded.

Collaborator names shown in presence and on cursors come from the signed-in
account, not from the browser, so clients cannot spoof each other. Logging out
closes the WebSockets associated with that session.

When `APP_ORIGIN` is configured, WebSocket handshakes require an exact matching
`Origin` header. Production requires an HTTPS `APP_ORIGIN`; Compose derives it
from `APP_DOMAIN`.

## Git sync

A diagram can be connected to a Git repository from **File → Sync with git**.
Each sync writes two files, under an optional path inside the repository:

- `<name>.json` — the diagram document, which is what a pull reads back. Pan and
  zoom are stripped, so moving the canvas never produces a commit.
- `<name>.sql` — the DDL for the diagram's database, generated by the same
  exporter as **File → Export SQL**.

Syncing is always deliberate: nothing is committed until someone presses
**Commit and push**, and one press produces exactly one commit carrying both
files. Editing the diagram never touches the repository on its own.

The server does the Git work itself. It keeps a working copy per diagram under
`<DATABASE_PATH directory>/git` (`/data/git` in the container, overridable with
`GIT_WORKDIR`), resets it to the tip of the configured branch before every
operation, and pushes an ordinary fast-forward commit authored by the signed-in
user. Nothing is committed when the schema has not changed, and a branch that
does not exist yet is created by the first push.

- **Commit and push** saves any pending edit, then commits the current schema.
- **Pull from repository** replaces the diagram with the version in the
  repository and pushes that snapshot to everyone who has it open, so treat it
  as a restore rather than a merge.

Repository URLs must be `https://`, `ssh://` or `git@host:path`; local paths are
refused, except when `GIT_ALLOW_LOCAL_REMOTES=1` is set for the test suite. HTTPS
remotes authenticate with an access token, stored AES-256-GCM encrypted under a
key generated once and kept in the database, or derived from `GIT_SECRET_KEY`
when that is set. The token is never returned by the API and is
stripped from Git's error output. SSH remotes authenticate with a key mounted
into the container and run in batch mode, so a missing key fails instead of
hanging.

Only the diagram owner can point a diagram at a repository or change the
credential; anyone who can edit the diagram can push and pull it. Repository
sync needs `git` on the server — the image installs it, and the panel says so
when it is missing.

When running behind a reverse proxy, forward `X-Forwarded-For` and
`X-Forwarded-Proto`, and allow WebSocket `Upgrade`/`Connection` headers on the
`/ws` path. The browser derives `ws://` or `wss://` from the current page.

## Production VM deployment

The production Compose setup targets **Ubuntu Server 24.04 LTS on x86_64**. Point
a DNS name at the VM and allow inbound TCP ports 80 and 443 (plus UDP 443 for
HTTP/3). Install Docker Engine, the Compose plugin, and Python 3.12+ (Ubuntu's
`python3` package, used for safe backup extraction), then check
`docker compose version`. Do not publish the application port 3000: Caddy is the
only service with host ports, and the app and proxy share an internal Compose
network. The app can still make outbound Git connections for Git sync.

### Host preparation

Clone this repository to `/opt/drawdb` and prepare persistent directories. The
app image runs as `node` (UID/GID 1000), so `/data` must be writable by that user.
`/data` contains SQLite and its WAL files as well as Git working copies.

```bash
git clone https://github.com/rename343/drawdb-collaborative-with-auth.git /opt/drawdb
sudo install -d -m 0700 /etc/drawdb
sudo install -d -o 1000 -g 1000 -m 0750 /srv/drawdb/data
sudo install -d -o 1000 -g 1000 -m 0750 /srv/drawdb/caddy-data /srv/drawdb/caddy-config
sudo install -d -o 1000 -g 1000 -m 0700 /etc/drawdb/ssh
sudo install -m 0600 /opt/drawdb/.env.production.example /etc/drawdb/production.env
sudoedit /etc/drawdb/production.env
sudo chmod 0600 /etc/drawdb/production.env
```

### Configuration

`.env.production.example` lists every value the deployment reads:

| Variable                             | Meaning                                                        |
| ------------------------------------ | -------------------------------------------------------------- |
| `DRAWDB_IMAGE`                       | GHCR image, `ghcr.io/rename343/drawdb-collaborative-with-auth` |
| `DRAWDB_TAG`                         | Image tag to run, `production` by default                      |
| `APP_DOMAIN`                         | Public DNS name, without scheme, path or trailing slash        |
| `DATA_DIR`                           | Host directory mounted at `/data`                              |
| `CADDY_DATA_DIR`, `CADDY_CONFIG_DIR` | Host directories for Caddy state                               |
| `SSH_KEY_DIR`                        | Host directory mounted read-only at `/home/node/.ssh`          |
| `BOOTSTRAP_SECRET`                   | One-time secret for the administrator account                  |
| `GIT_SECRET_KEY`                     | Optional, separately managed key for stored Git tokens         |

Set `APP_DOMAIN`, keep `DATA_DIR` and the Caddy directories consistent with the
paths created above, and generate `BOOTSTRAP_SECRET` with
`openssl rand -hex 32`. This file is outside the repository and readable only by
root.

The VM needs its own revocable GHCR credential with `read:packages` access. It is
separate from GitHub Actions' `GITHUB_TOKEN`. Log in as root so Docker stores the
credential in root's Docker configuration, not in the repository, Compose or the
environment file:

```bash
sudo install -d -m 0700 /root/.docker
read -rsp 'GHCR read token: ' GHCR_READ_TOKEN; echo
printf '%s' "$GHCR_READ_TOKEN" | sudo docker login ghcr.io --username YOUR_GITHUB_USER --password-stdin
sudo chmod 0600 /root/.docker/config.json
unset GHCR_READ_TOKEN
```

Rotate it by running `sudo docker logout ghcr.io` and logging in with a newly
issued read-only token. Keep the token out of command arguments and shell
history.

### First start

Install and start the systemd updater:

```bash
sudo chmod 0755 /opt/drawdb/deploy/*.sh
sudo install -m 0644 /opt/drawdb/deploy/drawdb.service /etc/systemd/system/drawdb.service
sudo systemctl daemon-reload
sudo systemctl enable --now drawdb.service
```

The service pulls the configured image before changing the app container and
waits for `GET /api/auth/status` to pass its healthcheck. On a failed pull, a
running old container stays up; if it is stopped, the service starts its local
copy. Updates and backups share a lock to prevent simultaneous container changes.
An unhealthy replacement is rolled back to the previous image. If there is no
local image on first start, the service reports that it could not start.

After the first healthy start, open `https://APP_DOMAIN/register` and enter the
bootstrap secret to create the administrator. Then remove `BOOTSTRAP_SECRET` from
`/etc/drawdb/production.env` and run `sudo systemctl start drawdb.service` to
recreate the container without it.

### Releases and updates

Pushes to the Git branch `production` run validation and publish `production`
plus the full commit SHA to GHCR. Git release tags publish their tag name,
`latest`, and the commit SHA; the literal Git tag name `production` is reserved
for the branch image. All published images target `linux/amd64`.

Updating the VM means running `sudo systemctl start drawdb.service` after the
image is published. The unit is a oneshot updater, so it can be started again for
later updates. Updating briefly interrupts active connections; browsers reconnect
and sync the current diagram version. Rolling back the image does not roll back a
SQLite schema or data change made by the newer image. The updater exits with an
error after a rollback so systemd reports the update as failed, even when the
previous app is healthy. Registry pulls have a timeout; recovery uses the local
image and never pulls the failed image again.

The Compose configuration rotates Docker logs and does not set an arbitrary
memory cap. It does not configure Azure schedules, resource sizes, or costs; the
intended operating window is Wednesday 13:45–16:10 in `Europe/Warsaw`, so
configure any VM start/stop schedule outside this repository.

### Backups and restore

Backups stop the app cleanly, archive the complete `/data` tree, and start the app
again even if archiving fails. Store copies away from the VM:

```bash
sudo /opt/drawdb/deploy/backup-data.sh /mnt/backup/drawdb
sudo /opt/drawdb/deploy/verify-backup.sh /mnt/backup/drawdb/drawdb-data-....tar.gz
```

Verification extracts the archive to a private temporary directory, rejects
unsafe paths and links, and runs SQLite `PRAGMA integrity_check` using the local
app image. Only the extracted copy is writable during this check so SQLite can
open WAL databases. On a replacement VM without an existing app container, first
pull an app image and set `DRAWDB_VERIFY_IMAGE` to that local image when running
verification or restore:

```bash
sudo env DRAWDB_VERIFY_IMAGE=ghcr.io/rename343/drawdb-collaborative-with-auth:production \
  /opt/drawdb/deploy/verify-backup.sh ARCHIVE
```

To restore, choose a new data directory; the script refuses to overwrite an
existing one:

```bash
sudo /opt/drawdb/deploy/restore-data.sh /mnt/backup/drawdb/drawdb-data-....tar.gz /srv/drawdb/data-restored
```

Review the extracted copy, stop the old container with
`sudo docker stop --timeout 30 drawdb-app`, set `DATA_DIR` to the new directory in
`/etc/drawdb/production.env`, then start the systemd updater. The previous data
directory remains available for rollback.

A database restore does not restore an externally configured `GIT_SECRET_KEY` or
SSH private keys; back those up separately and restore the same key material
before starting the app if Git sync depends on them. Without a custom
`GIT_SECRET_KEY`, the encryption key is stored in SQLite and included in the
`/data` archive. If you use SSH remotes, `SSH_KEY_DIR` is mounted read-only at
`/home/node/.ssh`: keep the private key and a verified `known_hosts` file there,
and back that directory up separately.

The deployment also supports `DRAWDB_APP_DIR` (default `/opt/drawdb`),
`DRAWDB_ENV_FILE` (default `/etc/drawdb/production.env`), `DRAWDB_CONTAINER`
(default `drawdb-app`) and `DRAWDB_RUN_DIR` (default `/run`).

## Development

```bash
npm run dev          # server + client in watch mode
npm run lint         # ESLint, zero warnings allowed
npm run build        # Vite build + precompression
npm run check:server # syntax-check every server module
```

Tests use the Node test runner:

| Command               | Covers                           |
| --------------------- | -------------------------------- |
| `npm run test:server` | HTTP API and the lock registry   |
| `npm run test:git`    | Git sync and credential handling |
| `npm run test:collab` | Collaboration session            |
| `npm run test:dbml`   | DBML apply                       |
| `npm run test:import` | SQL import normalisation         |
| `npm run test:layout` | Auto-layout                      |
| `npm run test:share`  | Share URL building               |

The updater regression scenarios run with `bash deploy/update-drawdb.test.sh`. The
backup integration scenarios run as root with Node, the installed npm
dependencies, and Python available: `sudo env "PATH=$PATH" bash deploy/backup.test.sh`.
Both suites use temporary data and stub Docker control and cover registry
failure, rollback, locking, archive failure, SQLite integrity, ownership, and
refusal to overwrite existing data.

CI runs `npm run lint`, `npm run build`, `npm run check:server`,
`npm audit --omit=dev --audit-level=high`, the server, Git, import, layout and
share tests, and both deployment test suites. Two moderate package warnings
remain for React Router 6:
[external navigation](https://github.com/remix-run/react-router/security/advisories/GHSA-wrjc-x8rr-h8h6)
and [SSR hydration](https://github.com/remix-run/react-router/security/advisories/GHSA-337j-9hxr-rhxg).
The app uses local navigation targets and client-side rendering; fully clearing
them requires a separate migration to React Router 7.18 or later.

Architecture decisions are recorded in [`docs/adr/`](docs/adr/), and repository
vocabulary in [`GLOSSARY.md`](GLOSSARY.md).

## Contributing

Please see [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.

## License and source availability

This project is distributed under the
[GNU Affero General Public License v3.0](LICENSE). It is based on
[drawDB](https://github.com/drawdb-io/drawdb), which is also distributed under
the GNU AGPL v3.0, via
[yms2772/drawdb-collaborative](https://github.com/yms2772/drawdb-collaborative)
and
[artempas/drawdb-collaborative-with-auth](https://github.com/artempas/drawdb-collaborative-with-auth).

If you interact with a deployed, modified version of this application over a
network, you are entitled to receive the Corresponding Source for that version
under section 13 of the GNU AGPL. The source for this version is available at:

https://github.com/rename343/drawdb-collaborative-with-auth

Copyright and attribution notices from the original project are retained. See
the repository history for changes made by this fork.

## Upstream project

The lineage table above links the original project and both intermediate forks.
Upstream website: [drawdb.app](https://drawdb.app/). Upstream community:
[Discord](https://discord.gg/BrjZgNrmR6).
