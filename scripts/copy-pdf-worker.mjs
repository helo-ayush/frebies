import { copyFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const source = path.join(process.cwd(), "node_modules/pdfjs-dist/build/pdf.worker.min.mjs");
const directory = path.join(process.cwd(), "public/vendor");
const target = path.join(directory, "pdf.worker.min.mjs");

if (!existsSync(source)) {
  console.warn("[pdf] pdfjs-dist is not installed; skipping worker copy.");
  process.exit(0);
}

await mkdir(directory, { recursive: true });
await copyFile(source, target);
console.log("[pdf] Copied pdfjs worker to public/vendor/pdf.worker.min.mjs");
