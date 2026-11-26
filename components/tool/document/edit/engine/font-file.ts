/**
 * The font writer cuts glyphs out of a font and lays them one after the other
 * with places counted in pairs of bytes. Fonts whose glyphs have odd lengths
 * would come out broken, so those are given even ones first.
 */
export function evenGlyphs(bytes: ArrayBuffer): ArrayBuffer {
  const view = new DataView(bytes);
  if (bytes.byteLength < 12) return bytes;
  const count = view.getUint16(4);
  const tables: { tag: string; at: number; length: number }[] = [];
  for (let i = 0; i < count; i += 1) {
    const at = 12 + i * 16;
    if (at + 16 > bytes.byteLength) return bytes;
    const tag = String.fromCharCode(
      view.getUint8(at),
      view.getUint8(at + 1),
      view.getUint8(at + 2),
      view.getUint8(at + 3),
    );
    tables.push({ tag, at: view.getUint32(at + 8), length: view.getUint32(at + 12) });
  }
  const table = (tag: string) => tables.find((item) => item.tag === tag);
  const head = table("head");
  const loca = table("loca");
  const glyf = table("glyf");
  const maxp = table("maxp");
  if (!head || !loca || !glyf || !maxp) return bytes;
  const glyphs = view.getUint16(maxp.at + 4);
  const long = view.getInt16(head.at + 50) === 1;
  if (!long || loca.length < (glyphs + 1) * 4) return bytes;
  const places: number[] = [];
  let odd = false;
  for (let i = 0; i <= glyphs; i += 1) {
    const place = view.getUint32(loca.at + i * 4);
    if (i > 0 && (place < places[i - 1] || place > glyf.length)) return bytes;
    if (place % 2) odd = true;
    places.push(place);
  }
  if (!odd) return bytes;

  const even = (value: number) => (value + 3) & ~3;
  const starts: number[] = [];
  let size = 0;
  for (let i = 0; i < glyphs; i += 1) {
    starts.push(size);
    size += even(places[i + 1] - places[i]);
  }
  starts.push(size);

  const sizes = new Map<string, number>(tables.map((item) => [item.tag, item.length]));
  sizes.set("glyf", size);
  sizes.set("loca", (glyphs + 1) * 4);
  const total = 12 + count * 16 + tables.reduce((sum, item) => sum + even(sizes.get(item.tag) ?? 0), 0);
  const out = new Uint8Array(total);
  const from = new Uint8Array(bytes);
  const made = new DataView(out.buffer);
  out.set(from.subarray(0, 12 + count * 16));
  let at = even(12 + count * 16);
  tables.forEach((item, i) => {
    const length = sizes.get(item.tag) ?? 0;
    made.setUint32(12 + i * 16 + 8, at);
    made.setUint32(12 + i * 16 + 12, length);
    if (item.tag === "glyf") {
      for (let g = 0; g < glyphs; g += 1)
        out.set(from.subarray(glyf.at + places[g], glyf.at + places[g + 1]), at + starts[g]);
    } else if (item.tag === "loca") starts.forEach((start, g) => made.setUint32(at + g * 4, start));
    else out.set(from.subarray(item.at, item.at + item.length), at);
    at += even(length);
  });
  return out.buffer;
}
