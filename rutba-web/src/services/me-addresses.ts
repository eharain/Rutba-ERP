import axios from "axios";
// Source descriptors — synchronous `{ path, method, data }` shapes. The
// generated proxy under endpoints/ wraps them as Promises and re-routes
// through the api-provider lib, which uses its own storage JWT (not the
// next-auth session). We want the raw descriptor so we can axios + Bearer
// ourselves.
import { MeAddressesEndpoints } from "@rutba/api-provider/api/me-addresses.js";
import { BASE_URL } from "@/static/const";

export interface CustomerAddress {
  documentId: string;
  label?: string;
  name?: string;
  email?: string;
  phone?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  country?: string;
  zip_code?: string;
  is_default?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface AddressInput {
  label?: string;
  name?: string;
  email?: string;
  phone?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  country?: string;
  zip_code?: string;
  is_default?: boolean;
}

/** Compact one-liner shown in lists / "Shipping to:" hints. */
export function formatAddressLines(a: Partial<CustomerAddress>): string {
  return [a.line1, a.line2, a.city, a.state, a.country]
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(", ");
}

/** True when an address has the bits needed to actually ship to it. */
export function hasShippableLines(a: Partial<CustomerAddress>): boolean {
  return !!(a.line1 && a.city && a.country);
}

function authHeaders(jwt?: string | null) {
  return jwt ? { Authorization: `Bearer ${jwt}` } : undefined;
}

/**
 * Server-side address book client.
 *
 * The generated MeAddressesEndpoints proxy authenticates via the api-provider
 * `storage` JWT — which rutba-web does not populate (auth lives in the
 * next-auth session). So we use the descriptors for paths/methods only and
 * make the HTTP call with axios + the session JWT, the same pattern
 * services/orders.ts and services/delivery.ts use.
 */
export function createMeAddressesService() {
  const list = async (jwt?: string | null): Promise<CustomerAddress[]> => {
    if (!jwt) return [];
    const ep = MeAddressesEndpoints.list();
    const res = await axios.get(`${BASE_URL}${ep.path}`, { headers: authHeaders(jwt) });
    return (res.data?.data ?? []) as CustomerAddress[];
  };

  const create = async (data: AddressInput, jwt: string): Promise<CustomerAddress> => {
    const ep = MeAddressesEndpoints.create(data);
    const res = await axios.post(
      `${BASE_URL}${ep.path}`,
      { data: ep.data },
      { headers: { "Content-Type": "application/json", ...(authHeaders(jwt) || {}) } }
    );
    return res.data?.data as CustomerAddress;
  };

  const update = async (documentId: string, data: AddressInput, jwt: string): Promise<CustomerAddress> => {
    const ep = MeAddressesEndpoints.update(documentId, data);
    const res = await axios.put(
      `${BASE_URL}${ep.path}`,
      { data: ep.data },
      { headers: { "Content-Type": "application/json", ...(authHeaders(jwt) || {}) } }
    );
    return res.data?.data as CustomerAddress;
  };

  const remove = async (documentId: string, jwt: string): Promise<void> => {
    const ep = MeAddressesEndpoints.del(documentId);
    await axios.delete(`${BASE_URL}${ep.path}`, { headers: authHeaders(jwt) });
  };

  const makeDefault = async (documentId: string, jwt: string): Promise<CustomerAddress> => {
    const ep = MeAddressesEndpoints.makeDefault(documentId);
    const res = await axios.post(
      `${BASE_URL}${ep.path}`,
      { data: {} },
      { headers: { "Content-Type": "application/json", ...(authHeaders(jwt) || {}) } }
    );
    return res.data?.data as CustomerAddress;
  };

  return { endpoints: MeAddressesEndpoints, list, create, update, remove, makeDefault };
}
