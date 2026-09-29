export interface ShippingPackagePreset {
  name: string;
  weightLb: number;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  description: string;
}

// One shared package catalog for Shop and Labs. Keeping the dimensions in one
// place prevents the research flow from displaying one preset while purchasing
// postage with another preset's dimensions.
export const SHIPPING_PACKAGE_PRESETS: ShippingPackagePreset[] = [
  {
    name: "Insulated Cold-Chain Shipper (Foam + Gel Pack)",
    description: "Insulated EPS shipper with frozen refrigerant pack for temperature-sensitive compounds (4-8°C)",
    weightLb: 0.88,
    lengthIn: 8,
    widthIn: 6,
    heightIn: 6,
  },
  {
    name: "Padded Cryo/Vial Bubble Mailer (1-4 Vials)",
    description: "Tear-resistant bubble envelope with vial foam insert for small ambient specimens",
    weightLb: 0.19,
    lengthIn: 7,
    widthIn: 9,
    heightIn: 1.5,
  },
  {
    name: "Rigid Multi-Vial Laboratory Box (5-10 Vials)",
    description: "Crush-resistant 200# corrugated box with segmented vial partition",
    weightLb: 0.38,
    lengthIn: 7,
    widthIn: 5,
    heightIn: 3,
  },
  {
    name: "Bulk Laboratory Carton (10-30 Vials)",
    description: "Medium shipping carton with double-wall interior cushioning for larger orders",
    weightLb: 0.75,
    lengthIn: 10,
    widthIn: 8,
    heightIn: 5,
  },
  {
    name: "Ambient Glassware / Reagent Shipper",
    description: "Heavy protective corrugated box with cellular suspension pack for delicate glass",
    weightLb: 1.25,
    lengthIn: 12,
    widthIn: 10,
    heightIn: 8,
  },
];

export function getShippingPackagePreset(name: string | null | undefined) {
  return SHIPPING_PACKAGE_PRESETS.find((preset) => preset.name === name) ?? null;
}
