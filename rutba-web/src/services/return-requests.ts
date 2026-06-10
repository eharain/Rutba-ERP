import axios from "axios";
import qs from "qs";
// Same pattern as services/orders.ts: pull the descriptor for path/method,
// then drive axios with the NextAuth session JWT directly. webApi storage
// is decoupled from NextAuth, so we can't share its client here.
import { WebReturnRequestsEndpoints } from "@rutba/api-provider/api/web/return-requests.js";
import { WebReturnPoliciesEndpoints } from "@rutba/api-provider/api/web/return-policies.js";
import { apiUrl } from "@/static/const";

function authHeaders(jwt?: string | null) {
  return jwt ? { Authorization: `Bearer ${jwt}` } : undefined;
}

function urlWithParams(path: string, params?: Record<string, unknown>) {
  if (!params || Object.keys(params).length === 0) return `${apiUrl(path)}`;
  const query = qs.stringify(params, { encodeValuesOnly: true });
  return `${apiUrl(path)}${query ? `?${query}` : ""}`;
}

export type ReturnLineInput = {
  order_line_index: number;
  quantity: number;
  reason?: string;
  reason_notes?: string;
};

export type CreateReturnInput = {
  sale_order_document_id: string;
  reason: string;
  reason_notes?: string;
  resolution?: "refund" | "store_credit";
  items: ReturnLineInput[];
  customer_evidence?: number[];
};

export function createWebReturnsService() {
  /** Read-only policy fetch — used to compute the return-window deadline. */
  const getPolicy = async () => {
    const ep = WebReturnPoliciesEndpoints.get();
    const res = await axios.get(urlWithParams(ep.path));
    return res.data?.data ?? res.data;
  };

  const create = async (input: CreateReturnInput, jwt: string) => {
    const ep = WebReturnRequestsEndpoints.createReturnRequest(input);
    const res = await axios.post(`${apiUrl(ep.path)}`, ep.data, {
      headers: authHeaders(jwt),
    });
    return res.data?.data ?? res.data;
  };

  const listMine = async (jwt: string) => {
    const ep = WebReturnRequestsEndpoints.listMine();
    const res = await axios.get(`${apiUrl(ep.path)}`, {
      headers: authHeaders(jwt),
    });
    return res.data?.data ?? [];
  };

  const byId = async (documentId: string, jwt: string) => {
    const ep = WebReturnRequestsEndpoints.byId(documentId);
    const res = await axios.get(`${apiUrl(ep.path)}`, {
      headers: authHeaders(jwt),
    });
    return res.data?.data ?? res.data;
  };

  const cancelMine = async (documentId: string, jwt: string) => {
    const ep = WebReturnRequestsEndpoints.cancelMine(documentId);
    const res = await axios.post(`${apiUrl(ep.path)}`, {}, {
      headers: authHeaders(jwt),
    });
    return res.data?.data ?? res.data;
  };

  return { getPolicy, create, listMine, byId, cancelMine };
}
