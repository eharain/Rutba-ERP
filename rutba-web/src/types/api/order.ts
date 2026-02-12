// import { ImageInterface } from "./image";

export interface OrderInterface {
  order_id: string;
  tracking_code: string | null | undefined;
  stripe_url: string | null | undefined;
  tracking_url: string | null | undefined;
  shipping_name: string | null | undefined;
  subtotal: string | null | undefined;
  shipping_price: string | null | undefined;
  total: string | null | undefined;
  payment_status: string | null | undefined;
  createdAt: string;
  id: number;
  customer_contact: {
    id: number;
    name: string;
    phone_number: string;
    email: string;
    address: string;
    state: string;
    city: string;
    zip_code: string;
    country: string;
  };
  products: {
    id: number;
    items: {
      id: number;
      quantity: number;
      price: number;
      total: number;
      variant: string;
      product_name: string;
      product: string;
    }[];
  };
}

export interface CheckoutPayload {
  order_id: string;
  products: {
    items: {
      quantity: number;
      price: number;
      total: number;
      product_name: string;
      product: string;
  }[];
  }; 
  subtotal: number;
  total: number;
  customer_contact: {
    name: string;
    phone_number: string;
    email: string;
    address: string;
    state: string;
    city: string;
    zip_code: string;
    country: string;
  };
  payment_status: string;
  user_id: string;
}