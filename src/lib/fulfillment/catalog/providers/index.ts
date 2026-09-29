import type { CatalogProviderAdapter, CatalogProviderKey } from "../types";
import { GelatoCatalogAdapter } from "./gelato";
import { GootenCatalogAdapter } from "./gooten";
import { PrintfulCatalogAdapter } from "./printful";

export function createCatalogAdapter(provider: CatalogProviderKey): CatalogProviderAdapter {
  if (provider === "printful") return new PrintfulCatalogAdapter();
  if (provider === "gelato") return new GelatoCatalogAdapter();
  if (provider === "gooten") return new GootenCatalogAdapter();
  throw new Error(`Unsupported pull provider: ${String(provider)}`);
}
