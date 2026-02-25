import { ImageInterface } from "./image";
import { ProductInterface } from "./product";
import { BrandInterface } from "./brand";

export interface CmsPageInterface {
  id: number;
  documentId: string;
  title: string;
  slug: string;
  excerpt?: string;
  page_type: "page" | "blog" | "announcement";
  sort_order: number;
  createdAt: string;
  updatedAt: string;
  publishedAt: string;
  featured_image?: ImageInterface;
}

export interface CmsProductGroupInterface {
  id: number;
  documentId: string;
  name: string;
  slug: string;
  products?: ProductInterface[];
  cover_image?: ImageInterface;
}

export interface CmsBrandGroupInterface {
  id: number;
  documentId: string;
  name: string;
  slug: string;
  sort_order: number;
  brands?: BrandInterface[];
}

export interface CmsPageDetailInterface extends CmsPageInterface {
  content?: string;
  gallery?: ImageInterface[];
  hero_product_groups?: CmsProductGroupInterface[];
  brand_groups?: CmsBrandGroupInterface[];
  product_groups?: CmsProductGroupInterface[];
  related_pages?: CmsPageInterface[];
}
