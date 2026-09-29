export type MoleculeBond = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
};

export type MoleculeLabel = {
  id: string;
  value: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  align: "start" | "middle" | "end";
};

export type MoleculeDrawing = {
  bonds: MoleculeBond[];
  labels: MoleculeLabel[];
  viewBox: [number, number, number, number];
};

const MAX_XML_LENGTH = 250_000;
const MAX_CELLS = 1_000;

function attributes(source: string) {
  const result: Record<string, string> = {};
  for (const match of source.matchAll(/([\w:-]+)="([^"]*)"/g)) result[match[1]] = match[2];
  return result;
}

function finite(value: string | undefined, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function decodeXmlText(value: string) {
  return value
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&")
    .replace(/<[^>]*>/g, "").trim().slice(0, 24);
}

function styleNumber(style: string, key: string, fallback: number) {
  const match = style.match(new RegExp(`(?:^|;)${key}=([0-9.]+)(?:;|$)`));
  return finite(match?.[1], fallback);
}

export function parseDrawioMolecule(xml: string | null | undefined): MoleculeDrawing | null {
  if (!xml?.trim() || xml.length > MAX_XML_LENGTH) return null;
  const bonds: MoleculeBond[] = [];
  const labels: MoleculeLabel[] = [];
  const cells = [...xml.matchAll(/<mxCell\b([^>]*)>([\s\S]*?)<\/mxCell>/g)].slice(0, MAX_CELLS);

  for (const cell of cells) {
    const cellAttrs = attributes(cell[1]);
    const body = cell[2];
    const style = cellAttrs.style ?? "";
    const id = cellAttrs.id || `cell-${bonds.length + labels.length}`;

    if (cellAttrs.edge === "1") {
      const source = body.match(/<mxPoint\b([^>]*)\bas="sourcePoint"\s*\/>/);
      const target = body.match(/<mxPoint\b([^>]*)\bas="targetPoint"\s*\/>/);
      if (!source || !target) continue;
      const from = attributes(source[1]);
      const to = attributes(target[1]);
      const x1 = finite(from.x, Number.NaN);
      const y1 = finite(from.y, Number.NaN);
      const x2 = finite(to.x, Number.NaN);
      const y2 = finite(to.y, Number.NaN);
      if (![x1, y1, x2, y2].every(Number.isFinite)) continue;
      bonds.push({ id, x1, y1, x2, y2, width: styleNumber(style, "strokeWidth", 2) });
      continue;
    }

    if (cellAttrs.vertex === "1" && cellAttrs.value) {
      const geometry = body.match(/<mxGeometry\b([^>]*)\bas="geometry"\s*\/>/);
      if (!geometry) continue;
      const box = attributes(geometry[1]);
      const width = finite(box.width, 40);
      const height = finite(box.height, 40);
      const align = style.includes("align=left") ? "start" : style.includes("align=right") ? "end" : "middle";
      labels.push({ id, value: decodeXmlText(cellAttrs.value),
        x: finite(box.x) + (align === "start" ? 0 : align === "end" ? width : width / 2),
        y: finite(box.y) + height / 2, width, height,
        fontSize: styleNumber(style, "fontSize", 24), align });
    }
  }

  if (bonds.length === 0 && labels.length === 0) return null;
  const xs = bonds.flatMap((bond) => [bond.x1, bond.x2]);
  const ys = bonds.flatMap((bond) => [bond.y1, bond.y2]);
  labels.forEach((label) => {
    xs.push(label.x - label.width / 2, label.x + label.width / 2);
    ys.push(label.y - label.height / 2, label.y + label.height / 2);
  });
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const maxX = Math.max(...xs), maxY = Math.max(...ys);
  const padding = Math.max(12, Math.max(maxX - minX, maxY - minY) * 0.025);
  return { bonds, labels,
    viewBox: [minX - padding, minY - padding, maxX - minX + padding * 2, maxY - minY + padding * 2] };
}
