import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { WebSocket } from "ws";
import { createDiagramStore, openDatabase } from "./database.js";
import { createApplication } from "./index.js";
import { isValidOperationPreview } from "./protocol.js";
import { createTableLockManager } from "./tableLocks.js";

/* global process */

function waitForMessage(socket, predicate) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off("message", onMessage);
      reject(new Error("Timed out waiting for WebSocket message"));
    }, 2_000);
    const onMessage = (raw) => {
      const message = JSON.parse(raw.toString());
      if (!predicate(message)) return;
      clearTimeout(timeout);
      socket.off("message", onMessage);
      resolve(message);
    };
    socket.on("message", onMessage);
  });
}

function openSocket(url, cookie, origin = "http://localhost:5173") {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (cookie) headers.Cookie = cookie;
    if (origin) headers.Origin = origin;
    const socket = new WebSocket(url, { headers });
    socket.once("open", () => resolve(socket));
    socket.once("error", reject);
  });
}

function waitForClose(socket) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Timed out waiting for WebSocket close")),
      2_000,
    );
    socket.once("close", (code, reason) => {
      clearTimeout(timeout);
      resolve({ code, reason: reason.toString() });
    });
  });
}

async function listen(application) {
  await new Promise((resolve) =>
    application.server.listen(0, "127.0.0.1", resolve),
  );
  return application.server.address().port;
}

function sessionCookieFrom(response) {
  const header = response.headers.get("set-cookie");
  assert.ok(header, "expected a session cookie");
  return header.split(";")[0];
}

const PASSWORD = "correct-horse-9";
const BOOTSTRAP_SECRET = "test-bootstrap-secret-for-local-suite-2026";
const JSON_HEADERS = { "Content-Type": "application/json" };

function createTestApplication(options = {}) {
  return createApplication({
    bootstrapSecret: BOOTSTRAP_SECRET,
    appOrigin: "http://localhost:5173",
    ...options,
  });
}

async function registerAdmin(port, username, password = PASSWORD) {
  const response = await fetch(`http://127.0.0.1:${port}/api/auth/register`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({
      username,
      password,
      bootstrapSecret: BOOTSTRAP_SECRET,
    }),
  });
  assert.equal(response.status, 201);
  return sessionCookieFrom(response);
}

/**
 * Registration closes after the first account, so every later user is created
 * by the administrator and then signs in to get their own session cookie.
 */
async function createUsers(port, usernames) {
  const base = `http://127.0.0.1:${port}`;
  const [first, ...rest] = usernames;
  const cookies = { [first]: await registerAdmin(port, first) };
  for (const username of rest) {
    const created = await fetch(`${base}/api/admin/users`, {
      method: "POST",
      headers: { ...JSON_HEADERS, Cookie: cookies[first] },
      body: JSON.stringify({ username, password: PASSWORD }),
    });
    assert.equal(created.status, 201);
    const login = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ username, password: PASSWORD }),
    });
    assert.equal(login.status, 200);
    cookies[username] = sessionCookieFrom(login);
  }
  return cookies;
}

test("diagram persistence enforces optimistic versions and operation IDs", () => {
  const database = openDatabase(":memory:");
  const store = createDiagramStore(database);

  const created = store.create({
    id: "diagram-1",
    name: "One",
    document: { tables: [] },
  });
  assert.equal(created.version, 1);

  const updated = store.updateSnapshot({
    id: "diagram-1",
    name: "Updated",
    document: { tables: [{ id: "table-1" }] },
    baseVersion: 1,
    operationId: "operation-1",
  });
  assert.equal(updated.status, "updated");
  assert.equal(updated.diagram.version, 2);

  const duplicate = store.updateSnapshot({
    id: "diagram-1",
    name: "Duplicate",
    document: {},
    baseVersion: 1,
    operationId: "operation-1",
  });
  assert.equal(duplicate.status, "duplicate");
  assert.equal(duplicate.diagram.name, "Updated");

  const conflict = store.updateSnapshot({
    id: "diagram-1",
    name: "Stale",
    document: {},
    baseVersion: 1,
    operationId: "operation-2",
  });
  assert.equal(conflict.status, "conflict");
  assert.equal(conflict.diagram.version, 2);
  database.close();
});

