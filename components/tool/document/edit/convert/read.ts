import type { AnyDoc, FlowDoc } from "./flow";
import { ConvertError } from "./flow";
import type { FileKind } from "./sniff";

/** Any kind of file as a document the editor can lay out. Every reader is only loaded when it is needed. */
export async function readFile(file: File, kind: FileKind): Promise<AnyDoc> {
  const bytes = async () => new Uint8Array(await file.arrayBuffer());
  const text = async () => {
    const { decodeText } = await import("./html-in");
    return decodeText(await bytes());
  };
  switch (kind) {
    case "docx":
      return (await import("./docx-in")).readDocx(await bytes());
    case "doc":
      return (await import("./doc-in")).readDoc(await bytes());
    case "odt":
      return (await import("./odt-in")).readOdt(await bytes());
    case "rtf":
      return (await import("./rtf-in")).readRtf(await bytes());
    case "html":
      return (await import("./html-in")).readHtml(await text(), { title: file.name.replace(/\.[^.]+$/, "") });
    case "markdown":
      return (await import("./html-in")).readMarkdown(await text());
    case "text":
      return (await import("./html-in")).readPlainText(await text());
    case "epub":
      return readEpub(await bytes());
    case "pptx":
      return (await import("./pptx-in")).readPptx(await bytes());
    case "xlsx":
      return (await import("./sheet-in")).readXlsx(await bytes());
    case "ods":
      return (await import("./sheet-in")).readOds(await bytes());
    case "csv":
      return (await import("./sheet-in")).readCsv(await text());
    case "xls":
      throw new ConvertError(`${file.name} is in the old Excel format. Save it as .xlsx in Excel and open that.`);
    case "odp":
      throw new ConvertError(`${file.name} is an OpenDocument presentation. Save it as .pptx or PDF and open that.`);
    case "zip":
      throw new ConvertError(`${file.name} is a zip. Unpack it first, then open the files in it.`);
    default:
      throw new ConvertError(`${file.name} is a kind of file that cannot be opened here.`);
  }
}

/** A book: its chapters one after the other. */
async function readEpub(bytes: Uint8Array): Promise<FlowDoc> {
  const [{ default: JSZip }, { readHtml }] = await Promise.all([import("jszip"), import("./html-in")]);
  const broken = new ConvertError("This book could not be read. It may be protected or damaged.");
  const zip = await JSZip.loadAsync(bytes).catch(() => {
    throw broken;
  });
  if (zip.file("META-INF/encryption.xml") && zip.file("META-INF/rights.xml")) throw broken;
  const parse = (text: string) => new DOMParser().parseFromString(text, "application/xml");
  const read = async (path: string) => (await zip.file(path)?.async("string")) ?? null;
  const container = await read("META-INF/container.xml");
  const root = container ? parse(container).getElementsByTagName("rootfile")[0]?.getAttribute("full-path") : null;
  const opf = root ? await read(root) : null;
  if (!root || !opf) throw broken;
  const book = parse(opf);
  const base = root.includes("/") ? root.slice(0, root.lastIndexOf("/") + 1) : "";
  const resolve = (from: string, href: string) => {
    const path = decodeURIComponent(href.split("#")[0]);
    const parts = (path.startsWith("/") ? path.slice(1) : from + path).split("/");
    const out: string[] = [];
    for (const part of parts) {
      if (part === "..") out.pop();
      else if (part !== "." && part !== "") out.push(part);
    }
    return out.join("/");
  };
  const items = new Map(
    [...book.getElementsByTagName("item")].map((item) => [
      item.getAttribute("id") ?? "",
      { href: item.getAttribute("href") ?? "", type: item.getAttribute("media-type") ?? "" },
    ]),
  );
  const title = book.getElementsByTagNameNS("*", "title")[0]?.textContent?.trim();
  const author = book.getElementsByTagNameNS("*", "creator")[0]?.textContent?.trim();
  const sections: FlowDoc["sections"] = [];
  for (const ref of book.getElementsByTagName("itemref")) {
    const item = items.get(ref.getAttribute("idref") ?? "");
    if (!item || !/html/.test(item.type)) continue;
    const path = resolve(base, item.href);
    const html = await read(path);
    if (!html) continue;
    const page = new DOMParser().parseFromString(html, "text/html");
    const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : "";
    // Pictures go along inside the page.
    for (const image of page.querySelectorAll("img[src], image")) {
      const name = image.hasAttribute("src") ? "src" : image.hasAttribute("href") ? "href" : "xlink:href";
      const src = image.getAttribute(name);
      if (!src || /^(data|https?):/.test(src)) continue;
      const file = zip.file(resolve(dir, src));
      if (!file) continue;
      const type = /\.png$/i.test(src)
        ? "image/png"
        : /\.gif$/i.test(src)
          ? "image/gif"
          : /\.svg$/i.test(src)
            ? "image/svg+xml"
            : "image/jpeg";
      image.setAttribute(name, `data:${type};base64,${await file.async("base64")}`);
    }
    const doc = await readHtml(page.documentElement.outerHTML).catch(() => null);
    if (!doc) continue;
    for (const section of doc.sections) if (section.blocks.length > 0) sections.push(section);
  }
  if (sections.length === 0) throw broken;
  return { kind: "flow", title, author, sections };
}
