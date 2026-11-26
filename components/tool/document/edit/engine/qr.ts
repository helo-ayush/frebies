/**
 * QR codes and bar codes as plain squares and bars. The white border scanners need is left to whoever draws
 * them: 4 squares around a QR code, 10 narrow bars beside Code 128, 11 to the left and 7 to the right of EAN-13.
 */

export type QrLevel = "L" | "M" | "Q" | "H";

// ---------------------------------------------------------------- what the text becomes

const ALPHANUMERIC = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";

/** Text as bits, and how many bits its length takes in versions up to 9, up to 26 and above. */
type Packed = { mode: number; length: number; lengthBits: readonly number[]; bits: number[] };

function push(bits: number[], value: number, count: number) {
  for (let i = count - 1; i >= 0; i -= 1) bits.push((value >>> i) & 1);
}

function pack(text: string): Packed {
  const bits: number[] = [];
  if (/^\d+$/.test(text)) {
    for (let i = 0; i < text.length; i += 3) {
      const part = text.slice(i, i + 3);
      push(bits, Number(part), part.length * 3 + 1);
    }
    return { mode: 1, length: text.length, lengthBits: [10, 12, 14], bits };
  }
  const places = Array.from(text, (char) => ALPHANUMERIC.indexOf(char));
  if (!places.includes(-1)) {
    for (let i = 0; i < places.length; i += 2) {
      if (i + 1 < places.length) push(bits, places[i] * 45 + places[i + 1], 11);
      else push(bits, places[i], 6);
    }
    return { mode: 2, length: places.length, lengthBits: [9, 11, 13], bits };
  }
  // Scanners take bytes for UTF-8 by themselves, and some do not know the mark that says so.
  const bytes = new TextEncoder().encode(text);
  for (const byte of bytes) push(bits, byte, 8);
  return { mode: 4, length: bytes.length, lengthBits: [8, 16, 16], bits };
}

// ---------------------------------------------------------------- room

/** By level and version: check words per block, and how many blocks. Version 0 does not exist. */
const CHECK_WORDS: Record<QrLevel, readonly number[]> = {
  L: [
    0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30,
    30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
  ],
  M: [
    0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28,
    28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
  ],
  Q: [
    0, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30,
    30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
  ],
  H: [
    0, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30,
    30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
  ],
};
const BLOCKS: Record<QrLevel, readonly number[]> = {
  L: [
    0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19,
    19, 20, 21, 22, 24, 25,
  ],
  M: [
    0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33,
    35, 37, 38, 40, 43, 45, 47, 49,
  ],
  Q: [
    0, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43,
    45, 48, 51, 53, 56, 59, 62, 65, 68,
  ],
  H: [
    0, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51,
    54, 57, 60, 63, 66, 70, 74, 77, 81,
  ],
};
const LEVEL_BITS: Record<QrLevel, number> = { L: 1, M: 0, Q: 3, H: 2 };

/** Words, data and checks together, that fit between the fixed patterns. */
function allWords(version: number): number {
  let squares = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const marks = Math.floor(version / 7) + 2;
    squares -= (25 * marks - 10) * marks - 55;
    if (version >= 7) squares -= 36;
  }
  return Math.floor(squares / 8);
}

const dataWords = (version: number, level: QrLevel) =>
  allWords(version) - CHECK_WORDS[level][version] * BLOCKS[level][version];

const lengthBitsOf = (packed: Packed, version: number) => packed.lengthBits[version <= 9 ? 0 : version <= 26 ? 1 : 2];

function tooLong(level: QrLevel): Error {
  const other = level === "L" ? "" : " or choose a lower error correction";
  return new Error(`This text is too long for a QR code. Please shorten it${other}.`);
}

/** The smallest version with room for it. */
function versionFor(packed: Packed, level: QrLevel): number {
  for (let version = 1; version <= 40; version += 1) {
    const needed = 4 + lengthBitsOf(packed, version) + packed.bits.length;
    if (needed <= dataWords(version, level) * 8) return version;
  }
  throw tooLong(level);
}

// ---------------------------------------------------------------- check words

