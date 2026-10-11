import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { CodexSource, activePet } from "../src/source.js";

test("reads active SQLite turns, prefers a running tool, expires completed and abandoned sessions", () => {
  const dir = mkdtempSync(join(tmpdir(), "codex-presence-test-")),
    now = Date.now(),
    s = new DatabaseSync(join(dir, "state_5.sqlite")),
    h = new DatabaseSync(join(dir, "thread_history_1.sqlite"));
  s.exec(
    "CREATE TABLE threads(id TEXT,cwd TEXT,rollout_path TEXT,updated_at INTEGER,archived INTEGER,agent_path TEXT,model TEXT,reasoning_effort TEXT,source TEXT,originator TEXT)",
  );
  h.exec(
    "CREATE TABLE thread_turns(thread_id TEXT,turn_id TEXT,status TEXT,started_at INTEGER,completed_at INTEGER,rollout_ordinal INTEGER); CREATE TABLE thread_items(thread_id TEXT,turn_id TEXT,item_type TEXT,item_json TEXT,rollout_ordinal INTEGER)",
  );
  s.prepare(
    "INSERT INTO threads VALUES(?,?,?,?,0,NULL,NULL,NULL,'vscode','Codex Desktop')",
  ).run("t", "D:\\Work\\Example", "missing", Math.floor(now / 1000));
  h.prepare("INSERT INTO thread_turns VALUES(?,?,?,?,NULL,1)").run(
    "t",
    "turn",
    "inProgress",
    Math.floor(now / 1000),
  );
  const add = h.prepare("INSERT INTO thread_items VALUES(?,?,?,?,?)");
  add.run(
    "t",
    "turn",
    "commandExecution",
    JSON.stringify({
      status: "inProgress",
      command: "npm test",
      aggregatedOutput: "SECRET_OUTPUT",
    }),
    1,
  );
  add.run(
    "t",
    "turn",
    "reasoning",
    JSON.stringify({ summary: "SECRET_REASONING" }),
    2,
  );
  const source = new CodexSource(dir);
  try {
    assert.equal(source.snapshot(now).state, "testing");
    assert.doesNotMatch(JSON.stringify(source.snapshot(now)), /SECRET|npm/);
    s.prepare(
      "INSERT INTO threads VALUES(?,?,?,?,0,NULL,NULL,NULL,'cli','codex-tui')",
    ).run("other", "D:\\Work\\Other", "missing", Math.floor(now / 1000) + 1);
    h.prepare("INSERT INTO thread_turns VALUES(?,?,?,?,NULL,1)").run(
      "other",
      "turn2",
      "inProgress",
      Math.floor(now / 1000) + 1,
    );
    assert.equal(source.snapshot(now + 1000).project, "Example"); // new activity cannot steal the card
    assert.equal(source.snapshot(now + 11 * 60_000), null);
    h.prepare(
      "UPDATE thread_turns SET status=?,completed_at=? WHERE thread_id=?",
    ).run("completed", Math.floor(now / 1000), "t");
    assert.equal(source.snapshot(now + 1000).project, "Other"); // hand over only on completion
    // A resumed real project preempts an older projectless chat.
    s.prepare("UPDATE threads SET cwd=? WHERE id=?").run(
      "C:\\Users\\Test\\Documents\\Codex\\2026-10-11\\private-chat",
      "other",
    );
    assert.equal(source.snapshot(now + 1000).project, null);
    h.prepare(
      "UPDATE thread_turns SET status=?,completed_at=NULL,started_at=? WHERE thread_id=?",
    ).run("inProgress", Math.floor(now / 1000) + 2, "t");
    assert.equal(source.snapshot(now + 2000).project, "Example");
    h.prepare("UPDATE thread_turns SET status=?,completed_at=?").run(
      "completed",
      Math.floor(now / 1000),
    );
    assert.equal(source.snapshot(now).state, "done");
    assert.equal(source.snapshot(now + 61_000), null);
  } finally {
    source.close();
    s.close();
    h.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("pet selection uses current account, disables on null and avoids ambiguous accounts", () => {
  const dir = mkdtempSync(join(tmpdir(), "codex-pet-test-"));
  const save = (a) =>
    writeFileSync(
      join(dir, ".codex-global-state.json"),
      JSON.stringify({ "electron-persisted-atom-state": a }),
    );
  try {
    save({ "last-observed-cloud-pet-selection-v1": { one: "null-signal" } });
    assert.equal(activePet(dir), "null-signal");
    save({
      "last-observed-cloud-pet-selection-v1": {
        one: "null-signal",
        two: "hoots",
      },
    });
    assert.equal(activePet(dir), null);
    save({
      "cloud-pet-artwork-cache": { accountId: "a", userId: "u" },
      "last-observed-cloud-pet-selection-v1": {
        '["a","u"]': "hoots",
        other: "bsod",
      },
    });
    assert.equal(activePet(dir), "hoots");
    save({ "last-observed-cloud-pet-selection-v1": { one: null } });
    assert.equal(activePet(dir), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
