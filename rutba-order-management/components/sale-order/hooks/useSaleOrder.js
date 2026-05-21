import { useCallback, useEffect, useState } from "react";
import {
  SaleOrdersEndpoints,
  RidersEndpoints,
  ProductsEndpoints,
  ReturnRequestsEndpoints,
} from "@rutba/api-provider/endpoints/index.js";

// Lifecycle map for the order-management UI. Mirrors the server-side
// state machine in pos-strapi/src/api/sale-order/services/sale-order-state-machine.js
// — keep them in sync; the UI uses this to pick which stage panel to render
// and which next-step buttons to surface.
export const TRANSITIONS = {
  PENDING_PAYMENT:   ["PAYMENT_CONFIRMED", "CANCELLED"],
  PAYMENT_CONFIRMED: ["PREPARING", "CANCELLED"],
  PREPARING:         ["AWAITING_PICKUP", "CANCELLED"],
  AWAITING_PICKUP:   ["OUT_FOR_DELIVERY", "CANCELLED"],
  OUT_FOR_DELIVERY:  ["DELIVERED", "FAILED_DELIVERY"],
  FAILED_DELIVERY:   ["OUT_FOR_DELIVERY", "CANCELLED"],
  DELIVERED:         ["RETURN_REQUESTED"],
  RETURN_REQUESTED:  ["RETURN_IN_TRANSIT", "DELIVERED"],
  RETURN_IN_TRANSIT: ["RETURNED", "DELIVERED"],
  RETURNED:          ["REFUND_INITIATED"],
  CANCELLED:         ["REFUND_INITIATED"],
  REFUND_INITIATED:  ["REFUNDED"],
  REFUNDED:          [],
};

export const STAGE_ORDER = [
  "PENDING_PAYMENT",
  "PAYMENT_CONFIRMED",
  "PREPARING",
  "AWAITING_PICKUP",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
];

export function isTerminal(status) {
  return ["REFUNDED"].includes(status);
}

// Statuses that put the order into the return detour. The shell uses this
// to route to ReturnStage instead of SettledStage / CancelledStage.
export const RETURN_STATUSES = new Set([
  "RETURN_REQUESTED",
  "RETURN_IN_TRANSIT",
  "RETURNED",
]);

// Populate spec used by both initial load and the post-mutation refresh.
// Keeping it in one place means stages never disagree about what's
// hydrated on the order — anything they read here is guaranteed present.
const ORDER_POPULATE = {
  customer_person: true,
  delivery_address: true,
  assigned_rider: true,
  delivery_method: true,
  payment_collected_by_rider: { fields: ["documentId", "full_name"] },
  payment_verified_by: { fields: ["id", "username", "email"] },
  products: {
    populate: {
      items: {
        populate: {
          image: true,
          product: { fields: ["documentId", "name"] },
          stock_item: {
            fields: ["documentId", "sku", "barcode", "name", "status"],
          },
        },
      },
    },
  },
};

export function useSaleOrder({ documentId, isNew, jwt, toast }) {
  const [order, setOrder] = useState(null);
  const [activeReturn, setActiveReturn] = useState(null);
  const [loading, setLoading] = useState(true);
  const [riders, setRiders] = useState([]);
  const [productsCatalog, setProductsCatalog] = useState([]);

  const refresh = useCallback(async () => {
    if (!documentId || isNew) return null;
    const res = await SaleOrdersEndpoints.byId(documentId, {
      populate: ORDER_POPULATE,
    });
    const o = res.data || res;
    setOrder(o);

    // Pull the most recent active return-request for this order so the
    // ReturnStage panel can drive its action buttons against it. Best-effort:
    // a 403 means the role doesn't have list-returns permission (e.g. a fresh
    // staff role without the api-pro seeded grant) — log and continue.
    if (RETURN_STATUSES.has(o?.order_status)) {
      try {
        const listRes = await ReturnRequestsEndpoints.list({
          filters: { sale_order: { documentId: { $eq: documentId } }, status: { $notIn: ["CANCELLED", "REJECTED", "COMPLETED"] } },
          sort: ["createdAt:desc"],
          pageSize: 1,
          populate: ["items", "return_method", "approved_by", "received_by"],
        });
        setActiveReturn((listRes?.data || [])[0] || null);
      } catch (err) {
        console.warn("Failed to load active return-request", err);
        setActiveReturn(null);
      }
    } else {
      setActiveReturn(null);
    }
    return o;
  }, [documentId, isNew]);

  useEffect(() => {
    if (!jwt || !documentId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [riderRes, productRes] = await Promise.all([
          RidersEndpoints.list({
            sort: ["full_name:asc"],
            fields: ["documentId", "full_name", "status"],
            pagination: { pageSize: 200 },
          }),
          ProductsEndpoints.list(1, 500, {
            sort: ["name:asc"],
            fields: ["documentId", "name"],
          }),
        ]);
        if (cancelled) return;
        setRiders(riderRes.data || []);
        setProductsCatalog(productRes.data || []);

        if (!isNew) await refresh();
      } catch (err) {
        console.error("Failed to load sale-order context", err);
        toast?.("Failed to load order.", "danger");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jwt, documentId, isNew, refresh, toast]);

  return {
    order,
    setOrder,
    activeReturn,
    loading,
    riders,
    productsCatalog,
    refresh,
  };
}