const EXP = new Uint8Array(255);
const LOG = new Uint8Array(256);
for (let i = 0, value = 1; i < 255; i += 1) {
  EXP[i] = value;
  LOG[value] = i;
  value = value < 128 ? value * 2 : (value * 2) ^ 0x11d;
}
const times = (a: number, b: number) => (a === 0 || b === 0 ? 0 : EXP[(LOG[a] + LOG[b]) % 255]);

/** Product of (x - 2^i), highest power first and without its leading 1. */
function divisorOf(degree: number): number[] {
  const out: number[] = new Array<number>(degree).fill(0);
  out[degree - 1] = 1;
  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < degree; j += 1) out[j] = times(out[j], EXP[i]) ^ (out[j + 1] ?? 0);
  }
  return out;
}

/** Reed-Solomon check words of a block. */
function checksOf(block: readonly number[], divisor: readonly number[]): number[] {
  const out: number[] = new Array<number>(divisor.length).fill(0);
  for (const word of block) {
    const factor = word ^ (out.shift() ?? 0);
    out.push(0);
    divisor.forEach((value, i) => {
      out[i] ^= times(value, factor);
    });
  }
  return out;
}

/** Every word of the code, in the order it is laid out. */
function wordsOf(packed: Packed, version: number, level: QrLevel): number[] {
  const bits: number[] = [];
  push(bits, packed.mode, 4);
  push(bits, packed.length, lengthBitsOf(packed, version));
  bits.push(...packed.bits);
  const room = dataWords(version, level) * 8;
  push(bits, 0, Math.min(4, room - bits.length));
  push(bits, 0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < room; pad ^= 0xec ^ 0x11) push(bits, pad, 8);

  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((sum, bit) => sum * 2 + bit, 0));

  // Later blocks can be one word longer. Blocks are mixed, so damage in one place is spread over all.
  const count = BLOCKS[level][version];
  const divisor = divisorOf(CHECK_WORDS[level][version]);
  const short = Math.floor(data.length / count);
  const firstLong = count - (data.length % count);
  const blocks: number[][] = [];
  for (let i = 0, at = 0; i < count; i += 1) {
    const size = short + (i >= firstLong ? 1 : 0);
    blocks.push(data.slice(at, at + size));
    at += size;
  }
  const checks = blocks.map((block) => checksOf(block, divisor));
  const mixed = (rows: readonly number[][], length: number) =>
    Array.from({ length }, (_, i) => rows.filter((row) => i < row.length).map((row) => row[i])).flat();
  return [...mixed(blocks, short + 1), ...mixed(checks, divisor.length)];
}

// ---------------------------------------------------------------- the squares

type Grid = { size: number; dark: boolean[][]; fixed: boolean[][]; set: (x: number, y: number, on: boolean) => void };

const bit = (value: number, i: number) => ((value >>> i) & 1) === 1;

function markPlaces(version: number, size: number): number[] {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const step = Math.floor((version * 8 + count * 3 + 5) / (count * 4 - 4)) * 2;
  return [6, ...Array.from({ length: count - 1 }, (_, i) => size - 7 - i * step).reverse()];
}

function blankGrid(version: number): Grid {
  const size = 17 + version * 4;
  const rows = () => Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const dark = rows();
  const fixed = rows();
  const set = (x: number, y: number, on: boolean) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    dark[y][x] = on;
    fixed[y][x] = true;
  };
  for (let i = 0; i < size; i += 1) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  const rings = (cx: number, cy: number, reach: number, white: readonly number[]) => {
    for (let dy = -reach; dy <= reach; dy += 1) {
      for (let dx = -reach; dx <= reach; dx += 1)
        set(cx + dx, cy + dy, !white.includes(Math.max(Math.abs(dx), Math.abs(dy))));
    }
  };
  const places = markPlaces(version, size);
  const last = size - 7;
  for (const x of places) {
    for (const y of places) {
      const corner = (x === 6 && (y === 6 || y === last)) || (x === last && y === 6);
      if (!corner) rings(x, y, 2, [1]);
    }
  }
  rings(3, 3, 4, [2, 4]);
  rings(size - 4, 3, 4, [2, 4]);
  rings(3, size - 4, 4, [2, 4]);
  if (version >= 7) {
    let rest = version;
    for (let i = 0; i < 12; i += 1) rest = (rest << 1) ^ ((rest >>> 11) * 0x1f25);
    const info = (version << 12) | rest;
    for (let i = 0; i < 18; i += 1) {
      const far = size - 11 + (i % 3);
      const near = Math.floor(i / 3);
      set(far, near, bit(info, i));
      set(near, far, bit(info, i));
    }
  }
  return { size, dark, fixed, set };
}

