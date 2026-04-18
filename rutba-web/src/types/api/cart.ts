export interface CartTermInfo {
  typeName: string;
  termName: string;
}

export interface CartInterface {
  id: number;
  image: string;
  imageId?: number | null;
  name: string;
  variant_id: number;
  variant_name: string;
  price: number;
  offerPrice?: number;
  offerId?: string;
  sourceGroupId?: string;
  width: number;
  length: number;
  height: number;
  weight: number;
  qty: number;
  documentId: string;
  variant_terms?: CartTermInfo[];
  selectedImage?: string | null;
}