test("validates ephemeral table movement previews", () => {
  assert.equal(
    isValidOperationPreview({
      type: "table.move",
      payload: { id: 0, x: 10, y: 20 },
    }),
    true,
  );
  assert.equal(
    isValidOperationPreview({
      type: "table.move",
      payload: { id: "table-1", x: 120.5, y: -40 },
    }),
    true,
  );
  assert.equal(
    isValidOperationPreview({
      type: "table.move",
      payload: { id: "../table", x: 1, y: 2 },
    }),
    false,
  );
  assert.equal(
    isValidOperationPreview({
      type: "table.move",
      payload: { id: "table-1", x: Number.NaN, y: 2 },
    }),
    false,
  );
});

test("table edit leases are exclusive and expire", () => {
  let currentTime = 1_000;
  const locks = createTableLockManager({
    leaseMs: 100,
    now: () => currentTime,
  });
  const participantA = {
    clientId: "client-a",
    displayName: "A",
    color: "#000",
  };
  const participantB = {
    clientId: "client-b",
    displayName: "B",
    color: "#fff",
  };

  const acquired = locks.acquire("diagram-1", "table-1", participantA);
  assert.equal(acquired.granted, true);
  assert.equal(locks.owns("diagram-1", "table-1", "client-a"), true);

  const denied = locks.acquire("diagram-1", "table-1", participantB);
  assert.equal(denied.granted, false);
  assert.equal(denied.lock.clientId, "client-a");

  currentTime += 101;
  const acquiredAfterExpiry = locks.acquire(
    "diagram-1",
    "table-1",
    participantB,
  );
  assert.equal(acquiredAfterExpiry.granted, true);
  assert.notEqual(acquiredAfterExpiry.lock.token, acquired.lock.token);
});

test("WebSocket table locks reject concurrent edits", async (t) => {
  const application = createTestApplication({ databasePath: ":memory:" });
  application.store.create({
    id: "diagram-lock-test",
    name: "Lock test",
    document: { tables: [{ id: 0, x: 0, y: 0 }] },
  });
  const port = await listen(application);
  const url = `ws://127.0.0.1:${port}/ws/diagrams/diagram-lock-test`;
  const cookies = await createUsers(port, ["client-a", "client-b"]);
  const clientA = await openSocket(url, cookies["client-a"]);
  const clientB = await openSocket(url, cookies["client-b"]);
  t.after(() => {
    clientA.close();
    clientB.close();
    application.websocket.close();
    application.server.close();
    application.database.close();
  });

  const join = async (socket, clientId) => {
    const joined = waitForMessage(
      socket,
      (message) => message.type === "joined",
    );
    socket.send(
      JSON.stringify({
        type: "join",
        diagramId: "diagram-lock-test",
        lastVersion: 1,
        participant: { clientId, displayName: clientId, color: "#000" },
      }),
    );
    await joined;
  };
  await join(clientA, "client-a");
  await join(clientB, "client-b");

  const grantedA = waitForMessage(
    clientA,
    (message) => message.type === "table_lock_granted",
  );
  const releasedState = waitForMessage(
    clientB,
    (message) =>
      message.type === "table_lock_state" && message.locks.length === 0,
  );
  clientA.send(
    JSON.stringify({
      type: "table_lock_acquire",
      diagramId: "diagram-lock-test",
      tableId: 0,
      requestId: "request-a",
    }),
  );
  const lockA = (await grantedA).lock;

  const deniedB = waitForMessage(
    clientB,
    (message) => message.type === "table_lock_denied",
  );
  clientB.send(
    JSON.stringify({
      type: "table_lock_acquire",
      diagramId: "diagram-lock-test",
      tableId: 0,
      requestId: "request-b",
    }),
  );
  assert.equal((await deniedB).lock.clientId, "client-a");

  const previewRejected = waitForMessage(
    clientB,
    (message) =>
      message.type === "error" &&
      message.message === "A table edit lock is required",
  );
  clientB.send(
    JSON.stringify({
      type: "operation_preview",
      diagramId: "diagram-lock-test",
      operation: {
        type: "table.move",
        payload: { id: 0, x: 10, y: 20 },
      },
    }),
  );
  await previewRejected;

  clientA.send(
    JSON.stringify({
      type: "table_lock_release",
      diagramId: "diagram-lock-test",
      tableId: 0,
      token: lockA.token,
    }),
  );
  await releasedState;
  const grantedB = waitForMessage(
    clientB,
    (message) => message.type === "table_lock_granted",
  );
  clientB.send(
    JSON.stringify({
      type: "table_lock_acquire",
      diagramId: "diagram-lock-test",
      tableId: 0,
      requestId: "request-b-after-release",
    }),
  );
  assert.equal((await grantedB).lock.clientId, "client-b");
});

