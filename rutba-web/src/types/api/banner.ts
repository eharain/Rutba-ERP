import { ImageInterface } from "./image";
import { ProductInterface } from "./product";

export interface BannerInterface {
  id: number;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
  publishedAt: string;
  cover_image?: ImageInterface;
  products?: ProductInterface[];
}
