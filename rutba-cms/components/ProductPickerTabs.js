import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi, StraipImageUrl } from "@rutba/pos-shared/lib/api";
import { ProductFilter } from "@rutba/pos-shared/components/filter/product-filter";
import { fetchProducts } from "@rutba/pos-shared/lib/pos";
import Link from "next/link";

const DEFAULT_PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = [5, 10, 25, 50, 100, 150, 200];

export default function ProductPickerTabs({ selectedProductIds, connectedProducts, onToggle, onBulkAdd, onRemoveAll }) {
    const [activeTab, setActiveTab] = useState("connected");
    const { jwt } = useAuth();
    const [bulkLoading, setBulkLoading] = useState(false);
    const [bulkMessage, setBulkMessage] = useState("");

    // Quick Add tab state
    const [quickAddLoading, setQuickAddLoading] = useState({});
    const [categoryCounts, setCategoryCounts] = useState({});
    const [brandCounts, setBrandCounts] = useState({});
    const [countsLoaded, setCountsLoaded] = useState(false);
    const [expandedCategories, setExpandedCategories] = useState(false);
    const [expandedBrands, setExpandedBrands] = useState(false);
    const [categorySearch, setCategorySearch] = useState("");
    const [brandSearch, setBrandSearch] = useState("");

    // Cache of product objects keyed by documentId
    const [productCache, setProductCache] = useState({});

    // Seed cache from connectedProducts
    useEffect(() => {
        if (!connectedProducts?.length) return;
        setProductCache(prev => {
            const next = { ...prev };
            connectedProducts.forEach(p => { next[p.documentId] = p; });
            return next;
        });
    }, [connectedProducts]);

    // Picker state
    const [pickerProducts, setPickerProducts] = useState([]);
    const [pickerLoading, setPickerLoading] = useState(false);
    const [pickerPage, setPickerPage] = useState(1);
    const [pickerPageSize, setPickerPageSize] = useState(DEFAULT_PAGE_SIZE);
    const [pickerPageCount, setPickerPageCount] = useState(1);
    const [pickerTotal, setPickerTotal] = useState(0);
    const [goToPage, setGoToPage] = useState("");

    // Filter data
    const [brands, setBrands] = useState([]);
    const [categories, setCategories] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [termTypes, setTermTypes] = useState([]);
    const [purchases, setPurchases] = useState([]);

    // Selected filters
    const [selectedBrand, setSelectedBrand] = useState("");
    const [selectedCategory, setSelectedCategory] = useState("");
    const [selectedSupplier, setSelectedSupplier] = useState("");
    const [selectedTerm, setSelectedTerm] = useState("");
    const [selectedPurchase, setSelectedPurchase] = useState("");
    const [searchText, setSearchText] = useState("");

    // Load filter options
    const [filterDataLoaded, setFilterDataLoaded] = useState(false);
    useEffect(() => {
        if (!jwt || filterDataLoaded || (activeTab !== "all" && activeTab !== "quickadd")) return;
        (async () => {
            try {
                const [brandsRes, categoriesRes, suppliersRes, termTypesRes, purchasesRes] = await Promise.all([
                    authApi.getAll("/brands"),
                    authApi.getAll("/categories"),
                    authApi.getAll("/suppliers"),
                    authApi.getAll("/term-types", { populate: ["terms"] }),
                    authApi.getAll("/purchases", { sort: ["createdAt:desc"] }),
                ]);
                setBrands(brandsRes?.data || brandsRes || []);
                setCategories(categoriesRes?.data || categoriesRes || []);
                setSuppliers(suppliersRes?.data || suppliersRes || []);
                setTermTypes(termTypesRes?.data || termTypesRes || []);
                setPurchases(purchasesRes?.data || purchasesRes || []);
                setFilterDataLoaded(true);
            } catch (err) {
                console.error("Failed to load picker data", err);
            }
        })();
    }, [jwt, activeTab, filterDataLoaded]);

    // Load product counts per category/brand for Quick Add tab
    useEffect(() => {
        if (!jwt || countsLoaded || (activeTab !== "quickadd" && activeTab !== "all") || !filterDataLoaded) return;
        (async () => {
            try {
                // Fetch counts by querying products for each category/brand
                const catCounts = {};
                const bCounts = {};
                // Use parallel lightweight calls
                const catPromises = (categories || []).map(async (cat) => {
                    try {
                        const res = await fetchProducts({ parentOnly: true, status: "draft", categories: [cat.documentId] }, 1, 1, "createdAt:desc");
                        catCounts[cat.documentId] = res.meta?.pagination?.total ?? 0;
                    } catch { catCounts[cat.documentId] = 0; }
                });
                const brandPromises = (brands || []).map(async (b) => {
                    try {
                        const res = await fetchProducts({ parentOnly: true, status: "draft", brands: [b.documentId] }, 1, 1, "createdAt:desc");
                        bCounts[b.documentId] = res.meta?.pagination?.total ?? 0;
                    } catch { bCounts[b.documentId] = 0; }
                });
                await Promise.all([...catPromises, ...brandPromises]);
                setCategoryCounts(catCounts);
                setBrandCounts(bCounts);
                setCountsLoaded(true);
            } catch (err) {
                console.error("Failed to load counts", err);
            }
        })();
    }, [jwt, activeTab, filterDataLoaded, countsLoaded, categories, brands]);

    // Bulk add all products from a specific category or brand
    const handleQuickAdd = useCallback(async (filterType, filterValue, filterLabel) => {
        if (!jwt || !onBulkAdd) return;
        const key = `${filterType}-${filterValue}`;
        setQuickAddLoading(prev => ({ ...prev, [key]: true }));
        try {
            const filters = { parentOnly: true, status: "draft" };
            if (filterType === "categories") filters.categories = [filterValue];
            if (filterType === "brands") filters.brands = [filterValue];
            const res = await fetchProducts(filters, 1, 9999, "createdAt:desc");
            const products = res.data || [];
            const newIds = products.map(p => p.documentId).filter(id => !selectedProductIds.includes(id));
            if (newIds.length > 0) {
                onBulkAdd(newIds);
                setProductCache(prev => {
                    const next = { ...prev };
                    products.forEach(p => { next[p.documentId] = p; });
                    return next;
                });
            }
            setBulkMessage(`Added ${newIds.length} from ${filterLabel}`);
            setTimeout(() => setBulkMessage(""), 3000);
        } catch (err) {
            console.error("Failed to quick add", err);
        } finally {
            setQuickAddLoading(prev => ({ ...prev, [key]: false }));
        }
    }, [jwt, selectedProductIds, onBulkAdd]);

    // Fetch picker products (only when All Products tab is active)
    useEffect(() => {
        if (!jwt || activeTab !== "all") return;

        const filters = { parentOnly: true, status: "draft", searchText };
        if (selectedBrand) filters.brands = [selectedBrand];
        if (selectedCategory) filters.categories = [selectedCategory];
        if (selectedSupplier) filters.suppliers = [selectedSupplier];
        if (selectedTerm) filters.terms = [selectedTerm];
        if (selectedPurchase) filters.purchases = [selectedPurchase];

        let cancelled = false;
        setPickerLoading(true);

        fetchProducts(filters, pickerPage, pickerPageSize, "createdAt:desc")
            .then((res) => {
                if (cancelled) return;
                const products = res.data || [];
                setPickerProducts(products);
                setPickerPageCount(res.meta?.pagination?.pageCount ?? 1);
                setPickerTotal(res.meta?.pagination?.total ?? 0);
                setProductCache(prev => {
                    const next = { ...prev };
                    products.forEach(p => { next[p.documentId] = p; });
                    return next;
                });
            })
            .catch((err) => { if (!cancelled) console.error("Failed to load filtered products", err); })
            .finally(() => { if (!cancelled) setPickerLoading(false); });

        return () => { cancelled = true; };
    }, [jwt, activeTab, pickerPage, pickerPageSize, selectedBrand, selectedCategory, selectedSupplier, selectedTerm, selectedPurchase, searchText]);

    // Bulk add all filtered products
    const handleAddAllFiltered = useCallback(async () => {
        if (!jwt) return;
        setBulkLoading(true);
        setBulkMessage("");
        try {
            const filters = { parentOnly: true, status: "draft", searchText };
            if (selectedBrand) filters.brands = [selectedBrand];
            if (selectedCategory) filters.categories = [selectedCategory];
            if (selectedSupplier) filters.suppliers = [selectedSupplier];
            if (selectedTerm) filters.terms = [selectedTerm];
            if (selectedPurchase) filters.purchases = [selectedPurchase];
            // Fetch all matching products (high limit)
            const res = await fetchProducts(filters, 1, 9999, "createdAt:desc");
            const products = res.data || [];
            const newIds = products.map(p => p.documentId).filter(id => !selectedProductIds.includes(id));
            if (newIds.length > 0 && onBulkAdd) {
                onBulkAdd(newIds);
                // Cache fetched products
                setProductCache(prev => {
                    const next = { ...prev };
                    products.forEach(p => { next[p.documentId] = p; });
                    return next;
                });
            }
            setBulkMessage(`Added ${newIds.length} product${newIds.length !== 1 ? "s" : ""}`);
            setTimeout(() => setBulkMessage(""), 3000);
        } catch (err) {
            console.error("Failed to bulk add products", err);
            setBulkMessage("Failed to add products.");
        } finally {
            setBulkLoading(false);
        }
    }, [jwt, searchText, selectedBrand, selectedCategory, selectedSupplier, selectedTerm, selectedPurchase, selectedProductIds, onBulkAdd]);

    // Pagination helpers
    const pickerFromItem = pickerTotal === 0 ? 0 : (pickerPage - 1) * pickerPageSize + 1;
    const pickerToItem = Math.min(pickerPage * pickerPageSize, pickerTotal);
    const pickerPaginationItems = (() => {
        if (pickerPageCount <= 7) return Array.from({ length: pickerPageCount }, (_, i) => i + 1);
        if (pickerPage <= 4) return [1, 2, 3, 4, 5, "…", pickerPageCount];
        if (pickerPage >= pickerPageCount - 3) return [1, "…", pickerPageCount - 4, pickerPageCount - 3, pickerPageCount - 2, pickerPageCount - 1, pickerPageCount];
        return [1, "…", pickerPage - 1, pickerPage, pickerPage + 1, "…", pickerPageCount];
    })();

    // Connected products from cache
    const displayConnected = selectedProductIds
        .map(id => productCache[id])
        .filter(Boolean);

    const renderProductButton = (p) => {
        const selected = selectedProductIds.includes(p.documentId);
        return (
            <div key={p.documentId} className="d-inline-flex align-items-center gap-1">
                {p.logo?.url ? (
                    <img
                        src={StraipImageUrl(p.logo)}
                        alt={p.name}
                        style={{ width: 32, height: 32, objectFit: "cover", borderRadius: 4 }}
                    />
                ) : (
                    <span className="text-muted" style={{ width: 32, height: 32, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                        <i className="fas fa-image"></i>
                    </span>
                )}
                <button
                    type="button"
                    className={`btn btn-sm ${selected ? "btn-success" : "btn-outline-secondary"}`}
                    onClick={() => onToggle(p.documentId)}
                >
                    {selected && <i className="fas fa-check me-1"></i>}
                    {p.name}
                </button>
                <Link
                    href={`/${p.documentId}/product`}
                    className="btn btn-sm btn-outline-primary"
                    title="Open product"
                >
                    <i className="fas fa-external-link-alt"></i>
                </Link>
            </div>
        );
    };

    return (
        <div className="card mb-3">
            <div className="card-header d-flex align-items-center">
                <i className="fas fa-box me-2"></i>
                <strong>Products</strong>
                <span className="badge bg-primary ms-2">{selectedProductIds.length}</span>
            </div>
            <div className="card-body">
                <ul className="nav nav-tabs mb-3">
                    <li className="nav-item">
                        <button
                            className={`nav-link ${activeTab === "connected" ? "active" : ""}`}
                            onClick={() => setActiveTab("connected")}
                        >
                            <i className="fas fa-link me-1"></i>
                            Connected <span className="badge bg-success ms-1">{selectedProductIds.length}</span>
                        </button>
                    </li>
                    <li className="nav-item">
                        <button
                            className={`nav-link ${activeTab === "all" ? "active" : ""}`}
                            onClick={() => setActiveTab("all")}
                        >
                            <i className="fas fa-search me-1"></i>
                            All Products
                        </button>
                    </li>
                    <li className="nav-item">
                        <button
                            className={`nav-link ${activeTab === "quickadd" ? "active" : ""}`}
                            onClick={() => setActiveTab("quickadd")}
                        >
                            <i className="fas fa-bolt me-1"></i>
                            Quick Add
                        </button>
                    </li>
                </ul>

                {activeTab === "connected" && (
                    <>
                        <div className="d-flex align-items-center justify-content-between mb-2">
                            <small className="text-muted">{selectedProductIds.length} product{selectedProductIds.length !== 1 ? "s" : ""} selected</small>
                            {selectedProductIds.length > 0 && onRemoveAll && (
                                <button className="btn btn-sm btn-outline-danger" onClick={onRemoveAll}>
                                    <i className="fas fa-times me-1"></i>Clear All
                                </button>
                            )}
                        </div>
                        {displayConnected.length === 0 ? (
                            <p className="text-muted small">No products connected yet. Use the "All Products" tab to search and add products.</p>
                        ) : (
                            <div className="d-flex flex-wrap gap-2">
                                {displayConnected.map(p => renderProductButton(p))}
                            </div>
                        )}
                    </>
                )}

                {activeTab === "all" && (
                    <>
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
                            onBrandChange={(v) => { setSelectedBrand(v || ""); setPickerPage(1); }}
                            onCategoryChange={(v) => { setSelectedCategory(v || ""); setPickerPage(1); }}
                            onSupplierChange={(v) => { setSelectedSupplier(v || ""); setPickerPage(1); }}
                            onTermChange={(v) => { setSelectedTerm(v || ""); setPickerPage(1); }}
                            onPurchaseChange={(v) => { setSelectedPurchase(v || ""); setPickerPage(1); }}
                            onSearchTextChange={(v) => { setSearchText(v || ""); setPickerPage(1); }}
                        />

                        <div className="d-flex align-items-center justify-content-between my-2">
                            <div className="d-flex align-items-center gap-2">
                                <small className="text-muted">
                                    {pickerTotal} products found
                                    {pickerTotal > 0 ? ` · Showing ${pickerFromItem}-${pickerToItem}` : ""}
                                </small>
                                {pickerTotal > 0 && onBulkAdd && (
                                    <button
                                        className="btn btn-sm btn-outline-success"
                                        onClick={handleAddAllFiltered}
                                        disabled={bulkLoading}
                                    >
                                        {bulkLoading ? (
                                            <><span className="spinner-border spinner-border-sm me-1"></span>Adding...</>
                                        ) : (
                                            <><i className="fas fa-plus-circle me-1"></i>Add All Filtered ({pickerTotal})</>
                                        )}
                                    </button>
                                )}
                                {bulkMessage && <span className="badge bg-info">{bulkMessage}</span>}
                            </div>
                            <div className="d-flex align-items-center gap-2">
                                <label className="small text-muted mb-0">Rows:</label>
                                <select
                                    className="form-select form-select-sm"
                                    style={{ width: 90 }}
                                    value={pickerPageSize}
                                    onChange={(e) => { setPickerPageSize(parseInt(e.target.value, 10)); setPickerPage(1); }}
                                >
                                    {PAGE_SIZE_OPTIONS.map((size) => (
                                        <option key={size} value={size}>{size}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {pickerLoading && <p className="text-muted small">Loading products...</p>}

                        {!pickerLoading && pickerProducts.length === 0 ? (
                            <p className="text-muted small">No products match the filters.</p>
                        ) : (
                            <div className="d-flex flex-wrap gap-2">
                                {pickerProducts.map(p => renderProductButton(p))}
                            </div>
                        )}

                        {pickerPageCount > 1 && (
                            <nav className="mt-3 d-flex align-items-center justify-content-between">
                                <div>
                                    <button
                                        className="btn btn-sm btn-outline-secondary me-1"
                                        disabled={pickerPage <= 1}
                                        onClick={() => setPickerPage(p => Math.max(1, p - 1))}
                                    >
                                        &laquo; Prev
                                    </button>
                                    <button
                                        className="btn btn-sm btn-outline-secondary"
                                        disabled={pickerPage >= pickerPageCount}
                                        onClick={() => setPickerPage(p => Math.min(pickerPageCount, p + 1))}
                                    >
                                        Next &raquo;
                                    </button>
                                </div>
                                <div className="d-flex align-items-center gap-2">
                                    <ul className="pagination pagination-sm mb-0">
                                        {pickerPaginationItems.map((item, idx) => (
                                            typeof item === "number" ? (
                                                <li key={item} className={`page-item ${pickerPage === item ? "active" : ""}`}>
                                                    <button className="page-link" onClick={() => setPickerPage(item)}>{item}</button>
                                                </li>
                                            ) : (
                                                <li key={`ellipsis-${idx}`} className="page-item disabled">
                                                    <span className="page-link">…</span>
                                                </li>
                                            )
                                        ))}
                                    </ul>
                                    <div className="d-flex align-items-center gap-1">
                                        <span className="small text-muted">Go to</span>
                                        <input
                                            type="number"
                                            min={1}
                                            max={pickerPageCount}
                                            className="form-control form-control-sm"
                                            style={{ width: 80 }}
                                            value={goToPage}
                                            onChange={(e) => setGoToPage(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key !== "Enter") return;
                                                const target = Math.max(1, Math.min(pickerPageCount, parseInt(goToPage, 10) || 1));
                                                setPickerPage(target);
                                                setGoToPage("");
                                            }}
                                        />
                                        <button
                                            className="btn btn-sm btn-outline-secondary"
                                            onClick={() => {
                                                const target = Math.max(1, Math.min(pickerPageCount, parseInt(goToPage, 10) || 1));
                                                setPickerPage(target);
                                                setGoToPage("");
                                            }}
                                        >
                                            Go
                                        </button>
                                    </div>
                                </div>
                            </nav>
                        )}
                    </>
                )}

                {activeTab === "quickadd" && (
                    <>
                        {bulkMessage && <div className="alert alert-info py-1 small mb-3">{bulkMessage}</div>}

                        <h6 className="mb-2">
                            <i className="fas fa-tags me-1"></i>
                            Categories
                            <span className="badge bg-secondary ms-2">{categories.length}</span>
                        </h6>
                        <input
                            type="text"
                            className="form-control form-control-sm mb-2"
                            placeholder="Search categories..."
                            value={categorySearch}
                            onChange={(e) => setCategorySearch(e.target.value)}
                        />
                        {!filterDataLoaded && <p className="text-muted small">Loading categories...</p>}
                        {filterDataLoaded && (() => {
                            const filtered = categorySearch.trim()
                                ? categories.filter(c => c.name.toLowerCase().includes(categorySearch.toLowerCase()))
                                : (expandedCategories ? categories : categories.slice(0, 10));
                            return (
                                <div className="list-group list-group-flush mb-4">
                                    {filtered.map(cat => {
                                        const key = `categories-${cat.documentId}`;
                                        const count = categoryCounts[cat.documentId];
                                        return (
                                            <div key={cat.documentId} className="list-group-item d-flex align-items-center justify-content-between py-2">
                                                <div>
                                                    <span>{cat.name}</span>
                                                    {count !== undefined && <span className="badge bg-secondary ms-2">{count}</span>}
                                                </div>
                                                <button
                                                    className="btn btn-sm btn-outline-success"
                                                    disabled={quickAddLoading[key]}
                                                    onClick={() => handleQuickAdd("categories", cat.documentId, cat.name)}
                                                >
                                                    {quickAddLoading[key] ? (
                                                        <span className="spinner-border spinner-border-sm"></span>
                                                    ) : (
                                                        <><i className="fas fa-plus me-1"></i>Add All</>
                                                    )}
                                                </button>
                                            </div>
                                        );
                                    })}
                                    {filtered.length === 0 && <div className="list-group-item text-muted small">No categories match "{categorySearch}"</div>}
                                    {!categorySearch && !expandedCategories && categories.length > 10 && (
                                        <div className="list-group-item text-center">
                                            <button className="btn btn-sm btn-link" onClick={() => setExpandedCategories(true)}>
                                                Show all {categories.length} categories
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })()}

                        <h6 className="mb-2">
                            <i className="fas fa-copyright me-1"></i>
                            Brands
                            <span className="badge bg-secondary ms-2">{brands.length}</span>
                        </h6>
                        <input
                            type="text"
                            className="form-control form-control-sm mb-2"
                            placeholder="Search brands..."
                            value={brandSearch}
                            onChange={(e) => setBrandSearch(e.target.value)}
                        />
                        {filterDataLoaded && (() => {
                            const filtered = brandSearch.trim()
                                ? brands.filter(b => b.name.toLowerCase().includes(brandSearch.toLowerCase()))
                                : (expandedBrands ? brands : brands.slice(0, 10));
                            return (
                                <div className="list-group list-group-flush">
                                    {filtered.map(brand => {
                                        const key = `brands-${brand.documentId}`;
                                        const count = brandCounts[brand.documentId];
                                        return (
                                            <div key={brand.documentId} className="list-group-item d-flex align-items-center justify-content-between py-2">
                                                <div>
                                                    <span>{brand.name}</span>
                                                    {count !== undefined && <span className="badge bg-secondary ms-2">{count}</span>}
                                                </div>
                                                <button
                                                    className="btn btn-sm btn-outline-success"
                                                    disabled={quickAddLoading[key]}
                                                    onClick={() => handleQuickAdd("brands", brand.documentId, brand.name)}
                                                >
                                                    {quickAddLoading[key] ? (
                                                        <span className="spinner-border spinner-border-sm"></span>
                                                    ) : (
                                                        <><i className="fas fa-plus me-1"></i>Add All</>
                                                    )}
                                                </button>
                                            </div>
                                        );
                                    })}
                                    {filtered.length === 0 && <div className="list-group-item text-muted small">No brands match "{brandSearch}"</div>}
                                    {!brandSearch && !expandedBrands && brands.length > 10 && (
                                        <div className="list-group-item text-center">
                                            <button className="btn btn-sm btn-link" onClick={() => setExpandedBrands(true)}>
                                                Show all {brands.length} brands
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })()}
                    </>
                )}
            </div>
        </div>
    );
}
