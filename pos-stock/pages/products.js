import { useEffect, useState, useCallback, Fragment } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { CircularProgress, SortableTh } from "@rutba/pos-shared/components/Table";
import Layout from "../components/Layout";
import ProductCard from "@rutba/pos-shared/components/ProductCard";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import PermissionCheck from "@rutba/pos-shared/components/PermissionCheck";
import { MediaUtilsEndpoints, ProductsEndpoints, StockItemsEndpoints } from "@rutba/api-provider/endpoints";
import { useProductLookups } from "@rutba/pos-shared/hooks/useProductLookups";
import { fetchProducts } from "@rutba/api-provider/pos";
import { ProductFilter } from "@rutba/pos-shared/components/filter/product-filter";
import { useUtil } from "@rutba/pos-shared/context/UtilContext";
import BulkProductActions from "@rutba/pos-shared/components/BulkProductActions";
import ListPageLayout, { AddButton } from "@rutba/pos-shared/components/ListPageLayout";
import ListPagination from "@rutba/pos-shared/components/ListPagination";

export default function Products() {
    const router = useRouter();
    const [products, setProducts] = useState([]);
    const { currency } = useUtil();
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [filters, setFilters] = useState({});
    const { brands, categories, suppliers, termTypes, purchases } = useProductLookups();
    const [selectedBrand, setSelectedBrand] = useState("");
    const [selectedCategory, setSelectedCategory] = useState("");
    const [selectedSupplier, setSelectedSupplier] = useState("");
    const [selectedTerm, setSelectedTerm] = useState("");
    const [selectedPurchase, setSelectedPurchase] = useState("");
    const [stockStatus, setStockStatus] = useState(false);
    const [searchText, setSearchText] = useState("");
    // Completeness / range filters (publish state is CMS-only, omitted here).
    const [missingContent, setMissingContent] = useState(false);
    const [missingLogo, setMissingLogo] = useState(false);
    const [missingGallery, setMissingGallery] = useState(false);
    const [priceRange, setPriceRange] = useState({ min: "", max: "" });
    const [createdRange, setCreatedRange] = useState({ from: "", to: "" });
    const [updatedRange, setUpdatedRange] = useState({ from: "", to: "" });
    const [filtersInitialized, setFiltersInitialized] = useState(false);
    const [sortField, setSortField] = useState('id');
    const [sortOrder, setSortOrder] = useState('desc');
    const [expandedProducts, setExpandedProducts] = useState({});
    const [variantsMap, setVariantsMap] = useState({});
    const [loadingVariants, setLoadingVariants] = useState({});
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [bulkMessage, setBulkMessage] = useState(null);
    const [syncingStock, setSyncingStock] = useState(false);

    // Triggers the recompute-product-stock admin job. The stock-item lifecycle
    // already keeps product.stock_quantity in sync during normal operation,
    // so this is a manual reconcile path — useful after migrations, suspected
    // drift, or any time the cache and the InStock count seem misaligned.
    const handleSyncStock = async () => {
        if (syncingStock) return;
        if (!confirm("Rebuild product.stock_quantity for every product from the live InStock count? Safe to run anytime — idempotent.")) return;
        setSyncingStock(true);
        try {
            const res = await StockItemsEndpoints.recomputeProductStock();
            const r = res?.data ?? res ?? {};
            bulkToast(
                `Synced stock — processed ${r.processed ?? 0}, corrected ${r.corrected ?? 0} in ${r.durationMs ?? "?"}ms`,
                "success"
            );
            loadProductsData();
        } catch (err) {
            console.error("Sync stock failed", err);
            bulkToast(err?.response?.data?.error?.message || err?.message || "Sync stock failed", "danger");
        } finally {
            setSyncingStock(false);
        }
    };

    const toggleSelected = (docId) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(docId)) next.delete(docId); else next.add(docId);
            return next;
        });
    };

    const allPageIds = products.map(p => p.documentId);
    const allSelected = allPageIds.length > 0 && allPageIds.every(id => selectedIds.has(id));
    const toggleSelectAll = () => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (allSelected) {
                allPageIds.forEach(id => next.delete(id));
            } else {
                allPageIds.forEach(id => next.add(id));
            }
            return next;
        });
    };

    const bulkToast = (message, variant) => {
        setBulkMessage({ message, variant });
        setTimeout(() => setBulkMessage(null), 4000);
    };

    const lookupMap = { categories, brands, suppliers };

    const handleBulkAssigned = (field, documentIds, docId) => {
        const lookup = lookupMap[field] || [];
        const resolved = documentIds.map(did => lookup.find(x => x.documentId === did)).filter(Boolean);
        const updater = (p) => p.documentId !== docId ? p : { ...p, [field]: resolved };
        setProducts(prev => prev.map(updater));
        setVariantsMap(prev => {
            const copy = { ...prev };
            for (const key of Object.keys(copy)) { copy[key] = copy[key].map(updater); }
            return copy;
        });
    };

    const sortString = `${sortField}:${sortOrder}`;

    const handleSort = useCallback((field) => {
        if (sortField === field) {
            setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortField(field);
            setSortOrder('asc');
        }
        setPage(1);
    }, [sortField]);

    async function loadProductsData() {
        setLoading(true);
        const { data, meta } = await fetchProducts(filters, page, pageSize, sortString);
        setProducts(data);
        setTotal(meta.pagination.total);
        setLoading(false);
    }

    useEffect(() => {
        if (!filtersInitialized) return;
        loadProductsData();
    }, [page, pageSize, filters, filtersInitialized, sortString]);

    useEffect(() => {
        if (!router.isReady || filtersInitialized) {
            return;
        }

        const getQueryValue = (value) => (Array.isArray(value) ? value[0] : value);
        const q = router.query;
        const { brands, categories, suppliers, terms, purchases, searchText, stockStatus } = q;

        if (brands) setSelectedBrand(getQueryValue(brands));
        if (categories) setSelectedCategory(getQueryValue(categories));
        if (suppliers) setSelectedSupplier(getQueryValue(suppliers));
        if (terms) setSelectedTerm(getQueryValue(terms));
        if (purchases) setSelectedPurchase(getQueryValue(purchases));
        if (searchText) setSearchText(getQueryValue(searchText));
        if (stockStatus) setStockStatus(getQueryValue(stockStatus));
        if (getQueryValue(q.missingContent) === "1") setMissingContent(true);
        if (getQueryValue(q.missingLogo) === "1") setMissingLogo(true);
        if (getQueryValue(q.missingGallery) === "1") setMissingGallery(true);
        if (q.priceMin || q.priceMax) setPriceRange({ min: getQueryValue(q.priceMin) || "", max: getQueryValue(q.priceMax) || "" });
        if (q.createdFrom || q.createdTo) setCreatedRange({ from: getQueryValue(q.createdFrom) || "", to: getQueryValue(q.createdTo) || "" });
        if (q.updatedFrom || q.updatedTo) setUpdatedRange({ from: getQueryValue(q.updatedFrom) || "", to: getQueryValue(q.updatedTo) || "" });

        setFiltersInitialized(true);
    }, [router.isReady, router.query, filtersInitialized]);

    useEffect(() => {
        if (!filtersInitialized) return;

        const updatedFilters = {
            brands: [selectedBrand],
            categories: [selectedCategory],
            suppliers: [selectedSupplier],
            terms: [selectedTerm],
            purchases: [selectedPurchase],
            stockStatus,
            searchText,
            parentOnly: true
        };
        if (missingContent) updatedFilters.missingContent = true;
        if (missingLogo) updatedFilters.missingLogo = true;
        if (missingGallery) updatedFilters.missingGallery = true;
        if (priceRange.min) updatedFilters.priceMin = priceRange.min;
        if (priceRange.max) updatedFilters.priceMax = priceRange.max;
        if (createdRange.from) updatedFilters.createdFrom = createdRange.from;
        if (createdRange.to) updatedFilters.createdTo = createdRange.to;
        if (updatedRange.from) updatedFilters.updatedFrom = updatedRange.from;
        if (updatedRange.to) updatedFilters.updatedTo = updatedRange.to;

        const query = {};
        if (selectedBrand) query.brands = selectedBrand;
        if (selectedCategory) query.categories = selectedCategory;
        if (selectedSupplier) query.suppliers = selectedSupplier;
        if (selectedTerm) query.terms = selectedTerm;
        if (selectedPurchase) query.purchases = selectedPurchase;
        if (searchText) query.searchText = searchText;
        if (stockStatus) query.stockStatus = stockStatus;
        if (missingContent) query.missingContent = "1";
        if (missingLogo) query.missingLogo = "1";
        if (missingGallery) query.missingGallery = "1";
        if (priceRange.min) query.priceMin = priceRange.min;
        if (priceRange.max) query.priceMax = priceRange.max;
        if (createdRange.from) query.createdFrom = createdRange.from;
        if (createdRange.to) query.createdTo = createdRange.to;
        if (updatedRange.from) query.updatedFrom = updatedRange.from;
        if (updatedRange.to) query.updatedTo = updatedRange.to;
        router.replace({ pathname: router.pathname, query }, undefined, { shallow: true });

        for (const [key, value] of Object.entries(updatedFilters)) {
            if (Array.isArray(value)) {
                updatedFilters[key] = value.filter((v) => v);
                if (updatedFilters[key].length === 0) {
                    delete updatedFilters[key];
                }
            }
        }

        setFilters(updatedFilters);
        setPage(1);
    }, [selectedBrand, selectedCategory, selectedSupplier, selectedTerm, selectedPurchase, stockStatus, searchText, missingContent, missingLogo, missingGallery, priceRange, createdRange, updatedRange, filtersInitialized]);

    const toggleVariants = async (product) => {
        const docId = product.documentId;
        if (expandedProducts[docId]) {
            setExpandedProducts(prev => ({ ...prev, [docId]: false }));
            return;
        }
        if (!variantsMap[docId]) {
            setLoadingVariants(prev => ({ ...prev, [docId]: true }));
            try {
                const res = await ProductsEndpoints.byParent(docId, {
                    pageSize: 100,
                    populate: {
                        logo: true,
                        categories: true,
                        brands: true,
                        suppliers: true,
                        purchase_items: { populate: { purchase: true } },
                    },
                });
                setVariantsMap(prev => ({ ...prev, [docId]: res.data || [] }));
            } catch (err) {
                console.error("Failed to load variants", err);
            } finally {
                setLoadingVariants(prev => ({ ...prev, [docId]: false }));
            }
        }
        setExpandedProducts(prev => ({ ...prev, [docId]: true }));
    };

    const bulkEditHref = `/products-bulk-edit${(() => {
        const params = new URLSearchParams();
        if (selectedBrand) params.set('brands', selectedBrand);
        if (selectedCategory) params.set('categories', selectedCategory);
        if (selectedSupplier) params.set('suppliers', selectedSupplier);
        if (selectedTerm) params.set('terms', selectedTerm);
        if (selectedPurchase) params.set('purchases', selectedPurchase);
        if (searchText) params.set('searchText', searchText);
        if (stockStatus) params.set('stockStatus', stockStatus);
        const qs = params.toString();
        return qs ? '?' + qs : '';
    })()}`;

    const headerActions = (
        <>
            <PermissionCheck showIf="admin">
                <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm"
                    onClick={handleSyncStock}
                    disabled={syncingStock}
                    title="Rebuild product.stock_quantity from the live InStock count (admin only, idempotent)"
                >
                    {syncingStock ? (
                        <><span className="spinner-border spinner-border-sm me-1" />Syncing…</>
                    ) : (
                        <><i className="fas fa-sync-alt me-1" /> Sync Stock</>
                    )}
                </button>
            </PermissionCheck>
            <Link href={bulkEditHref} className="btn btn-outline-warning btn-sm">
                <i className="fas fa-pen-square me-1" /> Bulk Edit
            </Link>
            <AddButton label="New Product" href="/new/product" />
        </>
    );

    const bulkActions = (
        <BulkProductActions
            selectedIds={selectedIds}
            categories={categories}
            brands={brands}
            suppliers={suppliers}
            onAssigned={handleBulkAssigned}
            onComplete={() => setSelectedIds(new Set())}
            toast={bulkToast}
            showPublish={false}
        />
    );

    return (
        <ProtectedRoute>
            <PermissionCheck required="stock">
                <Layout>
                    {bulkMessage && (
                        <div className={`alert alert-${bulkMessage.variant} alert-dismissible fade show py-2 mx-3 mt-3 mb-0`} role="alert">
                            {bulkMessage.message}
                            <button type="button" className="btn-close" onClick={() => setBulkMessage(null)}></button>
                        </div>
                    )}
                    <ListPageLayout
                        title="Products"
                        subtitle={total != null ? `${total} total` : undefined}
                        headerActions={headerActions}
                        filters={
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
                                onPurchaseChange={setSelectedPurchase}
                                onSearchTextChange={setSearchText}
                                extra={[
                                    {
                                        key: "stockStatus",
                                        type: "select",
                                        label: "Stock",
                                        value: stockStatus || "",
                                        onChange: (v) => setStockStatus(v || false),
                                        placeholder: "All stock",
                                        options: [
                                            { value: "inStock", label: "In stock" },
                                            { value: "outOfStock", label: "Out of stock" },
                                            { value: "low", label: "Low stock" },
                                        ],
                                    },
                                    {
                                        key: "price",
                                        type: "number-range",
                                        label: "Price",
                                        value: priceRange,
                                        onChange: setPriceRange,
                                    },
                                    {
                                        key: "created",
                                        type: "date-range",
                                        label: "Created",
                                        value: createdRange,
                                        onChange: setCreatedRange,
                                    },
                                    {
                                        key: "modified",
                                        type: "date-range",
                                        label: "Modified",
                                        value: updatedRange,
                                        onChange: setUpdatedRange,
                                    },
                                    {
                                        key: "missingContent",
                                        type: "toggle",
                                        label: "Missing content",
                                        value: missingContent,
                                        onChange: setMissingContent,
                                    },
                                    {
                                        key: "missingLogo",
                                        type: "toggle",
                                        label: "Missing logo",
                                        value: missingLogo,
                                        onChange: setMissingLogo,
                                    },
                                    {
                                        key: "missingGallery",
                                        type: "toggle",
                                        label: "Missing gallery",
                                        value: missingGallery,
                                        onChange: setMissingGallery,
                                    },
                                ]}
                            />
                        }
                        bulkActions={bulkActions}
                        selectedCount={selectedIds.size}
                        loading={loading}
                        pagination={
                            <ListPagination
                                page={page}
                                pageSize={pageSize}
                                total={total}
                                onPage={setPage}
                                onPageSize={(n) => { setPageSize(n); setPage(1); }}
                            />
                        }
                        emptyState={<div>No products found.</div>}
                    >
                        <div className="table-responsive">
                            <table className="table table-hover list-table">
                                <thead>
                                    <tr>
                                        <th style={{ width: 30 }}>
                                            <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} title="Select all" />
                                        </th>
                                        <th style={{ width: 30 }}></th>
                                        <SortableTh label="id" field="id" sortField={sortField} sortDir={sortOrder} onSort={handleSort} />
                                        <th>Logo</th>
                                        <SortableTh label="Product Name" field="name" sortField={sortField} sortDir={sortOrder} onSort={handleSort} />
                                        <SortableTh label="Modified" field="updatedAt" sortField={sortField} sortDir={sortOrder} onSort={handleSort} />
                                        <SortableTh label="Barcode" field="barcode" sortField={sortField} sortDir={sortOrder} onSort={handleSort} />
                                        <SortableTh label="SKU" field="sku" sortField={sortField} sortDir={sortOrder} onSort={handleSort} />
                                        <th>Suppliers</th>
                                        <th>Purchase #</th>
                                        <SortableTh label="Offer Price" field="offer_price" sortField={sortField} sortDir={sortOrder} onSort={handleSort} align="right" />
                                        <SortableTh label="Selling Price" field="selling_price" sortField={sortField} sortDir={sortOrder} onSort={handleSort} align="right" />
                                        <SortableTh label="Stock Quantity" field="stock_quantity" sortField={sortField} sortDir={sortOrder} onSort={handleSort} align="right" />
                                        <SortableTh label="Status" field="status" sortField={sortField} sortDir={sortOrder} onSort={handleSort} />
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {products.length === 0 ? (
                                        <tr>
                                            <td colSpan={15} className="text-center text-muted py-4">
                                                No products found.
                                            </td>
                                        </tr>
                                    ) : (
                                        products.map((product) => (
                                            <Fragment key={product.id}>
                                                <tr>
                                                    <td>
                                                        <input type="checkbox" checked={selectedIds.has(product.documentId)} onChange={() => toggleSelected(product.documentId)} />
                                                    </td>
                                                    <td>
                                                        <button
                                                            onClick={() => toggleVariants(product)}
                                                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                                                            title="Show/hide variants"
                                                        >
                                                            <i className={`fas fa-chevron-${expandedProducts[product.documentId] ? 'down' : 'right'}`}></i>
                                                        </button>
                                                    </td>
                                                    <td title={product.documentId}>{product.id}</td>
                                                    <td>
                                                        {product.logo?.url ? (
                                                            <img
                                                                src={MediaUtilsEndpoints.strapiImageUrl(product.logo)}
                                                                alt={product.name}
                                                                style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 4 }}
                                                            />
                                                        ) : (
                                                            <span style={{ color: '#999' }}><i className="fas fa-image"></i></span>
                                                        )}
                                                    </td>
                                                    <td>
                                                        <Link href={`/${product.documentId ?? product.id}/product-edit`}><strong>{product.name}</strong></Link>
                                                    </td>
                                                    <td className="text-nowrap small text-muted" title={product.updatedAt}>
                                                        {product.updatedAt ? new Date(product.updatedAt).toLocaleDateString() : '—'}
                                                    </td>
                                                    <td>{product.barcode}</td>
                                                    <td>{product.sku}</td>
                                                    <td>{product.suppliers?.map(s => s.name)}</td>
                                                    <td>
                                                        {(product.purchase_items || []).map(pi => pi.purchase?.orderId).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).map((orderId, i) => (
                                                            <span key={i}>{i > 0 && ', '}<Link href={`/${product.purchase_items.find(pi => pi.purchase?.orderId === orderId)?.purchase?.documentId}/purchase-view`}>{orderId}</Link></span>
                                                        ))}
                                                    </td>
                                                    <td className="text-end">{currency}{product.offer_price}</td>
                                                    <td className="text-end">{currency}{product.selling_price}</td>
                                                    <td className="text-end">{product.stock_quantity}</td>
                                                    <td>{product.status}</td>
                                                    <td>
                                                        <div className="list-actions btn-group btn-group-sm">
                                                            <Link href={`/${product.documentId ?? product.id}/product-edit`} className="btn btn-outline-primary" title="Edit product details">
                                                                <i className="fas fa-edit"></i>
                                                            </Link>
                                                            <Link href={`/${product.documentId ?? product.id}/product-stock-items`} className="btn btn-outline-info" title="Stock">
                                                                <i className="fas fa-boxes"></i>
                                                            </Link>
                                                            <Link href={`/${product.documentId ?? product.id}/product-variants`} className="btn btn-outline-warning" title="Variants">
                                                                <i className="fas fa-layer-group"></i>
                                                            </Link>
                                                            <Link href={`/${product.documentId ?? product.id}/product-relations`} className="btn btn-outline-secondary" title="Merge & relations">
                                                                <i className="fas fa-compress-arrows-alt"></i>
                                                            </Link>
                                                        </div>
                                                    </td>
                                                </tr>
                                                {expandedProducts[product.documentId] && (
                                                    loadingVariants[product.documentId] ? (
                                                        <tr>
                                                            <td colSpan={15} className="text-center">
                                                                <CircularProgress size={16} /> Loading variants...
                                                            </td>
                                                        </tr>
                                                    ) : (variantsMap[product.documentId] || []).length === 0 ? (
                                                        <tr>
                                                            <td colSpan={15} className="text-center" style={{ color: '#999', fontStyle: 'italic' }}>
                                                                No variants
                                                            </td>
                                                        </tr>
                                                    ) : (
                                                        (variantsMap[product.documentId] || []).map(v => (
                                                            <tr key={`variant-${v.id}`} style={{ background: '#f8f9fa' }}>
                                                                <td></td>
                                                                <td></td>
                                                                <td title={v.documentId}>{v.id}</td>
                                                                <td>
                                                                    {v.logo?.url ? (
                                                                        <img
                                                                            src={MediaUtilsEndpoints.strapiImageUrl(v.logo)}
                                                                            alt={v.name}
                                                                            style={{ width: 30, height: 30, objectFit: "cover", borderRadius: 4 }}
                                                                        />
                                                                    ) : (
                                                                        <span style={{ color: '#999' }}><i className="fas fa-image" style={{ fontSize: '0.8em' }}></i></span>
                                                                    )}
                                                                </td>
                                                                <td>
                                                                    <span style={{ paddingLeft: 16 }}>
                                                                        <i className="fas fa-level-up-alt fa-rotate-90" style={{ fontSize: '0.8em', marginRight: 4, color: '#999' }}></i>
                                                                        <Link href={`/${v.documentId ?? v.id}/product-edit`}>{v.name}</Link>
                                                                    </span>
                                                                </td>
                                                                <td className="text-nowrap small text-muted" title={v.updatedAt}>
                                                                    {v.updatedAt ? new Date(v.updatedAt).toLocaleDateString() : '—'}
                                                                </td>
                                                                <td>{v.barcode}</td>
                                                                <td>{v.sku}</td>
                                                                <td>{v.suppliers?.map(s => s.name)}</td>
                                                                <td>
                                                                    {(v.purchase_items || []).map(pi => pi.purchase?.orderId).filter(Boolean).filter((val, i, a) => a.indexOf(val) === i).map((orderId, i) => (
                                                                        <span key={i}>{i > 0 && ', '}<Link href={`/${v.purchase_items.find(pi => pi.purchase?.orderId === orderId)?.purchase?.documentId}/purchase-view`}>{orderId}</Link></span>
                                                                    ))}
                                                                </td>
                                                                <td className="text-end">{currency}{v.offer_price}</td>
                                                                <td className="text-end">{currency}{v.selling_price}</td>
                                                                <td className="text-end">{v.stock_quantity}</td>
                                                                <td>{v.status}</td>
                                                                <td>
                                                                    <div className="list-actions btn-group btn-group-sm">
                                                                        <Link href={`/${v.documentId ?? v.id}/product-edit`} className="btn btn-outline-primary" title="Edit variant details">
                                                                            <i className="fas fa-edit"></i>
                                                                        </Link>
                                                                        <Link href={`/${v.documentId ?? v.id}/product-stock-items`} className="btn btn-outline-info" title="Stock">
                                                                            <i className="fas fa-boxes"></i>
                                                                        </Link>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        ))
                                                    )
                                                )}
                                            </Fragment>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </ListPageLayout>
                </Layout>
            </PermissionCheck>
        </ProtectedRoute>
    );
}
