import assert from "node:assert/strict";
import test from "node:test";
import { buildDiagramShareUrl } from "./share.js";

test("builds the canonical diagram URL", () => {
  assert.equal(
    buildDiagramShareUrl("https://drawdb.example.com", "8d3f1c2a"),
    "https://drawdb.example.com/diagrams/8d3f1c2a",
  );
});

test("encodes diagram ids that need escaping", () => {
  assert.equal(
    buildDiagramShareUrl("https://drawdb.example.com", "a b/c?d#e"),
    "https://drawdb.example.com/diagrams/a%20b%2Fc%3Fd%23e",
  );
});

test("trims trailing slashes from the origin", () => {
  assert.equal(
    buildDiagramShareUrl("https://drawdb.example.com/", "abc123"),
    "https://drawdb.example.com/diagrams/abc123",
  );
  assert.equal(
    buildDiagramShareUrl("https://drawdb.example.com///", "abc123"),
    "https://drawdb.example.com/diagrams/abc123",
  );
});

test("rejects blank diagram ids", () => {
  assert.equal(
    buildDiagramShareUrl("https://drawdb.example.com", "blank"),
    null,
  );
  assert.equal(buildDiagramShareUrl("https://drawdb.example.com", ""), null);
  assert.equal(buildDiagramShareUrl("https://drawdb.example.com"), null);
  assert.equal(buildDiagramShareUrl("https://drawdb.example.com", "   "), null);
  assert.equal(buildDiagramShareUrl("", "abc123"), null);
});
