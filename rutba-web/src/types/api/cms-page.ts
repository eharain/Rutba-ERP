import { ImageInterface } from "./image";
import { ProductInterface } from "./product";
import { BrandInterface } from "./brand";
import { CategoryInterface } from "./category";

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
  title?: string;
  slug: string;
  excerpt?: string;
  content?: string;
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

export interface CmsCategoryGroupInterface {
  id: number;
  documentId: string;
  name: string;
  slug: string;
  sort_order: number;
  categories?: CategoryInterface[];
}

export interface CmsFooterInterface {
  id: number;
  documentId: string;
  name: string;
  slug: string;
  phone?: string;
  email?: string;
  address?: string;
  opening_hours?: { day: string; hours: string }[];
  social_links?: { platform: string; url: string }[];
  pinned_pages?: CmsPageInterface[];
  copyright_text?: string;
}

export interface CmsPageDetailInterface extends CmsPageInterface {
  content?: string;
  gallery?: ImageInterface[];
  hero_product_groups?: CmsProductGroupInterface[];
  brand_groups?: CmsBrandGroupInterface[];
  category_groups?: CmsCategoryGroupInterface[];
  product_groups?: CmsProductGroupInterface[];
  related_pages?: CmsPageInterface[];
  footer?: CmsFooterInterface;
}
