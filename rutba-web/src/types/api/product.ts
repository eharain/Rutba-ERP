import { BrandInterface } from "./brand";
import { CategoryInterface } from "./category";
import { ImageInterface } from "./image";

export interface ProductInterface {
  id: number;
  documentId: string;
  name: string;
  sku: string;
  barcode: string;
  selling_price: number;
  cost_price: number;
  stock_quantity: number;
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
}

export interface FilterProductInterface {
  brand?: string;
  category?: string;
  collection?: string;
  minPrice?: string;
  maxPrice?: string;
  sort?: string;
}
