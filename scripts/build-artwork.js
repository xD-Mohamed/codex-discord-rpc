import sharp from "sharp";
import { mkdir, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { BUILTIN_PETS } from "../src/config.js";

const source = process.argv[2],
  target = process.argv[3] || "artwork";
if (!source)
  throw new Error(
    "Usage: node scripts/build-artwork.js SPRITE_DIRECTORY [OUTPUT_DIRECTORY]",
  );
const rows = {
  idle: { row: 0, delay: [280, 110, 110, 140, 140, 320] },
  running: { row: 7, delay: [120, 120, 120, 120, 120, 220] },
  review: { row: 8, delay: [150, 150, 150, 150, 150, 280] },
  waiting: { row: 6, delay: [150, 150, 150, 150, 150, 260] },
  failed: { row: 5, delay: [140, 140, 140, 140, 140, 140, 140, 240] },
  waving: { row: 3, delay: [140, 140, 140, 280] },
  jumping: { row: 4, delay: [140, 140, 140, 140, 280] },
  "running-right": { row: 1, delay: [120, 120, 120, 120, 120, 120, 120, 220] },
  "running-left": { row: 2, delay: [120, 120, 120, 120, 120, 120, 120, 220] },
};
const files = await readdir(source);
for (const pet of BUILTIN_PETS) {
  const file = files.find(
    (f) => f.startsWith(`${pet}-spritesheet-`) && f.endsWith(".webp"),
  );
  if (!file) continue;
  const sheet = join(source, file),
    meta = await sharp(sheet).metadata();
  if (meta.width !== 1536 || meta.height !== 2288)
    throw new Error(`Unsupported v2 atlas: ${file}`);
  await mkdir(join(target, pet), { recursive: true });
  for (const [name, { row, delay }] of Object.entries(rows)) {
    const frames = [];
    for (let col = 0; col < delay.length; col++) {
      frames.push(
        await sharp(sheet)
          .extract({ left: col * 192, top: row * 208, width: 192, height: 208 })
          .resize(256, 256, { fit: "contain", background: "#00000000" })
          .ensureAlpha()
          .raw()
          .toBuffer(),
      );
    }
    const output = join(target, pet, `${name}.gif`);
    await sharp(Buffer.concat(frames), {
      raw: {
        width: 256,
        height: 256 * frames.length,
        channels: 4,
        pageHeight: 256,
      },
    })
      .gif({
        delay: delay.map((ms) => ms * 2),
        loop: 0,
        effort: 7,
        keepDuplicateFrames: true,
      })
      .toFile(output);
    const result = await sharp(output, { animated: true }).metadata();
    if (result.pages !== delay.length || result.pageHeight !== 256)
      throw new Error(`Animation verification failed: ${output}`);
  }
  console.log(
    `Built ${pet}: ${Object.keys(rows).length} verified animation loops`,
  );
}
console.log(`Artwork: ${resolve(target)}`);
