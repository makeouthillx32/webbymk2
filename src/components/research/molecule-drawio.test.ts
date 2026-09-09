import { describe, expect, it } from "bun:test";
import { parseDrawioMolecule } from "./molecule-drawio";
import { getResearchProductMoleculeXml } from "@/data/research-product-molecules";

const SAMPLE = `<mxGraphModel><root><mxCell id="bond" edge="1" style="strokeWidth=2;"><mxGeometry relative="1" as="geometry"><mxPoint x="10" y="20" as="sourcePoint"/><mxPoint x="110" y="120" as="targetPoint"/></mxGeometry></mxCell><mxCell id="atom" value="NH" vertex="1" style="fontSize=30;align=center;"><mxGeometry x="90" y="100" width="40" height="40" as="geometry"/></mxCell></root></mxGraphModel>`;

describe("parseDrawioMolecule", () => {
  it("extracts native bonds and atom labels", () => {
    const drawing = parseDrawioMolecule(SAMPLE);
    expect(drawing?.bonds).toEqual([{ id: "bond", x1: 10, y1: 20, x2: 110, y2: 120, width: 2 }]);
    expect(drawing?.labels[0]).toMatchObject({ id: "atom", value: "NH", fontSize: 30 });
  });
  it("returns null when XML is absent or unsupported", () => {
    expect(parseDrawioMolecule(null)).toBeNull();
    expect(parseDrawioMolecule("<mxGraphModel />")).toBeNull();
  });
  it("strips markup from atom labels", () => {
    const drawing = parseDrawioMolecule(SAMPLE.replace('value="NH"', 'value="&lt;b&gt;O&lt;/b&gt;"'));
    expect(drawing?.labels[0]?.value).toBe("O");
  });
  it("parses the complete first prototype from the static address book", () => {
    const drawing = parseDrawioMolecule(getResearchProductMoleculeXml("molecule-first-test"));
    expect(drawing?.bonds).toHaveLength(59);
    expect(drawing?.labels).toHaveLength(6);
  });
  it("parses the seeded NAD+ structure for every dosage-specific product slug", () => {
    const slugs = [
      "nadplus-500mg", "nad-400mg", "nadplus-1000mg", "nad-552-18mg", "nad-700mg",
      "nad-buffered-250mg", "nad-buffered-500mg", "nad-buffered-1000mg",
      "nad-spray-500mg", "nad-spray-700mg", "nad-spray-1000mg", "nad-spray-1500mg",
    ];
    for (const slug of slugs) {
      const drawing = parseDrawioMolecule(getResearchProductMoleculeXml(slug));
      expect(drawing?.bonds).toHaveLength(57);
      expect(drawing?.labels).toHaveLength(23);
    }
    expect(getResearchProductMoleculeXml("not-a-product")).toBeNull();
  });
  it("parses seeded glutathione and 5-Amino-1MQ structures", () => {
    const glutathione = parseDrawioMolecule(getResearchProductMoleculeXml("glutathione-1000mg"));
    const fiveAmino = parseDrawioMolecule(getResearchProductMoleculeXml("5-amino-1mq-10mg"));
    expect(glutathione?.bonds).toHaveLength(22);
    expect(glutathione?.labels).toHaveLength(10);
    expect(fiveAmino?.bonds).toHaveLength(17);
    expect(fiveAmino?.labels).toHaveLength(2);
  });
});
