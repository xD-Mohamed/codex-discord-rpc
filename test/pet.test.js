import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PetSelection } from "../src/pet.js";
test("disabled or missing pets use the remembered companion, otherwise the default", () => {
  const dir = mkdtempSync(join(tmpdir(), "codex-pet-choice-")),
    file = join(dir, "pet.json");
  try {
    const p = new PetSelection(file);
    assert.equal(p.resolve(null), "codex");
    assert.equal(p.resolve("null-signal"), "null-signal");
    assert.equal(p.resolve(null), "null-signal");
    assert.equal(new PetSelection(file).resolve(undefined), "null-signal");
    assert.equal(p.resolve("private-custom-id"), "null-signal");
    assert.equal(p.resolve(null, "hoots"), "hoots");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
