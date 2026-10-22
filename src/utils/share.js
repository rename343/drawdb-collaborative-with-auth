/**
 * Builds the canonical, absolute URL for a saved diagram.
 *
 * Returns `null` when there is nothing shareable yet: an unsaved editor has no
 * id and the built-in template is identified as "blank".
 */
export function buildDiagramShareUrl(origin, diagramId) {
  if (!origin || !diagramId) return null;

  const id = String(diagramId).trim();
  if (!id || id === "blank") return null;

  const base = String(origin).replace(/\/+$/, "");
  return `${base}/diagrams/${encodeURIComponent(id)}`;
}
