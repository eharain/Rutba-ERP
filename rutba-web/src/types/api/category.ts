import { ImageInterface } from "./image";

export interface CategoryInterface {
  id: number;
  name: string;
  slug: string;
  short_description: string;
  createdAt: string;
  updatedAt: string;
  logo?: ImageInterface;
  documentId?: string;
  summary?: string;
  description?: string;
  seo_meta?: import("./cms-page").SeoMetaInterface;
}
