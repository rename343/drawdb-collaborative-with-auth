import assert from "node:assert/strict";
import test from "node:test";
import { createCollabSession } from "./session.js";

function createMemoryTransport() {
  let handlers = null;
  return {
    sent: [],
    opened: false,
    closed: false,
    open(next) {
      handlers = next;
      this.opened = true;
    },
    send(raw) {
      this.sent.push(JSON.parse(raw));
    },
    receive(message) {
      handlers.onMessage(JSON.stringify(message));
    },
    serverOpen() {
      handlers.onOpen();
    },
    serverClose() {
      handlers.onClose();
    },
    close() {
      this.closed = true;
    },
  };
}

function createFakeClock() {
  let currentTime = 0;
  let nextId = 0;
  const timers = new Map();
  return {
    now: () => currentTime,
    setTimeout(callback, delay) {
      const id = ++nextId;
      timers.set(id, { at: currentTime + delay, callback });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    advance(ms) {
      currentTime += ms;
      for (const [id, timer] of [...timers]) {
        if (timer.at <= currentTime) {
          timers.delete(id);
          timer.callback();
        }
      }
    },
  };
}

function createFakeDocument(initial) {
  return {
    current: initial,
    previews: [],
    read() {
      return this.current;
    },
    apply(snapshot) {
      this.current = { name: snapshot.name, document: snapshot.document };
    },
    applyPreview(operation) {
      this.previews.push(operation);
    },
    equal(left, right) {
      return JSON.stringify(left) === JSON.stringify(right);
    },
  };
}

const identity = {
  clientId: "client-a",
  displayName: "A",
  color: "#000",
};

const tick = () => new Promise((resolve) => globalThis.setTimeout(resolve, 0));

async function connectSession({ reader = null } = {}) {
  const transport = createMemoryTransport();
  const clock = createFakeClock();
  const document = createFakeDocument({
    name: "Local",
    document: { tables: [] },
  });
  const writer = {
    writes: [],
    async write(snapshot) {
      this.writes.push(snapshot);
      return { version: 2 };
    },
  };
  const session = createCollabSession({ identity, transport, clock });
  session.connect({
    diagramId: "diagram-1",
    version: 1,
    document,
    writer,
    reader,
    initialSnapshot: document.current,
  });
  transport.serverOpen();
  transport.receive({ type: "joined", diagramId: "diagram-1", version: 1 });
  return { session, transport, clock, document, writer };
}

test("connects, joins and applies remote snapshots", () => {
  const transport = createMemoryTransport();
  const clock = createFakeClock();
  const document = createFakeDocument({
    name: "Local",
    document: { tables: [] },
  });
  const session = createCollabSession({ identity, transport, clock });
  const states = [];
  session.subscribe((state) => states.push(state));

  session.connect({
    diagramId: "diagram-1",
    version: 1,
    document,
    writer: { write: async () => ({ version: 2 }) },
  });
  assert.equal(session.getState().connection, "connecting");
  assert.equal(transport.opened, true);

  transport.serverOpen();
  assert.deepEqual(transport.sent[0], {
    type: "join",
    diagramId: "diagram-1",
    participant: identity,
    lastVersion: 1,
  });

  transport.receive({ type: "joined", diagramId: "diagram-1", version: 1 });
  assert.equal(session.getState().connection, "connected");

  transport.receive({
    type: "snapshot",
    diagramId: "diagram-1",
    version: 2,
    name: "Remote",
    document: { tables: [{ id: "table-1" }] },
  });
  assert.equal(document.current.name, "Remote");
  assert.deepEqual(document.current.document, {
    tables: [{ id: "table-1" }],
  });
  assert.equal(session.getState().version, 2);
  assert.ok(states.length > 0);

  transport.receive({
    type: "operation_preview",
    diagramId: "diagram-1",
    clientId: "client-b",
    operation: {
      type: "table.move",
      payload: { id: "table-1", x: 30, y: 40 },
    },
  });
  assert.deepEqual(document.previews[0], {
    type: "table.move",
    payload: { id: "table-1", x: 30, y: 40 },
  });
});

test("an initial snapshot is not saved back to the server", async () => {
  const transport = createMemoryTransport();
  const clock = createFakeClock();
  const document = createFakeDocument({
    name: "Loaded",
    document: { tables: [{ id: "table-1" }] },
  });
  const session = createCollabSession({ identity, transport, clock });
  session.connect({
    diagramId: "diagram-1",
    version: 3,
    document,
    writer: { write: async () => ({ version: 4 }) },
    initialSnapshot: {
      name: "Loaded",
      document: { tables: [{ id: "table-1" }] },
    },
  });
  transport.serverOpen();
  transport.receive({ type: "joined", diagramId: "diagram-1", version: 3 });

  const saved = session.scheduleSave();
  clock.advance(600);
  await saved;
  assert.equal(
    transport.sent.filter((message) => message.type === "operation").length,
    0,
  );
});

test("Table locks are refcounted and release after a grace period", async () => {
  const { session, transport, clock } = await connectSession();

  const first = session.claim(["table-1"]);
  const acquire = transport.sent.find(
    (message) => message.type === "table_lock_acquire",
  );
  assert.ok(acquire);
  assert.equal(acquire.tableId, "table-1");

  transport.receive({
    type: "table_lock_granted",
    diagramId: "diagram-1",
    requestId: acquire.requestId,
    lock: {
      tableId: "table-1",
      diagramId: "diagram-1",
      clientId: identity.clientId,
      displayName: identity.displayName,
      color: identity.color,
      token: 1,
      expiresAt: 100,
    },
  });
  assert.deepEqual(await first.whenSettled(), { ok: true });
  assert.equal(
    session.getState().tableLocks["table-1"].clientId,
    identity.clientId,
  );

  const second = session.claim(["table-1"]);
  assert.equal(
    transport.sent.filter((m) => m.type === "table_lock_acquire").length,
    1,
  );

  first.release();
  clock.advance(499);
  assert.equal(
    transport.sent.filter((m) => m.type === "table_lock_release").length,
    0,
  );

  second.release();
  clock.advance(500);
  assert.equal(
    transport.sent.filter((m) => m.type === "table_lock_release").length,
    1,
  );
  assert.equal(session.getState().tableLocks["table-1"], undefined);
});

test("a Table lock can be released immediately", async () => {
  const { session, transport } = await connectSession();
  const lease = session.claim(["table-1"]);
  const acquire = transport.sent.find(
    (message) => message.type === "table_lock_acquire",
  );

  transport.receive({
    type: "table_lock_granted",
    diagramId: "diagram-1",
    requestId: acquire.requestId,
    lock: {
      tableId: "table-1",
      diagramId: "diagram-1",
      clientId: identity.clientId,
      displayName: identity.displayName,
      color: identity.color,
      token: 1,
      expiresAt: 100,
    },
  });
  await lease.whenSettled();

  lease.release({ immediate: true });

  assert.equal(
    transport.sent.filter((m) => m.type === "table_lock_release").length,
    1,
  );
  assert.equal(session.getState().tableLocks["table-1"], undefined);
});

test("a denied Table lock reports the blocking participant", async () => {
  const { session, transport } = await connectSession();
  const lease = session.claim(["table-1"]);
  const acquire = transport.sent.find(
    (message) => message.type === "table_lock_acquire",
  );

  transport.receive({
    type: "table_lock_denied",
    diagramId: "diagram-1",
    requestId: acquire.requestId,
    lock: {
      tableId: "table-1",
      clientId: "client-b",
      displayName: "B",
      color: "#fff",
      token: 2,
      expiresAt: 100,
    },
  });

  assert.deepEqual(await lease.whenSettled(), {
    ok: false,
    blockedBy: "B",
  });
  lease.release();
});

test("table move previews need the lock and are throttled", async () => {
  const { session, transport, clock } = await connectSession();
  const lease = session.claim(["table-1"]);
  const acquire = transport.sent.find(
    (message) => message.type === "table_lock_acquire",
  );
  transport.receive({
    type: "table_lock_granted",
    diagramId: "diagram-1",
    requestId: acquire.requestId,
    lock: {
      tableId: "table-1",
      diagramId: "diagram-1",
      clientId: identity.clientId,
      token: 1,
      expiresAt: 100,
    },
  });

  session.previewTableMove("table-1", 10, 20);
  session.previewTableMove("table-1", 30, 40);
  assert.equal(
    transport.sent.filter((message) => message.type === "operation_preview")
      .length,
    0,
  );
  clock.advance(50);
  const previews = transport.sent.filter(
    (message) => message.type === "operation_preview",
  );
  assert.equal(previews.length, 1);
  assert.deepEqual(previews[0].operation.payload, {
    id: "table-1",
    x: 30,
    y: 40,
  });
  lease.release();
});

test("autosave debounces and acknowledges one snapshot", async () => {
  const { session, transport, clock, document } = await connectSession();
  document.current = {
    name: "Local",
    document: { tables: [{ id: "table-1" }] },
  };

  const saved = session.scheduleSave();
  clock.advance(599);
  assert.equal(
    transport.sent.filter((message) => message.type === "operation").length,
    0,
  );
  clock.advance(1);
  const operation = transport.sent.find(
    (message) => message.type === "operation",
  );
  assert.ok(operation);
  assert.equal(operation.baseVersion, 1);
  assert.deepEqual(operation.operation.payload, {
    name: "Local",
    document: { tables: [{ id: "table-1" }] },
  });

  transport.receive({
    type: "operation_applied",
    diagramId: "diagram-1",
    clientId: identity.clientId,
    operationId: operation.operationId,
    version: 2,
    operation: operation.operation,
  });
  await saved;
  assert.equal(session.getState().version, 2);
  assert.equal(session.getState().save.state, "saved");
});

test("autosave does not echo a remote snapshot back to the server", async () => {
  const { session, transport, clock } = await connectSession();
  transport.receive({
    type: "snapshot",
    diagramId: "diagram-1",
    version: 2,
    name: "Remote",
    document: { tables: [{ id: "table-1" }] },
  });

  const saved = session.scheduleSave();
  clock.advance(600);
  await saved;
  assert.equal(
    transport.sent.filter((message) => message.type === "operation").length,
    0,
  );
  assert.equal(session.getState().save.state, "saved");
});

test("autosave falls back to the writer while disconnected", async () => {
  const { session, transport, clock, document, writer } =
    await connectSession();
  transport.serverClose();
  document.current = {
    name: "Offline",
    document: { tables: [{ id: "table-1" }] },
  };

  const saved = session.scheduleSave();
  clock.advance(600);
  await saved;
  assert.equal(writer.writes.length, 1);
  assert.deepEqual(writer.writes[0], {
    name: "Offline",
    document: { tables: [{ id: "table-1" }] },
    baseVersion: 1,
  });
  assert.equal(session.getState().version, 2);
  assert.equal(session.getState().save.state, "saved");
});

test("Diagram edit lock flushes, drops Table locks, commits then releases", async () => {
  const { session, transport, clock, document } = await connectSession();
  const tableLease = session.claim(["table-1"]);
  const tableAcquire = transport.sent.find(
    (message) => message.type === "table_lock_acquire",
  );
  transport.receive({
    type: "table_lock_granted",
    diagramId: "diagram-1",
    requestId: tableAcquire.requestId,
    lock: {
      tableId: "table-1",
      diagramId: "diagram-1",
      clientId: identity.clientId,
      token: 1,
      expiresAt: 100,
    },
  });
  await tableLease.whenSettled();

  document.current = {
    name: "Local edit",
    document: { tables: [{ id: "table-1" }] },
  };
  const beginPromise = session.beginDiagramEdit();
  await tick();
  const save = transport.sent.find((message) => message.type === "operation");
  assert.ok(save);
  transport.receive({
    type: "operation_applied",
    diagramId: "diagram-1",
    clientId: identity.clientId,
    operationId: save.operationId,
    version: 2,
    operation: save.operation,
  });
  await tick();

  const diagramAcquire = transport.sent.find(
    (message) => message.type === "diagram_lock_acquire",
  );
  assert.ok(diagramAcquire);
  const releaseIndex = transport.sent.findIndex(
    (message) => message.type === "table_lock_release",
  );
  const acquireIndex = transport.sent.findIndex(
    (message) => message.type === "diagram_lock_acquire",
  );
  assert.ok(releaseIndex >= 0);
  assert.ok(releaseIndex < acquireIndex);

  transport.receive({
    type: "diagram_lock_granted",
    diagramId: "diagram-1",
    requestId: diagramAcquire.requestId,
    version: 2,
    lock: {
      diagramId: "diagram-1",
      clientId: identity.clientId,
      displayName: identity.displayName,
      token: 9,
      expiresAt: 999,
    },
  });
  assert.deepEqual(await beginPromise, {
    ok: true,
    lock: {
      diagramId: "diagram-1",
      clientId: identity.clientId,
      displayName: identity.displayName,
      token: 9,
      expiresAt: 999,
    },
    version: 2,
    stale: false,
  });
  assert.equal(session.getState().diagramPhase, "editing");

  document.current = {
    name: "GUI edit while locked",
    document: { tables: [] },
  };
  const suppressed = session.scheduleSave();
  clock.advance(600);
  await suppressed;
  assert.equal(
    transport.sent.filter(
      (message) =>
        message.type === "operation" &&
        message.operation.payload.name === "GUI edit while locked",
    ).length,
    0,
  );

  const commitPromise = session.commitDiagramEdit({
    name: "Applied",
    document: { tables: [] },
  });
  await tick();
  const commit = [...transport.sent]
    .reverse()
    .find((message) => message.type === "operation");
  assert.equal(commit.operation.payload.name, "Applied");
  transport.receive({
    type: "operation_applied",
    diagramId: "diagram-1",
    clientId: identity.clientId,
    operationId: commit.operationId,
    version: 3,
    operation: commit.operation,
  });
  assert.deepEqual(await commitPromise, { ok: true, version: 3 });
  assert.equal(session.getState().diagramPhase, "idle");
  assert.equal(session.getState().diagramLock, null);
  const release = transport.sent.find(
    (message) => message.type === "diagram_lock_release",
  );
  assert.equal(release.token, 9);
  tableLease.release();
});

test("Diagram edit lock denial blocks Table locks and loss is not retried", async () => {
  const { session, transport } = await connectSession();
  const beginPromise = session.beginDiagramEdit();
  await tick();
  const acquire = transport.sent.find(
    (message) => message.type === "diagram_lock_acquire",
  );
  transport.receive({
    type: "diagram_lock_denied",
    diagramId: "diagram-1",
    requestId: acquire.requestId,
    lock: {
      diagramId: "diagram-1",
      clientId: "client-b",
      displayName: "B",
      token: 7,
      expiresAt: 999,
    },
  });
  const denied = await beginPromise;
  assert.equal(denied.ok, false);
  assert.equal(denied.reason, "held");
  assert.equal(denied.blockedBy.displayName, "B");
  assert.equal(session.getState().diagramPhase, "blocked");

  const tableAcquires = transport.sent.filter(
    (message) => message.type === "table_lock_acquire",
  ).length;
  const lease = session.claim(["table-1"]);
  assert.equal(
    transport.sent.filter((message) => message.type === "table_lock_acquire")
      .length,
    tableAcquires,
  );
  lease.release();

  transport.receive({
    type: "diagram_lock_state",
    diagramId: "diagram-1",
    lock: null,
  });
  assert.equal(session.getState().diagramPhase, "idle");

  const beginAgain = session.beginDiagramEdit();
  await tick();
  const secondAcquire = transport.sent
    .filter((message) => message.type === "diagram_lock_acquire")
    .at(-1);
  transport.receive({
    type: "diagram_lock_granted",
    diagramId: "diagram-1",
    requestId: secondAcquire.requestId,
    version: 1,
    lock: {
      diagramId: "diagram-1",
      clientId: identity.clientId,
      token: 8,
      expiresAt: 999,
    },
  });
  await beginAgain;

  const acquireCount = transport.sent.filter(
    (message) => message.type === "diagram_lock_acquire",
  ).length;
  transport.receive({
    type: "diagram_lock_state",
    diagramId: "diagram-1",
    lock: null,
  });
  assert.equal(session.getState().diagramPhase, "lost");
  assert.equal(
    transport.sent.filter((message) => message.type === "diagram_lock_acquire")
      .length,
    acquireCount,
  );

  transport.receive({
    type: "diagram_lock_state",
    diagramId: "diagram-1",
    lock: null,
  });
  assert.equal(session.getState().diagramPhase, "lost");
});

test("re-entering edit mode refreshes a stale snapshot", async () => {
  const reader = {
    async read() {
      return {
        name: "Fresh",
        document: { tables: [{ id: "fresh" }] },
        version: 2,
      };
    },
  };
  const { session, transport, document } = await connectSession({ reader });
  const beginPromise = session.beginDiagramEdit();
  await tick();
  const acquire = transport.sent.find(
    (message) => message.type === "diagram_lock_acquire",
  );
  transport.receive({
    type: "diagram_lock_granted",
    diagramId: "diagram-1",
    requestId: acquire.requestId,
    version: 2,
    lock: {
      diagramId: "diagram-1",
      clientId: identity.clientId,
      token: 11,
      expiresAt: 999,
    },
  });
  const begin = await beginPromise;
  assert.equal(begin.ok, true);
  assert.equal(begin.version, 2);
  assert.equal(begin.refreshed, true);
  assert.deepEqual(document.current, {
    name: "Fresh",
    document: { tables: [{ id: "fresh" }] },
  });
  assert.equal(session.getState().version, 2);
});

test("an offline writer conflict applies the server snapshot", async () => {
  const { session, transport, clock, document, writer } =
    await connectSession();
  transport.serverClose();
  document.current = {
    name: "Offline",
    document: { tables: [{ id: "table-1" }] },
  };
  writer.write = async () => ({
    conflict: true,
    version: 5,
    diagram: {
      name: "Server",
      document: { tables: [{ id: "table-2" }] },
      version: 5,
    },
  });

  const saved = session.scheduleSave();
  clock.advance(600);
  await saved;
  assert.deepEqual(document.current, {
    name: "Server",
    document: { tables: [{ id: "table-2" }] },
  });
  assert.equal(session.getState().version, 5);
  assert.equal(session.getState().save.state, "conflict");
});

test("a resync keeps the server snapshot and marks the save as conflict", async () => {
  const { session, transport, clock, document } = await connectSession();
  document.current = {
    name: "Local",
    document: { tables: [{ id: "table-1" }] },
  };
  const saved = session.scheduleSave();
  clock.advance(600);

  transport.receive({
    type: "resync_required",
    diagramId: "diagram-1",
    version: 3,
    name: "Server",
    document: { tables: [{ id: "table-2" }] },
  });
  await saved;
  assert.deepEqual(document.current, {
    name: "Server",
    document: { tables: [{ id: "table-2" }] },
  });
  assert.equal(session.getState().version, 3);
  assert.equal(session.getState().save.state, "conflict");
});
