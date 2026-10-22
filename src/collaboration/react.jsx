import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import { createCollabSession } from "./session.js";

export const CollabContext = createContext(null);

export function CollabProvider({ identity, transport, clock, children }) {
  const session = useMemo(
    () => createCollabSession({ identity, transport, clock }),
    [identity, transport, clock],
  );

  useEffect(() => () => session.disconnect(), [session]);

  return (
    <CollabContext.Provider value={session}>{children}</CollabContext.Provider>
  );
}

export function useCollabSession() {
  const session = useContext(CollabContext);
  if (!session) {
    throw new Error("useCollabSession must be used inside CollabProvider");
  }
  return session;
}

export function useCollabState() {
  const session = useCollabSession();
  return useSyncExternalStore(
    session.subscribe,
    session.getState,
    session.getState,
  );
}

function tableView(session, state, tableIds) {
  const locks = tableIds
    .map((tableId) => state.tableLocks[tableId])
    .filter(Boolean);
  const holder =
    locks.find((lock) => lock.clientId !== session.identity.clientId) ?? null;
  const allMine =
    tableIds.length > 0 &&
    tableIds.every(
      (tableId) =>
        state.tableLocks[tableId]?.clientId === session.identity.clientId,
    );
  const pending = tableIds.some((tableId) => state.pendingTables[tableId]);
  const status =
    state.connection !== "connected"
      ? "offline"
      : allMine
        ? "held"
        : holder
          ? "blocked"
          : pending
            ? "requesting"
            : "idle";

  return {
    status,
    isMine: allMine,
    allMine,
    holder,
    lock: tableIds.length === 1 ? state.tableLocks[tableIds[0]] ?? null : null,
    tableLocks: state.tableLocks,
  };
}

export function useTableLocks(tableIds, { when = true } = {}) {
  const session = useCollabSession();
  const state = useCollabState();
  const idsRef = useRef(tableIds);
  idsRef.current = tableIds;
  const idsKey = tableIds.join("|");

  useEffect(() => {
    if (!when || idsRef.current.length === 0) return undefined;
    const lease = session.claim(idsRef.current);
    return () => lease.release();
  }, [session, when, idsKey]);

  return tableView(session, state, tableIds);
}

export function useTableLock(tableId) {
  return useTableLocks([tableId]);
}

export function useTableLockState(tableId) {
  const session = useCollabSession();
  const state = useCollabState();
  return tableView(session, state, [tableId]);
}

export function useTableAction() {
  const session = useCollabSession();

  return useMemo(
    () => ({
      async run(tableIds, action) {
        if (
          session.getState().connection !== "connected" ||
          !session.isJoined
        ) {
          return { ok: true, value: await action() };
        }
        const lease = session.claim(tableIds);
        let timeoutId;
        const result = await Promise.race([
          lease.whenSettled(),
          new Promise((resolve) => {
            timeoutId = globalThis.setTimeout(
              () => resolve({ ok: false, blockedBy: null }),
              5_000,
            );
          }),
        ]);
        globalThis.clearTimeout(timeoutId);
        try {
          if (!result.ok) return result;
          return { ok: true, value: await action() };
        } finally {
          lease.release();
        }
      },
    }),
    [session],
  );
}

export function useCollabStatus() {
  const session = useCollabSession();
  const state = useCollabState();
  return {
    session,
    connectionState: state.connection,
    participants: state.participants,
    remoteCursors: state.remoteCursors,
    identity: session.identity,
    tableLocks: state.tableLocks,
  };
}
