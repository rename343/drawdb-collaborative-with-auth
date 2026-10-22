import assert from "node:assert/strict";
import test from "node:test";
import { createLockRegistry } from "./lockRegistry.js";

const participant = (clientId) => ({
  clientId,
  displayName: clientId,
  color: "#000",
});

test("table locks are exclusive and expire", () => {
  let currentTime = 1_000;
  const locks = createLockRegistry({
    leaseMs: 100,
    now: () => currentTime,
  });

  const acquired = locks.acquire({
    diagramId: "diagram-1",
    holder: participant("client-a"),
    claim: { kind: "table", tableId: "table-1" },
  });
  assert.equal(acquired.granted, true);
  assert.equal(locks.inspect("diagram-1").tables.length, 1);
  assert.equal(
    locks.owns({
      diagramId: "diagram-1",
      tableId: "table-1",
      clientId: "client-a",
    }),
    true,
  );
  assert.equal(
    locks.owns({
      diagramId: "diagram-1",
      tableId: "table-1",
      clientId: "client-b",
    }),
    false,
  );

  const denied = locks.acquire({
    diagramId: "diagram-1",
    holder: participant("client-b"),
    claim: { kind: "table", tableId: "table-1" },
  });
  assert.equal(denied.granted, false);
  assert.equal(denied.reason, "held");
  assert.equal(denied.lock.clientId, "client-a");

  currentTime += 101;
  const acquiredAfterExpiry = locks.acquire({
    diagramId: "diagram-1",
    holder: participant("client-b"),
    claim: { kind: "table", tableId: "table-1" },
  });
  assert.equal(acquiredAfterExpiry.granted, true);
  assert.notEqual(acquiredAfterExpiry.lock.token, acquired.lock.token);
});

test("renew extends only the matching holder and token", () => {
  let currentTime = 1_000;
  const locks = createLockRegistry({
    leaseMs: 100,
    now: () => currentTime,
  });
  const claim = { kind: "table", tableId: "table-1" };
  const acquired = locks.acquire({
    diagramId: "diagram-1",
    holder: participant("client-a"),
    claim,
  });

  currentTime += 60;
  assert.equal(
    locks.renew({
      diagramId: "diagram-1",
      clientId: "client-a",
      claim,
      token: acquired.lock.token,
    }),
    true,
  );
  assert.equal(
    locks.renew({
      diagramId: "diagram-1",
      clientId: "client-b",
      claim,
      token: acquired.lock.token,
    }),
    false,
  );
  assert.equal(
    locks.renew({
      diagramId: "diagram-1",
      clientId: "client-a",
      claim,
      token: acquired.lock.token + 1,
    }),
    false,
  );

  currentTime += 60;
  assert.equal(locks.inspect("diagram-1").tables.length, 1);

  assert.equal(
    locks.release({
      diagramId: "diagram-1",
      clientId: "client-b",
      claim,
      token: acquired.lock.token,
    }),
    false,
  );
  assert.equal(
    locks.release({
      diagramId: "diagram-1",
      clientId: "client-a",
      claim,
      token: acquired.lock.token,
    }),
    true,
  );
  assert.equal(locks.inspect("diagram-1").tables.length, 0);
});

test("diagram and table locks exclude each other", () => {
  let currentTime = 1_000;
  const locks = createLockRegistry({
    leaseMs: 100,
    now: () => currentTime,
  });
  const diagramId = "diagram-1";
  const diagramClaim = { kind: "diagram" };
  const tableClaim = { kind: "table", tableId: "table-1" };

  const diagramA = locks.acquire({
    diagramId,
    holder: participant("client-a"),
    claim: diagramClaim,
  });
  assert.equal(diagramA.granted, true);

  const diagramB = locks.acquire({
    diagramId,
    holder: participant("client-b"),
    claim: diagramClaim,
  });
  assert.equal(diagramB.granted, false);
  assert.equal(diagramB.reason, "held");

  const tableB = locks.acquire({
    diagramId,
    holder: participant("client-b"),
    claim: tableClaim,
  });
  assert.equal(tableB.granted, false);
  assert.equal(tableB.reason, "diagram-locked");

  const tableA = locks.acquire({
    diagramId,
    holder: participant("client-a"),
    claim: tableClaim,
  });
  assert.equal(tableA.granted, false);
  assert.equal(tableA.reason, "diagram-locked");

  assert.equal(
    locks.release({
      diagramId,
      clientId: "client-a",
      claim: diagramClaim,
      token: diagramA.lock.token,
    }),
    true,
  );

  const heldTableA = locks.acquire({
    diagramId,
    holder: participant("client-a"),
    claim: tableClaim,
  });
  assert.equal(heldTableA.granted, true);

  const blockedDiagramB = locks.acquire({
    diagramId,
    holder: participant("client-b"),
    claim: diagramClaim,
  });
  assert.equal(blockedDiagramB.granted, false);
  assert.equal(blockedDiagramB.reason, "table-locks-held");
  assert.equal(blockedDiagramB.locks.length, 1);

  const diagramAWithOwnTable = locks.acquire({
    diagramId,
    holder: participant("client-a"),
    claim: diagramClaim,
  });
  assert.equal(diagramAWithOwnTable.granted, true);
  assert.equal(diagramAWithOwnTable.releasedTableLocks.length, 1);
  assert.equal(locks.inspect(diagramId).tables.length, 0);
  assert.equal(locks.inspect(diagramId).diagram.clientId, "client-a");
});

