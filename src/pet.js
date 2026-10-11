import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { BUILTIN_PETS } from "./config.js";
export class PetSelection {
  constructor(file) {
    this.file = file;
    try {
      const id = JSON.parse(readFileSync(file, "utf8")).lastPet;
      if (BUILTIN_PETS.includes(id)) this.lastPet = id;
    } catch {}
  }
  resolve(detected, override) {
    const candidate = override || detected;
    if (BUILTIN_PETS.includes(candidate) && candidate !== this.lastPet) {
      this.lastPet = candidate;
      try {
        mkdirSync(dirname(this.file), { recursive: true });
        writeFileSync(this.file, JSON.stringify({ lastPet: candidate }), {
          mode: 0o600,
        });
      } catch {
        /* Read-only homes still get the in-memory/default pet. */
      }
    }
    return this.lastPet || "codex";
  }
}
