import {
  Cardinality,
  tableWidth as defaultTableWidth,
} from "../../data/constants.js";
import { getTableHeight } from "../utils.js";
import { buildGraph, components, subgraph } from "./graph.js";
import { hierarchicalLayout } from "./hierarchical.js";
import { organicLayout } from "./organic.js";
import { orthogonalLayout } from "./orthogonal.js";
import { packBlocks } from "./pack.js";
import { treeLayout } from "./tree.js";

export const LayoutType = {
  HIERARCHICAL: "hierarchical",
  ORGANIC: "organic",
  TREE: "tree",
  ORTHOGONAL: "orthogonal",
};

const layouts = {
  [LayoutType.HIERARCHICAL]: hierarchicalLayout,
  [LayoutType.ORGANIC]: organicLayout,
  [LayoutType.TREE]: treeLayout,
  [LayoutType.ORTHOGONAL]: orthogonalLayout,
};

const defaults = {
  gapX: 120,
  gapY: 60,
  componentGap: 140,
  origin: { x: 50, y: 50 },
};

/**
 * Computes new positions for the given tables.
 *
 * @param {string} type one of {@link LayoutType}
 * @param {{ id: any, w: number, h: number }[]} nodes table sizes
 * @param {{ source: any, target: any }[]} edges referencing → referenced table
 * @returns {Map<any, { x: number, y: number }>} top-left position per table id
 */
export function computeLayout(type, nodes, edges, options = {}) {
  const layout = layouts[type];
  if (!layout) throw new Error(`Unknown layout type: ${type}`);
  const opts = { ...defaults, ...options };

  const graph = buildGraph(nodes, edges);
  const blocks = [];
  const blockNodes = [];
  const isolated = [];
  const isolatedNodes = [];

  for (const comp of components(graph)) {
    if (comp.length === 1) {
      const node = graph.nodes[comp[0]];
      isolated.push({ x: 0, y: 0, w: node.w, h: node.h });
      isolatedNodes.push(node);
      continue;
    }
    const sub = subgraph(graph, comp);
    blocks.push(layout(sub, opts));
    blockNodes.push(sub.nodes);
  }

  packBlocks(blocks, isolated, { gap: opts.componentGap, origin: opts.origin });

  const result = new Map();
  blocks.forEach((rects, i) => {
    rects.forEach((rect, j) => {
      result.set(blockNodes[i][j].id, {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
      });
    });
  });
  isolated.forEach((rect, i) => {
    result.set(isolatedNodes[i].id, {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
    });
  });
  return result;
}

/**
 * Computes new positions for the diagram tables with the given layout style.
 *
 * @returns {Map<any, { x: number, y: number }>} top-left position per table id
 */
export function layoutDiagramTables(
  type,
  tables,
  relationships = [],
  { tableWidth = defaultTableWidth, showComments = true } = {},
) {
  const nodes = tables.map((table) => ({
    id: table.id,
    w: tableWidth,
    h: getTableHeight(table, tableWidth, showComments, relationships),
  }));
  // Edges point from the table holding the foreign key (the "many" side) to
  // the referenced table. One-to-many relationships store it as the end.
  const edges = relationships.map((r) =>
    r.cardinality === Cardinality.ONE_TO_MANY
      ? { source: r.endTableId, target: r.startTableId }
      : { source: r.startTableId, target: r.endTableId },
  );
  return computeLayout(type, nodes, edges);
}

export function arrangeTables(diagram) {
  const positions = layoutDiagramTables(
    LayoutType.HIERARCHICAL,
    diagram.tables,
    diagram.relationships,
  );
  diagram.tables.forEach((table) => {
    Object.assign(table, positions.get(table.id));
  });
}
