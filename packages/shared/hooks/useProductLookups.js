import { useEffect, useState } from "react";
import {
    BrandsEndpoints,
    CategoriesEndpoints,
    SuppliersEndpoints,
    TermTypesEndpoints,
    PurchasesEndpoints,
} from "@rutba/api-provider/endpoints";

/**
 * Shared lookup loader for product-list filter chips.
 *
 * Every product list (apps/inventory/stock + apps/content/cms + apps/content/social + apps/inventory/control,
 * and any future surface that needs filter dropdowns over brands / categories /
 * suppliers / terms / recent purchases) was hand-rolling the same Promise.all
 * on mount. This hook centralises that fetch so the request shape is identical
 * across apps — important because dataset size is bounded, and any future
 * change (caching, server-side pagination of dropdowns) can land in one place.
 *
 * Returns `{ brands, categories, suppliers, termTypes, purchases, loading, error }`.
 * Caller can also pass `{ skip: Set<string> }` to omit fetches it doesn't need
 * (e.g. a list that doesn't surface a purchase filter):
 *
 *   const { brands, categories } = useProductLookups({ skip: new Set(["suppliers", "termTypes", "purchases"]) });
 */

// Strapi's api.rest.maxLimit is 100, so a single request can never return more
// however large a pageSize the caller asks for. Every lookup used to fire one
// page-1 request, so the dropdowns were silently truncated at that boundary.
const LOOKUP_PAGE_SIZE = 100;
const MAX_PAGES = 50; // safety stop — 5k rows is far past "usable dropdown"

function rowsOf(res) {
    const d = res?.data ?? res;
    return Array.isArray(d) ? d : [];
}

/**
 * Walk every page of a lookup list until a short page comes back.
 * `fetchPage(page)` must resolve to a Strapi list response.
 */
async function fetchAllPages(fetchPage) {
    const out = [];
    for (let page = 1; page <= MAX_PAGES; page += 1) {
        const res = await fetchPage(page);
        const rows = rowsOf(res);
        out.push(...rows);
        // Trust pageCount when the server reports it; otherwise stop on a short page.
        const pageCount = res?.meta?.pagination?.pageCount;
        if (typeof pageCount === "number" ? page >= pageCount : rows.length < LOOKUP_PAGE_SIZE) break;
    }
    return out;
}

export function useProductLookups({ skip } = {}) {
    const [brands, setBrands] = useState([]);
    const [categories, setCategories] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [termTypes, setTermTypes] = useState([]);
    const [purchases, setPurchases] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        const want = (k) => !skip || !skip.has(k);

        const load = (key, fetchPage) => (want(key)
            ? fetchAllPages(fetchPage)
            : Promise.resolve([]));

        const tasks = [
            load("brands", (page) => BrandsEndpoints.listAll({ page, pageSize: LOOKUP_PAGE_SIZE })),
            load("categories", (page) => CategoriesEndpoints.listAll({ page, pageSize: LOOKUP_PAGE_SIZE })),
            load("suppliers", (page) => SuppliersEndpoints.listAll({ page, pageSize: LOOKUP_PAGE_SIZE })),
            load("termTypes", (page) => TermTypesEndpoints.listWithTerms({ page, pageSize: LOOKUP_PAGE_SIZE })),
            load("purchases", (page) => PurchasesEndpoints.list(page, LOOKUP_PAGE_SIZE, { sort: ["createdAt:desc"] })),
        ];

        // allSettled, not all: these are five independent dropdowns and a single
        // rejection (e.g. one content-type not granted to the active app-role)
        // used to blank ALL of them, including the ones that had loaded fine.
        Promise.allSettled(tasks)
            .then((results) => {
                if (cancelled) return;
                const setters = [setBrands, setCategories, setSuppliers, setTermTypes, setPurchases];
                const names = ["brands", "categories", "suppliers", "termTypes", "purchases"];
                const failed = [];
                results.forEach((r, i) => {
                    if (r.status === "fulfilled") {
                        setters[i](r.value);
                    } else {
                        failed.push(names[i]);
                        console.error(`useProductLookups: ${names[i]} lookup failed`, r.reason);
                    }
                });
                setError(failed.length > 0 ? new Error(`Lookup failed: ${failed.join(", ")}`) : null);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => { cancelled = true; };
        // skip is expected to be stable; intentionally not deepcompared
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return { brands, categories, suppliers, termTypes, purchases, loading, error };
}
