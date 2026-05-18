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
  page_type: "shop" | "blog" | "news" | "info" | "page";
  enable_contact_form?: boolean;
  sort_order: number;
  createdAt: string;
  updatedAt: string;
  publishedAt: string;
  featured_image?: ImageInterface;
  background_image?: ImageInterface;
  seo_meta?: SeoMetaInterface;
}

export interface SeoMetaInterface {
  id: number;
  documentId: string;
  entity_type?: string;
  entity_title?: string;
  meta_title?: string;
  meta_description?: string;
  noindex?: boolean;
  og_image?: ImageInterface;
  /** Comma-separated free-form keyword list. */
  keywords?: string;
}

export interface OfferInterface {
  id: number;
  documentId: string;
  name: string;
  active: boolean;
  start_date?: string;
  end_date?: string;
  description?: string;
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
  layout?: 'hero-slider' | 'grid-4' | 'grid-6' | 'carousel' | 'banner-single' | 'list';
  priority?: number;
  default_sort?: 'default' | 'newest' | 'price_asc' | 'price_desc';
  enable_sort_dropdown?: boolean;
  enable_view_toggle?: boolean;
  max_inline_products?: number;
  show_brand?: boolean;
  show_category?: boolean;
  offers?: OfferInterface[];
  seo_meta?: SeoMetaInterface;
}

export interface CmsBrandGroupInterface {
  id: number;
  documentId: string;
  name: string;
  slug: string;
  sort_order: number;
  brands?: BrandInterface[];
  seo_meta?: SeoMetaInterface;
}

export interface CmsCategoryGroupInterface {
  id: number;
  documentId: string;
  name: string;
  slug: string;
  sort_order: number;
  categories?: CategoryInterface[];
  seo_meta?: SeoMetaInterface;
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
  // Tracking codes — injected into the storefront when this footer is used.
  ga_measurement_id?: string;
  meta_pixel_id?: string;
  gtm_container_id?: string;
  custom_head_html?: string;
  custom_body_end_html?: string;
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
  excerpt_priority?: number;
  featured_image_priority?: number;
  content_priority?: number;
  product_groups_priority?: number;
  gallery_priority?: number;
  related_pages_priority?: number;
}