test("diagram endpoints reject unauthenticated callers", async (t) => {
  const application = createTestApplication({ databasePath: ":memory:" });
  application.store.create({
    id: "diagram-auth-test",
    name: "Auth test",
    document: { tables: [] },
  });
  const port = await listen(application);
  t.after(() => {
    application.websocket.close();
    application.server.close();
    application.database.close();
  });
  const base = `http://127.0.0.1:${port}`;

  for (const path of ["/api/diagrams", "/api/diagrams/diagram-auth-test"]) {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, 401);
  }

  await assert.rejects(
    openSocket(`ws://127.0.0.1:${port}/ws/diagrams/diagram-auth-test`),
    /401/,
  );

  const cookie = await registerAdmin(port, "reader");
  const authorized = await fetch(`${base}/api/diagrams`, {
    headers: { Cookie: cookie },
  });
  assert.equal(authorized.status, 200);
});

test("registration, login and logout manage the session cookie", async (t) => {
  const application = createTestApplication({ databasePath: ":memory:" });
  const port = await listen(application);
  t.after(() => {
    application.websocket.close();
    application.server.close();
    application.database.close();
  });
  const base = `http://127.0.0.1:${port}`;
  const json = { "Content-Type": "application/json" };

  const short = await fetch(`${base}/api/auth/register`, {
    method: "POST",
    headers: json,
    body: JSON.stringify({ username: "bob", password: "short" }),
  });
  assert.equal(short.status, 400);

  const cookie = await registerAdmin(port, "alice", "long-enough-secret");

  const duplicate = await fetch(`${base}/api/admin/users`, {
    method: "POST",
    headers: { ...json, Cookie: cookie },
    body: JSON.stringify({ username: "ALICE", password: "long-enough-secret" }),
  });
  assert.equal(duplicate.status, 409);

  const me = await fetch(`${base}/api/auth/me`, {
    headers: { Cookie: cookie },
  });
  assert.equal(me.status, 200);
  assert.equal((await me.json()).user.username, "alice");

  const wrongPassword = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: json,
    body: JSON.stringify({ username: "alice", password: "wrong-password-1" }),
  });
  assert.equal(wrongPassword.status, 401);

  const login = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: json,
    body: JSON.stringify({ username: "alice", password: "long-enough-secret" }),
  });
  assert.equal(login.status, 200);
  const secondCookie = sessionCookieFrom(login);

  const logout = await fetch(`${base}/api/auth/logout`, {
    method: "POST",
    headers: { Cookie: secondCookie },
  });
  assert.equal(logout.status, 204);

  const afterLogout = await fetch(`${base}/api/auth/me`, {
    headers: { Cookie: secondCookie },
  });
  assert.equal(afterLogout.status, 401);

  // Logging out one session must not invalidate the other.
  const stillValid = await fetch(`${base}/api/auth/me`, {
    headers: { Cookie: cookie },
  });
  assert.equal(stillValid.status, 200);
});