/** Level and mask, written twice. */
function setFormat({ size, set }: Grid, level: QrLevel, mask: number) {
  const data = (LEVEL_BITS[level] << 3) | mask;
  let rest = data;
  for (let i = 0; i < 10; i += 1) rest = (rest << 1) ^ ((rest >>> 9) * 0x537);
  const info = ((data << 10) | rest) ^ 0x5412;
  for (let i = 0; i < 15; i += 1) {
    const on = bit(info, i);
    if (i < 6) set(8, i, on);
    else if (i < 8) set(8, i + 1, on);
    else if (i === 8) set(7, 8, on);
    else set(14 - i, 8, on);
    if (i < 8) set(size - 1 - i, 8, on);
    else set(8, size - 15 + i, on);
  }
  set(8, size - 8, true);
}

/** Two columns at a time from the right, up and down in turn, past everything fixed. */
function fillWords({ size, dark, fixed }: Grid, words: readonly number[]) {
  let at = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    const up = ((right + 1) & 2) === 0;
    for (let i = 0; i < size; i += 1) {
      const y = up ? size - 1 - i : i;
      for (const x of [right, right - 1]) {
        if (fixed[y][x] || at >= words.length * 8) continue;
        dark[y][x] = bit(words[at >>> 3], 7 - (at & 7));
        at += 1;
      }
    }
  }
}

const MASKS: readonly ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function applyMask({ size, dark, fixed }: Grid, mask: number) {
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) if (!fixed[y][x] && MASKS[mask](x, y)) dark[y][x] = !dark[y][x];
  }
}

/** What looks like a finder to a scanner: 1:1:3:1:1 with white on one side. */
const FALSE_FINDERS = [0b10111010000, 0b00001011101];

/** How hard a code is to scan: long runs, big blocks, false finders, too much of one colour. */
function penalty({ size, dark }: Grid): number {
  let sum = 0;
  let count = 0;
  for (const across of [true, false]) {
    for (let a = 0; a < size; a += 1) {
      let run = 0;
      let seen = 0;
      let before = false;
      for (let b = 0; b < size; b += 1) {
        const on = across ? dark[a][b] : dark[b][a];
        run = b > 0 && on === before ? run + 1 : 1;
        if (run === 5) sum += 3;
        else if (run > 5) sum += 1;
        before = on;
        seen = ((seen << 1) | (on ? 1 : 0)) & 0x7ff;
        if (b >= 10 && FALSE_FINDERS.includes(seen)) sum += 40;
      }
    }
  }
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const on = dark[y][x];
      if (on) count += 1;
      if (x > 0 && y > 0 && on === dark[y - 1][x] && on === dark[y][x - 1] && on === dark[y - 1][x - 1]) sum += 3;
    }
  }
  return sum + 10 * Math.floor((Math.abs(count * 2 - size * size) * 10) / (size * size));
}

/** More than any QR code holds, even of digits only: no need to pack a whole book to find that out. */
const MOST = 7089;

/** The squares of a QR code, row by row, true for dark. `level` says how much may get damaged: 7, 15, 25 or 30%. */
export function qrCode(text: string, level: QrLevel = "M"): boolean[][] {
  if (text === "") throw new Error("Type what the QR code should hold.");
  if (text.length > MOST) throw tooLong(level);
  const packed = pack(text);
  const version = versionFor(packed, level);
  const grid = blankGrid(version);
  setFormat(grid, level, 0);
  fillWords(grid, wordsOf(packed, version, level));
  let best = 0;
  let least = Infinity;
  for (let mask = 0; mask < MASKS.length; mask += 1) {
    applyMask(grid, mask);
    setFormat(grid, level, mask);
    const score = penalty(grid);
    if (score < least) [best, least] = [mask, score];
    applyMask(grid, mask);
  }
  applyMask(grid, best);
  setFormat(grid, level, best);
  return grid.dark;
}

