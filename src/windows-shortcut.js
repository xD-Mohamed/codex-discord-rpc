// Read legacy Shell Link ownership without running a script host.
const CLSID = Buffer.from("0114020000000000c000000000000046", "hex");
export function shortcutDescription(bytes) {
  const requireBytes = (offset, count) => {
    if (offset < 0 || count < 0 || offset + count > bytes.length)
      throw new Error("Invalid Windows shortcut; refusing to overwrite it.");
  };
  requireBytes(0, 76);
  if (bytes.readUInt32LE(0) !== 76 || !bytes.subarray(4, 20).equals(CLSID))
    throw new Error("Invalid Windows shortcut; refusing to overwrite it.");
  const flags = bytes.readUInt32LE(20);
  let offset = 76;
  if (flags & 1) {
    requireBytes(offset, 2);
    const size = bytes.readUInt16LE(offset);
    requireBytes(offset, 2 + size);
    offset += 2 + size;
  }
  if (flags & 2) {
    requireBytes(offset, 4);
    const size = bytes.readUInt32LE(offset);
    if (size < 28) throw new Error("Invalid Windows shortcut LinkInfo.");
    requireBytes(offset, size);
    offset += size;
  }
  if (!(flags & 4)) return "";
  requireBytes(offset, 2);
  const size = bytes.readUInt16LE(offset) * (flags & 128 ? 2 : 1);
  requireBytes(offset + 2, size);
  return bytes
    .subarray(offset + 2, offset + 2 + size)
    .toString(flags & 128 ? "utf16le" : "latin1");
}