test("diagram listing is scoped to the owner and only owners delete", async (t) => {
  const application = createTestApplication({ databasePath: ":memory:" });
  const port = await listen(application);
  t.after(() => {
    application.websocket.close();
    application.server.close();
    application.database.close();
  });
  const base = `http://127.0.0.1:${port}`;
  const cookies = await createUsers(port, ["owner", "other"]);
  const ownerCookie = cookies.owner;
  const otherCookie = cookies.other;

  // Predates authentication: no owner, so it stays visible to everyone.
  application.store.create({
    id: "legacy-diagram",
    name: "Legacy",
    document: { tables: [] },
  });

  const created = await fetch(`${base}/api/diagrams`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: ownerCookie },
    body: JSON.stringify({
      id: "owned-diagram",
      name: "Owned",
      document: { tables: [] },
    }),
  });
  assert.equal(created.status, 201);

  const listFor = async (cookie) => {
    const response = await fetch(`${base}/api/diagrams`, {
      headers: { Cookie: cookie },
    });
    assert.equal(response.status, 200);
    return (await response.json()).diagrams.map((diagram) => diagram.id).sort();
  };
  assert.deepEqual(await listFor(ownerCookie), [
    "legacy-diagram",
    "owned-diagram",
  ]);
  assert.deepEqual(await listFor(otherCookie), ["legacy-diagram"]);

  // Link sharing: a non-owner can still open and edit the diagram.
  const read = await fetch(`${base}/api/diagrams/owned-diagram`, {
    headers: { Cookie: otherCookie },
  });
  assert.equal(read.status, 200);
  const edit = await fetch(`${base}/api/diagrams/owned-diagram`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: otherCookie },
    body: JSON.stringify({
      name: "Edited by other",
      document: { tables: [] },
      baseVersion: 1,
    }),
  });
  assert.equal(edit.status, 200);

  const forbidden = await fetch(`${base}/api/diagrams/owned-diagram`, {
    method: "DELETE",
    headers: { Cookie: otherCookie },
  });
  assert.equal(forbidden.status, 403);

  const deleted = await fetch(`${base}/api/diagrams/owned-diagram`, {
    method: "DELETE",
    headers: { Cookie: ownerCookie },
  });
  assert.equal(deleted.status, 204);
});

test("registration closes after the first account claims the instance", async (t) => {
  const application = createTestApplication({ databasePath: ":memory:" });
  const port = await listen(application);
  t.after(() => {
    application.websocket.close();
    application.server.close();
    application.database.close();
  });
  const base = `http://127.0.0.1:${port}`;

  const before = await fetch(`${base}/api/auth/status`);
  assert.deepEqual(await before.json(), { setupRequired: true });

  const missingSecret = await fetch(`${base}/api/auth/register`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ username: "root", password: PASSWORD }),
  });
  assert.equal(missingSecret.status, 403);

  const secureRegistration = await fetch(`${base}/api/auth/register`, {
    method: "POST",
    headers: { ...JSON_HEADERS, "X-Forwarded-Proto": "https" },
    body: JSON.stringify({
      username: "root",
      password: PASSWORD,
      bootstrapSecret: BOOTSTRAP_SECRET,
    }),
  });
  assert.equal(secureRegistration.status, 201);
  assert.match(secureRegistration.headers.get("set-cookie"), /; Secure(?:;|$)/);
  const adminCookie = sessionCookieFrom(secureRegistration);

  const after = await fetch(`${base}/api/auth/status`);
  assert.deepEqual(await after.json(), { setupRequired: false });

  const second = await fetch(`${base}/api/auth/register`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ username: "intruder", password: PASSWORD }),
  });
  assert.equal(second.status, 403);

  const login = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ username: "intruder", password: PASSWORD }),
  });
  assert.equal(login.status, 401);

  const me = await fetch(`${base}/api/auth/me`, {
    headers: { Cookie: adminCookie },
  });
  assert.equal((await me.json()).user.isAdmin, true);
});

