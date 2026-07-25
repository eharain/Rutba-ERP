import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../context/AuthContext";
import { StockItemsEndpoints, BranchesEndpoints } from "@rutba/api-provider/endpoints";
import { ProductFilter } from "./filter/product-filter";
import { useProductLookups } from "../hooks/useProductLookups";

/**
 * StockHealthPanel — cohort stock-% analysis, shared across rutba-inventory and
 * pos-stock. For stock CREATED in a date range (the cohort's peak at creation),
 * shows how much is still in stock vs sold per product, with % remaining / % sold
 * and rich filters (brand / category / supplier / term / purchase order / branch /
 * % remaining / creation window / search). Driven by GET /stock-items/stock-health.
 * The host page wraps this in its own Layout / ProtectedRoute.
 */

const PAGE_SIZE = 50;

function localISO(d) {
    const t = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return t.toISOString().slice(0, 10);
}
function daysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d;
}

const RANGE_PRESETS = [
    { label: "30d", days: 30 },
    { label: "60d", days: 60 },
    { label: "90d", days: 90 },
    { label: "180d", days: 180 },
    { label: "1y", days: 365 },
];
const SOLD_PRESETS = [
    { label: "All", minSold: "" },
    { label: "≥50% sold", minSold: 50 },
    { label: "≥75% sold", minSold: 75 },
    { label: "≥90% sold", minSold: 90 },
];

function pctColor(pct) {
    if (pct <= 25) return "bg-danger";
    if (pct <= 50) return "bg-warning";
    return "bg-success";
}
function Bar({ pct }) {
    const v = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
    return (
        <div className="progress" style={{ height: 16, minWidth: 90 }} title={`${v}%`}>
            <div className={`progress-bar ${pctColor(v)}`} role="progressbar" style={{ width: `${v}%` }}>{v}%</div>
        </div>
    );
}

