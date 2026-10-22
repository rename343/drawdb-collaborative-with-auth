import { nanoid } from "nanoid";
import { arrangeTables } from "../autoLayout/index.js";

const NEW_TABLE_GAP = 120;

function arrangeNewTables(newTables, relationships, existingTables) {
  if (newTables.length === 0) return;

  const newIds = new Set(newTables.map((table) => table.id));
  const innerRelationships = relationships.filter(
    (relationship) =>
      newIds.has(relationship.startTableId) &&
      newIds.has(relationship.endTableId),
  );

  arrangeTables({ tables: newTables, relationships: innerRelationships });

  const positionedExisting = existingTables.filter((table) =>
    Number.isFinite(table.x),
  );
  if (positionedExisting.length === 0) return;

  const maxExistingX = Math.max(...positionedExisting.map((table) => table.x));
  const minNewX = Math.min(...newTables.map((table) => table.x));
  const shiftX = maxExistingX + NEW_TABLE_GAP - minNewX;
  if (!Number.isFinite(shiftX) || shiftX === 0) return;

  for (const table of newTables) {
    table.x += shiftX;
  }
}

function validateDiagram(tables, relationships) {
  const byId = new Map(tables.map((table) => [table.id, table]));

  for (const relationship of relationships) {
    const startTable = byId.get(relationship.startTableId);
    const endTable = byId.get(relationship.endTableId);
    if (!startTable || !endTable) {
      throw new Error(
        `Relationship ${relationship.name} references a table that no longer exists.`,
      );
    }

    const pairs =
      Array.isArray(relationship.fields) && relationship.fields.length > 0
        ? relationship.fields
        : [
            {
              startFieldId: relationship.startFieldId,
              endFieldId: relationship.endFieldId,
            },
          ];

    for (const pair of pairs) {
      const hasStartField = startTable.fields?.some(
        (field) => field.id === pair.startFieldId,
      );
      const hasEndField = endTable.fields?.some(
        (field) => field.id === pair.endFieldId,
      );
      if (!hasStartField || !hasEndField) {
        throw new Error(
          `Relationship ${relationship.name} references a field that no longer exists.`,
        );
      }
    }
  }
}

/**
 * Replaces the diagram's tables, relationships and enums with parsed DBML while
 * preserving everything that DBML does not represent.
 *
 * Matched tables keep their id and position by name, so notes, areas and
 * existing references stay valid. Parsed relationship table ids are remapped
 * onto the reused table ids.
 */
export function applyDBMLToDocument(parsed, current) {
  const currentDocument = current ?? {};
  const parsedTables = parsed?.tables ?? [];
  const parsedRelationships = parsed?.relationships ?? [];
  const existingTables = currentDocument.tables ?? [];

  const existingByName = new Map();
  for (const table of existingTables) {
    if (!existingByName.has(table.name)) {
      existingByName.set(table.name, table);
    }
  }

  const seenNames = new Set();
  for (const table of parsedTables) {
    if (seenNames.has(table.name)) {
      throw new Error(`Duplicate table name: ${table.name}`);
    }
    seenNames.add(table.name);
  }

  const usedIds = new Set(existingTables.map((table) => table.id));
  const tableIdMap = new Map();
  const newTables = [];

  const tables = parsedTables.map((parsedTable) => {
    const existing = existingByName.get(parsedTable.name);
    let id = parsedTable.id;
    if (existing) {
      id = existing.id;
    } else {
      while (usedIds.has(id)) id = nanoid();
      usedIds.add(id);
    }
    tableIdMap.set(parsedTable.id, id);

    const table = {
      ...parsedTable,
      id,
      ...(existing
        ? {
            x: existing.x,
            y: existing.y,
            locked: existing.locked ?? false,
            collapsed: existing.collapsed ?? false,
          }
        : {
            locked: false,
            collapsed: false,
          }),
    };

    if (!existing) newTables.push(table);
    return table;
  });

  const relationships = parsedRelationships.map((relationship) => ({
    ...relationship,
    startTableId:
      tableIdMap.get(relationship.startTableId) ?? relationship.startTableId,
    endTableId:
      tableIdMap.get(relationship.endTableId) ?? relationship.endTableId,
  }));

  arrangeNewTables(newTables, relationships, existingTables);
  validateDiagram(tables, relationships);

  return {
    ...currentDocument,
    tables,
    references: relationships,
    enums: parsed?.enums ?? [],
  };
}
