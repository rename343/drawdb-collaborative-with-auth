const OPEN = 1;

export function createBrowserTransport({
  WebSocketImpl = globalThis.WebSocket,
  location = globalThis.location,
} = {}) {
  let socket = null;

  return {
    open({ diagramId, onOpen, onMessage, onClose }) {
      const scheme = location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocketImpl(
        `${scheme}//${location.host}/ws/diagrams/${encodeURIComponent(diagramId)}`,
      );
      socket.onopen = onOpen;
      socket.onmessage = (event) => onMessage(event.data);
      socket.onclose = onClose;
      socket.onerror = () => socket?.close();
    },
    send(raw) {
      if (socket?.readyState === OPEN) socket.send(raw);
    },
    close() {
      const current = socket;
      socket = null;
      current?.close();
    },
  };
}
