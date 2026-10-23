const DEFAULT_LEASE_MS = 12_000;

export const DIAGRAM_LOCKED_ERROR = "Diagram is locked for DBML editing";

export function createLockRegistry({
  leaseMs = DEFAULT_LEASE_MS,
  now = () => Date.now(),
} = {}) {
  const locksByDiagram = new Map();
  let fencingToken = 0;

  const stateFor = (diagramId) => {
    if (!locksByDiagram.has(diagramId)) {
      locksByDiagram.set(diagramId, { diagram: null, tables: new Map() });
    }
    return locksByDiagram.get(diagramId);
  };

  const dropIfEmpty = (diagramId) => {
    const state = locksByDiagram.get(diagramId);
    if (state && state.tables.size === 0 && !state.diagram) {
      locksByDiagram.delete(diagramId);
    }
  };

  const removeExpired = (diagramId) => {
    const state = locksByDiagram.get(diagramId);
    if (!state) return false;
    const currentTime = now();
    let changed = false;
    for (const [tableId, lock] of state.tables) {
      if (lock.expiresAt <= currentTime) {
        state.tables.delete(tableId);
        changed = true;
      }
    }
    if (state.diagram && state.diagram.expiresAt <= currentTime) {
      state.diagram = null;
      changed = true;
    }
    dropIfEmpty(diagramId);
    return changed;
  };

  const mintLock = ({ diagramId, holder, token, tableId }) => ({
    ...(tableId === undefined ? {} : { tableId }),
    diagramId,
    clientId: holder.clientId,
    displayName: holder.displayName,
    color: holder.color,
    token,
    expiresAt: now() + leaseMs,
  });

  const holdsToken = (lock, clientId, token) =>
    Boolean(lock) && lock.clientId === clientId && lock.token === token;

  const lockFor = (state, claim) =>
    claim.kind === "diagram"
      ? state?.diagram
      : state?.tables.get(claim.tableId);

  return {
    leaseMs,
    acquire({ diagramId, holder, claim }) {
      removeExpired(diagramId);
      const state = stateFor(diagramId);

      if (claim.kind === "diagram") {
        const existing = state.diagram;
        if (existing && existing.clientId !== holder.clientId) {
          return { granted: false, reason: "held", lock: existing };
        }
        const heldByOthers = [...state.tables.values()].filter(
          (lock) => lock.clientId !== holder.clientId,
        );
        if (heldByOthers.length > 0) {
          return {
            granted: false,
            reason: "table-locks-held",
            locks: heldByOthers,
          };
        }
        const releasedTableLocks = [...state.tables.values()];
        state.tables.clear();

        const lock = mintLock({
          diagramId,
          holder,
          token: existing?.token ?? ++fencingToken,
        });
        state.diagram = lock;
        return { granted: true, lock, releasedTableLocks };
      }

      if (state.diagram) {
        return {
          granted: false,
          reason: "diagram-locked",
          lock: state.diagram,
        };
      }

      const existing = state.tables.get(claim.tableId);
      if (existing && existing.clientId !== holder.clientId) {
        return { granted: false, reason: "held", lock: existing };
      }
      const lock = mintLock({
        diagramId,
        holder,
        token: existing?.token ?? ++fencingToken,
        tableId: claim.tableId,
      });
      state.tables.set(claim.tableId, lock);
      return { granted: true, lock };
    },
    renew({ diagramId, clientId, claim, token }) {
      removeExpired(diagramId);
      const lock = lockFor(locksByDiagram.get(diagramId), claim);
      if (!holdsToken(lock, clientId, token)) return false;
      lock.expiresAt = now() + leaseMs;
      return true;
    },
    release({ diagramId, clientId, claim, token }) {
      removeExpired(diagramId);
      const state = locksByDiagram.get(diagramId);
      const lock = lockFor(state, claim);
      if (!holdsToken(lock, clientId, token)) return false;
      if (claim.kind === "diagram") state.diagram = null;
      else state.tables.delete(claim.tableId);
      dropIfEmpty(diagramId);
      return true;
    },
    releaseClient(diagramId, clientId) {
      removeExpired(diagramId);
      const state = locksByDiagram.get(diagramId);
      if (!state) return false;
      let changed = false;
      for (const [tableId, lock] of state.tables) {
        if (lock.clientId === clientId) {
          state.tables.delete(tableId);
          changed = true;
        }
      }
      if (state.diagram?.clientId === clientId) {
        state.diagram = null;
        changed = true;
      }
      dropIfEmpty(diagramId);
      return changed;
    },
    owns({ diagramId, tableId, clientId }) {
      removeExpired(diagramId);
      return (
        locksByDiagram.get(diagramId)?.tables.get(tableId)?.clientId ===
        clientId
      );
    },
    inspect(diagramId) {
      removeExpired(diagramId);
      const state = locksByDiagram.get(diagramId);
      return {
        diagram: state?.diagram ?? null,
        tables: [...(state?.tables.values() ?? [])],
      };
    },
    checkWrite({ diagramId, clientId, channel }) {
      removeExpired(diagramId);
      const lock = locksByDiagram.get(diagramId)?.diagram;
      if (!lock) return { allow: true };
      if (channel === "ws" && lock.clientId === clientId) {
        return { allow: true };
      }
      return { allow: false, reason: "diagram-locked", lock };
    },
    sweep() {
      const changedDiagrams = [];
      for (const diagramId of locksByDiagram.keys()) {
        if (removeExpired(diagramId)) changedDiagrams.push(diagramId);
      }
      return changedDiagrams;
    },
  };
}