test("WebSocket handshakes require the configured origin and a live session", async (t) => {
  const application = createTestApplication({
    databasePath: ":memory:",
    appOrigin: "https://draw.example.test",
  });
  application.store.create({
    id: "origin-test-diagram",
    name: "Origin test",
    document: { tables: [] },
  });
  const port = await listen(application);
  t.after(async () => application.shutdown());
  const cookie = await registerAdmin(port, "origin-user");
  const url = `ws://127.0.0.1:${port}/ws/diagrams/`;

  await assert.rejects(
    openSocket(
      `${url}origin-test-diagram`,
      undefined,
      "https://draw.example.test",
    ),
    /401/,
  );
  await assert.rejects(
    openSocket(`${url}missing-diagram`, cookie, "https://draw.example.test"),
    /404/,
  );
  await assert.rejects(
    openSocket(`${url}origin-test-diagram`, cookie, "https://attacker.test"),
    /403/,
  );
  await assert.rejects(
    openSocket(`${url}origin-test-diagram`, cookie, null),
    /403/,
  );

  const socket = await openSocket(
    `${url}origin-test-diagram`,
    cookie,
    "https://draw.example.test",
  );
  const closed = waitForClose(socket);
  socket.close();
  await closed;
});

test("logout closes only sockets tied to the logged-out session", async (t) => {
  const application = createTestApplication({ databasePath: ":memory:" });
  application.store.create({
    id: "session-close-diagram",
    name: "Session close",
    document: { tables: [] },
  });
  const port = await listen(application);
  t.after(async () => application.shutdown());
  const firstCookie = await registerAdmin(port, "session-user");
  const login = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ username: "session-user", password: PASSWORD }),
  });
  assert.equal(login.status, 200);
  const secondCookie = sessionCookieFrom(login);
  const url = `ws://127.0.0.1:${port}/ws/diagrams/session-close-diagram`;
  const firstSocket = await openSocket(url, firstCookie);
  const secondSocket = await openSocket(url, secondCookie);
  const firstClosed = waitForClose(firstSocket);

  const logout = await fetch(`http://127.0.0.1:${port}/api/auth/logout`, {
    method: "POST",
    headers: { Cookie: firstCookie },
  });
  assert.equal(logout.status, 204);
  assert.equal((await firstClosed).code, 1008);
  assert.equal(secondSocket.readyState, WebSocket.OPEN);

  const joined = waitForMessage(
    secondSocket,
    (message) => message.type === "joined",
  );
  secondSocket.send(
    JSON.stringify({
      type: "join",
      diagramId: "session-close-diagram",
      lastVersion: 1,
      participant: {
        clientId: "second-session",
        displayName: "Second",
        color: "blue",
      },
    }),
  );
  await joined;
  const pong = waitForMessage(
    secondSocket,
    (message) => message.type === "pong",
  );
  secondSocket.send(
    JSON.stringify({
      type: "ping",
      diagramId: "session-close-diagram",
    }),
  );
  await pong;
  secondSocket.close();
});

test("graceful shutdown closes WebSockets and SQLite", async () => {
  const application = createTestApplication({ databasePath: ":memory:" });
  application.store.create({
    id: "shutdown-test-diagram",
    name: "Shutdown test",
    document: { tables: [] },
  });
  const port = await listen(application);
  const cookie = await registerAdmin(port, "shutdown-user");
  const socket = await openSocket(
    `ws://127.0.0.1:${port}/ws/diagrams/shutdown-test-diagram`,
    cookie,
  );
  const closed = waitForClose(socket);
  await application.shutdown();

  assert.equal((await closed).code, 1001);
  assert.throws(() => application.database.prepare("SELECT 1"), /not open/);
});

