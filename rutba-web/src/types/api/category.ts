import { ImageInterface } from "./image";

export interface CategoryInterface {
  id: number;
  name: string;
  slug: string;
  short_description: string;
  createdAt: string;
  updatedAt: string;
  logo?: ImageInterface;
}
