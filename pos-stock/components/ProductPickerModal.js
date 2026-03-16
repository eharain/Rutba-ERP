import { useState, useRef, useEffect, Fragment } from "react";
import { authApi } from "@rutba/pos-shared/lib/api";
import { fetchProducts } from "@rutba/pos-shared/lib/pos";
import SearchableSelect from "@rutba/pos-shared/components/SearchableSelect";

export default function ProductPickerModal({ show, onClose, onSelect, title }) {
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const pageSize = 15;
    const debounceRef = useRef(null);
    const inputRef = useRef(null);

    // filters – mirrors the standard products page
    const [searchText, setSearchText] = useState("");
    const [selectedBrand, setSelectedBrand] = useState("");
    const [selectedCategory, setSelectedCategory] = useState("");
    const [selectedSupplier, setSelectedSupplier] = useState("");
    const [selectedTerm, setSelectedTerm] = useState("");
    const [selectedPurchase, setSelectedPurchase] = useState("");

    // filter option lists
    const [brands, setBrands] = useState([]);
    const [categories, setCategories] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [termTypes, setTermTypes] = useState([]);
    const [purchases, setPurchases] = useState([]);
    const [filterDataLoaded, setFilterDataLoaded] = useState(false);

    // variants
    const [expandedProducts, setExpandedProducts] = useState({});
    const [variantsMap, setVariantsMap] = useState({});
    const [loadingVariants, setLoadingVariants] = useState({});

    // ── helpers ──────────────────────────────────────────────

    function buildFilters() {
        const f = { parentOnly: true };
        if (searchText) f.searchText = searchText;
        if (selectedBrand) f.brands = [selectedBrand];
        if (selectedCategory) f.categories = [selectedCategory];
        if (selectedSupplier) f.suppliers = [selectedSupplier];
        if (selectedTerm) f.terms = [selectedTerm];
        if (selectedPurchase) f.purchases = [selectedPurchase];
        return f;
    }

    async function loadResults(filters, p) {
        setLoading(true);
        try {
            const res = await fetchProducts(filters, p, pageSize, "name:asc");
            setResults(res.data || []);
            setTotal(res.meta?.pagination?.total || 0);
        } catch (e) {
            console.error("Product search failed:", e);
            setResults([]);
            setTotal(0);
        } finally {
            setLoading(false);
        }
    }

    async function toggleVariants(product) {
        const docId = product.documentId;
        if (expandedProducts[docId]) {
            setExpandedProducts(prev => ({ ...prev, [docId]: false }));
            return;
        }
        if (!variantsMap[docId]) {
            setLoadingVariants(prev => ({ ...prev, [docId]: true }));
            try {
                const res = await authApi.get("/products", {
                    filters: { parent: { documentId: docId } },
                    populate: { categories: true, brands: true, suppliers: true },
                    pagination: { pageSize: 100 },
                });
                setVariantsMap(prev => ({ ...prev, [docId]: res.data || [] }));
            } catch (err) {
                console.error("Failed to load variants", err);
            } finally {
                setLoadingVariants(prev => ({ ...prev, [docId]: false }));
            }
        }
        setExpandedProducts(prev => ({ ...prev, [docId]: true }));
    }

    const hasActiveFilters = selectedBrand || selectedCategory || selectedSupplier || selectedTerm || selectedPurchase;

    function clearFilters() {
        setSelectedBrand("");
        setSelectedCategory("");
        setSelectedSupplier("");
        setSelectedTerm("");
        setSelectedPurchase("");
        setSearchText("");
    }

    // ── effects ─────────────────────────────────────────────

    // load filter option lists once when modal first opens
    useEffect(() => {
        if (!show || filterDataLoaded) return;
        Promise.all([
            authApi.getAll("/brands"),
            authApi.getAll("/categories"),
            authApi.getAll("/suppliers"),
            authApi.getAll("/term-types", { populate: ["terms"] }),
            authApi.getAll("/purchases", { sort: ["createdAt:desc"] }),
        ]).then(([b, c, s, t, p]) => {
            setBrands(b?.data || b || []);
            setCategories(c?.data || c || []);
            setSuppliers(s?.data || s || []);
            setTermTypes(t?.data || t || []);
            setPurchases(p?.data || p || []);
            setFilterDataLoaded(true);
        });
    }, [show, filterDataLoaded]);

    // reset state when modal opens
    useEffect(() => {
        if (!show) return;
        setSearchText("");
        setSelectedBrand("");
        setSelectedCategory("");
        setSelectedSupplier("");
        setSelectedTerm("");
        setSelectedPurchase("");
        setPage(1);
        setResults([]);
        setTotal(0);
        setExpandedProducts({});
        setVariantsMap({});
        loadResults({ parentOnly: true }, 1);
        setTimeout(() => inputRef.current?.focus(), 100);
    }, [show]);

    // debounced search text
    useEffect(() => {
        if (!show) return;
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            setPage(1);
            loadResults(buildFilters(), 1);
        }, 300);
        return () => clearTimeout(debounceRef.current);
    }, [searchText]);

    // immediate reload on filter / page change
    useEffect(() => {
        if (!show) return;
        setPage(1);
        loadResults(buildFilters(), 1);
    }, [selectedBrand, selectedCategory, selectedSupplier, selectedTerm, selectedPurchase]);

    useEffect(() => {
        if (!show) return;
        loadResults(buildFilters(), page);
    }, [page]);

    // ── derived ─────────────────────────────────────────────

    const totalPages = Math.ceil(total / pageSize) || 1;

    const brandOptions = brands.map(b => ({ value: b.documentId, label: b.name }));
    const categoryOptions = categories.map(c => ({ value: c.documentId, label: c.name }));
    const supplierOptions = suppliers.map(s => ({ value: s.documentId, label: s.name }));
    const termOptions = termTypes.flatMap(tt =>
        (tt.terms || []).map(t => ({ value: t.documentId, label: `${tt.name} - ${t.name}` }))
    );
    const purchaseOptions = (purchases || []).map(p => ({ value: p.documentId, label: p.orderId }));

    if (!show) return null;

    return (
        <div
            className="modal d-block"
            style={{ backgroundColor: "rgba(0,0,0,0.5)", zIndex: 9999 }}
            tabIndex="-1"
            onClick={onClose}
        >
            <div
                className="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable"
                onClick={e => e.stopPropagation()}
            >
                <div className="modal-content">
                    <div className="modal-header">
                        <h5 className="modal-title">{title || "Select Product"}</h5>
                        <button type="button" className="btn-close" onClick={onClose} />
                    </div>
                    <div className="modal-body p-0">
                        {/* ── Search + Filters ── */}
                        <div className="p-3 border-bottom">
                            <input
                                ref={inputRef}
                                type="text"
                                className="form-control mb-2"
                                placeholder="Search by name, SKU, barcode, supplier, or purchase #..."
                                value={searchText}
                                onChange={e => setSearchText(e.target.value)}
                            />
                            <div className="row g-2">
                                <div className="col">
                                    <SearchableSelect value={selectedBrand} onChange={setSelectedBrand} options={brandOptions} placeholder="All Brands" />
                                </div>
                                <div className="col">
                                    <SearchableSelect value={selectedCategory} onChange={setSelectedCategory} options={categoryOptions} placeholder="All Categories" />
                                </div>
                                <div className="col">
                                    <SearchableSelect value={selectedSupplier} onChange={setSelectedSupplier} options={supplierOptions} placeholder="All Suppliers" />
                                </div>
                                <div className="col">
                                    <SearchableSelect value={selectedTerm} onChange={setSelectedTerm} options={termOptions} placeholder="All Terms" />
                                </div>
                                <div className="col">
                                    <SearchableSelect value={selectedPurchase} onChange={setSelectedPurchase} options={purchaseOptions} placeholder="All Purchases" />
                                </div>
                            </div>
                            <div className="d-flex align-items-center mt-2">
                                <span className="text-muted small">
                                    {total} product{total !== 1 ? "s" : ""} found
                                </span>
                                {hasActiveFilters && (
                                    <button className="btn btn-sm btn-link text-decoration-none ms-2 p-0" onClick={clearFilters}>
                                        Clear filters
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* ── Results ── */}
                        {loading && (
                            <div className="text-center py-4">
                                <div className="spinner-border spinner-border-sm" role="status" />
                            </div>
                        )}

                        {!loading && results.length === 0 && (
                            <div className="text-center text-muted py-4">No products found.</div>
                        )}

                        {!loading && results.length > 0 && (
                            <div className="table-responsive" style={{ maxHeight: 400 }}>
                                <table className="table table-hover table-sm mb-0">
                                    <thead className="table-light sticky-top">
                                        <tr>
                                            <th style={{ width: 30 }} />
                                            <th>Name</th>
                                            <th>SKU</th>
                                            <th>Barcode</th>
                                            <th>Selling Price</th>
                                            <th>Cost Price</th>
                                            <th>Stock Qty</th>
                                            <th />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {results.map(p => (
                                            <Fragment key={p.documentId}>
                                                <tr>
                                                    <td>
                                                        <button
                                                            className="btn btn-sm btn-link p-0"
                                                            onClick={() => toggleVariants(p)}
                                                            title="Show/hide variants"
                                                        >
                                                            {expandedProducts[p.documentId] ? "▼" : "▶"}
                                                        </button>
                                                    </td>
                                                    <td><strong>{p.name}</strong></td>
                                                    <td>{p.sku || "—"}</td>
                                                    <td>{p.barcode || "—"}</td>
                                                    <td>{p.selling_price ?? "—"}</td>
                                                    <td>{p.cost_price ?? "—"}</td>
                                                    <td>{p.stock_quantity ?? "—"}</td>
                                                    <td>
                                                        <button
                                                            className="btn btn-sm btn-primary"
                                                            onClick={() => onSelect(p.documentId)}
                                                        >
                                                            Select
                                                        </button>
                                                    </td>
                                                </tr>
                                                {expandedProducts[p.documentId] && (
                                                    loadingVariants[p.documentId] ? (
                                                        <tr>
                                                            <td colSpan={8} className="text-center text-muted py-2">
                                                                <div className="spinner-border spinner-border-sm me-1" role="status" />
                                                                Loading variants…
                                                            </td>
                                                        </tr>
                                                    ) : (variantsMap[p.documentId] || []).length === 0 ? (
                                                        <tr>
                                                            <td colSpan={8} className="text-center text-muted fst-italic py-1">
                                                                No variants
                                                            </td>
                                                        </tr>
                                                    ) : (
                                                        (variantsMap[p.documentId] || []).map(v => (
                                                            <tr key={v.documentId} style={{ background: "#f8f9fa" }}>
                                                                <td />
                                                                <td className="ps-4">
                                                                    <span className="text-muted me-1">↳</span>
                                                                    {v.name}
                                                                </td>
                                                                <td>{v.sku || "—"}</td>
                                                                <td>{v.barcode || "—"}</td>
                                                                <td>{v.selling_price ?? "—"}</td>
                                                                <td>{v.cost_price ?? "—"}</td>
                                                                <td>{v.stock_quantity ?? "—"}</td>
                                                                <td>
                                                                    <button
                                                                        className="btn btn-sm btn-outline-primary"
                                                                        onClick={() => onSelect(v.documentId)}
                                                                    >
                                                                        Select Variant
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        ))
                                                    )
                                                )}
                                            </Fragment>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                    {totalPages > 1 && (
                        <div className="modal-footer justify-content-between py-2">
                            <span className="text-muted small">
                                Page {page} of {totalPages}
                            </span>
                            <div>
                                <button
                                    className="btn btn-sm btn-outline-secondary me-1"
                                    disabled={page <= 1}
                                    onClick={() => setPage(p => p - 1)}
                                >
                                    &laquo; Prev
                                </button>
                                <button
                                    className="btn btn-sm btn-outline-secondary"
                                    disabled={page >= totalPages}
                                    onClick={() => setPage(p => p + 1)}
                                >
                                    Next &raquo;
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
