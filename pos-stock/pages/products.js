import { useEffect, useState, useCallback, Fragment } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { CircularProgress } from "@rutba/pos-shared/components/Table";
import Layout from "../components/Layout";
import ProductCard from "@rutba/pos-shared/components/ProductCard";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import PermissionCheck from "@rutba/pos-shared/components/PermissionCheck";
import { MediaUtilsEndpoints, ProductsEndpoints, BrandsEndpoints, CategoriesEndpoints, SuppliersEndpoints, PurchasesEndpoints, TermTypesEndpoints } from "@rutba/api-provider/endpoints";
import { fetchProducts } from "@rutba/api-provider/pos";
import { ProductFilter } from "@rutba/pos-shared/components/filter/product-filter";
import { useUtil } from "@rutba/pos-shared/context/UtilContext";
import BulkProductActions from "@rutba/pos-shared/components/BulkProductActions";
import ListPageLayout, { AddButton } from "@rutba/pos-shared/components/ListPageLayout";
import ListPagination from "@rutba/pos-shared/components/ListPagination";

function SortableTh({ label, field, sortField, sortOrder, onSort, align, style }) {
    const isActive = sortField === field;
    const arrow = isActive ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : '';
    return (
        <th
            style={{ cursor: 'pointer', userSelect: 'none', textAlign: align, ...style }}
            onClick={() => onSort(field)}
        >
            {label}{arrow}
        </th>
    );
}

