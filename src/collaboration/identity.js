import { nanoid } from "nanoid";

const COLORS = ["#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea580c"];
const STORAGE_KEY = "drawdb-collaboration-identity";

// The tab keeps a stable client ID and color; the display name always comes
// from the signed-in account, and the server enforces that on join.
export function getLocalIdentity(storage = globalThis.sessionStorage) {
  const stored = storage?.getItem(STORAGE_KEY);
  if (stored) {
    try {
      const identity = JSON.parse(stored);
      if (identity?.clientId && identity?.color) return identity;
    } catch {
      // Fall through and mint a fresh identity.
    }
    storage.removeItem(STORAGE_KEY);
  }
  const identity = {
    clientId: nanoid(),
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  };
  storage?.setItem(STORAGE_KEY, JSON.stringify(identity));
  return identity;
}
