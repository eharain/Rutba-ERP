export interface CartTermInfo {
  typeName: string;
  termName: string;
}

export interface CartInterface {
  id: number;
  image: string;
  name: string;
  variant_id: number;
  variant_name: string;
  price: number;
  width: number;
  length: number;
  height: number;
  weight: number;
  qty: number;
  documentId: string;
  variant_terms?: CartTermInfo[];
  selectedImage?: string | null;
}
