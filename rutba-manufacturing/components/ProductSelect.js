import { useState, useEffect, useRef, useCallback } from "react";
import { Dropdown } from "primereact/dropdown";
import { ProductsEndpoints } from "@rutba/api-provider/endpoints";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";

function optionLabel(p) {
    const sku = p.sku ? ` · ${p.sku}` : "";
    const kind = p.kind ? ` (${p.kind.replace(/_/g, " ")})` : "";
    return `${p.name}${sku}${kind}`;
}

/**
 * Product picker following the CMS pattern: a filterable PrimeReact dropdown
 * whose options come from the server. The first page loads up front; typing in
 * the filter box runs the products full-text search (name / SKU / barcode /
 * supplier), so every product is reachable, not just the first page.
 *
 * Props:
 *  - value       selected product documentId ('' when empty)
 *  - onChange    called with the new documentId string
 *  - kinds       optional product.kind whitelist, e.g. ['raw_material','consumable'].
 *                When set, both the initial list and search results are limited to it.
 *  - placeholder, disabled, className
 */
export default function ProductSelect({
    value,
    onChange,
    kinds,
    placeholder = "Select product…",
    disabled = false,
    className = "",
}) {
    const { jwt } = useAuth();
    const [options, setOptions] = useState([]);
    const [loading, setLoading] = useState(false);
    const optionsById = useRef({}); // keeps the selected option present across searches
    const searchTimer = useRef(null);
    const searchSeq = useRef(0);
    const kindsKey = JSON.stringify(kinds || []);

    const mergeProducts = useCallback((products) => {
        (products || []).forEach((p) => {
            if (!p?.documentId) return;
            optionsById.current[p.documentId] = { value: p.documentId, label: optionLabel(p) };
        });
        setOptions(Object.values(optionsById.current).sort((a, b) => a.label.localeCompare(b.label)));
    }, []);

    useEffect(() => {
        if (!jwt) return;
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const res = await ProductsEndpoints.list(1, 200, {
                    ...(kinds?.length ? { kinds } : {}),
                    parentOnly: true,
                    sort: "name:asc",
                    fields: ["name", "sku", "kind"],
                });
                if (!cancelled) mergeProducts(res.data || []);
            } catch (err) {
                console.error("Failed to load products", err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [jwt, kindsKey]);

    // Server-side search while typing — reaches products beyond the first page.
    function handleFilter(e) {
        const text = (e.filter || "").trim();
        if (text.length < 2) return;
        clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(async () => {
            const seq = ++searchSeq.current;
            try {
                const res = await ProductsEndpoints.search(text, 1, 50);
                if (seq !== searchSeq.current) return;
                let products = res.data || [];
                if (kinds?.length) products = products.filter((p) => kinds.includes(p.kind));
                mergeProducts(products);
            } catch (err) {
                console.error("Product search failed", err);
            }
        }, 350);
    }

    return (
        <Dropdown
            value={value || null}
            options={options}
            optionLabel="label"
            optionValue="value"
            onChange={(e) => onChange(e.value ?? "")}
            placeholder={loading ? "Loading products…" : placeholder}
            filter
            onFilter={handleFilter}
            showClear
            resetFilterOnHide
            emptyFilterMessage="No match — keep typing to search the full catalogue"
            className={className}
            style={{ width: "100%" }}
            disabled={disabled}
        />
    );
}