export default function Products() {
    const router = useRouter();
    const [products, setProducts] = useState([]);
    const { currency } = useUtil();
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [filters, setFilters] = useState({});
    const [brands, setBrands] = useState([]);
    const [categories, setCategories] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [termTypes, setTermTypes] = useState([]);
    const [purchases, setPurchases] = useState([]);
    const [selectedBrand, setSelectedBrand] = useState("");
    const [selectedCategory, setSelectedCategory] = useState("");
    const [selectedSupplier, setSelectedSupplier] = useState("");
    const [selectedTerm, setSelectedTerm] = useState("");
    const [selectedPurchase, setSelectedPurchase] = useState("");
    const [stockStatus, setStockStatus] = useState(false);
    const [searchText, setSearchText] = useState("");
    const [filtersInitialized, setFiltersInitialized] = useState(false);
    const [sortField, setSortField] = useState('id');
    const [sortOrder, setSortOrder] = useState('desc');
    const [expandedProducts, setExpandedProducts] = useState({});
    const [variantsMap, setVariantsMap] = useState({});
    const [loadingVariants, setLoadingVariants] = useState({});
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [bulkMessage, setBulkMessage] = useState(null);

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
        Promise.all([
            BrandsEndpoints.listAll(),
            CategoriesEndpoints.listAll(),
            SuppliersEndpoints.listAll(),
            TermTypesEndpoints.listWithTerms(),
            PurchasesEndpoints.list(1, 100, { sort: ['createdAt:desc'] }),
        ]).then(([b, c, s, t, p]) => {
            setBrands(b?.data || b || []);
            setCategories(c?.data || c || []);
            setSuppliers(s?.data || s || []);
            setTermTypes(t?.data || t || []);
            setPurchases(p?.data || p || []);
        });
    }, []);

    useEffect(() => {
        if (!router.isReady || filtersInitialized) {
            return;
        }

        const getQueryValue = (value) => (Array.isArray(value) ? value[0] : value);
        const { brands, categories, suppliers, terms, purchases, searchText, stockStatus } = router.query;

        if (brands) setSelectedBrand(getQueryValue(brands));
        if (categories) setSelectedCategory(getQueryValue(categories));
        if (suppliers) setSelectedSupplier(getQueryValue(suppliers));
        if (terms) setSelectedTerm(getQueryValue(terms));
        if (purchases) setSelectedPurchase(getQueryValue(purchases));
        if (searchText) setSearchText(getQueryValue(searchText));
        if (stockStatus) setStockStatus(getQueryValue(stockStatus));

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

        const query = {};
        if (selectedBrand) query.brands = selectedBrand;
        if (selectedCategory) query.categories = selectedCategory;
        if (selectedSupplier) query.suppliers = selectedSupplier;
        if (selectedTerm) query.terms = selectedTerm;
        if (selectedPurchase) query.purchases = selectedPurchase;
        if (searchText) query.searchText = searchText;
        if (stockStatus) query.stockStatus = stockStatus;
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
    }, [selectedBrand, selectedCategory, selectedSupplier, selectedTerm, selectedPurchase, stockStatus, searchText, filtersInitialized]);

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
                                        <SortableTh label="id" field="id" sortField={sortField} sortOrder={sortOrder} onSort={handleSort} />
                                        <SortableTh label="Product Name" field="name" sortField={sortField} sortOrder={sortOrder} onSort={handleSort} />
                                        <th>Logo</th>
                                        <SortableTh label="Barcode" field="barcode" sortField={sortField} sortOrder={sortOrder} onSort={handleSort} />
                                        <SortableTh label="SKU" field="sku" sortField={sortField} sortOrder={sortOrder} onSort={handleSort} />
                                        <th>Suppliers</th>
                                        <th>Purchase #</th>
                                        <SortableTh label="Offer Price" field="offer_price" sortField={sortField} sortOrder={sortOrder} onSort={handleSort} align="right" />
                                        <SortableTh label="Selling Price" field="selling_price" sortField={sortField} sortOrder={sortOrder} onSort={handleSort} align="right" />
                                        <SortableTh label="Stock Quantity" field="stock_quantity" sortField={sortField} sortOrder={sortOrder} onSort={handleSort} align="right" />
                                        <SortableTh label="Status" field="status" sortField={sortField} sortOrder={sortOrder} onSort={handleSort} />
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {products.length === 0 ? (
                                        <tr>
                                            <td colSpan={14} className="text-center text-muted py-4">
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
                                                        <Link href={`/${product.documentId ?? product.id}/product-edit`}><strong>{product.name}</strong></Link>
                                                    </td>
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
                                                        <div className="list-actions">
                                                            <Link href={`/${product.documentId ?? product.id}/product-edit`} className="btn btn-sm btn-outline-primary" title="Edit">
                                                                <i className="fas fa-edit"></i>
                                                            </Link>
                                                            <Link href={`/${product.documentId ?? product.id}/product-stock-items`} className="btn btn-sm btn-outline-info" title="Stock Control">
                                                                <i className="fas fa-boxes"></i>
                                                            </Link>
                                                            <Link href={`/${product.documentId ?? product.id}/product-variants`} className="btn btn-sm btn-outline-warning" title="Variants">
                                                                <i className="fas fa-layer-group"></i>
                                                            </Link>
                                                            <Link href={`/stock-items?product=${product.documentId ?? product.id}`} className="btn btn-sm btn-outline-dark" title="Stock Items">
                                                                <i className="fas fa-barcode"></i>
                                                            </Link>
                                                            <Link href={`/${product.documentId ?? product.id}/product-relations`} className="btn btn-sm btn-outline-danger" title="Relations & Merge">
                                                                <i className="fas fa-compress-arrows-alt"></i>
                                                            </Link>
                                                        </div>
                                                    </td>
                                                </tr>
                                                {expandedProducts[product.documentId] && (
                                                    loadingVariants[product.documentId] ? (
                                                        <tr>
                                                            <td colSpan={14} className="text-center">
                                                                <CircularProgress size={16} /> Loading variants...
                                                            </td>
                                                        </tr>
                                                    ) : (variantsMap[product.documentId] || []).length === 0 ? (
                                                        <tr>
                                                            <td colSpan={14} className="text-center" style={{ color: '#999', fontStyle: 'italic' }}>
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
                                                                    <span style={{ paddingLeft: 16 }}>
                                                                        <i className="fas fa-level-up-alt fa-rotate-90" style={{ fontSize: '0.8em', marginRight: 4, color: '#999' }}></i>
                                                                        <Link href={`/${v.documentId ?? v.id}/product-edit`}>{v.name}</Link>
                                                                    </span>
                                                                </td>
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
                                                                    <div className="list-actions">
                                                                        <Link href={`/${v.documentId ?? v.id}/product-edit`} className="btn btn-sm btn-outline-primary" title="Edit">
                                                                            <i className="fas fa-edit"></i>
                                                                        </Link>
                                                                        <Link href={`/${v.documentId ?? v.id}/product-stock-items`} className="btn btn-sm btn-outline-info" title="Stock Control">
                                                                            <i className="fas fa-boxes"></i>
                                                                        </Link>
                                                                        <Link href={`/stock-items?product=${v.documentId ?? v.id}`} className="btn btn-sm btn-outline-dark" title="Stock Items">
                                                                            <i className="fas fa-barcode"></i>
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
