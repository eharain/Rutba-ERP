import { useState, useEffect, useCallback, useMemo, Fragment } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { MediaUtilsEndpoints, ProductsEndpoints, fetchProducts } from "@rutba/api-provider/endpoints";
import { useProductLookups } from "@rutba/pos-shared/hooks/useProductLookups";
import { useUtil } from "@rutba/pos-shared/context/UtilContext";
import { ProductFilter } from "@rutba/pos-shared/components/filter/product-filter";
import Link from "next/link";
import { useToast } from "../components/Toast";
import BulkProductActions from "@rutba/pos-shared/components/BulkProductActions";
import ListPageLayout, { AddButton } from "@rutba/pos-shared/components/ListPageLayout";
import ListPagination from "@rutba/pos-shared/components/ListPagination";
import { SortableTh } from "@rutba/pos-shared/components/Table";
import ExcelIO from "../components/ExcelIO";
import { SEO_EXCEL_COLUMNS, SEO_POPULATE, makeSeoUpsert } from "../components/seoExcel";
import { buildProductWebUrl } from "../lib/cmsPageWebUrl";

const PRODUCT_EXCEL_COLUMNS = [
    { key: "name", isLabel: true, width: 40 },
    { key: "slug", width: 30 },
    { key: "sku", width: 22 },
    { key: "barcode", width: 22 },
    {
        // Read-only display column: shows the variant's parent so reviewers
        // can group rows by parent in Excel. Import ignores this column —
        // parent linkage is not changed via spreadsheet.
        key: "parent",
        header: "parent",
        width: 40,
        readOnly: true,
        format: (r) => {
            const p = r?.parent;
            if (!p) return "";
            const id = p.documentId || "";
            const name = p.name || "";
            if (id && name) return `${id} | ${name}`;
            return id || name || "";
        },
    },
    { key: "summary", width: 60 },
    { key: "description", width: 90 },
    ...SEO_EXCEL_COLUMNS,
];

const DEFAULT_PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = [5, 10, 25, 50, 100, 150, 200];
const DEFAULT_SORT_FIELD = "createdAt";
const DEFAULT_SORT_DIR = "desc";
const SORTABLE_FIELDS = new Set(["name", "sku", "selling_price", "stock_quantity", "updatedAt", "createdAt"]);

