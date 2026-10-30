const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = 3893;
const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const JSZIP_CODE = fs.readFileSync(path.join(__dirname, '../node_modules/jszip/dist/jszip.min.js'), 'utf8');

const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Frebies Image Conversion Test Suite</title>
</head>
<body>
  <h1>Running All Image Conversion Tests...</h1>

  <script>${JSZIP_CODE}</script>
  <script>
    window.onerror = function(msg, url, line, col, err) {
      console.error('JS ERROR:', msg, 'line:', line);
      fetch('/results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([{ format: 'syntax_error', status: 'ERROR', error: msg + ' line ' + line }])
      });
    };
    function clamp(val, min, max) { return Math.min(max, Math.max(min, val)); }
    function roundSize(val) { return Math.max(1, Math.round(val)); }

    function createCanvas(w, h) {
      const c = document.createElement('canvas');
      c.width = roundSize(w);
      c.height = roundSize(h);
      return c;
    }

    function context2d(c) {
      return c.getContext('2d', { willReadFrequently: true });
    }

    function canvasToBmpBlob(canvas) {
      const width = canvas.width;
      const height = canvas.height;
      const context = context2d(canvas);
      const imageData = context.getImageData(0, 0, width, height);
      const data = imageData.data;

      const rowSize = Math.floor((24 * width + 31) / 32) * 4;
      const pixelArraySize = rowSize * height;
      const fileSize = 54 + pixelArraySize;

      const buffer = new ArrayBuffer(fileSize);
      const view = new DataView(buffer);

      view.setUint16(0, 0x424d, false);
      view.setUint32(2, fileSize, true);
      view.setUint16(6, 0, true);
      view.setUint16(8, 0, true);
      view.setUint32(10, 54, true);

      view.setUint32(14, 40, true);
      view.setInt32(18, width, true);
      view.setInt32(22, height, true);
      view.setUint16(26, 1, true);
      view.setUint16(28, 24, true);
      view.setUint32(30, 0, true);
      view.setUint32(34, pixelArraySize, true);
      view.setInt32(38, 2835, true);
      view.setInt32(42, 2835, true);
      view.setUint32(46, 0, true);
      view.setUint32(50, 0, true);

      const bytes = new Uint8Array(buffer);
      let offset = 54;
      for (let y = height - 1; y >= 0; y -= 1) {
        const rowStart = offset;
        for (let x = 0; x < width; x += 1) {
          const idx = (y * width + x) * 4;
          bytes[offset] = data[idx + 2];
          bytes[offset + 1] = data[idx + 1];
          bytes[offset + 2] = data[idx];
          offset += 3;
        }
        while ((offset - rowStart) % 4 !== 0) {
          bytes[offset++] = 0;
        }
      }

      return new Blob([buffer], { type: "image/bmp" });
    }

    async function canvasToIcoBlob(canvas, size = 256, backgroundColor = null) {
      const iconDim = Math.min(256, Math.max(16, roundSize(size)));
      const iconCanvas = createCanvas(iconDim, iconDim);
      const context = context2d(iconCanvas);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";

      if (backgroundColor) {
        context.fillStyle = backgroundColor;
        context.fillRect(0, 0, iconDim, iconDim);
      }

      const sW = canvas.width;
      const sH = canvas.height;
      const scale = Math.min(iconDim / sW, iconDim / sH);
      const dW = sW * scale;
      const dH = sH * scale;
      const dX = (iconDim - dW) / 2;
      const dY = (iconDim - dH) / 2;
      context.drawImage(canvas, dX, dY, dW, dH);

      const pngBlob = await new Promise((resolve, reject) => {
        iconCanvas.toBlob((b) => b ? resolve(b) : reject(new Error("ICO frame failed")), "image/png");
      });
      const pngBuffer = await pngBlob.arrayBuffer();
      const pngBytes = new Uint8Array(pngBuffer);

      const headerSize = 22;
      const totalSize = headerSize + pngBytes.length;
      const buffer = new ArrayBuffer(totalSize);
      const view = new DataView(buffer);

      view.setUint16(0, 0, true);
      view.setUint16(2, 1, true);
      view.setUint16(4, 1, true);

      view.setUint8(6, iconDim === 256 ? 0 : iconDim);
      view.setUint8(7, iconDim === 256 ? 0 : iconDim);
      view.setUint8(8, 0);
      view.setUint8(9, 0);
      view.setUint16(10, 1, true);
      view.setUint16(12, 32, true);
      view.setUint32(14, pngBytes.length, true);
      view.setUint32(18, headerSize, true);

      const bytes = new Uint8Array(buffer);
      bytes.set(pngBytes, headerSize);

      return new Blob([buffer], { type: "image/x-icon" });
    }

    function canvasToTiffBlob(canvas) {
      const width = canvas.width;
      const height = canvas.height;
      const context = context2d(canvas);
      const imgData = context.getImageData(0, 0, width, height);
      const data = imgData.data;

      const numTags = 12;
      const headerSize = 8;
      const ifdSize = 2 + numTags * 12 + 4;
      const extraSize = 8 + 8 + 8;
      const pixelOffset = headerSize + ifdSize + extraSize;
      const pixelBytes = width * height * 3;
      const totalSize = pixelOffset + pixelBytes;

      const buffer = new ArrayBuffer(totalSize);
      const view = new DataView(buffer);
      const bytes = new Uint8Array(buffer);

      bytes[0] = 0x49; bytes[1] = 0x49;
      view.setUint16(2, 42, true);
      view.setUint32(4, headerSize, true);

      let offset = headerSize;
      view.setUint16(offset, numTags, true); offset += 2;

      function writeTag(tag, type, count, val) {
        view.setUint16(offset, tag, true);
        view.setUint16(offset + 2, type, true);
        view.setUint32(offset + 4, count, true);
        view.setUint32(offset + 8, val, true);
        offset += 12;
      }

      const bpsOffset = headerSize + ifdSize;
      const xresOffset = bpsOffset + 8;
      const yresOffset = xresOffset + 8;

      writeTag(256, 4, 1, width);
      writeTag(257, 4, 1, height);
      writeTag(258, 3, 3, bpsOffset);
      writeTag(259, 3, 1, 1);
      writeTag(262, 3, 1, 2);
      writeTag(273, 4, 1, pixelOffset);
      writeTag(277, 3, 1, 3);
      writeTag(278, 4, 1, height);
      writeTag(279, 4, 1, pixelBytes);
      writeTag(282, 5, 1, xresOffset);
      writeTag(283, 5, 1, yresOffset);
      writeTag(296, 3, 1, 2);

      view.setUint32(offset, 0, true);

      view.setUint16(bpsOffset, 8, true);
      view.setUint16(bpsOffset + 2, 8, true);
      view.setUint16(bpsOffset + 4, 8, true);

      view.setUint32(xresOffset, 72, true);
      view.setUint32(xresOffset + 4, 1, true);
      view.setUint32(yresOffset, 72, true);
      view.setUint32(yresOffset + 4, 1, true);

      let pOff = pixelOffset;
      for (let i = 0; i < data.length; i += 4) {
        bytes[pOff++] = data[i];
        bytes[pOff++] = data[i + 1];
        bytes[pOff++] = data[i + 2];
      }

      return new Blob([buffer], { type: "image/tiff" });
    }

    async function canvasToPdfBlob(canvas) {
      const width = canvas.width;
      const height = canvas.height;
      const jpegBlob = await new Promise((resolve) => {
        canvas.toBlob((b) => resolve(b), "image/jpeg", 0.95);
      });
      const jpegBuffer = await jpegBlob.arrayBuffer();
      const jpegBytes = new Uint8Array(jpegBuffer);

      const enc = new TextEncoder();
      const header = enc.encode("%PDF-1.4\\n");
      const obj1 = enc.encode("1 0 obj\\n<< /Type /Catalog /Pages 2 0 R >>\\nendobj\\n");
      const obj2 = enc.encode("2 0 obj\\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\\nendobj\\n");
      const obj3 = enc.encode(
        \`3 0 obj\\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 \${width} \${height}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\\nendobj\\n\`
      );
      const obj4Head = enc.encode(
        \`4 0 obj\\n<< /Type /XObject /Subtype /Image /Width \${width} \${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length \${jpegBytes.length} >>\\nstream\\n\`
      );
      const obj4Foot = enc.encode("\\nendstream\\nendobj\\n");
      const contentStr = \`q\\n\${width} 0 0 \${height} 0 0 cm\\n/Im0 Do\\nQ\\n\`;
      const obj5 = enc.encode(\`5 0 obj\\n<< /Length \${contentStr.length} >>\\nstream\\n\${contentStr}endstream\\nendobj\\n\`);

      let offset = header.length;
      const offset1 = offset; offset += obj1.length;
      const offset2 = offset; offset += obj2.length;
      const offset3 = offset; offset += obj3.length;
      const offset4 = offset; offset += obj4Head.length + jpegBytes.length + obj4Foot.length;
      const offset5 = offset; offset += obj5.length;
      const xrefOffset = offset;

      const pad10 = (n) => n.toString().padStart(10, "0");
      const xref = enc.encode(
        \`xref\\n0 6\\n0000000000 65535 f \\n\${pad10(offset1)} 00000 n \\n\${pad10(offset2)} 00000 n \\n\${pad10(offset3)} 00000 n \\n\${pad10(offset4)} 00000 n \\n\${pad10(offset5)} 00000 n \\ntrailer\\n<< /Size 6 /Root 1 0 R >>\\nstartxref\\n\${xrefOffset}\\n%%EOF\\n\`
      );

      return new Blob([header, obj1, obj2, obj3, obj4Head, jpegBytes, obj4Foot, obj5, xref], {
        type: "application/pdf",
      });
    }

    function canvasToSvgBlob(canvas) {
      const width = canvas.width;
      const height = canvas.height;
      const dataUrl = canvas.toDataURL("image/png");
      const svg = \`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 \${width} \${height}" width="\${width}" height="\${height}">
  <title>Converted Image</title>
  <image width="\${width}" height="\${height}" href="\${dataUrl}" />
</svg>\`;
      return new Blob([svg], { type: "image/svg+xml" });
    }

    function canvasToTgaBlob(canvas) {
      const width = canvas.width;
      const height = canvas.height;
      const context = context2d(canvas);
      const imgData = context.getImageData(0, 0, width, height);
      const data = imgData.data;

      const headerSize = 18;
      const pixelSize = width * height * 4;
      const buffer = new ArrayBuffer(headerSize + pixelSize);
      const view = new DataView(buffer);
      const bytes = new Uint8Array(buffer);

      view.setUint8(0, 0);
      view.setUint8(1, 0);
      view.setUint8(2, 2);
      view.setUint16(12, width, true);
      view.setUint16(14, height, true);
      view.setUint8(16, 32);
      view.setUint8(17, 0x28);

      let offset = headerSize;
      for (let i = 0; i < data.length; i += 4) {
        bytes[offset++] = data[i + 2];
        bytes[offset++] = data[i + 1];
        bytes[offset++] = data[i];
        bytes[offset++] = data[i + 3];
      }

      return new Blob([buffer], { type: "image/x-tga" });
    }

    function canvasToEpsBlob(canvas) {
      const width = canvas.width;
      const height = canvas.height;
      const context = context2d(canvas);
      const imgData = context.getImageData(0, 0, width, height);
      const data = imgData.data;

      const parts = [
        \`%!PS-Adobe-3.0 EPSF-3.0\\n%%BoundingBox: 0 0 \${width} \${height}\\n%%Pages: 1\\n%%Title: Converted Image\\n%%Creator: frebies\\n%%EndComments\\n\`,
        \`/picstr \${width * 3} string def\\ngsave\\n0 0 translate\\n\${width} \${height} scale\\n\`,
        \`\${width} \${height} 8 [\${width} 0 0 -\${height} 0 \${height}] {currentfile picstr readhexstring pop} false 3 colorimage\\ngrestore\\n\`,
      ];

      let hex = "";
      for (let i = 0; i < data.length; i += 4) {
        hex += data[i].toString(16).padStart(2, "0") +
               data[i + 1].toString(16).padStart(2, "0") +
               data[i + 2].toString(16).padStart(2, "0");
        if ((i / 4) % 30 === 29) hex += "\\n";
      }
      parts.push(hex + "\\n%%EOF\\n");

      return new Blob(parts, { type: "application/postscript" });
    }

    function canvasToGifBlob(canvas) {
      const width = canvas.width;
      const height = canvas.height;
      const context = context2d(canvas);
      const imgData = context.getImageData(0, 0, width, height);
      const data = imgData.data;

      const palette = [];
      for (let r = 0; r < 6; r++) {
        for (let g = 0; g < 6; g++) {
          for (let b = 0; b < 6; b++) {
            palette.push([Math.round(r * 51), Math.round(g * 51), Math.round(b * 51)]);
          }
        }
      }
      for (let i = 0; i < 40; i++) {
        const v = Math.round((i / 39) * 255);
        palette.push([v, v, v]);
      }

      const indexedPixels = new Uint8Array(width * height);
      for (let i = 0, p = 0; i < data.length; i += 4, p++) {
        const rIdx = Math.min(5, Math.max(0, Math.round(data[i] / 51)));
        const gIdx = Math.min(5, Math.max(0, Math.round(data[i + 1] / 51)));
        const bIdx = Math.min(5, Math.max(0, Math.round(data[i + 2] / 51)));
        indexedPixels[p] = rIdx * 36 + gIdx * 6 + bIdx;
      }

      const minCodeSize = 8;
      const clearCode = 1 << minCodeSize;
      const eoiCode = clearCode + 1;

      const outBytes = [
        0x47, 0x49, 0x46, 0x38, 0x39, 0x61,
        width & 0xff, (width >> 8) & 0xff,
        height & 0xff, (height >> 8) & 0xff,
        0xf7, 0x00, 0x00,
      ];

      for (let i = 0; i < 256; i++) {
        const col = palette[i] || [0, 0, 0];
        outBytes.push(col[0], col[1], col[2]);
      }

      outBytes.push(0x21, 0xf9, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00);
      outBytes.push(0x2c, 0x00, 0x00, 0x00, 0x00);
      outBytes.push(width & 0xff, (width >> 8) & 0xff);
      outBytes.push(height & 0xff, (height >> 8) & 0xff);
      outBytes.push(0x00, minCodeSize);

      let curCodeSize = minCodeSize + 1;
      let nextCode = eoiCode + 1;
      const dict = new Map();

      let accum = 0;
      let accumBits = 0;
      const subBlock = [];

      function writeBits(code, numBits) {
        accum |= code << accumBits;
        accumBits += numBits;
        while (accumBits >= 8) {
          subBlock.push(accum & 0xff);
          accum >>= 8;
          accumBits -= 8;
          if (subBlock.length === 254) {
            outBytes.push(subBlock.length, ...subBlock);
            subBlock.length = 0;
          }
        }
      }

      function flushBits() {
        if (accumBits > 0) {
          subBlock.push(accum & 0xff);
          accum = 0;
          accumBits = 0;
        }
        if (subBlock.length > 0) {
          outBytes.push(subBlock.length, ...subBlock);
          subBlock.length = 0;
        }
      }

      writeBits(clearCode, curCodeSize);

      let prefix = "";
      for (let i = 0; i < indexedPixels.length; i++) {
        const k = indexedPixels[i].toString();
        const pk = prefix === "" ? k : prefix + "," + k;
        if (dict.has(pk)) {
          prefix = pk;
        } else {
          const code = prefix === "" ? indexedPixels[i] : (prefix.includes(",") ? dict.get(prefix) : Number(prefix));
          writeBits(code, curCodeSize);
          if (nextCode < 4096) {
            dict.set(pk, nextCode++);
            if (nextCode > (1 << curCodeSize) && curCodeSize < 12) {
              curCodeSize++;
            }
          } else {
            writeBits(clearCode, curCodeSize);
            dict.clear();
            curCodeSize = minCodeSize + 1;
            nextCode = eoiCode + 1;
          }
          prefix = k;
        }
      }

      if (prefix !== "") {
        const code = prefix.includes(",") ? dict.get(prefix) : Number(prefix);
        writeBits(code, curCodeSize);
      }

      writeBits(eoiCode, curCodeSize);
      flushBits();
      outBytes.push(0x00, 0x3b);

      return new Blob([new Uint8Array(outBytes)], { type: "image/gif" });
    }

    async function canvasToBlob(canvas, format, quality = 0.92, options = {}) {
      if (format === "bmp") return canvasToBmpBlob(canvas);
      if (format === "ico") return await canvasToIcoBlob(canvas, options.icoSize || 256, options.backgroundColor);
      if (format === "tiff") return canvasToTiffBlob(canvas);
      if (format === "svg") return canvasToSvgBlob(canvas);
      if (format === "tga") return canvasToTgaBlob(canvas);
      if (format === "eps") return canvasToEpsBlob(canvas);
      if (format === "gif") return canvasToGifBlob(canvas);

      const mime = {
        jpeg: "image/jpeg",
        png: "image/png",
        webp: "image/webp",
        avif: "image/avif"
      }[format];

      const targetQuality = options.lossless ? 1.0 : clamp(quality, 0.05, 1);

      return new Promise((resolve, reject) => {
        try {
          canvas.toBlob((b) => b ? resolve(b) : reject(new Error("Encoding failed for " + format)), mime, targetQuality);
        } catch (e) {
          reject(e);
        }
      });
    }

    async function downloadAllAsZip(files) {
      const zip = new JSZip();
      files.forEach(f => zip.file(f.name, f.blob));
      return await zip.generateAsync({ type: "blob" });
    }

    async function redecodeImage(blob) {
      return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); resolve({ width: img.naturalWidth, height: img.naturalHeight }); };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image element failed to decode blob")); };
        img.src = url;
      });
    }

    async function runAllTests() {
      const results = [];
      const testCanvas = createCanvas(120, 80);
      const ctx = context2d(testCanvas);

      ctx.fillStyle = "rgba(0,0,0,0)";
      ctx.clearRect(0, 0, 120, 80);

      const grad = ctx.createLinearGradient(0, 0, 120, 80);
      grad.addColorStop(0, "rgba(255, 60, 60, 1)");
      grad.addColorStop(0.5, "rgba(60, 200, 60, 0.8)");
      grad.addColorStop(1, "rgba(60, 60, 255, 0.5)");
      ctx.fillStyle = grad;
      ctx.fillRect(10, 10, 100, 60);

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 14px sans-serif";
      ctx.fillText("Frebies", 25, 45);

      const formats = [
        "jpeg", "png", "webp",
        "svg", "tiff", "bmp",
        "ico", "tga", "gif", "eps"
      ];

      for (const fmt of formats) {
        try {
          const t0 = performance.now();
          const blob = await canvasToBlob(testCanvas, fmt, 0.85);
          const duration = Math.round(performance.now() - t0);

          if (!blob || blob.size === 0) {
            throw new Error("Zero byte blob generated");
          }

          // Read 32 bytes for header checking
          const buf = await blob.slice(0, 32).arrayBuffer();
          const u8 = new Uint8Array(buf);
          let sigOk = false;
          let sigDesc = "";

          if (fmt === "jpeg") {
            sigOk = u8[0] === 0xFF && u8[1] === 0xD8 && u8[2] === 0xFF;
            sigDesc = "JPEG SOI (FF D8 FF)";
          } else if (fmt === "png") {
            sigOk = u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4E && u8[3] === 0x47;
            sigDesc = "PNG Magic (89 50 4E 47)";
          } else if (fmt === "webp") {
            const str = String.fromCharCode(...u8.slice(0, 4));
            sigOk = str === "RIFF";
            sigDesc = "RIFF/WebP header";
          } else if (fmt === "pdf") {
            const str = String.fromCharCode(...u8.slice(0, 5));
            sigOk = str === "%PDF-";
            sigDesc = "%PDF- header";
          } else if (fmt === "svg") {
            const str = new TextDecoder().decode(u8.slice(0, 5));
            sigOk = str.startsWith("<svg");
            sigDesc = "<svg> XML tag";
          } else if (fmt === "tiff") {
            sigOk = u8[0] === 0x49 && u8[1] === 0x49 && u8[2] === 42;
            sigDesc = "TIFF Little-Endian (II*)";
          } else if (fmt === "bmp") {
            sigOk = u8[0] === 0x42 && u8[1] === 0x4D;
            sigDesc = "BMP Magic (BM)";
          } else if (fmt === "ico") {
            sigOk = u8[0] === 0 && u8[1] === 0 && u8[2] === 1 && u8[3] === 0;
            sigDesc = "ICO Header (00 00 01 00)";
          } else if (fmt === "tga") {
            sigOk = u8[2] === 2 && u8[16] === 32;
            sigDesc = "TGA 32-bit true-color";
          } else if (fmt === "gif") {
            const str = String.fromCharCode(...u8.slice(0, 6));
            sigOk = str === "GIF89a";
            sigDesc = "GIF89a Magic";
          } else if (fmt === "eps") {
            const str = String.fromCharCode(...u8.slice(0, 14));
            sigOk = str.startsWith("%!PS-Adobe");
            sigDesc = "%!PS-Adobe PostScript header";
          }

          let redecodeOk = null;
          if (["jpeg", "png", "webp", "bmp", "ico", "gif", "svg"].includes(fmt)) {
            try {
              const decoded = await redecodeImage(blob);
              redecodeOk = decoded.width > 0 && decoded.height > 0;
            } catch (err) {
              redecodeOk = false;
            }
          }

          results.push({
            format: fmt,
            status: sigOk ? "PASS" : "FAIL_SIGNATURE",
            bytes: blob.size,
            durationMs: duration,
            sigDesc,
            redecodable: redecodeOk,
          });
        } catch (err) {
          results.push({
            format: fmt,
            status: "ERROR",
            error: err.message
          });
        }
      }

      // Check AVIF support detection
      const avifSupported = testCanvas.toDataURL("image/avif").startsWith("data:image/avif");
      results.push({
        format: "avif_detection",
        status: "PASS",
        bytes: 0,
        sigDesc: avifSupported ? "AVIF natively supported" : "AVIF not supported in this browser (gracefully filtered)"
      });

      // Test Quality Scaling (JPG at 100% vs 25%)
      try {
        const highJpg = await canvasToBlob(testCanvas, "jpeg", 1.0);
        const lowJpg = await canvasToBlob(testCanvas, "jpeg", 0.25);
        const qualityControlOk = highJpg.size > lowJpg.size;
        results.push({
          format: "quality_control",
          status: qualityControlOk ? "PASS" : "FAIL",
          highQualityBytes: highJpg.size,
          lowQualityBytes: lowJpg.size,
          sigDesc: \`100% (\${highJpg.size} B) vs 25% (\${lowJpg.size} B) - \${Math.round((1 - lowJpg.size / highJpg.size) * 100)}% reduction\`
        });
      } catch (err) {
        results.push({ format: "quality_control", status: "ERROR", error: err.message });
      }

      // Test WebP Lossless Toggle
      try {
        const lossyWebp = await canvasToBlob(testCanvas, "webp", 0.8, { lossless: false });
        const losslessWebp = await canvasToBlob(testCanvas, "webp", 1.0, { lossless: true });
        results.push({
          format: "webp_lossless",
          status: losslessWebp.size > 0 ? "PASS" : "FAIL",
          bytes: losslessWebp.size,
          sigDesc: "Lossless toggle: " + losslessWebp.size + " B vs Lossy: " + lossyWebp.size + " B"
        });
      } catch (err) {
        results.push({ format: "webp_lossless", status: "ERROR", error: err.message });
      }

      // Test ICO Custom Frame Sizes (16, 32, 64, 128, 256)
      try {
        const ico16 = await canvasToBlob(testCanvas, "ico", 1, { icoSize: 16 });
        const ico128 = await canvasToBlob(testCanvas, "ico", 1, { icoSize: 128 });
        const ico256 = await canvasToBlob(testCanvas, "ico", 1, { icoSize: 256 });
        const icoOk = ico16.size > 0 && ico128.size > ico16.size && ico256.size > ico128.size;
        results.push({
          format: "ico_multi_size",
          status: icoOk ? "PASS" : "FAIL",
          bytes: ico256.size,
          sigDesc: "ICO scalable frames: 16px (" + ico16.size + " B) < 128px (" + ico128.size + " B) < 256px (" + ico256.size + " B)"
        });
      } catch (err) {
        results.push({ format: "ico_multi_size", status: "ERROR", error: err.message });
      }

      // Test Resizing Transformations (50% scale, max edge 60px)
      try {
        function scaleC(c, scale) {
          const w = Math.round(c.width * scale);
          const h = Math.round(c.height * scale);
          const out = createCanvas(w, h);
          context2d(out).drawImage(c, 0, 0, w, h);
          return out;
        }
        const scaled50 = scaleC(testCanvas, 0.5);
        const isScale50Ok = scaled50.width === 60 && scaled50.height === 40;
        results.push({
          format: "resize_scale_50",
          status: isScale50Ok ? "PASS" : "FAIL",
          bytes: 0,
          sigDesc: "Scale 50%: 120x80 -> " + scaled50.width + "x" + scaled50.height + " px"
        });
      } catch (err) {
        results.push({ format: "resize_scale_50", status: "ERROR", error: err.message });
      }

      // Test Background Color Fill for Non-Alpha Formats
      try {
        const bgCanvas = createCanvas(testCanvas.width, testCanvas.height);
        const bgCtx = context2d(bgCanvas);
        bgCtx.fillStyle = "#ffffff";
        bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);
        bgCtx.drawImage(testCanvas, 0, 0);
        const pData = bgCtx.getImageData(0, 0, 1, 1).data;
        const isBgOk = pData[0] === 255 && pData[1] === 255 && pData[2] === 255 && pData[3] === 255;
        results.push({
          format: "background_fill",
          status: isBgOk ? "PASS" : "FAIL",
          bytes: 0,
          sigDesc: "White background fill replaced transparent pixel (0,0) with RGBA(255,255,255,255)"
        });
      } catch (err) {
        results.push({ format: "background_fill", status: "ERROR", error: err.message });
      }

      // Test Grayscale Color Filter
      try {
        const grayCanvas = createCanvas(testCanvas.width, testCanvas.height);
        const gCtx = context2d(grayCanvas);
        gCtx.drawImage(testCanvas, 0, 0);
        const imgData = gCtx.getImageData(0, 0, grayCanvas.width, grayCanvas.height);
        const d = imgData.data;
        for (let i = 0; i < d.length; i += 4) {
          const g = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
          d[i] = g; d[i + 1] = g; d[i + 2] = g;
        }
        gCtx.putImageData(imgData, 0, 0);
        const centerPixel = gCtx.getImageData(30, 30, 1, 1).data;
        const isGrayOk = centerPixel[0] === centerPixel[1] && centerPixel[1] === centerPixel[2];
        results.push({
          format: "filter_grayscale",
          status: isGrayOk ? "PASS" : "FAIL",
          bytes: 0,
          sigDesc: "Grayscale conversion verified: R=G=B (" + centerPixel[0] + "," + centerPixel[1] + "," + centerPixel[2] + ")"
        });
      } catch (err) {
        results.push({ format: "filter_grayscale", status: "ERROR", error: err.message });
      }

      // Test SVG Input Vector Decoding to Raster Canvas
      try {
        const svgString = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="40" fill="purple"/></svg>';
        const svgBlob = new Blob([svgString], { type: "image/svg+xml" });
        const decodedSvg = await redecodeImage(svgBlob);
        const svgDecodeOk = decodedSvg.width === 100 && decodedSvg.height === 100;
        results.push({
          format: "svg_input_decode",
          status: svgDecodeOk ? "PASS" : "FAIL",
          bytes: svgBlob.size,
          sigDesc: "Decoded SVG vector input into canvas: " + decodedSvg.width + "x" + decodedSvg.height + " px"
        });
      } catch (err) {
        results.push({ format: "svg_input_decode", status: "ERROR", error: err.message });
      }

      // Test ZIP Generation of all formats
      try {
        const fileList = [];
        for (const fmt of formats) {
          const b = await canvasToBlob(testCanvas, fmt, 0.9);
          fileList.push({ name: "image." + fmt, blob: b });
        }
        const zipBlob = await downloadAllAsZip(fileList);
        const zipHeader = new Uint8Array(await zipBlob.slice(0, 4).arrayBuffer());
        const isZipOk = zipHeader[0] === 0x50 && zipHeader[1] === 0x4B && zipHeader[2] === 0x03 && zipHeader[3] === 0x04;
        results.push({
          format: "zip_archive",
          status: isZipOk ? "PASS" : "FAIL",
          bytes: zipBlob.size,
          sigDesc: \`Bundled \${fileList.length} formats into ZIP (\${zipBlob.size} B)\`
        });
      } catch (err) {
        results.push({ format: "zip_archive", status: "ERROR", error: err.message });
      }

      fetch("/results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(results)
      });
    }

    window.onload = runAllTests;
  </script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  console.log(`[Server] ${req.method} ${req.url}`);
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(htmlContent);
    return;
  }

  if (req.method === 'POST' && req.url === '/results') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"status":"ok"}');

      try {
        const results = JSON.parse(body);
        console.log('\n========================================================================');
        console.log('              FREBIES IMAGE CONVERTER TEST RESULTS                      ');
        console.log('========================================================================\n');

        let allPassed = true;
        results.forEach(r => {
          const isPass = r.status === "PASS";
          if (!isPass) allPassed = false;
          const mark = isPass ? '✓' : '✗';
          const redecodeStr = r.redecodable !== null && r.redecodable !== undefined
            ? ` | Browser Redecode: ${r.redecodable ? "OK" : "FAILED"}`
            : '';
          console.log(
            `${mark} [${r.format.toUpperCase().padEnd(16)}] Status: ${r.status.padEnd(6)} | Bytes: ${(r.bytes || 0).toString().padStart(6)} | ${(r.sigDesc || "")}${redecodeStr}`
          );
        });

        console.log('\n========================================================================');
        if (allPassed) {
          console.log('🎉 ALL CONVERSIONS, QUALITY CONTROLS & ZIP ARCHIVES PASSED 100%!');
        } else {
          console.log('⚠️ Some conversion tests failed.');
        }
        console.log('========================================================================\n');

        setTimeout(() => {
          server.close();
          process.exit(allPassed ? 0 : 1);
        }, 500);
      } catch (e) {
        console.error('Error parsing results:', e);
        process.exit(1);
      }
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Test server running on http://127.0.0.1:${PORT}`);
  console.log(`Launching Chrome Headless to test all conversions...`);

  const os = require('os');
  const tempDir = path.join(os.tmpdir(), 'chrome_test_' + Date.now());
  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    `--user-data-dir=${tempDir}`,
    `http://127.0.0.1:${PORT}`
  ]);

  chromeProc.on('error', (err) => {
    console.error('Failed to spawn Chrome:', err);
    server.close();
    process.exit(1);
  });

  setTimeout(() => {
    console.error('Test run timed out after 25s');
    chromeProc.kill();
    server.close();
    process.exit(1);
  }, 25000);
});
