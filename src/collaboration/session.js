import { nanoid } from "nanoid";
import { CONNECTION_STATE, MESSAGE_TYPES } from "./protocol.js";

const INITIAL_STATE = {
  connection: CONNECTION_STATE.DISCONNECTED,
  version: 0,
  participants: [],
  remoteCursors: {},
  tableLocks: {},
  ownTableLocks: {},
  pendingTables: {},
  diagramLock: null,
  diagramBlockedBy: null,
  diagramPhase: "idle",
  save: { state: "idle", at: null },
};

const RELEASE_GRACE_MS = 500;
const LOCK_TIMEOUT_MS = 5_000;
const RENEW_EVERY_MS = 4_000;
const RECONNECT_MAX_MS = 15_000;

export function createCollabSession({
  identity,
  transport,
  clock = {
    now: () => Date.now(),
    setTimeout: (callback, delay) => globalThis.setTimeout(callback, delay),
    clearTimeout: (id) => globalThis.clearTimeout(id),
  },
}) {
  let state = INITIAL_STATE;
  let session = null;
  let joined = false;
  let reconnectAttempts = 0;
  let reconnectTimer = null;
  let renewTimer = null;
  let saveTimer = null;
  let savePromise = null;
  let pendingDiagram = null;
  const listeners = new Set();
  const pendingSaves = new Map();
  const previewThrottle = new Map();
  let cursorSentAt = 0;

  const desired = new Map();
  const leases = new Set();
  const held = new Map();
  const pending = new Map();
  const pendingByTable = new Map();
  const blocked = new Map();
  const graceTimers = new Map();

  const emit = (patch) => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener(state);
  };

  const send = (message) => {
    if (!session) return;
    transport.send(JSON.stringify(message));
  };

  const emitOwnLocks = () => {
    emit({
      ownTableLocks: Object.fromEntries(
        [...held.keys()].map((tableId) => [tableId, true]),
      ),
      pendingTables: Object.fromEntries(
        [...pendingByTable.keys()].map((tableId) => [tableId, true]),
      ),
    });
  };

  const resolveLeases = () => {
    for (const lease of leases) {
      if (lease.settled) continue;
      if (lease.tables.every((tableId) => held.has(tableId))) {
        lease.settled = true;
        lease.resolve({ ok: true });
        continue;
      }
      const blockedTable = lease.tables.find((tableId) => blocked.has(tableId));
      if (blockedTable) {
        lease.settled = true;
        lease.resolve({
          ok: false,
          blockedBy: blocked.get(blockedTable)?.displayName ?? null,
        });
      }
    }
  };

  const releaseHeldTable = (tableId) => {
    const lock = held.get(tableId);
    if (!lock) return;
    if (joined) {
      send({
        type: MESSAGE_TYPES.TABLE_LOCK_RELEASE,
        diagramId: session.diagramId,
        tableId,
        token: lock.token,
      });
    }
    held.delete(tableId);
    const tableLocks = { ...state.tableLocks };
    delete tableLocks[tableId];
    emit({ tableLocks });
    emitOwnLocks();
  };

  const scheduleGraceRelease = (tableId) => {
    if (graceTimers.has(tableId) || held.has(tableId) === false) return;
    const timer = clock.setTimeout(() => {
      graceTimers.delete(tableId);
      if ((desired.get(tableId) ?? 0) > 0) return;
      releaseHeldTable(tableId);
    }, RELEASE_GRACE_MS);
    graceTimers.set(tableId, timer);
  };

  const requestTable = (tableId) => {
    if (
      !session ||
      !joined ||
      state.diagramLock ||
      pendingByTable.has(tableId) ||
      held.has(tableId)
    ) {
      return;
    }
    const requestId = nanoid();
    pending.set(requestId, tableId);
    pendingByTable.set(tableId, requestId);
    send({
      type: MESSAGE_TYPES.TABLE_LOCK_ACQUIRE,
      diagramId: session.diagramId,
      tableId,
      requestId,
    });
    clock.setTimeout(() => {
      if (pending.get(requestId) !== tableId) return;
      pending.delete(requestId);
      pendingByTable.delete(tableId);
      blocked.set(tableId, null);
      emitOwnLocks();
      resolveLeases();
    }, LOCK_TIMEOUT_MS);
    emitOwnLocks();
  };

  const requestDesiredTables = () => {
    if (state.diagramLock) return;
    for (const tableId of desired.keys()) requestTable(tableId);
  };

  const releaseAllTableLocks = () => {
    for (const tableId of [...held.keys()]) releaseHeldTable(tableId);
  };

  const releaseDiagramLock = () => {
    const lock = state.diagramLock;
    if (lock && lock.clientId === identity.clientId && joined) {
      send({
        type: MESSAGE_TYPES.DIAGRAM_LOCK_RELEASE,
        diagramId: session.diagramId,
        token: lock.token,
      });
    }
    emit({
      diagramLock: null,
      diagramBlockedBy: null,
      diagramPhase: "idle",
    });
    requestDesiredTables();
  };

  const applySnapshot = (message, source) => {
    if (!session) return;
    session.document.apply(message, { source });
    session.lastApplied = {
      name: message.name,
      document: message.document,
    };
    emit({
      version: message.version,
      save: { ...state.save, state: "saved" },
    });
  };

  const rejectPendingSaves = (reason) => {
    for (const [operationId, pendingSave] of pendingSaves) {
      clock.clearTimeout(pendingSave.timer);
      pendingSaves.delete(operationId);
      pendingSave.reject(new Error(reason));
    }
  };

  const saveState = (next, error) => {
    emit({
      save: {
        state: next,
        at: clock.now(),
        ...(error ? { error } : {}),
      },
    });
  };

  const sendSnapshot = (snapshot) => {
    const operationId = nanoid();
    return new Promise((resolve, reject) => {
      const timer = clock.setTimeout(() => {
        pendingSaves.delete(operationId);
        saveState("error", "Save acknowledgement timed out");
        reject(new Error("Save acknowledgement timed out"));
      }, 10_000);
      pendingSaves.set(operationId, {
        resolve,
        reject,
        timer,
        snapshot,
      });
      send({
        type: MESSAGE_TYPES.OPERATION,
        diagramId: session.diagramId,
        clientId: identity.clientId,
        operationId,
        baseVersion: state.version,
        operation: {
          type: "snapshot.replace",
          payload: { name: snapshot.name, document: snapshot.document },
        },
      });
    });
  };

  const writeSnapshot = async (snapshot) => {
    const result = await session.writer.write({
      name: snapshot.name,
      document: snapshot.document,
      baseVersion: state.version,
    });
    if (result?.conflict) {
      session.document.apply(result.diagram, { source: "remote" });
      session.lastApplied = {
        name: result.diagram.name,
        document: result.diagram.document,
      };
      emit({ version: result.version ?? result.diagram.version });
      saveState("conflict");
      return;
    }
    emit({ version: result.version });
    session.lastApplied = snapshot;
    saveState("saved");
  };

  const saveNow = async () => {
    if (saveTimer !== null) {
      clock.clearTimeout(saveTimer);
      saveTimer = null;
    }
    if (savePromise) await savePromise;
    if (!session || !session.document) return;
    const snapshot = session.document.read();
    if (!snapshot) return;
    if (
      session.lastApplied &&
      session.document.equal(snapshot, session.lastApplied)
    ) {
      saveState("saved");
      return;
    }

    let saved = false;
    savePromise = (async () => {
      saveState("saving");
      try {
        if (joined) {
          await sendSnapshot(snapshot);
          session.lastApplied = snapshot;
          saveState("saved");
        } else {
          if (!session.writer) {
            throw new Error("Snapshot writer is unavailable");
          }
          await writeSnapshot(snapshot);
        }
        saved = true;
      } catch (error) {
        if (!["error", "conflict", "offline"].includes(state.save.state)) {
          saveState("error", error.message);
        }
      } finally {
        savePromise = null;
        if (
          saved &&
          session &&
          !session.document.equal(session.document.read(), snapshot)
        ) {
          scheduleSave();
        }
      }
    })();
    await savePromise;
  };

  const scheduleSave = () => {
    if (state.diagramLock || state.diagramPhase === "requesting") {
      return Promise.resolve();
    }
    if (saveTimer !== null) clock.clearTimeout(saveTimer);
    let resolve;
    const promise = new Promise((next) => {
      resolve = next;
    });
    saveTimer = clock.setTimeout(async () => {
      saveTimer = null;
      await saveNow();
      resolve();
    }, 600);
    return promise;
  };

  const sendCursor = ({ x, y, selected = null } = {}) => {
    if (!session || !joined || !Number.isFinite(x) || !Number.isFinite(y)) {
      return;
    }
    const now = clock.now();
    if (now - cursorSentAt < 50) return;
    cursorSentAt = now;
    send({
      type: MESSAGE_TYPES.CURSOR,
      diagramId: session.diagramId,
      x,
      y,
      selected,
    });
  };

  const previewTableMove = (tableId, x, y) => {
    if (!session || !joined || !held.has(tableId)) return;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const current = previewThrottle.get(tableId) ?? {
      lastSent: 0,
      timer: null,
      payload: null,
    };
    current.payload = { id: tableId, x, y };

    const flush = () => {
      current.timer = null;
      current.lastSent = clock.now();
      send({
        type: MESSAGE_TYPES.OPERATION_PREVIEW,
        diagramId: session.diagramId,
        operation: { type: "table.move", payload: current.payload },
      });
    };

    const remaining = 50 - (clock.now() - current.lastSent);
    if (remaining <= 0) {
      if (current.timer !== null) clock.clearTimeout(current.timer);
      flush();
    } else if (current.timer === null) {
      current.timer = clock.setTimeout(flush, remaining);
    }
    previewThrottle.set(tableId, current);
  };

  const beginDiagramEdit = async () => {
    if (!session || !joined) return { ok: false, reason: "offline" };
    if (state.diagramPhase === "editing") {
      return { ok: true, lock: state.diagramLock };
    }
    if (state.diagramPhase === "requesting") {
      return { ok: false, reason: "requesting" };
    }

    await saveNow();
    if (["error", "conflict"].includes(state.save.state)) {
      return { ok: false, reason: "save-failed" };
    }

    releaseAllTableLocks();
    emit({ diagramPhase: "requesting" });
    const requestId = nanoid();
    const result = await new Promise((resolve) => {
      const timer = clock.setTimeout(() => {
        if (pendingDiagram?.requestId !== requestId) return;
        pendingDiagram = null;
        emit({ diagramPhase: "idle" });
        resolve({ ok: false, reason: "timeout" });
      }, LOCK_TIMEOUT_MS);
      pendingDiagram = { requestId, resolve, timer };
      send({
        type: MESSAGE_TYPES.DIAGRAM_LOCK_ACQUIRE,
        diagramId: session.diagramId,
        requestId,
      });
    });

    if (!result.ok || !result.stale) return result;
    if (!session.reader) {
      releaseDiagramLock();
      return { ok: false, reason: "stale", version: result.version };
    }

    try {
      const fresh = await session.reader.read();
      session.document.apply(fresh, { source: "remote" });
      session.lastApplied = {
        name: fresh.name,
        document: fresh.document,
      };
      emit({
        version: fresh.version,
        save: { ...state.save, state: "saved" },
      });
      return {
        ...result,
        ok: true,
        version: fresh.version,
        stale: false,
        refreshed: true,
        snapshot: fresh,
      };
    } catch (error) {
      releaseDiagramLock();
      return {
        ok: false,
        reason: "refresh-failed",
        message: error.message,
      };
    }
  };

  const cancelDiagramEdit = () => {
    if (pendingDiagram) {
      clock.clearTimeout(pendingDiagram.timer);
      pendingDiagram.resolve({ ok: false, reason: "cancelled" });
      pendingDiagram = null;
    }
    if (state.diagramPhase === "editing") {
      releaseDiagramLock();
    } else {
      emit({
        diagramBlockedBy: null,
        diagramPhase: state.diagramLock ? "blocked" : "idle",
      });
    }
  };

  const commitDiagramEdit = async (snapshot) => {
    if (
      state.diagramPhase !== "editing" ||
      state.diagramLock?.clientId !== identity.clientId
    ) {
      return { ok: false, reason: "not-editing" };
    }
    if (saveTimer !== null) {
      clock.clearTimeout(saveTimer);
      saveTimer = null;
    }
    if (savePromise) await savePromise;
    try {
      const acknowledgement = await sendSnapshot(snapshot);
      session.lastApplied = {
        name: snapshot.name,
        document: snapshot.document,
      };
      releaseDiagramLock();
      return { ok: true, version: acknowledgement.version };
    } catch (error) {
      return {
        ok: false,
        reason: state.save.state === "conflict" ? "conflict" : "error",
        message: error.message,
      };
    }
  };

  const handleLockState = (message) => {
    const nextLocks = Object.fromEntries(
      (message.locks || []).map((lock) => [lock.tableId, lock]),
    );
    emit({ tableLocks: nextLocks });

    for (const [tableId, lock] of held) {
      if (
        !nextLocks[tableId] ||
        nextLocks[tableId].clientId !== identity.clientId ||
        nextLocks[tableId].token !== lock.token
      ) {
        held.delete(tableId);
      }
    }

    for (const tableId of desired.keys()) {
      const lock = nextLocks[tableId];
      if (lock && lock.clientId !== identity.clientId) {
        held.delete(tableId);
        blocked.set(tableId, lock);
      } else if (lock) {
        blocked.delete(tableId);
        held.set(tableId, lock);
      } else if (!pendingByTable.has(tableId)) {
        blocked.delete(tableId);
        requestTable(tableId);
      }
    }

    emitOwnLocks();
    resolveLeases();
  };

  const handleMessage = (raw) => {
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }

    if (message.type === MESSAGE_TYPES.JOINED) {
      joined = true;
      reconnectAttempts = 0;
      emit({
        version: message.version,
        connection: CONNECTION_STATE.CONNECTED,
      });
      for (const tableId of desired.keys()) requestTable(tableId);
      return;
    }

    if (message.type === MESSAGE_TYPES.SNAPSHOT) {
      applySnapshot(message, "remote");
      return;
    }

    if (message.type === MESSAGE_TYPES.RESYNC_REQUIRED) {
      applySnapshot(message, "remote");
      rejectPendingSaves("The diagram changed while saving");
      saveState("conflict");
      return;
    }

    if (message.type === MESSAGE_TYPES.OPERATION_APPLIED) {
      const pendingSave = pendingSaves.get(message.operationId);
      if (pendingSave) {
        clock.clearTimeout(pendingSave.timer);
        pendingSaves.delete(message.operationId);
        emit({ version: message.version });
        session.lastApplied = pendingSave.snapshot;
        saveState("saved");
        pendingSave.resolve({ version: message.version });
      } else {
        emit({ version: message.version });
        if (message.clientId !== identity.clientId) {
          applySnapshot(
            {
              name: message.operation.payload.name,
              document: message.operation.payload.document,
              version: message.version,
            },
            "remote",
          );
        }
      }
      return;
    }

    if (message.type === MESSAGE_TYPES.ERROR) {
      const pendingSave = message.operationId
        ? pendingSaves.get(message.operationId)
        : null;
      if (pendingSave) {
        clock.clearTimeout(pendingSave.timer);
        pendingSaves.delete(message.operationId);
        saveState("error", message.message || "Save rejected");
        pendingSave.reject(new Error(message.message || "Save rejected"));
      }
      return;
    }

    if (message.type === MESSAGE_TYPES.PRESENCE) {
      emit({ participants: message.participants || [] });
      return;
    }

    if (message.type === MESSAGE_TYPES.TABLE_LOCK_STATE) {
      handleLockState(message);
      return;
    }

    if (message.type === MESSAGE_TYPES.TABLE_LOCK_GRANTED) {
      const tableId = pending.get(message.requestId);
      if (tableId === undefined) return;
      pending.delete(message.requestId);
      pendingByTable.delete(tableId);
      held.set(tableId, message.lock);
      blocked.delete(tableId);
      emit({
        tableLocks: { ...state.tableLocks, [tableId]: message.lock },
      });
      if (state.diagramLock || (desired.get(tableId) ?? 0) === 0) {
        releaseHeldTable(tableId);
      } else {
        emitOwnLocks();
      }
      resolveLeases();
      return;
    }

    if (message.type === MESSAGE_TYPES.TABLE_LOCK_DENIED) {
      const tableId = pending.get(message.requestId);
      if (tableId === undefined) return;
      pending.delete(message.requestId);
      pendingByTable.delete(tableId);
      blocked.set(tableId, message.lock ?? null);
      emitOwnLocks();
      resolveLeases();
      return;
    }

    if (message.type === MESSAGE_TYPES.DIAGRAM_LOCK_STATE) {
      const lock = message.lock;
      if (!lock) {
        if (state.diagramPhase === "editing") {
          emit({
            diagramLock: null,
            diagramBlockedBy: null,
            diagramPhase: "lost",
          });
        } else if (
          state.diagramPhase !== "requesting" &&
          state.diagramPhase !== "lost"
        ) {
          emit({
            diagramLock: null,
            diagramBlockedBy: null,
            diagramPhase: "idle",
          });
        }
        requestDesiredTables();
      } else if (lock.clientId === identity.clientId) {
        if (state.diagramPhase === "lost") {
          if (joined) {
            send({
              type: MESSAGE_TYPES.DIAGRAM_LOCK_RELEASE,
              diagramId: session.diagramId,
              token: lock.token,
            });
          }
          emit({
            diagramLock: null,
            diagramBlockedBy: null,
            diagramPhase: "lost",
          });
        } else {
          emit({
            diagramLock: lock,
            diagramBlockedBy: null,
            diagramPhase:
              state.diagramPhase === "requesting" ? "requesting" : "editing",
          });
        }
      } else {
        emit({
          diagramLock: lock,
          diagramBlockedBy: null,
          diagramPhase: state.diagramPhase === "editing" ? "lost" : "blocked",
        });
      }
      return;
    }

    if (message.type === MESSAGE_TYPES.DIAGRAM_LOCK_GRANTED) {
      if (pendingDiagram?.requestId !== message.requestId) {
        if (message.lock?.clientId === identity.clientId && session && joined) {
          send({
            type: MESSAGE_TYPES.DIAGRAM_LOCK_RELEASE,
            diagramId: session.diagramId,
            token: message.lock.token,
          });
        }
        return;
      }
      clock.clearTimeout(pendingDiagram.timer);
      const { resolve } = pendingDiagram;
      pendingDiagram = null;
      const stale =
        Number.isInteger(message.version) && message.version !== state.version;
      emit({
        diagramLock: message.lock,
        diagramBlockedBy: null,
        diagramPhase: "editing",
      });
      resolve({
        ok: true,
        lock: message.lock,
        version: message.version,
        stale,
      });
      return;
    }

    if (message.type === MESSAGE_TYPES.DIAGRAM_LOCK_DENIED) {
      if (pendingDiagram?.requestId !== message.requestId) return;
      clock.clearTimeout(pendingDiagram.timer);
      const { resolve } = pendingDiagram;
      pendingDiagram = null;
      emit({
        diagramPhase: "blocked",
        diagramBlockedBy: message.lock ?? message.tableLocks?.[0] ?? null,
        ...(message.lock ? { diagramLock: message.lock } : {}),
      });
      resolve({
        ok: false,
        reason: message.tableLocks?.length ? "table-locked" : "held",
        blockedBy: message.lock ?? message.tableLocks?.[0] ?? null,
      });
      return;
    }

    if (
      message.type === MESSAGE_TYPES.OPERATION_PREVIEW &&
      message.clientId !== identity.clientId
    ) {
      session?.document.applyPreview?.(message.operation);
      return;
    }

    if (message.type === MESSAGE_TYPES.CURSOR) {
      emit({
        remoteCursors: {
          ...state.remoteCursors,
          [message.clientId]: {
            x: message.x,
            y: message.y,
            selected: message.selected,
          },
        },
      });
    }
  };

  const scheduleRenew = () => {
    renewTimer = clock.setTimeout(() => {
      if (!session) return;
      if (joined) {
        for (const [tableId, lock] of held) {
          send({
            type: MESSAGE_TYPES.TABLE_LOCK_RENEW,
            diagramId: session.diagramId,
            tableId,
            token: lock.token,
          });
        }
        if (
          state.diagramPhase === "editing" &&
          state.diagramLock?.clientId === identity.clientId
        ) {
          send({
            type: MESSAGE_TYPES.DIAGRAM_LOCK_RENEW,
            diagramId: session.diagramId,
            token: state.diagramLock.token,
          });
        }
      }
      scheduleRenew();
    }, RENEW_EVERY_MS);
  };

  const clearTransientLocks = () => {
    for (const lease of leases) {
      if (lease.settled) continue;
      lease.settled = true;
      lease.resolve({ ok: false, blockedBy: null });
    }
    held.clear();
    pending.clear();
    pendingByTable.clear();
    blocked.clear();
    for (const timer of graceTimers.values()) clock.clearTimeout(timer);
    graceTimers.clear();
    emitOwnLocks();
  };

  const handleOpen = () => {
    send({
      type: MESSAGE_TYPES.JOIN,
      diagramId: session.diagramId,
      participant: identity,
      lastVersion: state.version,
    });
  };

  const handleClose = () => {
    joined = false;
    if (!session) return;
    clearTransientLocks();
    const hadPendingSaves = pendingSaves.size > 0;
    rejectPendingSaves("Connection closed before the save was acknowledged");
    if (hadPendingSaves) saveState("offline");
    emit({
      connection: CONNECTION_STATE.CONNECTING,
      diagramLock: null,
      diagramBlockedBy: null,
      diagramPhase:
        state.diagramPhase === "editing" ? "lost" : state.diagramPhase,
    });
    const delay = Math.min(1_000 * 2 ** reconnectAttempts, RECONNECT_MAX_MS);
    reconnectAttempts += 1;
    reconnectTimer = clock.setTimeout(() => {
      if (!session) return;
      transport.open({
        diagramId: session.diagramId,
        onOpen: handleOpen,
        onMessage: handleMessage,
        onClose: handleClose,
      });
    }, delay);
  };

  const connect = ({
    diagramId,
    version,
    document,
    writer,
    reader = null,
    initialSnapshot = null,
  }) => {
    clock.clearTimeout(reconnectTimer);
    clock.clearTimeout(renewTimer);
    clock.clearTimeout(saveTimer);
    rejectPendingSaves("Connection replaced before the save was acknowledged");
    saveTimer = null;
    savePromise = null;
    session = null;
    transport.close();
    session = {
      diagramId,
      document,
      writer,
      reader,
      lastApplied: initialSnapshot,
    };
    joined = false;
    reconnectAttempts = 0;
    clearTransientLocks();
    emit({
      ...INITIAL_STATE,
      connection: CONNECTION_STATE.CONNECTING,
      version,
    });
    transport.open({
      diagramId,
      onOpen: handleOpen,
      onMessage: handleMessage,
      onClose: handleClose,
    });
    scheduleRenew();
  };

  const disconnect = () => {
    session = null;
    joined = false;
    clock.clearTimeout(reconnectTimer);
    clock.clearTimeout(renewTimer);
    clock.clearTimeout(saveTimer);
    for (const preview of previewThrottle.values()) {
      if (preview.timer !== null) clock.clearTimeout(preview.timer);
    }
    previewThrottle.clear();
    saveTimer = null;
    savePromise = null;
    rejectPendingSaves("Collaboration disconnected");
    clearTransientLocks();
    desired.clear();
    leases.clear();
    transport.close();
    emit({ ...INITIAL_STATE });
  };

  const claim = (tableIds) => {
    const tables = [...new Set(tableIds)].sort();
    let resolve;
    const promise = new Promise((next) => {
      resolve = next;
    });
    const lease = {
      tables,
      active: true,
      settled: false,
      resolve,
      whenSettled: () => promise,
      release: (options) => releaseLease(lease, options),
    };
    leases.add(lease);

    for (const tableId of tables) {
      desired.set(tableId, (desired.get(tableId) ?? 0) + 1);
      const graceTimer = graceTimers.get(tableId);
      if (graceTimer !== undefined) {
        clock.clearTimeout(graceTimer);
        graceTimers.delete(tableId);
      }
      blocked.delete(tableId);
      if (!held.has(tableId)) requestTable(tableId);
    }
    resolveLeases();
    return lease;
  };

  function releaseLease(lease, { immediate = false } = {}) {
    if (!lease.active) return;
    lease.active = false;
    leases.delete(lease);
    for (const tableId of lease.tables) {
      const count = (desired.get(tableId) ?? 0) - 1;
      if (count > 0) {
        desired.set(tableId, count);
        continue;
      }
      desired.delete(tableId);
      if (!immediate) {
        scheduleGraceRelease(tableId);
        continue;
      }
      const graceTimer = graceTimers.get(tableId);
      if (graceTimer !== undefined) {
        clock.clearTimeout(graceTimer);
        graceTimers.delete(tableId);
      }
      releaseHeldTable(tableId);
    }
  }

  return {
    identity,
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    connect,
    disconnect,
    claim,
    scheduleSave,
    saveNow,
    beginDiagramEdit,
    cancelDiagramEdit,
    commitDiagramEdit,
    sendCursor,
    previewTableMove,
    markSnapshotApplied(snapshot) {
      if (!session || !snapshot) return;
      session.lastApplied = {
        name: snapshot.name,
        document: snapshot.document,
      };
      if (Number.isInteger(snapshot.version)) {
        emit({ version: snapshot.version });
      }
    },
    get isJoined() {
      return joined;
    },
    isTableLockedByOther(tableId) {
      const lock = state.tableLocks[tableId];
      return Boolean(lock && lock.clientId !== identity.clientId);
    },
    getTableLock(tableId) {
      return state.tableLocks[tableId] ?? null;
    },
  };
}
