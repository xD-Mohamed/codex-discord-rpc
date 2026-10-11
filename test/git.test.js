import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { GitDiff, parseNumstat } from "../src/git.js";
test("NUL numstat handles binary, rename paths and newlines without leaking names", () => {
  assert.deepEqual(
    parseNumstat(
      "400\t50\tprivate\nname\0-\t-\tbinary\0" + "2\t1\t\0old\0new\0",
    ),
    { added: 402, removed: 51 },
  );
});
test("real Git combines staged and unstaged against HEAD, excludes untracked, omits non-repos", async () => {
  const dir = mkdtempSync(join(tmpdir(), "codex-diff-test-"));
  const git = (...args) =>
    execFileSync("git", ["-C", dir, ...args], {
      windowsHide: true,
      stdio: "pipe",
    });
  try {
    assert.equal(await new GitDiff().read(dir), null);
    git("init");
    git("config", "user.name", "Test");
    git("config", "user.email", "test@example.invalid");
    git("config", "core.autocrlf", "false");
    writeFileSync(join(dir, "tracked.txt"), "a\nb\nc\n");
    git("add", ".");
    git("-c", "commit.gpgsign=false", "commit", "-m", "fixture");
    writeFileSync(join(dir, "tracked.txt"), "a\nb\nc\nd\n");
    git("add", ".");
    writeFileSync(join(dir, "tracked.txt"), "a\nc\nd\ne\n");
    writeFileSync(join(dir, "private-untracked.txt"), "secret\n");
    assert.deepEqual(await new GitDiff().read(dir), {
      added: 2,
      removed: 1,
      hasChanges: true,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