export default function Products() {
    const router = useRouter();
    const { jwt } = useAuth();
    const { currency } = useUtil();

    // --- product list results ---
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [pageCount, setPageCount] = useState(1);
    const [total, setTotal] = useState(0);

    // --- lookup data (fetched once) ---
    const { brands, categories, suppliers, termTypes, purchases } = useProductLookups();

    // --- variant expansion ---
    const [expandedProducts, setExpandedProducts] = useState({});
    const [variantsMap, setVariantsMap] = useState({});
    const [loadingVariants, setLoadingVariants] = useState({});

    // --- toast ---
    const { toast, ToastContainer } = useToast();

    // --- selection & bulk operations ---
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [publishing, setPublishing] = useState({});

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

    const publishOne = async (docId) => {
        setPublishing(prev => ({ ...prev, [docId]: true }));
        try {
            await ProductsEndpoints.publish(docId);
            const now = new Date().toISOString();
            setProducts(prev => prev.map(p => p.documentId === docId ? { ...p, _isPublished: true, _publishedAt: now } : p));
            setVariantsMap(prev => {
                const copy = { ...prev };
                for (const key of Object.keys(copy)) {
                    copy[key] = copy[key].map(v => v.documentId === docId ? { ...v, _isPublished: true, _publishedAt: now } : v);
                }
                return copy;
            });
            toast("Published!", "success");
        } catch (err) {
            console.error("Failed to publish", err);
            toast("Failed to publish.", "danger");
        } finally {
            setPublishing(prev => ({ ...prev, [docId]: false }));
        }
    };

    const unpublishOne = async (docId) => {
        setPublishing(prev => ({ ...prev, [docId]: true }));
        try {
            await ProductsEndpoints.unpublish(docId);
            setProducts(prev => prev.map(p => p.documentId === docId ? { ...p, _isPublished: false, _publishedAt: null } : p));
            setVariantsMap(prev => {
                const copy = { ...prev };
                for (const key of Object.keys(copy)) {
                    copy[key] = copy[key].map(v => v.documentId === docId ? { ...v, _isPublished: false, _publishedAt: null } : v);
                }
                return copy;
            });
            toast("Unpublished.", "success");
        } catch (err) {
            console.error("Failed to unpublish", err);
            toast("Failed to unpublish.", "danger");
        } finally {
            setPublishing(prev => ({ ...prev, [docId]: false }));
        }
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

    const handleBulkPublished = (docId) => {
        const now = new Date().toISOString();
        setProducts(prev => prev.map(p => p.documentId === docId ? { ...p, _isPublished: true, _publishedAt: now } : p));
        setVariantsMap(prev => {
            const copy = { ...prev };
            for (const key of Object.keys(copy)) {
                copy[key] = copy[key].map(v => v.documentId === docId ? { ...v, _isPublished: true, _publishedAt: now } : v);
            }
            return copy;
        });
    };

    const handleBulkUnpublished = (docId) => {
        setProducts(prev => prev.map(p => p.documentId === docId ? { ...p, _isPublished: false, _publishedAt: null } : p));
        setVariantsMap(prev => {
            const copy = { ...prev };
            for (const key of Object.keys(copy)) {
                copy[key] = copy[key].map(v => v.documentId === docId ? { ...v, _isPublished: false, _publishedAt: null } : v);
            }
            return copy;
        });
    };

    // --- derive ALL filter & page state from the URL ---
    const qVal = (v) => (Array.isArray(v) ? v[0] : v) || "";
    const selectedBrand = qVal(router.query.brands);
    const selectedCategory = qVal(router.query.categories);
    const selectedSupplier = qVal(router.query.suppliers);
    const selectedTerm = qVal(router.query.terms);
    const selectedPurchase = qVal(router.query.purchases);
    const searchText = qVal(router.query.searchText);
    const page = parseInt(router.query.page, 10) || 1;
    const pageSize = parseInt(router.query.pageSize, 10) || DEFAULT_PAGE_SIZE;
    const sortField = SORTABLE_FIELDS.has(qVal(router.query.sortField)) ? qVal(router.query.sortField) : DEFAULT_SORT_FIELD;
    const sortDir = qVal(router.query.sortDir) || DEFAULT_SORT_DIR;

    // helper: merge params into the current URL (falsy values are removed)
    const updateQuery = useCallback((params) => {
        const merged = { ...router.query, ...params };
        const cleaned = {};
        for (const [k, v] of Object.entries(merged)) {
            if (v != null && v !== "" && v !== undefined) cleaned[k] = String(v);
        }
        router.push({ pathname: router.pathname, query: cleaned }, undefined, { shallow: true });
    }, [router]);

    const handleSort = useCallback((field) => {
        const newDir = sortField === field && sortDir === "asc" ? "desc" : "asc";
        updateQuery({ sortField: field === DEFAULT_SORT_FIELD && newDir === DEFAULT_SORT_DIR ? undefined : field, sortDir: newDir === DEFAULT_SORT_DIR && field === DEFAULT_SORT_FIELD ? undefined : newDir, page: undefined });
    }, [sortField, sortDir, updateQuery]);

    // single effect: fetch products whenever URL params or jwt change
    useEffect(() => {
        if (!router.isReady || !jwt) return;

        const filters = { parentOnly: true, status: "draft", searchText, populate: SEO_POPULATE };
        if (selectedBrand) filters.brands = [selectedBrand];
        if (selectedCategory) filters.categories = [selectedCategory];
        if (selectedSupplier) filters.suppliers = [selectedSupplier];
        if (selectedTerm) filters.terms = [selectedTerm];
        if (selectedPurchase) filters.purchases = [selectedPurchase];

        let cancelled = false;
        setLoading(true);

        fetchProducts(filters, page, pageSize, `${sortField}:${sortDir}`)
            .then(async (productRes) => {
                if (cancelled) return;
                const draftProducts = productRes.data || [];
                // Check published status only for the current page's products
                let pubMap = {};
                if (draftProducts.length > 0) {
                    const docIds = draftProducts.map(p => p.documentId);
                    try {
                        const pubRes = await ProductsEndpoints.list(1, docIds.length, {
                            status: "published",
                            fields: ["documentId", "publishedAt"],
                            filters: { documentId: { $in: docIds } },
                        });
                        for (const p of (pubRes.data || [])) {
                            pubMap[p.documentId] = p.publishedAt;
                        }
                    } catch (err) {
                        console.error("Failed to check published status", err);
                    }
                }
                setProducts(draftProducts.map(p => ({ ...p, _isPublished: !!pubMap[p.documentId], _publishedAt: pubMap[p.documentId] || null })));
                setPageCount(productRes.meta?.pagination?.pageCount ?? 1);
                setTotal(productRes.meta?.pagination?.total ?? 0);
            }).catch(err => {
                if (cancelled) return;
                console.error("Failed to load products", err);
            }).finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => { cancelled = true; };
    }, [router.isReady, jwt, page, pageSize, selectedBrand, selectedCategory, selectedSupplier, selectedTerm, selectedPurchase, searchText, sortField, sortDir]);

    const setPage = (p) => updateQuery({ page: p > 1 ? p : undefined });
    const setPageSize = (s) => updateQuery({ pageSize: s, page: undefined });

    // Rows passed to ExcelIO. Includes any expanded variants (with parent
    // synthesised from the parent product on this page) so "current page" and
    // "selected" exports carry the variant rows the user has loaded.
    const productsForExport = useMemo(() => {
        const out = [];
        for (const p of products) {
            out.push(p);
            const variants = variantsMap[p.documentId];
            if (Array.isArray(variants) && variants.length > 0) {
                const parentRef = { documentId: p.documentId, name: p.name };
                for (const v of variants) out.push({ ...v, parent: v.parent || parentRef });
            }
        }
        return out;
    }, [products, variantsMap]);

    const findExistingProduct = useCallback(async (row) => {
        // Slug is the canonical natural key now (public URLs depend on it);
        // SKU stays as a fallback for legacy sheets that don't carry slug yet.
        const lookups = [];
        if (row.slug) lookups.push({ slug: { $eq: row.slug } });
        if (row.sku) lookups.push({ sku: { $eq: row.sku } });
        if (lookups.length === 0) return null;
        for (const filters of lookups) {
            try {
                const res = await ProductsEndpoints.list(1, 1, {
                    status: "draft",
                    filters,
                    populate: SEO_POPULATE,
                });
                if (res.data?.[0]) return res.data[0];
            } catch { /* try next lookup */ }
        }
        return null;
    }, []);

    const fetchAllProducts = useCallback(async () => {
        // "All" mode includes variants — drop parentOnly so they're emitted.
        // The `parent` column on each row identifies which parent product a
        // variant belongs to.
        const filters = {
            status: "draft",
            searchText,
            populate: { parent: { fields: ["documentId", "name"] }, ...SEO_POPULATE },
        };
        if (selectedBrand) filters.brands = [selectedBrand];
        if (selectedCategory) filters.categories = [selectedCategory];
        if (selectedSupplier) filters.suppliers = [selectedSupplier];
        if (selectedTerm) filters.terms = [selectedTerm];
        if (selectedPurchase) filters.purchases = [selectedPurchase];
        // Strapi caps pageSize at 100, so a PAGE > 100 quietly returns 100
        // and the loop's `arr.length < PAGE` check breaks early — that was
        // capping "All" exports at 100 rows. Use 100 to match the server max
        // and only stop when a page comes back short (or empty).
        const out = [];
        let p = 1;
        const PAGE = 100;
        while (true) {
            const res = await fetchProducts(filters, p, PAGE, `${sortField}:${sortDir}`);
            const arr = res.data || [];
            out.push(...arr);
            if (arr.length < PAGE) break;
            p += 1;
            if (p > 500) break; // safety stop ~50k rows
        }
        return out;
    }, [searchText, selectedBrand, selectedCategory, selectedSupplier, selectedTerm, selectedPurchase, sortField, sortDir]);

    const toggleVariants = async (product) => {
        const docId = product.documentId;
        if (expandedProducts[docId]) {
            setExpandedProducts(prev => ({ ...prev, [docId]: false }));
            return;
        }
        if (!variantsMap[docId]) {
            setLoadingVariants(prev => ({ ...prev, [docId]: true }));
            try {
                const res = await ProductsEndpoints.list(1, 100, {
                    status: "draft",
                    filters: { parent: { documentId: docId } },
                    populate: { logo: true, categories: true, brands: true, purchase_items: { populate: ["purchase"] } },
                });
                const pubRes = await ProductsEndpoints.list(1, 100, {
                    status: "published",
                    filters: { parent: { documentId: docId } },
                    fields: ["documentId", "publishedAt"],
                });
                const varPubMap = {};
                for (const pv of (pubRes.data || [])) {
                    varPubMap[pv.documentId] = pv.publishedAt;
                }
                setVariantsMap(prev => ({
                    ...prev,
                    [docId]: (res.data || []).map(v => ({ ...v, _isPublished: !!varPubMap[v.documentId], _publishedAt: varPubMap[v.documentId] || null })),
                }));
            } catch (err) {
                console.error("Failed to load variants", err);
            } finally {
                setLoadingVariants(prev => ({ ...prev, [docId]: false }));
            }
        }
        setExpandedProducts(prev => ({ ...prev, [docId]: true }));
    };

    return (
        <ProtectedRoute>
            <Layout>
                <ToastContainer />
                <ListPageLayout
                    title="Products"
                    subtitle={`${total} products found`}
                    headerActions={
                        <>
                            <ExcelIO
                                entityLabel="Products"
                                contentType="api::product.product"
                                columns={PRODUCT_EXCEL_COLUMNS}
                                rows={productsForExport}
                                selectedIds={selectedIds}
                                total={total}
                                fetchAll={fetchAllProducts}
                                findExisting={findExistingProduct}
                                create={(data) => ProductsEndpoints.create(data)}
                                update={(documentId, data) => ProductsEndpoints.update(documentId, data)}
                                onSecondary={makeSeoUpsert("product", "product")}
                                onAfterImport={() => updateQuery({ page: undefined })}
                            />
                            <AddButton label="New Product" href="/new/product" />
                        </>
                    }
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
                            onBrandChange={(v) => updateQuery({ brands: v || undefined, page: undefined })}
                            onCategoryChange={(v) => updateQuery({ categories: v || undefined, page: undefined })}
                            onSupplierChange={(v) => updateQuery({ suppliers: v || undefined, page: undefined })}
                            onTermChange={(v) => updateQuery({ terms: v || undefined, page: undefined })}
                            onPurchaseChange={(v) => updateQuery({ purchases: v || undefined, page: undefined })}
                            onSearchTextChange={(v) => updateQuery({ searchText: v || undefined, page: undefined })}
                        />
                    }
                    bulkActions={
                        <BulkProductActions
                            selectedIds={selectedIds}
                            categories={categories}
                            brands={brands}
                            suppliers={suppliers}
                            onAssigned={handleBulkAssigned}
                            onPublished={handleBulkPublished}
                            onUnpublished={handleBulkUnpublished}
                            onComplete={() => setSelectedIds(new Set())}
                            toast={toast}
                        />
                    }
                    selectedCount={selectedIds.size}
                    loading={loading}
                    pagination={
                        <ListPagination
                            page={page}
                            pageSize={pageSize}
                            total={total}
                            onPage={setPage}
                            onPageSize={setPageSize}
                            pageSizeOptions={PAGE_SIZE_OPTIONS}
                        />
                    }
                    emptyState={<div>No products found.</div>}
                >
                    {products.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-hover list-table">
                            <thead>
                                <tr>
                                    <th style={{ width: 30 }}>
                                        <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} title="Select all" />
                                    </th>
                                    <th style={{ width: 30 }}></th>
                                    <th style={{ width: 50 }}></th>
                                    <SortableTh label="Name" field="name" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                                    <SortableTh label="SKU" field="sku" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                                    <SortableTh label="Price" field="selling_price" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                                    <SortableTh label="Stock" field="stock_quantity" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                                    <th>Categories</th>
                                    <th>Brands</th>
                                    <th>Purchase #</th>
                                    <SortableTh label="Modified" field="updatedAt" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                                    <th>Published</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {products.map(p => (
                                    <Fragment key={p.id}>
                                        <tr>
                                            <td>
                                                <input type="checkbox" checked={selectedIds.has(p.documentId)} onChange={() => toggleSelected(p.documentId)} />
                                            </td>
                                            <td>
                                                <button
                                                    className="btn btn-sm btn-link p-0"
                                                    onClick={() => toggleVariants(p)}
                                                    title="Show/hide variants"
                                                >
                                                    <i className={`fas fa-chevron-${expandedProducts[p.documentId] ? 'down' : 'right'}`}></i>
                                                </button>
                                            </td>
                                            <td>
                                                {p.logo?.url ? (
                                                    <img
                                                        src={MediaUtilsEndpoints.strapiImageUrl(p.logo)}
                                                        alt={p.name}
                                                        style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 4 }}
                                                    />
                                                ) : (
                                                    <span className="text-muted"><i className="fas fa-image"></i></span>
                                                )}
                                            </td>
                                            <td><strong>{p.name}</strong></td>
                                            <td>{p.sku || "—"}</td>
                                            <td>{currency}{parseFloat(p.selling_price || 0).toFixed(2)}</td>
                                            <td>{p.stock_quantity ?? "—"}</td>
                                            <td>{(p.categories || []).map(c => c.name).join(", ") || "—"}</td>
                                            <td>{(p.brands || []).map(b => b.name).join(", ") || "—"}</td>
                                            <td>{(p.purchase_items || []).map(pi => pi.purchase?.orderId).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", ") || "—"}</td>
                                            <td className="small text-nowrap">{p.updatedAt ? new Date(p.updatedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—"}</td>
                                            <td className="small text-nowrap">
                                                {p._isPublished
                                                    ? <button className="list-status btn border-0" style={{ background: '#198754', color: '#fff' }} onClick={() => unpublishOne(p.documentId)} disabled={publishing[p.documentId]} title="Click to unpublish">
                                                        {publishing[p.documentId] ? <i className="fas fa-spinner fa-spin"></i> : <><i className="fas fa-check me-1"></i>{p._publishedAt ? new Date(p._publishedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "Published"}</>}
                                                    </button>
                                                    : <button className="list-status btn border-0" style={{ background: '#e9ecef', color: '#495057' }} onClick={() => publishOne(p.documentId)} disabled={publishing[p.documentId]} title="Click to publish">
                                                        {publishing[p.documentId] ? <i className="fas fa-spinner fa-spin"></i> : "Draft"}
                                                    </button>
                                                }
                                            </td>
                                            <td>
                                                <div className="list-actions">
                                                    <Link className="btn btn-outline-primary" href={`/${p.documentId}/product`}>
                                                        Edit
                                                    </Link>
                                                    {buildProductWebUrl(p) && (
                                                        <a
                                                            className="btn btn-outline-secondary"
                                                            href={buildProductWebUrl(p)}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            title="Open on the storefront"
                                                        >
                                                            <i className="fas fa-eye me-1"></i>View
                                                        </a>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                        {expandedProducts[p.documentId] && (
                                            loadingVariants[p.documentId] ? (
                                                <tr>
                                                    <td colSpan={13} className="text-center text-muted">
                                                        Loading variants...
                                                    </td>
                                                </tr>
                                            ) : (variantsMap[p.documentId] || []).length === 0 ? (
                                                <tr>
                                                    <td colSpan={13} className="text-center text-muted">
                                                        No variants
                                                    </td>
                                                </tr>
                                            ) : (
                                                (variantsMap[p.documentId] || []).map(v => (
                                                    <tr key={`variant-${v.id}`} className="table-light">
                                                        <td></td>
                                                        <td></td>
                                                        <td>
                                                            {v.logo?.url ? (
                                                                <img
                                                                    src={MediaUtilsEndpoints.strapiImageUrl(v.logo)}
                                                                    alt={v.name}
                                                                    style={{ width: 30, height: 30, objectFit: "cover", borderRadius: 4 }}
                                                                />
                                                            ) : (
                                                                <span className="text-muted"><i className="fas fa-image" style={{ fontSize: '0.8em' }}></i></span>
                                                            )}
                                                        </td>
                                                        <td className="ps-4">
                                                            <i className="fas fa-level-up-alt fa-rotate-90 me-1 text-muted" style={{ fontSize: '0.8em' }}></i>
                                                            {v.name}
                                                        </td>
                                                        <td>{v.sku || "—"}</td>
                                                        <td>{currency}{parseFloat(v.selling_price || 0).toFixed(2)}</td>
                                                        <td>{v.stock_quantity ?? "—"}</td>
                                                        <td>{(v.categories || []).map(c => c.name).join(", ") || "—"}</td>
                                                        <td>{(v.brands || []).map(b => b.name).join(", ") || "—"}</td>
                                                        <td>{(v.purchase_items || []).map(pi => pi.purchase?.orderId).filter(Boolean).filter((val, i, a) => a.indexOf(val) === i).join(", ") || "—"}</td>
                                                        <td className="small text-nowrap">{v.updatedAt ? new Date(v.updatedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—"}</td>
                                                        <td className="small text-nowrap">
                                                            {v._isPublished
                                                                ? <button className="list-status btn border-0" style={{ background: '#198754', color: '#fff' }} onClick={() => unpublishOne(v.documentId)} disabled={publishing[v.documentId]} title="Click to unpublish">
                                                                    {publishing[v.documentId] ? <i className="fas fa-spinner fa-spin"></i> : <><i className="fas fa-check me-1"></i>{v._publishedAt ? new Date(v._publishedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "Published"}</>}
                                                                </button>
                                                                : <button className="list-status btn border-0" style={{ background: '#e9ecef', color: '#495057' }} onClick={() => publishOne(v.documentId)} disabled={publishing[v.documentId]} title="Click to publish">
                                                                    {publishing[v.documentId] ? <i className="fas fa-spinner fa-spin"></i> : "Draft"}
                                                                </button>
                                                            }
                                                        </td>
                                                        <td>
                                                            <div className="list-actions">
                                                                <Link className="btn btn-outline-primary" href={`/${v.documentId}/product`}>
                                                                    Edit
                                                                </Link>
                                                                {buildProductWebUrl(v) && (
                                                                    <a
                                                                        className="btn btn-outline-secondary"
                                                                        href={buildProductWebUrl(v)}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        title="Open on the storefront"
                                                                    >
                                                                        <i className="fas fa-eye me-1"></i>View
                                                                    </a>
                                                                )}
                                                            </div>
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
                </ListPageLayout>
            </Layout>
        </ProtectedRoute>
    );
}