// ---------------------------------------------------------------- Code 128

/** Bar and space widths of every sign, the stop sign last. */
const SIGNS = (
  "212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 " +
  "123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 " +
  "232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 " +
  "313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 " +
  "111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 " +
  "111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 " +
  "114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112"
).split(" ");
const TO_C = 99;
const TO_B = 100;
const START_B = 104;
const START_C = 105;
const STOP = 106;

/** Widths of the bars and spaces of a Code 128 barcode, in turn, starting with a bar. */
export function code128(text: string): number[] {
  if (text === "") throw new Error("Type what the barcode should hold.");
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (code < 32) throw new Error("A barcode cannot hold line breaks or tabs.");
    if (code > 127) throw new Error(`A barcode cannot hold "${char}". Use plain letters, digits and signs.`);
  }
  // Set C packs two digits into one sign. What is the fewest signs from each place on, in set B and in set C?
  const pair = (i: number) => /^\d\d$/.test(text.slice(i, i + 2));
  const inB: number[] = new Array<number>(text.length + 1).fill(0);
  const inC: number[] = new Array<number>(text.length + 1).fill(0);
  const stayC = (i: number) => (pair(i) ? 1 + inC[i + 2] : Infinity);
  for (let i = text.length - 1; i >= 0; i -= 1) {
    inB[i] = Math.min(1 + inB[i + 1], 1 + stayC(i));
    inC[i] = Math.min(stayC(i), 2 + inB[i + 1]);
  }
  let setC = inC[0] < inB[0];
  const values = [setC ? START_C : START_B];
  for (let i = 0; i < text.length;) {
    if (setC && stayC(i) <= inC[i]) {
      values.push(Number(text.slice(i, i + 2)));
      i += 2;
    } else if (!setC && 1 + inB[i + 1] <= inB[i]) {
      values.push(text.charCodeAt(i) - 32);
      i += 1;
    } else {
      values.push(setC ? TO_B : TO_C);
      setC = !setC;
    }
  }
  const check = values.reduce((sum, value, i) => sum + value * Math.max(1, i), 0) % 103;
  return [...values, check, STOP].flatMap((value) => Array.from(SIGNS[value], Number));
}

// ---------------------------------------------------------------- EAN-13

/** Digits as the left half writes them, and which of the six are written backwards for each first digit. */
const LEFT = "0001101 0011001 0010011 0111101 0100011 0110001 0101111 0111011 0110111 0001011".split(" ");
const PARITY = "LLLLLL LLGLGG LLGGLG LLGGGL LGLLGG LGGLLG LGGGLL LGLGLG LGLGGL LGGLGL".split(" ");
const flip = (bits: string) => Array.from(bits, (value) => (value === "1" ? "0" : "1")).join("");
const backwards = (bits: string) => Array.from(bits).reverse().join("");

/** The 95 bars of an EAN-13 barcode, and its 13 digits. Twelve digits get their check digit. */
export function ean13(digits: string): { bars: boolean[]; text: string } {
  const given = digits.replace(/[\s-]/g, "");
  if (!/^\d{12,13}$/.test(given)) throw new Error("An EAN-13 barcode needs 12 or 13 digits.");
  const sum = Array.from(given.slice(0, 12), Number).reduce((total, digit, i) => total + digit * (i % 2 ? 3 : 1), 0);
  const check = String((10 - (sum % 10)) % 10);
  if (given.length === 13 && given[12] !== check)
    throw new Error(`The last digit of this number should be ${check}. Please check it for typing errors.`);
  const text = given.slice(0, 12) + check;
  const parity = PARITY[Number(text[0])];
  const left = Array.from(text.slice(1, 7), (digit, i) => {
    const bits = LEFT[Number(digit)];
    return parity[i] === "L" ? bits : backwards(flip(bits));
  });
  const right = Array.from(text.slice(7), (digit) => flip(LEFT[Number(digit)]));
  const bars = ["101", ...left, "01010", ...right, "101"].join("");
  return { bars: Array.from(bars, (value) => value === "1"), text };
}
