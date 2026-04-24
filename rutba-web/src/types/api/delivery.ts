export interface DeliveryMethodOption {
  methodId: number;
  methodDocumentId: string;
  name: string;
  description: string;
  serviceProvider: 'own_rider' | 'easypost' | 'custom';
  cost: number;
  estimatedDaysMin: number;
  estimatedDaysMax: number;
  isFreeShipping: boolean;
  zoneId: number;
  zoneDocumentId: string;
  zoneType: 'domestic_own_rider' | 'domestic_courier' | 'international';
  offerTimeoutMinutes: number;
  requiresRateQuery: boolean;
}

export interface OrderMessage {
  id: number;
  documentId: string;
  sender_type: 'rider' | 'customer' | 'staff';
  sender_id: string;
  message: string;
  sent_at: string;
  is_read: boolean;
}

export interface OrderTracking {
  order_id: string;
  order_status: string;
  payment_status: string;
  delivery_method: {
    name: string;
    service_provider: string;
    estimated_days_min: number;
    estimated_days_max: number;
  } | null;
  assigned_rider: {
    full_name: string;
    phone: string;
    vehicle_type: string;
  } | null;
  estimated_delivery_time: string | null;
  actual_delivery_time: string | null;
  subtotal: number;
  delivery_cost: number;
  total: number;
  createdAt: string;
  customer_contact: { name: string; city: string };
  products: unknown;
}