test("releaseClient removes only that client's locks", () => {
  let currentTime = 1_000;
  const locks = createLockRegistry({
    leaseMs: 100,
    now: () => currentTime,
  });
  const diagramId = "diagram-1";

  locks.acquire({
    diagramId,
    holder: participant("client-a"),
    claim: { kind: "table", tableId: "table-a" },
  });
  locks.acquire({
    diagramId,
    holder: participant("client-b"),
    claim: { kind: "table", tableId: "table-b" },
  });

  assert.equal(locks.releaseClient(diagramId, "client-a"), true);
  assert.deepEqual(
    locks.inspect(diagramId).tables.map((lock) => lock.clientId),
    ["client-b"],
  );
  assert.equal(locks.releaseClient(diagramId, "client-a"), false);

  assert.equal(locks.releaseClient(diagramId, "client-b"), true);
  const diagram = locks.acquire({
    diagramId,
    holder: participant("client-a"),
    claim: { kind: "diagram" },
  });
  assert.equal(diagram.granted, true);
  assert.equal(locks.releaseClient(diagramId, "client-a"), true);
  assert.equal(locks.inspect(diagramId).diagram, null);
  assert.equal(locks.releaseClient(diagramId, "client-a"), false);
});

test("sweep reports diagrams whose leases expired", () => {
  let currentTime = 1_000;
  const locks = createLockRegistry({
    leaseMs: 100,
    now: () => currentTime,
  });

  locks.acquire({
    diagramId: "diagram-1",
    holder: participant("client-a"),
    claim: { kind: "table", tableId: "table-1" },
  });
  locks.acquire({
    diagramId: "diagram-2",
    holder: participant("client-a"),
    claim: { kind: "diagram" },
  });

  currentTime += 101;
  assert.deepEqual(locks.sweep().sort(), ["diagram-1", "diagram-2"]);
  assert.deepEqual(locks.inspect("diagram-1"), { diagram: null, tables: [] });
  assert.deepEqual(locks.inspect("diagram-2"), { diagram: null, tables: [] });
  assert.deepEqual(locks.sweep(), []);
});

test("snapshot writes respect the diagram lock per channel", () => {
  let currentTime = 1_000;
  const locks = createLockRegistry({
    leaseMs: 100,
    now: () => currentTime,
  });
  const diagramId = "diagram-1";

  assert.deepEqual(
    locks.checkWrite({ diagramId, clientId: "client-a", channel: "ws" }),
    { allow: true },
  );

  const acquired = locks.acquire({
    diagramId,
    holder: participant("client-a"),
    claim: { kind: "diagram" },
  });
  assert.equal(acquired.granted, true);

  assert.deepEqual(
    locks.checkWrite({ diagramId, clientId: "client-a", channel: "ws" }),
    { allow: true },
  );

  const deniedWebSocket = locks.checkWrite({
    diagramId,
    clientId: "client-b",
    channel: "ws",
  });
  assert.equal(deniedWebSocket.allow, false);
  assert.equal(deniedWebSocket.reason, "diagram-locked");
  assert.equal(deniedWebSocket.lock.clientId, "client-a");

  for (const channel of ["http", "git"]) {
    for (const clientId of ["client-a", "client-b"]) {
      const denied = locks.checkWrite({ diagramId, clientId, channel });
      assert.equal(denied.allow, false);
      assert.equal(denied.reason, "diagram-locked");
    }
  }

  locks.release({
    diagramId,
    clientId: "client-a",
    claim: { kind: "diagram" },
    token: acquired.lock.token,
  });
  assert.deepEqual(
    locks.checkWrite({ diagramId, clientId: "client-b", channel: "http" }),
    { allow: true },
  );
});
