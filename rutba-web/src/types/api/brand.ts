import { ImageInterface } from "./image";

export interface BrandInterface {
  id: number;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
  logo?: ImageInterface;
  gallery?: ImageInterface[];
  keywords?: string[];
  documentId?: string;
  summary?: string;
  description?: string;
  seo_meta?: import("./cms-page").SeoMetaInterface;
}
