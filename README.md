<div align="center">
  <sup>Special thanks to:</sup>
  <br>
  <a href="https://www.warp.dev/drawdb/" target="_blank">
    <img alt="Warp sponsorship" width="280" src="https://github.com/user-attachments/assets/c7f141e7-9751-407d-bb0e-d6f2c487b34f">
    <br>
    <b>Next-gen AI-powered intelligent terminal for all platforms</b>
  </a>
</div>

<br/>
<br/>

<div align="center">
    <img width="64" alt="drawDB logo" src="./src/assets/icon-dark.png">
    <h1>drawDB Collaborative</h1>
</div>

<h3 align="center">A self-hosted, real-time collaborative database schema editor.</h3>

<div align="center" style="margin-bottom:12px;">
    <a href="https://github.com/yms2772/drawdb-collaborative" style="display: flex; align-items: center;">
        <img src="https://img.shields.io/badge/Source-GitHub-grey?logo=github" alt="Source code"/>
    </a>
    <a href="./LICENSE" style="display: flex; align-items: center;">
        <img src="https://img.shields.io/badge/License-AGPL--3.0-blue" alt="AGPL-3.0 license"/>
    </a>
</div>

<h3 align="center"><img width="700" style="border-radius:5px;" alt="drawDB screenshot demo" src="drawdb.png"></h3>

