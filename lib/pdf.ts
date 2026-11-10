/** A small text-only PDF writer, so reports need no extra package and no outside service. */
export interface PdfLine { text: string; size?: number; bold?: boolean; gap?: number }

const PAGE_W = 595, PAGE_H = 842, MARGIN = 54;
// PDF built-in fonts cover Latin text only. Anything else becomes a question mark rather than corrupting the file.
const clean = (s: string) => s.replace(/[^\x20-\x7e]/g, "?").replace(/([\\()])/g, "\\$1");

function wrap(text: string, size: number): string[] {
  const max = Math.floor((PAGE_W - MARGIN * 2) / (size * 0.52));
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > max && line) { out.push(line); line = word; } else line = next;
  }
  out.push(line);
  return out;
}

export function simplePdf(lines: PdfLine[]): Uint8Array {
  const pages: string[] = [];
  let content = "";
  let y = PAGE_H - MARGIN;
  for (const l of lines) {
    const size = l.size ?? 11;
    y -= l.gap ?? 0;
    for (const part of wrap(l.text, size)) {
      if (y < MARGIN + size) { pages.push(content); content = ""; y = PAGE_H - MARGIN; }
      y -= size * 1.45;
      content += `BT /${l.bold ? "F2" : "F1"} ${size} Tf ${MARGIN} ${y.toFixed(1)} Td (${clean(part)}) Tj ET\n`;
    }
  }
  pages.push(content);

  const objects: string[] = [];
  const pageIds = pages.map((_, i) => 5 + i * 2);
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((n) => `${n} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";
  pages.forEach((c, i) => {
    objects[5 + i * 2] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + i * 2} 0 R >>`;
    objects[6 + i * 2] = `<< /Length ${c.length} >>\nstream\n${c}endstream`;
  });

  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let n = 1; n < objects.length; n++) {
    offsets[n] = out.length;
    out += `${n} 0 obj\n${objects[n]}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let n = 1; n < objects.length; n++) out += `${String(offsets[n]).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}