export default function StockHealthPanel() {
    const { jwt } = useAuth();
    const router = useRouter();
    const { brands, categories, suppliers, termTypes, purchases } = useProductLookups();

    const [rows, setRows] = useState([]);
    const [meta, setMeta] = useState(null);
    const [branches, setBranches] = useState([]);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState(null);

    // Cohort window — free (unbounded) by default; presets/inputs narrow it.
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");

    // Taxonomy / relation filters (documentId).
    const [selectedBrand, setSelectedBrand] = useState("");
    const [selectedCategory, setSelectedCategory] = useState("");
    const [selectedSupplier, setSelectedSupplier] = useState("");
    const [selectedTerm, setSelectedTerm] = useState("");
    const [selectedPurchase, setSelectedPurchase] = useState("");
    const [branchDocId, setBranchDocId] = useState("");

    // % remaining / % sold ranges + display options.
    const [minPct, setMinPct] = useState("");
    const [maxPct, setMaxPct] = useState("");
    const [minSoldPct, setMinSoldPct] = useState("");
    const [maxSoldPct, setMaxSoldPct] = useState("");
    const [includeReserved, setIncludeReserved] = useState(false);
    const [sort, setSort] = useState("asc");

    // Search (debounced → server-side).
    const [searchText, setSearchText] = useState("");
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [hydrated, setHydrated] = useState(false); // URL → state done

    useEffect(() => {
        const t = setTimeout(() => setSearch(searchText.trim()), 400);
        return () => clearTimeout(t);
    }, [searchText]);

    // Hydrate filters from the URL once the router is ready (shareable / back-button state).
    useEffect(() => {
        if (!router.isReady || hydrated) return;
        const q = router.query;
        const g = (v) => (Array.isArray(v) ? v[0] : v);
        if (q.from) setFrom(g(q.from));
        if (q.to) setTo(g(q.to));
        if (q.branch) setBranchDocId(g(q.branch));
        if (q.brand) setSelectedBrand(g(q.brand));
        if (q.category) setSelectedCategory(g(q.category));
        if (q.supplier) setSelectedSupplier(g(q.supplier));
        if (q.term) setSelectedTerm(g(q.term));
        if (q.purchase) setSelectedPurchase(g(q.purchase));
        if (q.minRem != null) setMinPct(g(q.minRem));
        if (q.maxRem != null) setMaxPct(g(q.maxRem));
        if (q.minSold != null) setMinSoldPct(g(q.minSold));
        if (q.maxSold != null) setMaxSoldPct(g(q.maxSold));
        if (q.reserved) setIncludeReserved(g(q.reserved) === "1");
        if (q.sort) setSort(g(q.sort));
        if (q.q) { setSearchText(g(q.q)); setSearch(g(q.q)); }
        setHydrated(true);
    }, [router.isReady, router.query, hydrated]);

    const loadBranches = useCallback(async () => {
        if (!jwt) return;
        try {
            const res = await BranchesEndpoints.list({ pageSize: 200, sort: ["name:asc"] });
            setBranches(res?.data || []);
        } catch (e) { console.error("Failed to load branches", e); }
    }, [jwt]);

    const load = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        setErr(null);
        try {
            const res = await StockItemsEndpoints.stockHealth({
                from,
                to,
                ...(branchDocId ? { branchDocId } : {}),
                ...(minPct !== "" ? { minPct: Number(minPct) } : {}),
                ...(maxPct !== "" ? { maxPct: Number(maxPct) } : {}),
                ...(minSoldPct !== "" ? { minSoldPct: Number(minSoldPct) } : {}),
                ...(maxSoldPct !== "" ? { maxSoldPct: Number(maxSoldPct) } : {}),
                includeReserved,
                sort,
                ...(selectedCategory ? { categoryDocId: selectedCategory } : {}),
                ...(selectedBrand ? { brandDocId: selectedBrand } : {}),
                ...(selectedSupplier ? { supplierDocId: selectedSupplier } : {}),
                ...(selectedTerm ? { termDocId: selectedTerm } : {}),
                ...(selectedPurchase ? { purchaseDocId: selectedPurchase } : {}),
                ...(search ? { search } : {}),
                page,
                pageSize: PAGE_SIZE,
            });
            setRows(res?.data || []);
            setMeta(res?.meta?.pagination || null);
        } catch (e) {
            console.error("Failed to load stock health", e);
            setErr("Failed to load stock health.");
        } finally {
            setLoading(false);
        }
    }, [jwt, from, to, branchDocId, minPct, maxPct, minSoldPct, maxSoldPct, includeReserved, sort, selectedCategory, selectedBrand, selectedSupplier, selectedTerm, selectedPurchase, search, page]);

    useEffect(() => { loadBranches(); }, [loadBranches]);

    // Single fetch driver (runs only after URL hydration). `load` closes over the
    // filters + page. When a filter changes while not on page 1, jump to page 1
    // first and SKIP the stale-page fetch, so exactly one request runs per change
    // (page is intentionally left out of the URL, matching the purchases list).
    const filtersKey = [from, to, branchDocId, minPct, maxPct, minSoldPct, maxSoldPct, includeReserved ? 1 : 0, sort, selectedCategory, selectedBrand, selectedSupplier, selectedTerm, selectedPurchase, search].join("|");
    const lastFetchedKey = useRef(null);
    useEffect(() => {
        if (!hydrated) return;
        if (lastFetchedKey.current !== null && lastFetchedKey.current !== filtersKey && page !== 1) {
            setPage(1); // the page change re-runs this effect → single fetch at page 1
            return;
        }
        lastFetchedKey.current = filtersKey;
        load();
    }, [load, filtersKey, page, hydrated]); // eslint-disable-line react-hooks/exhaustive-deps

    // Reflect the active filters in the URL (shallow — no navigation / refetch loop).
    // Page is intentionally omitted (resets to 1 on any filter change), matching the
    // purchases-list convention.
    useEffect(() => {
        if (!hydrated) return;
        const query = {};
        if (from) query.from = from;
        if (to) query.to = to;
        if (branchDocId) query.branch = branchDocId;
        if (selectedBrand) query.brand = selectedBrand;
        if (selectedCategory) query.category = selectedCategory;
        if (selectedSupplier) query.supplier = selectedSupplier;
        if (selectedTerm) query.term = selectedTerm;
        if (selectedPurchase) query.purchase = selectedPurchase;
        if (minPct !== "") query.minRem = minPct;
        if (maxPct !== "") query.maxRem = maxPct;
        if (minSoldPct !== "") query.minSold = minSoldPct;
        if (maxSoldPct !== "") query.maxSold = maxSoldPct;
        if (includeReserved) query.reserved = "1";
        if (sort && sort !== "asc") query.sort = sort;
        if (search) query.q = search;
        router.replace({ pathname: router.pathname, query }, undefined, { shallow: true });
    }, [hydrated, from, to, branchDocId, selectedBrand, selectedCategory, selectedSupplier, selectedTerm, selectedPurchase, minPct, maxPct, minSoldPct, maxSoldPct, includeReserved, sort, search]); // eslint-disable-line react-hooks/exhaustive-deps

    const applyRangePreset = (days) => { setFrom(localISO(daysAgo(days))); setTo(localISO(new Date())); };
    const clearAll = () => {
        setSelectedBrand(""); setSelectedCategory(""); setSelectedSupplier(""); setSelectedTerm(""); setSelectedPurchase("");
        setBranchDocId(""); setMinPct(""); setMaxPct(""); setMinSoldPct(""); setMaxSoldPct(""); setIncludeReserved(false); setSearchText("");
        setFrom(""); setTo("");
    };

    // Selecting a specific purchase order scopes the Created window to that PO's
    // lifecycle — order date → completion (received date, else today) — with a
    // 1-day buffer on each side so units received right at the edges aren't
    // excluded. Clearing the PO frees the window again.
    const isoOf = (d) => { if (!d) return ""; const dt = new Date(d); return Number.isNaN(dt.getTime()) ? "" : localISO(dt); };
    const shiftISO = (isoStr, days) => { if (!isoStr) return isoStr; const dt = new Date(`${isoStr}T00:00:00`); dt.setDate(dt.getDate() + days); return localISO(dt); };
    const handlePurchaseChange = (docId) => {
        setSelectedPurchase(docId || "");
        if (!docId) { setFrom(""); setTo(""); return; }
        const po = (purchases || []).find((p) => p.documentId === docId);
        if (!po) return;
        const start = shiftISO(isoOf(po.order_date) || isoOf(po.createdAt), -1);
        const end = shiftISO(isoOf(po.order_recieved_date) || localISO(new Date()), 1);
        if (start) setFrom(start);
        if (end) setTo(end);
    };

    const branchOptions = branches.map((b) => ({ value: b.documentId, label: b.name }));

    const extra = [
        { key: "branch", type: "select", label: "Branch", value: branchDocId, onChange: setBranchDocId, placeholder: "All Branches", options: branchOptions },
        { key: "created", type: "date-range", label: "Created", value: { from, to }, onChange: (v) => { setFrom(v.from); setTo(v.to); } },
        { key: "pctrem", type: "number-range", label: "% remaining", value: { min: minPct, max: maxPct }, onChange: (v) => { setMinPct(v.min); setMaxPct(v.max); }, placeholderMin: "Rem min %", placeholderMax: "Rem max %" },
        { key: "pctsold", type: "number-range", label: "% sold", value: { min: minSoldPct, max: maxSoldPct }, onChange: (v) => { setMinSoldPct(v.min); setMaxSoldPct(v.max); }, placeholderMin: "Sold min %", placeholderMax: "Sold max %" },
        { key: "reserved", type: "toggle", label: "Count Reserved as in-stock", value: includeReserved, onChange: setIncludeReserved },
        { key: "sort", type: "select", label: "Sort", value: sort, onChange: setSort, placeholder: false, options: [{ value: "asc", label: "Lowest % remaining first" }, { value: "desc", label: "Highest % remaining first" }] },
    ];

    return (
        <>
            <div className="d-flex justify-content-between align-items-center mb-3">
                <h3><i className="fas fa-heart-pulse me-2 text-danger"></i>Stock Health</h3>
                <div className="d-flex gap-2">
                    <button className="btn btn-outline-secondary btn-sm" onClick={clearAll} disabled={loading}><i className="fas fa-eraser me-1"></i>Clear</button>
                    <button className="btn btn-outline-secondary btn-sm" onClick={load} disabled={loading}><i className="fas fa-rotate me-1"></i>Refresh</button>
                </div>
            </div>

            <p className="text-muted small mb-3">
                For stock <strong>created within the selected window</strong> (its peak at creation), how much is
                still in stock vs already sold — per product. <strong>% remaining</strong> = still in stock ÷
                created; <strong>% sold</strong> = sold ÷ created. Filter by brand, category, supplier, term,
                purchase order, branch and % remaining.
            </p>

            {/* Quick presets */}
            <div className="d-flex flex-wrap gap-2 align-items-center mb-2">
                <span className="small text-muted">Created window:</span>
                <div className="btn-group btn-group-sm" role="group">
                    <button type="button" className={`btn ${!from && !to ? "btn-secondary" : "btn-outline-secondary"}`} onClick={() => { setFrom(""); setTo(""); }}>All time</button>
                    {RANGE_PRESETS.map((p) => (
                        <button key={p.days} type="button" className="btn btn-outline-secondary" onClick={() => applyRangePreset(p.days)}>{p.label}</button>
                    ))}
                </div>
                <span className="small text-muted ms-2">Sold:</span>
                <div className="btn-group btn-group-sm" role="group">
                    {SOLD_PRESETS.map((p) => (
                        <button key={p.label} type="button" className={`btn ${String(p.minSold) === String(minSoldPct) ? "btn-danger" : "btn-outline-danger"}`} onClick={() => setMinSoldPct(p.minSold)}>{p.label}</button>
                    ))}
                </div>
            </div>

            {/* Full taxonomy filter bar */}
            <div className="mb-3">
                <ProductFilter
                    brands={brands}
                    categories={categories}
                    suppliers={suppliers}
                    termTypes={termTypes}
                    purchases={purchases}
                    selectedBrand={selectedBrand}
                    selectedCategory={selectedCategory}
                    selectedSupplier={selectedSupplier}
                    selectedTerm={selectedTerm}
                    selectedPurchase={selectedPurchase}
                    searchText={searchText}
                    onBrandChange={setSelectedBrand}
                    onCategoryChange={setSelectedCategory}
                    onSupplierChange={setSelectedSupplier}
                    onTermChange={setSelectedTerm}
                    onPurchaseChange={handlePurchaseChange}
                    onSearchTextChange={setSearchText}
                    searchPlaceholder="Search product name or SKU…"
                    extra={extra}
                />
            </div>

            {err && <div className="alert alert-danger py-2">{err}</div>}

            {loading ? (
                <div className="text-center py-5"><div className="spinner-border"></div></div>
            ) : rows.length === 0 ? (
                <div className="alert alert-info">No products match these filters in this window. Try widening the date range or clearing filters.</div>
            ) : (
                <>
                    <div className="table-responsive">
                        <table className="table table-sm table-hover align-middle">
                            <thead>
                                <tr>
                                    <th>Product</th>
                                    <th>SKU</th>
                                    <th className="text-end">Created</th>
                                    <th className="text-end">In stock</th>
                                    <th className="text-end">Sold</th>
                                    <th style={{ minWidth: 110 }}>% remaining</th>
                                    <th style={{ minWidth: 110 }}>% sold</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((r) => (
                                    <tr key={r.product}>
                                        <td>
                                            {r.product_name || <span className="text-muted">(unnamed)</span>}
                                            {r.track_mode === "bulk" ? <span className="badge bg-light text-dark border ms-1" title="Bulk-tracked product">bulk</span> : null}
                                        </td>
                                        <td><code>{r.sku || "—"}</code></td>
                                        <td className="text-end">{r.created}</td>
                                        <td className="text-end fw-semibold">{r.in_stock}</td>
                                        <td className="text-end">{r.sold}</td>
                                        <td><Bar pct={r.pct_remaining} /></td>
                                        <td><Bar pct={r.pct_sold} /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {meta && (
                        <div className="d-flex justify-content-between align-items-center">
                            <span className="text-muted small">Page {meta.page} of {meta.pageCount} · {meta.total} product(s)</span>
                            <div className="btn-group btn-group-sm">
                                <button className="btn btn-outline-secondary" disabled={loading || meta.page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                                    <i className="fas fa-angle-left"></i> Prev
                                </button>
                                <button className="btn btn-outline-secondary" disabled={loading || meta.page >= meta.pageCount} onClick={() => setPage((p) => p + 1)}>
                                    Next <i className="fas fa-angle-right"></i>
                                </button>
                            </div>
                        </div>
                    )}
                </>
            )}
        </>
    );
}
