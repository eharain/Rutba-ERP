import { BrandInterface } from "./brand";
import { CategoryInterface } from "./category";
import { ImageInterface } from "./image";

export interface TermTypeInterface {
  id: number;
  documentId: string;
  name: string;
  slug?: string;
  is_variant?: boolean;
  is_public?: boolean;
}

export interface TermInterface {
  id: number;
  documentId: string;
  name: string;
  slug?: string;
  term_types?: TermTypeInterface[];
}

export interface VariantTermSummary {
  typeName: string;
  termNames: string[];
}

export interface ProductInterface {
  id: number;
  documentId: string;
  name: string;
  sku: string;
  barcode: string;
  selling_price: number;
  cost_price: number;
  stock_quantity: number;
  summary: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  publishedAt: string;
  keywords: string[];
  offer_price: number;
  gallery?: ImageInterface[];
  variants: ProductInterface[];
  is_variant: boolean;
  parent: ProductInterface;
  logo: ImageInterface;
  brands?: BrandInterface[];
  categories?: CategoryInterface[];
  terms?: TermInterface[];
}

export interface FilterProductInterface {
  brand?: string;
  category?: string;
  collection?: string;
  minPrice?: string;
  maxPrice?: string;
  sort?: string;
}

/** Compute aggregated variant term summary for a product */
export function getVariantTermSummary(product: ProductInterface): VariantTermSummary[] {
  const typeMap = new Map<string, { typeName: string; terms: Set<string> }>();
  (product.variants || []).forEach((v) => {
    (v.terms || []).forEach((t) => {
      (t.term_types || []).forEach((tt) => {
        if (tt.is_variant || tt.is_public) {
          const key = tt.documentId || String(tt.id);
          if (!typeMap.has(key)) {
            typeMap.set(key, { typeName: tt.name, terms: new Set() });
          }
          typeMap.get(key)!.terms.add(t.name);
        }
      });
    });
  });
  return Array.from(typeMap.values()).map(({ typeName, terms }) => ({
    typeName,
    termNames: Array.from(terms),
  }));
}
