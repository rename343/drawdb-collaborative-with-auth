import { WebSocketServer, WebSocket } from "ws";
import { MESSAGE_TYPES } from "../src/collaboration/protocol.js";
import { hashSessionToken, parseCookies, SESSION_COOKIE } from "./auth.js";
import { DIAGRAM_LOCKED_ERROR } from "./lockRegistry.js";
import { isValidOperationPreview, isValidParticipant } from "./protocol.js";
import {
  CLIENT_ID_PATTERN,
  DIAGRAM_ID_PATTERN,
  isValidEntityId,
  isPlainObject,
} from "./validation.js";

const MAX_MESSAGE_BYTES = 2 * 1024 * 1024;

function send(socket, message) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

export function attachCollaborationServer(
  server,
  store,
  auth,
  { allowedOrigin, locks } = {},
) {
  if (!locks) {
    throw new Error("attachCollaborationServer requires a lock registry");
  }
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_MESSAGE_BYTES,
    closeTimeout: 5_000,
  });
  const rooms = new Map();
  const sessions = new Map();
  let closing = false;
  let shutdownPromise;

  const broadcast = (diagramId, message, except = null) => {
    for (const client of rooms.get(diagramId) || []) {
      if (client !== except) send(client, message);
    }
  };

  const broadcastPresence = (diagramId) => {
    const participants = [...(rooms.get(diagramId) || [])]
      .map((client) => client.participant)
      .filter(Boolean);
    broadcast(diagramId, {
      type: MESSAGE_TYPES.PRESENCE,
      diagramId,
      participants,
    });
  };

  const broadcastTableLocks = (diagramId) => {
    broadcast(diagramId, {
      type: MESSAGE_TYPES.TABLE_LOCK_STATE,
      diagramId,
      locks: locks.inspect(diagramId).tables,
    });
  };

  const broadcastDiagramLock = (diagramId) => {
    broadcast(diagramId, {
      type: MESSAGE_TYPES.DIAGRAM_LOCK_STATE,
      diagramId,
      lock: locks.inspect(diagramId).diagram,
    });
  };

  server.on("upgrade", (request, socket, head) => {
    if (closing) {
      socket.write("HTTP/1.1 503 Service Unavailable\r\n\r\n");
      socket.destroy();
      return;
    }
    if (allowedOrigin && request.headers.origin !== allowedOrigin) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }
    const url = new URL(request.url, "http://localhost");
    const match = url.pathname.match(/^\/ws\/diagrams\/([^/]+)$/);
    const diagramId = match?.[1];
    if (!diagramId || !DIAGRAM_ID_PATTERN.test(diagramId)) {
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      socket.destroy();
      return;
    }
    const sessionToken = parseCookies(request.headers.cookie)[SESSION_COOKIE];
    const session = auth.resolveSession(sessionToken);
    if (!session) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    if (!store.get(diagramId)) {
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      ws.diagramId = diagramId;
      ws.user = session.user;
      ws.sessionKey = hashSessionToken(sessionToken);
      wss.emit("connection", ws, request);
    });
  });

  wss.on("connection", (socket) => {
    const diagramId = socket.diagramId;
    if (!sessions.has(socket.sessionKey)) {
      sessions.set(socket.sessionKey, new Set());
    }
    sessions.get(socket.sessionKey).add(socket);
    if (!rooms.has(diagramId)) rooms.set(diagramId, new Set());
    rooms.get(diagramId).add(socket);
    socket.isAlive = true;
    socket.on("pong", () => {
      socket.isAlive = true;
    });

    socket.on("message", (raw) => {
      // ws can still emit incoming frames while its close handshake runs.
      if (closing || socket.readyState !== WebSocket.OPEN) return;
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        send(socket, {
          type: MESSAGE_TYPES.ERROR,
          message: "Invalid JSON message",
        });
        return;
      }
      if (!isPlainObject(message) || message.diagramId !== diagramId) {
        send(socket, {
          type: MESSAGE_TYPES.ERROR,
          message: "Invalid diagram message",
        });
        return;
      }

      if (message.type === MESSAGE_TYPES.JOIN) {
        if (!isValidParticipant(message.participant)) {
          send(socket, {
            type: MESSAGE_TYPES.ERROR,
            message: "Invalid participant",
          });
          return;
        }
        if (
          socket.participant &&
          socket.participant.clientId !== message.participant.clientId
        ) {
          send(socket, {
            type: MESSAGE_TYPES.ERROR,
            message: "Client ID cannot change after joining",
          });
          return;
        }
        const duplicateClient = [...(rooms.get(diagramId) || [])].some(
          (client) =>
            client !== socket &&
            client.participant?.clientId === message.participant.clientId,
        );
        if (duplicateClient) {
          send(socket, {
            type: MESSAGE_TYPES.ERROR,
            message: "Client ID is already in use",
          });
          return;
        }
        // The signed-in account, not the client, decides the shown identity.
        socket.participant = {
          ...message.participant,
          userId: socket.user.id,
          displayName: socket.user.username,
        };
        const diagram = store.get(diagramId);
        send(socket, {
          type: MESSAGE_TYPES.JOINED,
          diagramId,
          version: diagram.version,
        });
        if (message.lastVersion !== diagram.version) {
          send(socket, { type: MESSAGE_TYPES.SNAPSHOT, diagramId, ...diagram });
        }
        const lockState = locks.inspect(diagramId);
        send(socket, {
          type: MESSAGE_TYPES.TABLE_LOCK_STATE,
          diagramId,
          locks: lockState.tables,
        });
        send(socket, {
          type: MESSAGE_TYPES.DIAGRAM_LOCK_STATE,
          diagramId,
          lock: lockState.diagram,
        });
        broadcastPresence(diagramId);
        return;
      }

      if (!socket.participant) {
        send(socket, {
          type: MESSAGE_TYPES.ERROR,
          message: "Join is required",
        });
        return;
      }

      if (message.type === MESSAGE_TYPES.OPERATION) {
        const valid =
          CLIENT_ID_PATTERN.test(message.clientId || "") &&
          message.clientId === socket.participant.clientId &&
          CLIENT_ID_PATTERN.test(message.operationId || "") &&
          Number.isInteger(message.baseVersion) &&
          isPlainObject(message.operation) &&
          message.operation.type === "snapshot.replace" &&
          isPlainObject(message.operation.payload?.document);
        if (!valid) {
          send(socket, {
            type: MESSAGE_TYPES.ERROR,
            message: "Invalid operation",
          });
          return;
        }
        const gate = locks.checkWrite({
          diagramId,
          clientId: socket.participant.clientId,
          channel: "ws",
        });
        if (!gate.allow) {
          send(socket, {
            type: MESSAGE_TYPES.ERROR,
            diagramId,
            operationId: message.operationId,
            message: DIAGRAM_LOCKED_ERROR,
            lock: gate.lock,
          });
          return;
        }
        const result = store.updateSnapshot({
          id: diagramId,
          name: message.operation.payload.name,
          document: message.operation.payload.document,
          baseVersion: message.baseVersion,
          operationId: message.operationId,
        });
        if (result.status === "conflict") {
          send(socket, {
            type: MESSAGE_TYPES.RESYNC_REQUIRED,
            diagramId,
            ...result.diagram,
          });
          return;
        }
        const applied = {
          type: MESSAGE_TYPES.OPERATION_APPLIED,
          diagramId,
          clientId: message.clientId,
          operationId: message.operationId,
          version: result.diagram.version,
          operation: {
            type: "snapshot.replace",
            payload: {
              name: result.diagram.name,
              document: result.diagram.document,
            },
          },
        };
        broadcast(diagramId, applied);
        return;
      }

      if (message.type === MESSAGE_TYPES.OPERATION_PREVIEW) {
        if (!isValidOperationPreview(message.operation)) {
          send(socket, {
            type: MESSAGE_TYPES.ERROR,
            message: "Invalid operation preview",
          });
          return;
        }
        const targetTableId =
          message.operation.payload.tableId ?? message.operation.payload.id;
        const ownsTable = locks.owns({
          diagramId,
          tableId: targetTableId,
          clientId: socket.participant.clientId,
        });
        if (!ownsTable) {
          send(socket, {
            type: MESSAGE_TYPES.ERROR,
            message: "A table edit lock is required",
          });
          return;
        }
        broadcast(
          diagramId,
          {
            type: MESSAGE_TYPES.OPERATION_PREVIEW,
            diagramId,
            clientId: socket.participant.clientId,
            operation: message.operation,
          },
          socket,
        );
        return;
      }

      if (message.type === MESSAGE_TYPES.TABLE_LOCK_ACQUIRE) {
        if (
          !isValidEntityId(message.tableId) ||
          !CLIENT_ID_PATTERN.test(message.requestId || "")
        ) {
          send(socket, {
            type: MESSAGE_TYPES.ERROR,
            message: "Invalid table lock request",
          });
          return;
        }
        const result = locks.acquire({
          diagramId,
          holder: socket.participant,
          claim: { kind: "table", tableId: message.tableId },
        });
        if (!result.granted) {
          const diagramLocked = result.reason === "diagram-locked";
          send(socket, {
            type: MESSAGE_TYPES.TABLE_LOCK_DENIED,
            diagramId,
            requestId: message.requestId,
            lock: diagramLocked ? null : result.lock ?? null,
            ...(diagramLocked ? { diagramLock: result.lock } : {}),
          });
          return;
        }
        send(socket, {
          type: MESSAGE_TYPES.TABLE_LOCK_GRANTED,
          diagramId,
          requestId: message.requestId,
          lock: result.lock,
        });
        broadcastTableLocks(diagramId);
        return;
      }

      if (message.type === MESSAGE_TYPES.TABLE_LOCK_RENEW) {
        if (
          isValidEntityId(message.tableId) &&
          Number.isInteger(message.token) &&
          locks.renew({
            diagramId,
            clientId: socket.participant.clientId,
            claim: { kind: "table", tableId: message.tableId },
            token: message.token,
          })
        ) {
          broadcastTableLocks(diagramId);
        }
        return;
      }

      if (message.type === MESSAGE_TYPES.TABLE_LOCK_RELEASE) {
        if (
          isValidEntityId(message.tableId) &&
          Number.isInteger(message.token) &&
          locks.release({
            diagramId,
            clientId: socket.participant.clientId,
            claim: { kind: "table", tableId: message.tableId },
            token: message.token,
          })
        ) {
          broadcastTableLocks(diagramId);
        }
        return;
      }

      if (message.type === MESSAGE_TYPES.DIAGRAM_LOCK_ACQUIRE) {
        if (!CLIENT_ID_PATTERN.test(message.requestId || "")) {
          send(socket, {
            type: MESSAGE_TYPES.ERROR,
            message: "Invalid diagram lock request",
          });
          return;
        }
        const result = locks.acquire({
          diagramId,
          holder: socket.participant,
          claim: { kind: "diagram" },
        });
        if (!result.granted) {
          send(socket, {
            type: MESSAGE_TYPES.DIAGRAM_LOCK_DENIED,
            diagramId,
            requestId: message.requestId,
            lock: result.lock ?? null,
            ...(result.locks ? { tableLocks: result.locks } : {}),
          });
          return;
        }
        broadcastTableLocks(diagramId);
        broadcastDiagramLock(diagramId);
        const diagram = store.get(diagramId);
        send(socket, {
          type: MESSAGE_TYPES.DIAGRAM_LOCK_GRANTED,
          diagramId,
          requestId: message.requestId,
          lock: result.lock,
          version: diagram.version,
        });
        return;
      }

      if (message.type === MESSAGE_TYPES.DIAGRAM_LOCK_RENEW) {
        if (Number.isInteger(message.token)) {
          locks.renew({
            diagramId,
            clientId: socket.participant.clientId,
            claim: { kind: "diagram" },
            token: message.token,
          });
        }
        return;
      }

      if (message.type === MESSAGE_TYPES.DIAGRAM_LOCK_RELEASE) {
        if (
          Number.isInteger(message.token) &&
          locks.release({
            diagramId,
            clientId: socket.participant.clientId,
            claim: { kind: "diagram" },
            token: message.token,
          })
        ) {
          broadcastDiagramLock(diagramId);
        }
        return;
      }

      if (message.type === MESSAGE_TYPES.CURSOR) {
        const { x, y, selected } = message;
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        broadcast(
          diagramId,
          {
            type: MESSAGE_TYPES.CURSOR,
            diagramId,
            clientId: socket.participant.clientId,
            x,
            y,
            selected: typeof selected === "string" ? selected : null,
          },
          socket,
        );
        return;
      }

      if (message.type === MESSAGE_TYPES.PING) {
        send(socket, { type: MESSAGE_TYPES.PONG, diagramId });
        return;
      }
      send(socket, {
        type: MESSAGE_TYPES.ERROR,
        message: "Unsupported message type",
      });
    });

    socket.on("close", () => {
      const sessionSockets = sessions.get(socket.sessionKey);
      sessionSockets?.delete(socket);
      if (sessionSockets?.size === 0) sessions.delete(socket.sessionKey);
      const room = rooms.get(diagramId);
      room?.delete(socket);
      const releasedLocks = socket.participant
        ? locks.releaseClient(diagramId, socket.participant.clientId)
        : false;
      if (room?.size === 0) rooms.delete(diagramId);
      else {
        broadcastPresence(diagramId);
        if (releasedLocks) {
          broadcastTableLocks(diagramId);
          broadcastDiagramLock(diagramId);
        }
      }
    });
  });

  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (!socket.isAlive) {
        socket.terminate();
        continue;
      }
      socket.isAlive = false;
      socket.ping();
    }
  }, 30_000);
  heartbeat.unref();
  const lockSweep = setInterval(() => {
    for (const diagramId of locks.sweep()) {
      broadcastTableLocks(diagramId);
      broadcastDiagramLock(diagramId);
    }
  }, 2_000);
  lockSweep.unref();
  const clearTimers = () => {
    clearInterval(heartbeat);
    clearInterval(lockSweep);
  };
  wss.on("close", clearTimers);

  wss.closeSession = (token) => {
    const sessionKey = hashSessionToken(token);
    if (!sessionKey) return;
    for (const socket of sessions.get(sessionKey) || []) {
      socket.close(1008, "Session ended");
    }
  };

  wss.shutdown = ({ timeoutMs = 8_000 } = {}) => {
    if (shutdownPromise) return shutdownPromise;
    shutdownPromise = new Promise((resolve) => {
      closing = true;
      clearTimers();
      const terminateTimer = setTimeout(() => {
        for (const socket of wss.clients) socket.terminate();
      }, timeoutMs);
      terminateTimer.unref();
      wss.close(() => {
        clearTimeout(terminateTimer);
        resolve();
      });
      for (const socket of wss.clients)
        socket.close(1001, "Server shutting down");
    });
    return shutdownPromise;
  };

  // A snapshot written outside the socket layer — a git pull, for instance —
  // still has to reach everyone who has the diagram open.
  wss.broadcastSnapshot = (diagramId, diagram) => {
    broadcast(diagramId, {
      type: MESSAGE_TYPES.SNAPSHOT,
      diagramId,
      ...diagram,
    });
  };
  return wss;
}
