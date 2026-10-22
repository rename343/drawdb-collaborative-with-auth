import test from "node:test";
import assert from "node:assert/strict";
import { fromDBML } from "./dbml.js";
import { applyDBMLToDocument } from "./dbmlApply.js";

const source = `
enum account_status {
  active
  blocked
}

Table users {
  id int [pk]
  name varchar
  status account_status
}

Table posts {
  id int [pk]
  user_id int
}

Table comments {
  id int [pk]
  post_id int
}

Ref: posts.user_id > users.id
Ref: comments.post_id > posts.id
`;

function currentDocument() {
  return {
    database: "postgresql",
    tables: [
      {
        id: "users-existing",
        name: "users",
        x: 120,
        y: 240,
        locked: true,
        collapsed: true,
        fields: [{ id: "old-field", name: "id", type: "INT" }],
      },
      {
        id: "posts-existing",
        name: "posts",
        x: 520,
        y: 240,
        locked: false,
        collapsed: false,
        fields: [{ id: "old-field-2", name: "id", type: "INT" }],
      },
      {
        id: "removed",
        name: "removed",
        x: 800,
        y: 800,
        fields: [],
      },
    ],
    references: [
      {
        id: "old-relationship",
        name: "old_relationship",
        startTableId: "posts-existing",
        endTableId: "users-existing",
        startFieldId: "old-field-2",
        endFieldId: "old-field",
      },
    ],
    notes: [{ id: 0, title: "note", x: 10, y: 20 }],
    areas: [{ id: 0, name: "area", x: 0, y: 0 }],
    types: [{ id: "uuid", name: "uuid" }],
    pan: { x: 12, y: 34 },
    zoom: 0.75,
    enums: [{ name: "old_status", values: ["old"] }],
  };
}

test("applies parsed DBML while preserving the surrounding document", () => {
  const parsed = fromDBML(source);
  const current = currentDocument();

  const next = applyDBMLToDocument(parsed, current);

  assert.equal(next.tables.length, 3);
  assert.equal(
    next.tables.some((table) => table.name === "removed"),
    false,
  );

  const users = next.tables.find((table) => table.name === "users");
  const posts = next.tables.find((table) => table.name === "posts");
  const comments = next.tables.find((table) => table.name === "comments");

  assert.equal(users.id, "users-existing");
  assert.equal(users.x, 120);
  assert.equal(users.y, 240);
  assert.equal(users.locked, true);
  assert.equal(users.collapsed, true);
  assert.equal(posts.id, "posts-existing");

  assert.notEqual(comments.id, "removed");
  assert.ok(comments.x > 520);

  const postRelationship = next.references.find(
    (relationship) => relationship.name.includes("posts_user_id_users"),
  );
  const commentRelationship = next.references.find(
    (relationship) => relationship.name.includes("comments_post_id_posts"),
  );

  assert.equal(postRelationship.startTableId, "posts-existing");
  assert.equal(postRelationship.endTableId, "users-existing");
  assert.equal(commentRelationship.startTableId, comments.id);
  assert.equal(commentRelationship.endTableId, "posts-existing");

  for (const relationship of next.references) {
    const start = next.tables.find(
      (table) => table.id === relationship.startTableId,
    );
    const end = next.tables.find(
      (table) => table.id === relationship.endTableId,
    );
    assert.ok(start);
    assert.ok(end);
    for (const pair of relationship.fields) {
      assert.ok(start.fields.some((field) => field.id === pair.startFieldId));
      assert.ok(end.fields.some((field) => field.id === pair.endFieldId));
    }
  }

  assert.deepEqual(next.notes, current.notes);
  assert.deepEqual(next.areas, current.areas);
  assert.deepEqual(next.types, current.types);
  assert.deepEqual(next.pan, current.pan);
  assert.equal(next.zoom, current.zoom);
  assert.deepEqual(
    next.enums.map((entry) => entry.name),
    ["account_status"],
  );
});

test("is idempotent when the same DBML is applied twice", () => {
  const parsed = fromDBML(source);
  const once = applyDBMLToDocument(parsed, currentDocument());
  const twice = applyDBMLToDocument(parsed, once);

  assert.deepEqual(
    twice.tables.map((table) => [table.name, table.id, table.x, table.y]),
    once.tables.map((table) => [table.name, table.id, table.x, table.y]),
  );
  assert.deepEqual(
    twice.references.map((relationship) => [
      relationship.name,
      relationship.startTableId,
      relationship.endTableId,
    ]),
    once.references.map((relationship) => [
      relationship.name,
      relationship.startTableId,
      relationship.endTableId,
    ]),
  );
  assert.deepEqual(twice.notes, once.notes);
});

test("rejects a relationship that points at an unknown table", () => {
  const parsed = fromDBML(source);
  parsed.relationships[0].startTableId = "missing";

  assert.throws(
    () => applyDBMLToDocument(parsed, currentDocument()),
    /references a table that no longer exists/,
  );
});
