/**
 * Tables as an Excel workbook. Text that is plainly a number goes in as one, in
 * a format that shows it the way it was written, so it can be added up.
 */

export type SheetCell = {
  text: string;
  bold?: boolean;
  fill?: string;
  align?: "left" | "center" | "right";
  colSpan?: number;
  rowSpan?: number;
};

/** Cells covered by a span are not in their row's list. Widths are points. */
export type SheetOut = { name: string; rows: SheetCell[][]; cols?: number[] };

const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PACKAGE = "http://schemas.openxmlformats.org/package/2006";
const TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml";

// What Excel itself allows.
const MAX_ROWS = 1048576;
const MAX_COLS = 16384;
const MAX_TEXT = 32767;

const ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };

const esc = (value: string) =>
  value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/[\ud800-\udfff]/gu, "")
    .replace(/[&<>"]/g, (sign) => ENTITIES[sign]);

/** Excel reads _x0041_ as a letter's code, so text that looks like one is marked. */
const escText = (value: string) => esc(value).replace(/_(x[0-9a-f]{4}_)/gi, "_x005F_$1");

/** 0 is A, 26 is AA. */
function colName(index: number): string {
  let out = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) out = String.fromCharCode(65 + ((n - 1) % 26)) + out;
  return out;
}

// ---------------------------------------------------------------- numbers

const CURRENCY = "[$€£¥₹₩₽₺₪₫฿]";
const NUMBER = new RegExp(
  `^(\\()?([-−])?(${CURRENCY})?(\\s?)([-−])?(\\d[\\d,]*)(\\.\\d+)?(?:(\\s?)(%|${CURRENCY}))?(\\))?$`,
);

/** The number a text stands for and the format that writes it the same way. Null for anything else. */
export function numberIn(text: string): { value: number; format: string } | null {
  const found = NUMBER.exec(text.trim());
  if (!found) return null;
  const [, open, minus, before = "", gap, minus2, whole, decimals = "", gap2 = "", after = "", close] = found;
  if (Boolean(open) !== Boolean(close) || (minus && minus2) || (open && (minus || minus2)) || (before && after))
    return null;
  if (gap && !before) return null;
  const digits = whole.replace(/,/g, "");
  // Codes keep their leading zeros, and long ones all their digits.
  if (/^0\d/.test(digits) || digits.length + decimals.length > 16) return null;
  if (!whole.includes(",") && digits.length > 11) return null;
  const indian = /^\d{1,2}(,\d{2})+,\d{3}$/.test(whole);
  if (whole.includes(",") && !indian && !/^\d{1,3}(,\d{3})+$/.test(whole)) return null;

  const size = Number(digits + decimals);
  const negative = Boolean(open || minus || minus2);
  const value = (negative ? -size : size) / (after === "%" ? 100 : 1);
  const places = decimals ? `.${"0".repeat(decimals.length - 1)}` : "";
  const quote = (sign: string, space: string, first: boolean) =>
    sign === "" ? "" : sign === "%" ? `${space}%` : `"${first ? sign + space : space + sign}"`;
  const start = quote(before, gap, true);
  const end = quote(after, gap2, false);
  const plain = `${start}${whole.includes(",") ? "#,##0" : "0"}${places}${end}`;
  if (open) return { value, format: `${plain};(${plain})` };
  if (!indian) return { value, format: plain === "0" ? "General" : plain };
  // Lakhs and crores: Excel groups by thousands only, unless it is told otherwise.
  const part = (groups: string) => `${start}${groups}${places}${end}`;
  const [more, less, sign] = negative ? ["[<=-10000000]", "[<=-100000]", "-"] : ["[>=10000000]", "[>=100000]", ""];
  return {
    value,
    format: `${more}${sign}${part("##\\,##\\,##\\,##0")};${less}${sign}${part("##\\,##\\,##0")};${part("##,##0")}`,
  };
}

// ---------------------------------------------------------------- looks

/** The looks cells share, each kept once. */
class Looks {
  private readonly fills = ["none", "gray125"];
  private readonly formats: string[] = [];
  private readonly list: string[] = ["0|0|0|||"];

  /** Where in the list of looks these are. */
  of(bold: boolean, fill: string | null, align: string, format: string, wrap: boolean): number {
    const key = [
      (bold ? 1 : 0) + (isDark(fill) ? 2 : 0),
      fill ? place(this.fills, fill) : 0,
      format === "General" ? 0 : 164 + place(this.formats, format),
      align,
      wrap ? 1 : "",
      "",
    ].join("|");
    return place(this.list, key);
  }

  xml(): string {
    const fonts = [0, 1, 2, 3].map((font) => {
      const color = font > 1 ? '<color rgb="FFFFFFFF"/>' : "";
      return `<font>${font % 2 ? "<b/>" : ""}<sz val="11"/>${color}<name val="Calibri"/><family val="2"/></font>`;
    });
    const fills = this.fills.map((fill) =>
      /^[0-9A-F]{6}$/.test(fill)
        ? `<fill><patternFill patternType="solid"><fgColor rgb="FF${fill}"/><bgColor indexed="64"/></patternFill></fill>`
        : `<fill><patternFill patternType="${fill}"/></fill>`,
    );
    const formats = this.formats.map((code, i) => `<numFmt numFmtId="${164 + i}" formatCode="${esc(code)}"/>`);
    const looks = this.list.map((key) => {
      const [font, fill, format, align, wrap] = key.split("|");
      const at = `${align ? ` horizontal="${align}"` : ""} vertical="top"${wrap ? ' wrapText="1"' : ""}`;
      return (
        `<xf numFmtId="${format}" fontId="${font}" fillId="${fill}" borderId="0" xfId="0"` +
        `${format === "0" ? "" : ' applyNumberFormat="1"'}${font === "0" ? "" : ' applyFont="1"'}${fill === "0" ? "" : ' applyFill="1"'}` +
        ` applyAlignment="1"><alignment${at}/></xf>`
      );
    });
    return (
      `<styleSheet xmlns="${MAIN}">` +
      (formats.length > 0 ? `<numFmts count="${formats.length}">${formats.join("")}</numFmts>` : "") +
      `<fonts count="${fonts.length}">${fonts.join("")}</fonts><fills count="${fills.length}">${fills.join("")}</fills>` +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      `<cellXfs count="${looks.length}">${looks.join("")}</cellXfs>` +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'
    );
  }
}

/** The place of a value in a list, which it is added to if it is not there. */
function place(list: string[], value: string): number {
  const at = list.indexOf(value);
  return at >= 0 ? at : list.push(value) - 1;
}

const hex = (color: string | undefined) => /^#?([0-9a-f]{6})/i.exec(color ?? "")?.[1].toUpperCase() ?? null;

/** Whether black letters would be hard to read on this colour. */
function isDark(fill: string | null): boolean {
  if (!fill) return false;
  const [r, g, b] = [0, 2, 4].map((at) => Number.parseInt(fill.slice(at, at + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b < 128;
}

// ---------------------------------------------------------------- sheets

/** Excel's rules for the name of a sheet, and no name twice. */
function sheetName(wanted: string, index: number, taken: Set<string>): string {
  const base =
    wanted
      .replace(/[[\]:*?/\\\s\u0000-\u001f]+/g, " ")
      .replace(/^['\s]+|['\s]+$/g, "")
      .slice(0, 31)
      .trim() || `Sheet${index + 1}`;
  let name = /^history$/i.test(base) ? `${base} 1` : base;
  for (let n = 2; taken.has(name.toLowerCase()); n += 1) {
    const end = ` (${n})`;
    name = base.slice(0, 31 - end.length).trim() + end;
  }
  taken.add(name.toLowerCase());
  return name;
}

type Placed = { cell: SheetCell; r: number; c: number; rows: number; cols: number };

/** Gives every cell its place; spans push the cells after them aside. */
function placeCells(rows: readonly SheetCell[][]): Placed[] {
  const out: Placed[] = [];
  /** For every column, the first row not covered from above. */
  const free: number[] = [];
  rows.slice(0, MAX_ROWS).forEach((row, r) => {
    let c = 0;
    for (const cell of row) {
      while ((free[c] ?? 0) > r) c += 1;
      if (c >= MAX_COLS) break;
      let cols = 1;
      while (cols < (cell.colSpan ?? 1) && c + cols < MAX_COLS && (free[c + cols] ?? 0) <= r) cols += 1;
      const tall = Math.max(1, Math.min(cell.rowSpan ?? 1, rows.length - r));
      for (let i = c; i < c + cols; i += 1) free[i] = r + tall;
      out.push({ cell, r, c, rows: tall, cols });
      c += cols;
    }
  });
  return out;
}

/** Points to Excel's widths, which count characters of 7 dots with 5 dots of room around them. */
const charsOf = (points: number) => Math.max(1, Math.round(((points / 0.75 - 5) / 7) * 100) / 100);

const longest = (text: string) => Math.max(...text.split("\n").map((line) => line.length));

function widths(sheet: SheetOut, cells: readonly Placed[]): number[] {
  const count = cells.reduce((most, { c, cols }) => Math.max(most, c + cols), 0);
  const out = Array.from({ length: count }, (_, c) => {
    const points = sheet.cols?.[c];
    return points && points > 0 ? charsOf(points) : 0;
  });
  const told = (sheet.cols?.length ?? 0) > 0;
  for (const { cell, c, cols } of cells) {
    // Words can wrap, but a number without the room it needs shows as ####.
    if (cols > 1 || (told && !numberIn(cell.text))) continue;
    out[c] = Math.max(out[c], Math.min(60, longest(cell.text) * (cell.bold ? 1.15 : 1.05) + 1.5));
  }
  return out.map((width) => (told ? width || 8.43 : Math.max(8.43, width)));
}

function sheetXml(sheet: SheetOut, first: boolean, strings: Map<string, number>, looks: Looks): string {
  const cells = placeCells(sheet.rows);
  const wide = widths(sheet, cells);
  const rows: string[][] = [];
  const merges: string[] = [];
  let last = 0;
  for (const { cell, r, c, rows: tall, cols } of cells) {
    const ref = `${colName(c)}${r + 1}`;
    const text = cell.text.replace(/\r\n?/g, "\n").slice(0, MAX_TEXT);
    const number = numberIn(text);
    const room = wide.slice(c, c + cols).reduce((sum, width) => sum + width, 0);
    const wrap = !number && (text.includes("\n") || longest(text) > room * 1.1);
    const align = cell.align ?? (number ? "" : "left");
    const look = looks.of(cell.bold ?? false, hex(cell.fill), align, number?.format ?? "General", wrap);
    let value = "";
    if (number) value = `<v>${number.value}</v>`;
    else if (text !== "") {
      let at = strings.get(text);
      if (at === undefined) strings.set(text, (at = strings.size));
      value = `<v>${at}</v>`;
    }
    (rows[r] ??= []).push(
      `<c r="${ref}" s="${look}"${!number && value ? ' t="s"' : ""}${value ? `>${value}</c>` : "/>"}`,
    );
    if (tall > 1 || cols > 1) merges.push(`<mergeCell ref="${ref}:${colName(c + cols - 1)}${r + tall}"/>`);
    last = Math.max(last, r + tall);
  }
  const data = Array.from(rows, (row, r) => (row ? `<row r="${r + 1}">${row.join("")}</row>` : "")).join("");
  const cols = wide.map(
    (width, c) => `<col min="${c + 1}" max="${c + 1}" width="${(width + 0.71).toFixed(2)}" customWidth="1"/>`,
  );
  return (
    `<worksheet xmlns="${MAIN}"><dimension ref="A1:${colName(Math.max(0, wide.length - 1))}${Math.max(1, last)}"/>` +
    `<sheetViews><sheetView${first ? ' tabSelected="1"' : ""} workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/>` +
    `${cols.length > 0 ? `<cols>${cols.join("")}</cols>` : ""}<sheetData>${data}</sheetData>` +
    `${merges.length > 0 ? `<mergeCells count="${merges.length}">${merges.join("")}</mergeCells>` : ""}` +
    '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>'
  );
}

export async function writeXlsx(sheets: SheetOut[]): Promise<Uint8Array> {
  const { default: Zip } = await import("jszip");
  const zip = new Zip();
  const put = (path: string, xml: string) => zip.file(path, HEAD + xml, { createFolders: false });
  // The list of parts is the first thing in the file, where programs look for it. It is filled in at the end.
  put("[Content_Types].xml", "");
  const list: SheetOut[] = sheets.length > 0 ? sheets : [{ name: "Sheet1", rows: [] }];
  const taken = new Set<string>();
  const strings = new Map<string, number>();
  const looks = new Looks();
  const names = list.map((sheet, i) => sheetName(sheet.name, i, taken));
  list.forEach((sheet, i) => put(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(sheet, i === 0, strings, looks)));
  const n = list.length;
  const relation = (id: number, type: string, target: string) =>
    `<Relationship Id="rId${id}" Type="${REL}/${type}" Target="${target}"/>`;
  const relations = (each: string[]) =>
    `<Relationships xmlns="${PACKAGE}/relationships">${each.join("")}</Relationships>`;
  put(
    "xl/workbook.xml",
    `<workbook xmlns="${MAIN}" xmlns:r="${REL}"><bookViews><workbookView/></bookViews><sheets>` +
      names.map((name, i) => `<sheet name="${esc(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") +
      "</sheets></workbook>",
  );
  put(
    "xl/_rels/workbook.xml.rels",
    relations([
      ...names.map((_, i) => relation(i + 1, "worksheet", `worksheets/sheet${i + 1}.xml`)),
      relation(n + 1, "styles", "styles.xml"),
      relation(n + 2, "sharedStrings", "sharedStrings.xml"),
    ]),
  );
  const items = [...strings.keys()].map((text) => `<si><t xml:space="preserve">${escText(text)}</t></si>`);
  put("xl/sharedStrings.xml", `<sst xmlns="${MAIN}" uniqueCount="${items.length}">${items.join("")}</sst>`);
  put("xl/styles.xml", looks.xml());
  put("_rels/.rels", relations([relation(1, "officeDocument", "xl/workbook.xml")]));
  const override = (part: string, type: string) =>
    `<Override PartName="/xl/${part}.xml" ContentType="${TYPE}.${type}+xml"/>`;
  put(
    "[Content_Types].xml",
    `<Types xmlns="${PACKAGE}/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      override("workbook", "sheet.main") +
      names.map((_, i) => override(`worksheets/sheet${i + 1}`, "worksheet")).join("") +
      override("styles", "styles") +
      override("sharedStrings", "sharedStrings") +
      "</Types>",
  );
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
}
