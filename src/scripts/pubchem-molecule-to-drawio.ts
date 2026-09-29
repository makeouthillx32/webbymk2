type PubChemCompound = {
  atoms: { aid: number[]; element: number[]; charge?: { aid: number; value: number }[] };
  bonds: { aid1: number[]; aid2: number[]; order: number[] };
  coords: { conformers: { x: number[]; y: number[] }[] }[];
};

const ELEMENTS: Record<number, string> = { 7: "N", 8: "O", 9: "F", 15: "P", 16: "S", 17: "Cl", 35: "Br", 53: "I" };

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function bondCell(id: string, x1: number, y1: number, x2: number, y2: number) {
  return `<mxCell id="${id}" edge="1" parent="1" style="endArrow=none;strokeWidth=2;"><mxGeometry relative="1" as="geometry"><mxPoint x="${x1.toFixed(2)}" y="${y1.toFixed(2)}" as="sourcePoint"/><mxPoint x="${x2.toFixed(2)}" y="${y2.toFixed(2)}" as="targetPoint"/></mxGeometry></mxCell>`;
}

export function pubChemRecordToDrawio(compound: PubChemCompound) {
  const conformer = compound.coords[0]?.conformers[0];
  if (!conformer) throw new Error("PubChem record has no 2D conformer");
  const atoms = compound.atoms.aid.map((aid, index) => ({ aid, element: compound.atoms.element[index], x: conformer.x[index], y: conformer.y[index] }));
  const heavy = atoms.filter((atom) => atom.element !== 1);
  const heavyIds = new Set(heavy.map((atom) => atom.aid));
  const byId = new Map(atoms.map((atom) => [atom.aid, atom]));
  const minX = Math.min(...heavy.map((atom) => atom.x));
  const maxY = Math.max(...heavy.map((atom) => atom.y));
  const point = (atom: (typeof atoms)[number]) => ({ x: (atom.x - minX) * 70 + 35, y: (maxY - atom.y) * 70 + 35 });
  const cells: string[] = [];

  compound.bonds.aid1.forEach((aid1, index) => {
    const aid2 = compound.bonds.aid2[index];
    if (!heavyIds.has(aid1) || !heavyIds.has(aid2)) return;
    const from = point(byId.get(aid1)!);
    const to = point(byId.get(aid2)!);
    const order = Math.max(1, Math.min(3, compound.bonds.order[index] || 1));
    const dx = to.x - from.x, dy = to.y - from.y;
    const length = Math.hypot(dx, dy) || 1;
    const nx = (-dy / length) * 4.5, ny = (dx / length) * 4.5;
    const offsets = order === 1 ? [0] : order === 2 ? [-0.5, 0.5] : [-1, 0, 1];
    offsets.forEach((offset, lineIndex) => cells.push(bondCell(`b-${index}-${lineIndex}`, from.x + nx * offset, from.y + ny * offset, to.x + nx * offset, to.y + ny * offset)));
  });

  const charges = new Map((compound.atoms.charge ?? []).map((charge) => [charge.aid, charge.value]));
  heavy.filter((atom) => atom.element !== 6).forEach((atom) => {
    const p = point(atom);
    const hydrogenCount = compound.bonds.aid1.reduce((count, aid1, index) => {
      const aid2 = compound.bonds.aid2[index];
      return count + ((aid1 === atom.aid && byId.get(aid2)?.element === 1) || (aid2 === atom.aid && byId.get(aid1)?.element === 1) ? 1 : 0);
    }, 0);
    const charge = charges.get(atom.aid) ?? 0;
    const value = `${ELEMENTS[atom.element] ?? `E${atom.element}`}${hydrogenCount ? `H${hydrogenCount > 1 ? hydrogenCount : ""}` : ""}${charge ? (Math.abs(charge) > 1 ? Math.abs(charge) : "") + (charge > 0 ? "+" : "−") : ""}`;
    cells.push(`<mxCell id="a-${atom.aid}" value="${escapeXml(value)}" vertex="1" parent="1" style="text;align=center;fontSize=24;"><mxGeometry x="${(p.x - 25).toFixed(2)}" y="${(p.y - 20).toFixed(2)}" width="50" height="40" as="geometry"/></mxCell>`);
  });

  return `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells.join("")}</root></mxGraphModel>`;
}

if (import.meta.main) {
  const cid = process.argv[2];
  if (!/^\d+$/.test(cid ?? "")) throw new Error("Usage: bun src/scripts/pubchem-molecule-to-drawio.ts <PubChem CID>");
  const response = await fetch(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/record/JSON?record_type=2d`);
  if (!response.ok) throw new Error(`PubChem returned HTTP ${response.status}`);
  const payload = await response.json() as { PC_Compounds?: PubChemCompound[] };
  const compound = payload.PC_Compounds?.[0];
  if (!compound) throw new Error("PubChem returned no compound record");
  process.stdout.write(pubChemRecordToDrawio(compound));
}
