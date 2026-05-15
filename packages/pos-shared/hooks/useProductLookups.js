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
 * Every product list (pos-stock + rutba-cms, and any future surface that
 * needs filter dropdowns over brands / categories / suppliers / terms /
 * recent purchases) was hand-rolling the same Promise.all on mount. This
 * hook centralises that fetch so the request shape is identical across
 * apps — important because dataset size is bounded (listAll fetches every
 * row), and any future change (caching, smaller page sizes, server-side
 * pagination of dropdowns) can land in one place.
 *
 * Returns `{ brands, categories, suppliers, termTypes, purchases, loading, error }`.
 * Caller can also pass `{ skip: Set<string> }` to omit fetches it doesn't need
 * (e.g. a list that doesn't surface a purchase filter):
 *
 *   const { brands, categories } = useProductLookups({ skip: new Set(["suppliers", "termTypes", "purchases"]) });
 */
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
        const tasks = [
            want("brands") ? BrandsEndpoints.listAll() : Promise.resolve(null),
            want("categories") ? CategoriesEndpoints.listAll() : Promise.resolve(null),
            want("suppliers") ? SuppliersEndpoints.listAll() : Promise.resolve(null),
            want("termTypes") ? TermTypesEndpoints.listWithTerms() : Promise.resolve(null),
            want("purchases") ? PurchasesEndpoints.list(1, 100, { sort: ["createdAt:desc"] }) : Promise.resolve(null),
        ];
        Promise.all(tasks)
            .then(([b, c, s, t, p]) => {
                if (cancelled) return;
                const unwrap = (r) => (r?.data ?? r ?? []);
                setBrands(unwrap(b));
                setCategories(unwrap(c));
                setSuppliers(unwrap(s));
                setTermTypes(unwrap(t));
                setPurchases(unwrap(p));
            })
            .catch((err) => {
                if (cancelled) return;
                console.error("useProductLookups failed", err);
                setError(err);
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
