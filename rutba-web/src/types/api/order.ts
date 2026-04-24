import { ImageInterface } from "./image";

export interface OrderTermInfo {
    typeName: string;
    termName: string;
}

export interface OrderInterface {
    order_id: string;
    tracking_code: string | null | undefined;
    stripe_url: string | null | undefined;
    tracking_url: string | null | undefined;
    shipping_name: string | null | undefined;
    subtotal: string | null | undefined;
    shipping_price: string | null | undefined;
    total: string | null | undefined;
    original_subtotal?: string | null;
    savings?: number | null;
    payment_status: string | null | undefined;
    createdAt: string;
    id: number;
    url: string;
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
            original_price?: number;
            offer_price?: number;
            total: number;
            variant: string;
            variant_name: string;
            variant_terms?: OrderTermInfo[];
            product_name: string;
            product: string;
            image?: ImageInterface | null;
            offer_id?: string;
            source_group_id?: string;
        }[];
    };
}

export interface CheckoutPayload {
    order_id: string;
    products: {
        items: {
            quantity: number;
            price: number;
            original_price?: number;
            offer_price?: number;
            total: number;
            product_name: string;
            product: string;
            variant?: string;
            variant_name?: string;
            variant_terms?: OrderTermInfo[];
            image?: number;
            offer_id?: string;
            source_group_id?: string;
        }[];
    };
    subtotal: number;
    total: number;
    original_subtotal?: number;
    savings?: number;
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
    delivery_method_id?: string;
    delivery_zone_id?: string;
    delivery_cost?: number;
    delivery_cost_breakdown?: Record<string, unknown>;
}

export type OrderStatus =
    | 'PENDING_PAYMENT'
    | 'PAYMENT_CONFIRMED'
    | 'PREPARING'
    | 'AWAITING_PICKUP'
    | 'OUT_FOR_DELIVERY'
    | 'DELIVERED'
    | 'CANCELLED'
    | 'FAILED_DELIVERY'
    | 'REFUND_INITIATED'
    | 'REFUNDED';