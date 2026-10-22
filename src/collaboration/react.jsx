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
  const ownDiagramLock =
    state.diagramLock?.clientId === session.identity.clientId;
  const holder =
    locks.find((lock) => lock.clientId !== session.identity.clientId) ??
    (state.diagramLock && !ownDiagramLock ? state.diagramLock : null);
  const allMine =
    !state.diagramLock &&
    tableIds.length > 0 &&
    tableIds.every(
      (tableId) =>
        state.tableLocks[tableId]?.clientId === session.identity.clientId,
    );

  return {
    isMine: allMine,
    holder,
  };
}

export function useTableLocks(
  tableIds,
  { when = true, immediateRelease = false } = {},
) {
  const session = useCollabSession();
  const state = useCollabState();
  const idsRef = useRef(tableIds);
  idsRef.current = tableIds;
  const idsKey = tableIds.join("|");

  useEffect(() => {
    if (!when || idsRef.current.length === 0) return undefined;
    const lease = session.claim(idsRef.current);
    return () => lease.release({ immediate: immediateRelease });
  }, [immediateRelease, session, when, idsKey]);

  return tableView(session, state, tableIds);
}

export function useTableLock(tableId, options) {
  return useTableLocks([tableId], options);
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
        const diagramLock = session.getState().diagramLock;
        if (diagramLock) {
          return {
            ok: false,
            blockedBy:
              diagramLock.clientId === session.identity.clientId
                ? null
                : diagramLock.displayName,
          };
        }
        const lease = session.claim(tableIds);
        const result = await lease.whenSettled();
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

export function useDiagramEdit() {
  const session = useCollabSession();
  const state = useCollabState();
  const ownLock = state.diagramLock?.clientId === session.identity.clientId;
  const holder =
    state.diagramLock && !ownLock
      ? state.diagramLock
      : state.diagramBlockedBy ?? null;

  return {
    phase: state.diagramPhase,
    isMine: state.diagramPhase === "editing" && ownLock,
    holder,
    guiDisabled: Boolean(state.diagramLock) || state.diagramPhase === "editing",
    begin: session.beginDiagramEdit,
    cancel: session.cancelDiagramEdit,
    commit: session.commitDiagramEdit,
  };
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