test("a logged-out peer cannot edit while ignoring the WebSocket close frame", async (t) => {
  const application = createTestApplication({ databasePath: ":memory:" });
  const port = await listen(application);
  t.after(() => application.shutdown());
  const cookie = await registerAdmin(port, "closing-user");
  const diagramId = "closing-socket-diagram";
  application.store.create({ id: diagramId, name: "Original", document: {} });
  const socket = await openSocket(
    `ws://127.0.0.1:${port}/ws/diagrams/${diagramId}`,
    cookie,
  );
  t.after(() => socket.terminate());
  const joined = waitForMessage(socket, (message) => message.type === "joined");
  socket.send(
    JSON.stringify({
      type: "join",
      diagramId,
      lastVersion: 1,
      participant: {
        clientId: "closing-client",
        displayName: "Closing",
        color: "blue",
      },
    }),
  );
  await joined;

  // A stalled reader cannot acknowledge the server's close frame.
  socket._socket.pause();
  const logout = await fetch(`http://127.0.0.1:${port}/api/auth/logout`, {
    method: "POST",
    headers: { Cookie: cookie },
  });
  assert.equal(logout.status, 204);
  const peer = [...application.websocket.clients][0];
  assert.equal(peer.readyState, WebSocket.CLOSING);
  const received = new Promise((resolve) => peer.once("message", resolve));
  socket.send(
    JSON.stringify({
      type: "operation",
      diagramId,
      clientId: "closing-client",
      operationId: "revoked-operation",
      baseVersion: 1,
      operation: {
        type: "snapshot.replace",
        payload: { name: "Revoked edit", document: {} },
      },
    }),
  );
  await received;
  assert.equal(application.store.get(diagramId).version, 1);
  socket.terminate();
});

test("shutdown waits for an async handler even after its client disconnects", async (t) => {
  const application = createTestApplication({ databasePath: ":memory:" });
  const port = await listen(application);
  t.after(() => application.shutdown());
  await registerAdmin(port, "draining-user");
  let entered;
  let complete;
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  const finished = new Promise((resolve) => {
    complete = resolve;
  });
  const verify = application.auth.verifyCredentials;
  application.auth.verifyCredentials = async (credentials) => {
    entered();
    await finished;
    return verify(credentials);
  };
  const controller = new AbortController();
  const response = fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: "POST",
    headers: JSON_HEADERS,
    signal: controller.signal,
    body: JSON.stringify({ username: "draining-user", password: PASSWORD }),
  }).catch(() => null);
  await started;
  controller.abort();
  const shutdown = application.shutdown();
  await response;
  assert.equal(application.database.open, true);
  complete();
  await shutdown;
  assert.equal(application.database.open, false);
});

test(
  "shutdown cancels a blocked Git request before closing SQLite",
  { timeout: 10_000 },
  async (t) => {
    let reachedRemote;
    const remoteRequested = new Promise((resolve) => {
      reachedRemote = resolve;
    });
    const remote = http.createServer(() => {
      reachedRemote();
    });
    await new Promise((resolve) => remote.listen(0, "127.0.0.1", resolve));
    t.after(() => {
      remote.closeAllConnections();
      remote.close();
    });
    const application = createTestApplication({ databasePath: ":memory:" });
    const port = await listen(application);
    t.after(() => application.shutdown({ timeoutMs: 50 }));
    const cookie = await registerAdmin(port, "git-draining-user");
    const user = application.auth.listUsers()[0];
    const diagramId = "git-draining-diagram";
    application.store.create({
      id: diagramId,
      name: "Slow Git",
      document: {},
      ownerId: user.id,
    });
    const configured = await fetch(
      `http://127.0.0.1:${port}/api/diagrams/${diagramId}/git`,
      {
        method: "PUT",
        headers: { ...JSON_HEADERS, Cookie: cookie },
        body: JSON.stringify({
          remoteUrl: `http://127.0.0.1:${remote.address().port}/slow.git`,
          branch: "main",
        }),
      },
    );
    assert.equal(configured.status, 200);
    const controller = new AbortController();
    const response = fetch(
      `http://127.0.0.1:${port}/api/diagrams/${diagramId}/git/test`,
      {
        method: "POST",
        headers: { Cookie: cookie },
        signal: controller.signal,
      },
    )
      .then((result) => result.text())
      .catch(() => null);
    await Promise.race([
      remoteRequested,
      response.then((body) => {
        throw new Error(`Git finished before reaching the remote: ${body}`);
      }),
    ]);
    await application.shutdown({ timeoutMs: 50 });
    controller.abort();
    await response;
    assert.equal(application.database.open, false);
  },
);

