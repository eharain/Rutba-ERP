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
    /**
     * Snapshot of the contact + shipping info as it was at order create time.
     * Frozen — never updated by later edits to person/address rows. Use this
     * for receipts / tracking / anywhere historical accuracy matters.
     */
    delivery_snapshot?: {
        name?: string;
        email?: string;
        phone?: string;
        line1?: string;
        line2?: string;
        city?: string;
        state?: string;
        country?: string;
        zip_code?: string;
        note?: string;
    };
    /** Live person record. Renames here propagate to all live UI but never the snapshot. */
    customer_person?: {
        id?: number;
        documentId?: string;
        name?: string;
        email?: string;
        phone?: string;
    };
    /** Linked address row (saved in user's address book). Null for guests / express path. */
    delivery_address?: {
        id?: number;
        documentId?: string;
        line1?: string;
        line2?: string;
        city?: string;
        state?: string;
        country?: string;
        zip_code?: string;
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
    /** Flat customer-info payload — server translates to person + snapshot. */
    customer: {
        name: string;
        phone: string;
        email: string;
        line1?: string;
        line2?: string;
        state?: string;
        city?: string;
        zip_code?: string;
        country?: string;
        note?: string;
    };
    /** If true and `line1` is set, the server persists the address into the user's book (dedup'd). */
    save_address?: boolean;
    /** Pre-existing saved address chosen by the user (skips creating a new one). */
    delivery_address_documentId?: string;
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