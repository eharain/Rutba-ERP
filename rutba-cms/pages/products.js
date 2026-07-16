import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { ProductsEndpoints, StockItemsEndpoints, fetchProducts } from "@rutba/api-provider/endpoints";
import PermissionCheck from "@rutba/pos-shared/components/PermissionCheck";
import { useProductLookups } from "@rutba/pos-shared/hooks/useProductLookups";
import { useUtil } from "@rutba/pos-shared/context/UtilContext";
import { ProductFilter } from "@rutba/pos-shared/components/filter/product-filter";
import { useToast } from "../components/Toast";
import BulkProductActions from "@rutba/pos-shared/components/BulkProductActions";
import ListPageLayout, { AddButton } from "@rutba/pos-shared/components/ListPageLayout";
import ListPagination from "@rutba/pos-shared/components/ListPagination";
import ProductListTable from "@rutba/pos-shared/components/ProductListTable";
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
const SORTABLE_FIELDS = new Set(["id", "name", "sku", "selling_price", "stock_quantity", "updatedAt", "createdAt"]);

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
    const [syncingStock, setSyncingStock] = useState(false);

    // Triggers the recompute-product-stock admin job. The stock-item lifecycle
    // keeps product.stock_quantity in sync during normal operation — this is
    // the manual reconcile path for post-migration / suspected drift cases.
    const handleSyncStock = async () => {
        if (syncingStock) return;
        if (!confirm("Rebuild product.stock_quantity for every product from the live InStock count? Safe to run anytime — idempotent.")) return;
        setSyncingStock(true);
        try {
            const res = await StockItemsEndpoints.recomputeProductStock();
            const r = res?.data ?? res ?? {};
            toast(
                `Synced stock — processed ${r.processed ?? 0}, corrected ${r.corrected ?? 0} in ${r.durationMs ?? "?"}ms`,
                "success"
            );
            // Bump the page state so the products list refetches with fresh counts.
            updateQuery({ page: undefined });
        } catch (err) {
            console.error("Sync stock failed", err);
            toast(err?.response?.data?.error?.message || err?.message || "Sync stock failed", "danger");
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
    const stockStatus = qVal(router.query.stockStatus); // "" | "inStock" | "outOfStock" | "low"
    const page = parseInt(router.query.page, 10) || 1;
    const pageSize = parseInt(router.query.pageSize, 10) || DEFAULT_PAGE_SIZE;
    const sortField = SORTABLE_FIELDS.has(qVal(router.query.sortField)) ? qVal(router.query.sortField) : DEFAULT_SORT_FIELD;
    const sortDir = qVal(router.query.sortDir) || DEFAULT_SORT_DIR;
    // --- completeness / range / publish filters (all URL-driven) ---
    const missingContent = qVal(router.query.missingContent) === "1";
    const missingLogo = qVal(router.query.missingLogo) === "1";
    const missingGallery = qVal(router.query.missingGallery) === "1";
    const priceMin = qVal(router.query.priceMin);
    const priceMax = qVal(router.query.priceMax);
    const createdFrom = qVal(router.query.createdFrom);
    const createdTo = qVal(router.query.createdTo);
    const updatedFrom = qVal(router.query.updatedFrom);
    const updatedTo = qVal(router.query.updatedTo);
    const publishState = qVal(router.query.publishState); // "" | "published" | "unpublished"

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

    // Layer the completeness / range / publish-state filters onto a filters
    // object. Shared by the page-fetch effect and the "All" export path.
    const applyExtraFilters = useCallback((filters) => {
        if (missingContent) filters.missingContent = true;
        if (missingLogo) filters.missingLogo = true;
        if (missingGallery) filters.missingGallery = true;
        if (priceMin) filters.priceMin = priceMin;
        if (priceMax) filters.priceMax = priceMax;
        if (createdFrom) filters.createdFrom = createdFrom;
        if (createdTo) filters.createdTo = createdTo;
        if (updatedFrom) filters.updatedFrom = updatedFrom;
        if (updatedTo) filters.updatedTo = updatedTo;
        if (publishState) filters.publishState = publishState;
        return filters;
    }, [missingContent, missingLogo, missingGallery, priceMin, priceMax, createdFrom, createdTo, updatedFrom, updatedTo, publishState]);

    // single effect: fetch products whenever URL params or jwt change
    useEffect(() => {
        if (!router.isReady || !jwt) return;

        const filters = { parentOnly: true, status: "draft", searchText, populate: SEO_POPULATE };
        if (selectedBrand) filters.brands = [selectedBrand];
        if (selectedCategory) filters.categories = [selectedCategory];
        if (selectedSupplier) filters.suppliers = [selectedSupplier];
        if (selectedTerm) filters.terms = [selectedTerm];
        if (selectedPurchase) filters.purchases = [selectedPurchase];
        if (stockStatus) filters.stockStatus = stockStatus;
        applyExtraFilters(filters);

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
    }, [router.isReady, jwt, page, pageSize, selectedBrand, selectedCategory, selectedSupplier, selectedTerm, selectedPurchase, searchText, stockStatus, sortField, sortDir, applyExtraFilters]);

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
        if (stockStatus) filters.stockStatus = stockStatus;
        applyExtraFilters(filters);
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
    }, [searchText, selectedBrand, selectedCategory, selectedSupplier, selectedTerm, selectedPurchase, stockStatus, sortField, sortDir, applyExtraFilters]);

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
                            extra={[
                                {
                                    key: "stockStatus",
                                    type: "select",
                                    label: "Stock",
                                    value: stockStatus || "",
                                    onChange: (v) => updateQuery({ stockStatus: v || undefined, page: undefined }),
                                    placeholder: "All stock",
                                    options: [
                                        { value: "inStock", label: "In stock" },
                                        { value: "outOfStock", label: "Out of stock" },
                                        { value: "low", label: "Low stock" },
                                    ],
                                },
                                {
                                    key: "publishState",
                                    type: "select",
                                    label: "Publish",
                                    value: publishState || "",
                                    onChange: (v) => updateQuery({ publishState: v || undefined, page: undefined }),
                                    placeholder: "All publish states",
                                    options: [
                                        { value: "published", label: "Published" },
                                        { value: "unpublished", label: "Unpublished" },
                                    ],
                                },
                                {
                                    key: "price",
                                    type: "number-range",
                                    label: "Price",
                                    value: { min: priceMin, max: priceMax },
                                    onChange: (v) => updateQuery({ priceMin: v.min || undefined, priceMax: v.max || undefined, page: undefined }),
                                },
                                {
                                    key: "created",
                                    type: "date-range",
                                    label: "Created",
                                    value: { from: createdFrom, to: createdTo },
                                    onChange: (v) => updateQuery({ createdFrom: v.from || undefined, createdTo: v.to || undefined, page: undefined }),
                                },
                                {
                                    key: "modified",
                                    type: "date-range",
                                    label: "Modified",
                                    value: { from: updatedFrom, to: updatedTo },
                                    onChange: (v) => updateQuery({ updatedFrom: v.from || undefined, updatedTo: v.to || undefined, page: undefined }),
                                },
                                {
                                    key: "missingContent",
                                    type: "toggle",
                                    label: "Missing content",
                                    value: missingContent,
                                    onChange: (checked) => updateQuery({ missingContent: checked ? "1" : undefined, page: undefined }),
                                },
                                {
                                    key: "missingLogo",
                                    type: "toggle",
                                    label: "Missing logo",
                                    value: missingLogo,
                                    onChange: (checked) => updateQuery({ missingLogo: checked ? "1" : undefined, page: undefined }),
                                },
                                {
                                    key: "missingGallery",
                                    type: "toggle",
                                    label: "Missing gallery",
                                    value: missingGallery,
                                    onChange: (checked) => updateQuery({ missingGallery: checked ? "1" : undefined, page: undefined }),
                                },
                            ]}
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
                    {products.length > 0 && <ProductListTable
                        products={products}
                        currency={currency}
                        sortField={sortField}
                        sortDir={sortDir}
                        onSort={handleSort}
                        selectedIds={selectedIds}
                        onToggleSelect={toggleSelected}
                        allSelected={allSelected}
                        onToggleSelectAll={toggleSelectAll}
                        expandable
                        expandedProducts={expandedProducts}
                        onToggleExpand={toggleVariants}
                        variantChildren={(p) => ({ loading: loadingVariants[p.documentId], items: variantsMap[p.documentId] || [] })}
                        publishing={publishing}
                        onPublish={publishOne}
                        onUnpublish={unpublishOne}
                        editHref={(p) => `/${p.documentId}/product`}
                        buildWebUrl={buildProductWebUrl}
                    />}
                </ListPageLayout>
            </Layout>
        </ProtectedRoute>
    );
}