test("reconnect after restart resynchronizes a persisted diagram and session", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "drawdb-reconnect-"));
  const databasePath = path.join(directory, "drawdb.sqlite");
  let application = createTestApplication({ databasePath });
  t.after(async () => {
    await application.shutdown();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  let port = await listen(application);
  const cookie = await registerAdmin(port, "reconnecting-user");
  const diagramId = "reconnect-diagram";
  application.store.create({
    id: diagramId,
    name: "Before restart",
    document: {},
  });
  application.store.updateSnapshot({
    id: diagramId,
    name: "Persisted",
    document: { tables: [] },
    baseVersion: 1,
  });
  const socket = await openSocket(
    `ws://127.0.0.1:${port}/ws/diagrams/${diagramId}`,
    cookie,
  );
  const closed = waitForClose(socket);
  await application.shutdown();
  assert.equal((await closed).code, 1001);

  application = createTestApplication({ databasePath });
  port = await listen(application);
  const reconnected = await openSocket(
    `ws://127.0.0.1:${port}/ws/diagrams/${diagramId}`,
    cookie,
  );
  const snapshot = waitForMessage(
    reconnected,
    (message) => message.type === "snapshot",
  );
  reconnected.send(
    JSON.stringify({
      type: "join",
      diagramId,
      lastVersion: 1,
      participant: {
        clientId: "reconnecting-client",
        displayName: "Reconnect",
        color: "blue",
      },
    }),
  );
  const current = await snapshot;
  assert.equal(current.version, 2);
  assert.equal(current.name, "Persisted");
  assert.deepEqual(current.document, { tables: [] });
  reconnected.close();
});

test("SIGTERM closes the process and leaves SQLite reopenable", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "drawdb-sigterm-"));
  const databasePath = path.join(directory, "drawdb.sqlite");
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      APP_ORIGIN: "https://draw.example.test",
      BOOTSTRAP_SECRET,
      DATABASE_PATH: databasePath,
      NODE_ENV: "production",
      PORT: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => {
    child.kill("SIGKILL");
    fs.rmSync(directory, { recursive: true, force: true });
  });

  await new Promise((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(
      () => reject(new Error(`Server did not start: ${output}`)),
      5_000,
    );
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
      if (output.includes("drawDB listening")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });

  child.kill("SIGTERM");
  const [exitCode, signal] = await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Server did not exit after SIGTERM")),
      5_000,
    );
    child.once("exit", (code, receivedSignal) => {
      clearTimeout(timeout);
      resolve([code, receivedSignal]);
    });
  });
  assert.equal(exitCode, 0);
  assert.equal(signal, null);

  const database = openDatabase(databasePath);
  assert.equal(database.pragma("integrity_check", { simple: true }), "ok");
  database.close();
});

test("only the administrator can create accounts", async (t) => {
  const application = createTestApplication({ databasePath: ":memory:" });
  const port = await listen(application);
  t.after(() => {
    application.websocket.close();
    application.server.close();
    application.database.close();
  });
  const base = `http://127.0.0.1:${port}`;
  const cookies = await createUsers(port, ["root", "member"]);

  const listed = await fetch(`${base}/api/admin/users`, {
    headers: { Cookie: cookies.root },
  });
  assert.equal(listed.status, 200);
  const { users } = await listed.json();
  assert.deepEqual(
    users.map((user) => [user.username, user.isAdmin]),
    [
      ["root", true],
      ["member", false],
    ],
  );

  for (const method of ["GET", "POST"]) {
    const response = await fetch(`${base}/api/admin/users`, {
      method,
      headers: { ...JSON_HEADERS, Cookie: cookies.member },
      body:
        method === "POST"
          ? JSON.stringify({ username: "sneaky", password: PASSWORD })
          : undefined,
    });
    assert.equal(response.status, 403);
  }

  const anonymous = await fetch(`${base}/api/admin/users`);
  assert.equal(anonymous.status, 401);

  // Administrator status is not handed out through this endpoint.
  const escalation = await fetch(`${base}/api/admin/users`, {
    method: "POST",
    headers: { ...JSON_HEADERS, Cookie: cookies.root },
    body: JSON.stringify({
      username: "wannabe",
      password: PASSWORD,
      isAdmin: true,
    }),
  });
  assert.equal(escalation.status, 201);
  assert.equal((await escalation.json()).user.isAdmin, false);
});