drawDB Collaborative is an unofficial fork of
[drawDB](https://github.com/drawdb-io/drawdb). It adds centralized SQLite
storage and real-time WebSocket collaboration while retaining drawDB's
browser-based ERD editing and SQL import/export features.

This fork is independently maintained and is not affiliated with or endorsed
by the original drawDB maintainers.

Key additions include:

- Invite-only accounts with server-side sessions, managed by an administrator
- Centralized diagram storage backed by SQLite
- Real-time table movement and editing between participants
- Participant presence and viewport-aware collaborative cursors
- Optimistic version checks that prevent stale clients from overwriting changes
- Git sync that commits a diagram and its DDL to a repository, and reads them
  back
- A single-container setup for the frontend, API, WebSocket server, and storage

## Getting Started

### Local Development

```bash
git clone https://github.com/yms2772/drawdb-collaborative.git
cd drawdb-collaborative
npm install
export APP_ORIGIN=http://localhost:5173
export BOOTSTRAP_SECRET="$(openssl rand -hex 32)"
npm run dev
```

This starts both the Vite frontend on port `5173` and the API/WebSocket server
on port `3000`. Use `npm run dev:client` or `npm run dev:server` when only one
side is needed. Use `printf '%s\n' "$BOOTSTRAP_SECRET"` in that same terminal
to obtain the secret for the administrator registration form.

### Build

```bash
git clone https://github.com/yms2772/drawdb-collaborative.git
cd drawdb-collaborative
npm install
npm run build
```

### Docker Build

```bash
openssl rand -hex 32
# Put the output in the ignored .env file as BOOTSTRAP_SECRET=<value>
docker compose up --build
```

Open `http://localhost:3333`. The single application container serves the
frontend, diagram API, WebSocket collaboration endpoint, and SQLite storage.
The Compose configuration persists the database in the `drawdb-data` volume.
Registration also requires the value of `BOOTSTRAP_SECRET` from `.env`.

### Collaborative self-hosting

Diagrams are stored centrally in SQLite; IndexedDB is not used for diagram
storage. `DATABASE_PATH` controls the database location and defaults to
`./data/drawdb.sqlite` outside the container. Diagram URLs use
`/diagrams/:diagramId`, and everyone opening the same URL joins the same live
session automatically.

The application exposes:

- `GET /api/auth/status`, `POST /api/auth/register`, `POST /api/auth/login`,
  `POST /api/auth/logout`, `GET /api/auth/me`
- `GET|POST /api/admin/users` (administrator only)
- `GET|POST /api/diagrams`
- `GET|PUT|DELETE /api/diagrams/:diagramId`
- `GET|PUT|DELETE /api/diagrams/:diagramId/git`
- `POST /api/diagrams/:diagramId/git/push`, `.../git/pull`, `.../git/test`,
  `GET .../git/history`
- `/ws/diagrams/:diagramId` (WebSocket)

### Accounts

Every diagram endpoint and the WebSocket handshake require a signed-in user.

There is no open registration. On an empty instance, `/register` asks for the
one-time `BOOTSTRAP_SECRET` configured by the operator. The first account
claims the instance and becomes its administrator. Remove the secret from the
runtime configuration after setup. From then on `/register` returns `403` and
accounts are created only by the administrator, through the people icon in the
editor toolbar (or `POST /api/admin/users`). Accounts created that way are
always regular users — the administrator role cannot be granted over the API,
so an instance has exactly one administrator. Upgrading an instance that
already had accounts promotes its earliest account to administrator.

If the administrator account is lost, the recovery path is direct SQL against
the database, for example
`UPDATE users SET is_admin = 1 WHERE username = '<name>';`.

Passwords are hashed with scrypt and sessions are stored in SQLite, referenced
by an `HttpOnly`, `SameSite=Lax` session cookie that is marked `Secure` when the
request arrives over HTTPS. Sessions last 30 days and slide forward as they are
used, so make sure the reverse proxy forwards `X-Forwarded-Proto` (see below)
for the `Secure` flag to be set correctly.

When `APP_ORIGIN` is configured, WebSocket handshakes require an exact matching
`Origin`. Production requires an HTTPS `APP_ORIGIN`; WebSockets without
that header are rejected. Logging out closes WebSockets associated with that
specific session.

Access follows an owner-plus-link model:

- The creator owns a diagram, sees it in their diagram list, and is the only
  one who can delete it.
- Any signed-in user who has the diagram URL can open, edit, and collaborate on
  it. Treat diagram URLs as shareable secrets.
- Diagrams created before authentication was added have no owner. They stay
  visible and deletable for every signed-in user so no data is stranded.

Collaborator names shown in presence and on cursors come from the signed-in
account, not from the browser, so clients cannot spoof each other.

Snapshot saves are debounced and guarded by an optimistic version. Stale
clients receive the current snapshot instead of silently overwriting it.
Reconnects send the last known version and converge on the server snapshot.

### Git sync

A diagram can be connected to a git repository from **File → Sync with git**.
Each sync writes two files, under an optional path inside the repository:

- `<name>.json` — the diagram document, which is what a pull reads back. Pan and
  zoom are stripped, so moving the canvas never produces a commit.
- `<name>.sql` — the DDL for the diagram's database, generated by the same
  exporter as **File → Export SQL**.

Syncing is always a deliberate act: nothing is committed until someone presses
**Commit and push**, and one press produces exactly one commit carrying both
files. Editing the diagram never touches the repository on its own.

The server does the git work itself. It keeps a working copy per diagram under
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
refused. HTTPS remotes authenticate with an access token, stored AES-256-GCM
encrypted under a key that is generated once and kept in the database, or
derived from `GIT_SECRET_KEY` when that is set. The token is never returned by
the API and is stripped from git's error output. SSH remotes authenticate with a
key mounted into the container, and run in batch mode so a missing key fails
instead of hanging.

Only the diagram owner can point a diagram at a repository or change the
credential; anyone who can edit the diagram can push and pull it. Repository
sync needs `git` on the server — the image installs it, and the panel says so
when it is missing.

When running behind a reverse proxy, forward `X-Forwarded-For` and
`X-Forwarded-Proto`, and allow WebSocket `Upgrade`/`Connection` headers on the
`/ws` path. The browser derives `ws://` or `wss://` from the current page.
Set the server's `APP_ORIGIN` to the exact public HTTPS origin; production
Compose derives it from `APP_DOMAIN`.

### Production VM deployment

The production Compose setup targets **Ubuntu Server 24.04 LTS on x86_64**.
Point a DNS name at the VM and allow inbound TCP ports 80 and 443 (plus UDP
443 for HTTP/3). Install Docker Engine, the Compose plugin, and Python 3.12+
(Ubuntu's `python3` package, used for safe backup extraction), then check
`docker compose version`. Do not publish the application port 3000: Caddy is
the only service with host ports, and the app and proxy share an internal
Compose network. The app can still make outbound Git connections for Git sync.

Clone this repository to `/opt/drawdb` and prepare persistent directories.
The app image runs as `node` (UID/GID 1000), so `/data` must be writable by
that user. `/data` contains SQLite and its WAL files as well as Git working
copies.

```bash
sudo install -d -m 0700 /etc/drawdb
sudo install -d -o 1000 -g 1000 -m 0750 /srv/drawdb/data
sudo install -d -o 1000 -g 1000 -m 0750 /srv/drawdb/caddy-data /srv/drawdb/caddy-config
sudo install -d -o 1000 -g 1000 -m 0700 /etc/drawdb/ssh
sudo install -m 0600 /opt/drawdb/.env.production.example /etc/drawdb/production.env
sudoedit /etc/drawdb/production.env
sudo chmod 0600 /etc/drawdb/production.env
```

Set `DRAWDB_IMAGE` to the GHCR image name, `APP_DOMAIN` to the public DNS
name (without a scheme, path, or trailing slash), and review the host paths.
Generate `BOOTSTRAP_SECRET` with
`openssl rand -hex 32`, place it in `/etc/drawdb/production.env`, and keep a
copy long enough to create the administrator account. This file is outside the
repository and readable only by root. `GIT_SECRET_KEY` is optional; set it
only if you want a separately managed encryption key for stored Git tokens.

The VM needs its own revocable GHCR credential with `read:packages` access. It is
separate from GitHub Actions' `GITHUB_TOKEN`. Log in as root so Docker stores
the credential in root's Docker configuration, not in the repository, Compose
or the environment file:

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
An unhealthy replacement is rolled back to the previous image. If there
is no local image on first start, the service reports that it could not start.
After the first healthy start, open `https://APP_DOMAIN/register` and enter the
bootstrap secret to create the administrator. Then remove `BOOTSTRAP_SECRET`
from `/etc/drawdb/production.env` and run `sudo systemctl start drawdb.service`
to recreate the container without it. Updating the app briefly interrupts
active connections; browsers reconnect and sync the current diagram version.
Rolling back the image does not roll back a SQLite schema or data change made
by the newer image.
The updater exits with an error after a rollback so systemd reports that the
update failed, even when the previous app is healthy. Registry pulls have a
timeout; recovery uses the local image and never pulls the failed image again.

Pushes to the Git branch `production` run validation and publish
`production` plus the full commit SHA to GHCR. Git release tags continue to
publish their tag name, `latest`, and the commit SHA; the literal Git tag name
`production` is reserved for the branch image. All published images target
`linux/amd64`. Updating the VM means running `sudo systemctl start
drawdb.service` after the image is published. The service unit is a oneshot
updater, so it can be started again for later updates. It does not configure
Azure schedules, resource sizes, or costs.
The intended operating window is Wednesday 13:45–16:10 in `Europe/Warsaw`;
configure any VM start/stop schedule outside this repository.

The Compose configuration rotates Docker logs and does not set an arbitrary
memory cap. Backups stop the app cleanly, archive the complete `/data` tree,
and start the app again even if archiving fails. Store copies away from the VM:

```bash
sudo /opt/drawdb/deploy/backup-data.sh /mnt/backup/drawdb
sudo /opt/drawdb/deploy/verify-backup.sh /mnt/backup/drawdb/drawdb-data-....tar.gz
```

Verification extracts the archive to a private temporary directory, rejects
unsafe paths and links, and runs SQLite `PRAGMA integrity_check` using the
local app image. Only the extracted copy is writable during this check so
SQLite can open WAL databases. On a replacement VM without an existing app
container, first pull an app image and set `DRAWDB_VERIFY_IMAGE` to that local
image when running verification or restore (for example,
`sudo env DRAWDB_VERIFY_IMAGE=ghcr.io/rename343/drawdb-collaborative-with-auth:production /opt/drawdb/deploy/verify-backup.sh ARCHIVE`).
To restore, choose a new data directory; the script refuses to overwrite an
existing one:

```bash
sudo /opt/drawdb/deploy/restore-data.sh /mnt/backup/drawdb/drawdb-data-....tar.gz /srv/drawdb/data-restored
```

Review the extracted copy, stop the old container with
`sudo docker stop --timeout 30 drawdb-app`, set `DATA_DIR` to the new directory in
`/etc/drawdb/production.env`, then start the systemd updater. The previous data
directory remains available for rollback. A database restore does not restore
an externally configured `GIT_SECRET_KEY` or SSH private keys; back those up
separately and restore the same key material before starting the app if Git
sync depends on them. Without a custom `GIT_SECRET_KEY`, the encryption key is
stored in SQLite and included in the `/data` archive.

If using SSH remotes, `SSH_KEY_DIR` is mounted read-only at
`/home/node/.ssh`. Keep the private key and verified `known_hosts` file there;
the key directory is not part of `/data` and must be backed up separately.

The updater regression scenarios run with `bash deploy/update-drawdb.test.sh`.
The backup integration scenarios run as root with Node, the installed npm
dependencies, and Python available: `sudo env "PATH=$PATH" bash deploy/backup.test.sh`.
Both suites use temporary data and stub Docker control. They cover registry
failure, rollback, locking, archive failure, SQLite integrity, ownership, and
refusal to overwrite existing data.

CI also checks production dependencies with
`npm audit --omit=dev --audit-level=high`. The lockfile includes the compatible
security updates found during the deployment review. Two moderate package
warnings remain for React Router 6: [external navigation](https://github.com/remix-run/react-router/security/advisories/GHSA-wrjc-x8rr-h8h6)
and [SSR hydration](https://github.com/remix-run/react-router/security/advisories/GHSA-337j-9hxr-rhxg).
The app uses local navigation targets and client-side rendering. Fully clearing
these package warnings requires a separate migration to React Router 7.18 or
later; this deployment change keeps the current routing API.

## Contributing

Please see [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.

## License and source availability

This project is distributed under the
[GNU Affero General Public License v3.0](LICENSE). It is based on
[drawDB](https://github.com/drawdb-io/drawdb), which is also distributed under
the GNU AGPL v3.0.

If you interact with a deployed, modified version of this application over a
network, you are entitled to receive the Corresponding Source for that version
under section 13 of the GNU AGPL. The source for this version is available at:

https://github.com/yms2772/drawdb-collaborative

Copyright and attribution notices from the original project are retained. See
the repository history for changes made by this fork.

## Upstream project

- Original source: [drawdb-io/drawdb](https://github.com/drawdb-io/drawdb)
- Forked source: [artempas/drawdb-collaborative-with-auth](https://github.com/artempas/drawdb-collaborative-with-auth)
- Original project website: [drawdb.app](https://drawdb.app/)
- Upstream community: [Discord](https://discord.gg/BrjZgNrmR6)
