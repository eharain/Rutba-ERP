import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { useUtil } from "@rutba/pos-shared/context/UtilContext";
import { ProductsEndpoints, SocialPostsEndpoints, fetchProducts } from "@rutba/api-provider/endpoints";
import { useProductLookups } from "@rutba/pos-shared/hooks/useProductLookups";
import { ProductFilter } from "@rutba/pos-shared/components/filter/product-filter";
import ListPageLayout, { AddButton } from "@rutba/pos-shared/components/ListPageLayout";
import ListPagination from "@rutba/pos-shared/components/ListPagination";
import ProductListTable from "@rutba/pos-shared/components/ProductListTable";
import { useToast } from "../components/Toast";

// Products browser for rutba-social. Same list + filters as the CMS (shared
// ProductListTable + ProductFilter), parents only. Expanding a product shows
// the social posts already made for it; a post can be started from a product
// row (or from several selected products), so every social post originates
// from a real product and links back to the storefront.

const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL || "http://localhost:4000";

const DEFAULT_PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = [5, 10, 25, 50, 100, 150, 200];
const DEFAULT_SORT_FIELD = "createdAt";
const DEFAULT_SORT_DIR = "desc";
const SORTABLE_FIELDS = new Set(["id", "name", "sku", "selling_price", "stock_quantity", "updatedAt", "createdAt"]);

const POST_STATUS_BADGE = {
    draft: "bg-secondary",
    scheduled: "bg-warning text-dark",
    publishing: "bg-info",
    published: "bg-success",
    partially_published: "bg-warning text-dark",
    failed: "bg-danger",
};

const storefrontUrl = (p) => `${WEB_URL}/product/${encodeURIComponent(p.slug || p.documentId)}`;

export default function SocialProducts() {
    const router = useRouter();
    const { jwt } = useAuth();
    const { currency } = useUtil();
    const { toast, ToastContainer } = useToast();

    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [total, setTotal] = useState(0);

    // Catalog filter lookups (purchases skipped — not exposed to the social role).
    const { brands, categories, suppliers, termTypes } = useProductLookups({ skip: new Set(["purchases"]) });

    // Posts-per-product expansion.
    const [expandedProducts, setExpandedProducts] = useState({});
    const [postsMap, setPostsMap] = useState({});
    const [loadingPosts, setLoadingPosts] = useState({});

    // Multi-select → one combined post.
    const [selectedIds, setSelectedIds] = useState(new Set());

    // --- URL-driven filter/page state (mirrors the CMS list) ---
    const qVal = (v) => (Array.isArray(v) ? v[0] : v) || "";
    const selectedBrand = qVal(router.query.brands);
    const selectedCategory = qVal(router.query.categories);
    const selectedSupplier = qVal(router.query.suppliers);
    const selectedTerm = qVal(router.query.terms);
    const searchText = qVal(router.query.searchText);
    const stockStatus = qVal(router.query.stockStatus);
    const page = parseInt(router.query.page, 10) || 1;
    const pageSize = parseInt(router.query.pageSize, 10) || DEFAULT_PAGE_SIZE;
    const sortField = SORTABLE_FIELDS.has(qVal(router.query.sortField)) ? qVal(router.query.sortField) : DEFAULT_SORT_FIELD;
    const sortDir = qVal(router.query.sortDir) || DEFAULT_SORT_DIR;
    const missingContent = qVal(router.query.missingContent) === "1";
    const missingLogo = qVal(router.query.missingLogo) === "1";
    const missingGallery = qVal(router.query.missingGallery) === "1";
    const priceMin = qVal(router.query.priceMin);
    const priceMax = qVal(router.query.priceMax);
    const createdFrom = qVal(router.query.createdFrom);
    const createdTo = qVal(router.query.createdTo);
    const updatedFrom = qVal(router.query.updatedFrom);
    const updatedTo = qVal(router.query.updatedTo);
    const publishState = qVal(router.query.publishState);

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
        updateQuery({
            sortField: field === DEFAULT_SORT_FIELD && newDir === DEFAULT_SORT_DIR ? undefined : field,
            sortDir: newDir === DEFAULT_SORT_DIR && field === DEFAULT_SORT_FIELD ? undefined : newDir,
            page: undefined,
        });
    }, [sortField, sortDir, updateQuery]);

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

    useEffect(() => {
        if (!router.isReady || !jwt) return;

        const filters = {
            parentOnly: true,
            status: "draft",
            searchText,
            populate: { logo: true, categories: true, brands: true },
        };
        if (selectedBrand) filters.brands = [selectedBrand];
        if (selectedCategory) filters.categories = [selectedCategory];
        if (selectedSupplier) filters.suppliers = [selectedSupplier];
        if (selectedTerm) filters.terms = [selectedTerm];
        if (stockStatus) filters.stockStatus = stockStatus;
        applyExtraFilters(filters);

        let cancelled = false;
        setLoading(true);

        fetchProducts(filters, page, pageSize, `${sortField}:${sortDir}`)
            .then(async (productRes) => {
                if (cancelled) return;
                const draftProducts = productRes.data || [];
                // Read-only published badge: match the CMS by checking which of
                // this page's products have a published sibling.
                let pubMap = {};
                if (draftProducts.length > 0) {
                    const docIds = draftProducts.map((p) => p.documentId);
                    try {
                        const pubRes = await ProductsEndpoints.list(1, docIds.length, {
                            status: "published",
                            fields: ["documentId", "publishedAt"],
                            filters: { documentId: { $in: docIds } },
                        });
                        for (const p of (pubRes.data || [])) pubMap[p.documentId] = p.publishedAt;
                    } catch (err) {
                        console.error("Failed to check published status", err);
                    }
                }
                setProducts(draftProducts.map((p) => ({ ...p, _isPublished: !!pubMap[p.documentId], _publishedAt: pubMap[p.documentId] || null })));
                setTotal(productRes.meta?.pagination?.total ?? 0);
            })
            .catch((err) => {
                if (cancelled) return;
                console.error("Failed to load products", err);
                toast("Failed to load products.", "danger");
            })
            .finally(() => { if (!cancelled) setLoading(false); });

        return () => { cancelled = true; };
    }, [router.isReady, jwt, page, pageSize, selectedBrand, selectedCategory, selectedSupplier, selectedTerm, searchText, stockStatus, sortField, sortDir, applyExtraFilters, toast]);

    const setPage = (p) => updateQuery({ page: p > 1 ? p : undefined });
    const setPageSize = (s) => updateQuery({ pageSize: s, page: undefined });

    // --- selection ---
    const toggleSelected = (docId) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(docId)) next.delete(docId); else next.add(docId);
            return next;
        });
    };
    const allPageIds = products.map((p) => p.documentId);
    const allSelected = allPageIds.length > 0 && allPageIds.every((id) => selectedIds.has(id));
    const toggleSelectAll = () => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (allSelected) allPageIds.forEach((id) => next.delete(id));
            else allPageIds.forEach((id) => next.add(id));
            return next;
        });
    };

    // --- posts per product ---
    const togglePosts = async (product) => {
        const docId = product.documentId;
        if (expandedProducts[docId]) {
            setExpandedProducts((prev) => ({ ...prev, [docId]: false }));
            return;
        }
        if (!postsMap[docId]) {
            setLoadingPosts((prev) => ({ ...prev, [docId]: true }));
            try {
                const res = await SocialPostsEndpoints.list({
                    status: "draft",
                    filters: { products: { documentId: { $eq: docId } } },
                    sort: ["createdAt:desc"],
                    fields: ["documentId", "title", "post_status", "platforms", "published_at_social"],
                    pagination: { pageSize: 50 },
                });
                setPostsMap((prev) => ({ ...prev, [docId]: res.data || [] }));
            } catch (err) {
                console.error("Failed to load posts for product", err);
                setPostsMap((prev) => ({ ...prev, [docId]: [] }));
            } finally {
                setLoadingPosts((prev) => ({ ...prev, [docId]: false }));
            }
        }
        setExpandedProducts((prev) => ({ ...prev, [docId]: true }));
    };

    const renderProductPosts = (product) => {
        const docId = product.documentId;
        const posts = postsMap[docId] || [];
        const newPostHref = `/posts/from-product?product=${encodeURIComponent(docId)}`;
        return (
            <div className="p-2">
                <div className="d-flex align-items-center justify-content-between mb-2">
                    <strong className="small"><i className="fas fa-hashtag me-1"></i>Posts for “{product.name}”</strong>
                    <Link className="btn btn-sm btn-success" href={newPostHref}>
                        <i className="fas fa-plus me-1"></i>New post from this product
                    </Link>
                </div>
                {loadingPosts[docId] ? (
                    <div className="text-muted small"><span className="spinner-border spinner-border-sm me-1"></span>Loading posts…</div>
                ) : posts.length === 0 ? (
                    <div className="text-muted small">No posts yet for this product. Start one above.</div>
                ) : (
                    <div className="list-group list-group-flush">
                        {posts.map((post) => (
                            <Link key={post.documentId} href={`/posts/${post.documentId}`} className="list-group-item list-group-item-action d-flex align-items-center gap-2 px-2 py-1">
                                <span className={`badge ${POST_STATUS_BADGE[post.post_status] || "bg-secondary"}`}>
                                    {(post.post_status || "draft").replace("_", " ")}
                                </span>
                                <span className="flex-grow-1 text-truncate">{post.title || "(untitled)"}</span>
                                <span className="small text-muted">{(post.platforms || []).join(", ")}</span>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    const renderRowActions = (product) => (
        <div className="list-actions">
            <Link className="btn btn-outline-success" href={`/posts/from-product?product=${encodeURIComponent(product.documentId)}`}>
                <i className="fas fa-tags me-1"></i>Create Post
            </Link>
            <a className="btn btn-outline-secondary" href={storefrontUrl(product)} target="_blank" rel="noopener noreferrer" title="Open on the storefront">
                <i className="fas fa-eye me-1"></i>View
            </a>
        </div>
    );

    const startFromSelection = () => {
        const ids = [...selectedIds];
        if (ids.length === 0) return;
        router.push(`/posts/from-product?products=${ids.map(encodeURIComponent).join(",")}`);
    };

    return (
        <ProtectedRoute>
            <Layout>
                <ToastContainer />
                <ListPageLayout
                    title="Products"
                    subtitle={`${total} products found — start a social post from any product`}
                    headerActions={<AddButton label="New Post" href="/posts/create" />}
                    filters={
                        <ProductFilter
                            brands={brands}
                            categories={categories}
                            suppliers={suppliers}
                            termTypes={termTypes}
                            hide={new Set(["purchase"])}
                            selectedBrand={selectedBrand}
                            selectedCategory={selectedCategory}
                            selectedSupplier={selectedSupplier}
                            selectedTerm={selectedTerm}
                            searchText={searchText}
                            onBrandChange={(v) => updateQuery({ brands: v || undefined, page: undefined })}
                            onCategoryChange={(v) => updateQuery({ categories: v || undefined, page: undefined })}
                            onSupplierChange={(v) => updateQuery({ suppliers: v || undefined, page: undefined })}
                            onTermChange={(v) => updateQuery({ terms: v || undefined, page: undefined })}
                            onSearchTextChange={(v) => updateQuery({ searchText: v || undefined, page: undefined })}
                            extra={[
                                {
                                    key: "stockStatus", type: "select", label: "Stock",
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
                                    key: "publishState", type: "select", label: "Publish",
                                    value: publishState || "",
                                    onChange: (v) => updateQuery({ publishState: v || undefined, page: undefined }),
                                    placeholder: "All publish states",
                                    options: [
                                        { value: "published", label: "Published" },
                                        { value: "unpublished", label: "Unpublished" },
                                    ],
                                },
                                {
                                    key: "price", type: "number-range", label: "Price",
                                    value: { min: priceMin, max: priceMax },
                                    onChange: (v) => updateQuery({ priceMin: v.min || undefined, priceMax: v.max || undefined, page: undefined }),
                                },
                                {
                                    key: "created", type: "date-range", label: "Created",
                                    value: { from: createdFrom, to: createdTo },
                                    onChange: (v) => updateQuery({ createdFrom: v.from || undefined, createdTo: v.to || undefined, page: undefined }),
                                },
                                {
                                    key: "modified", type: "date-range", label: "Modified",
                                    value: { from: updatedFrom, to: updatedTo },
                                    onChange: (v) => updateQuery({ updatedFrom: v.from || undefined, updatedTo: v.to || undefined, page: undefined }),
                                },
                                {
                                    key: "missingContent", type: "toggle", label: "Missing content",
                                    value: missingContent,
                                    onChange: (checked) => updateQuery({ missingContent: checked ? "1" : undefined, page: undefined }),
                                },
                                {
                                    key: "missingLogo", type: "toggle", label: "Missing logo",
                                    value: missingLogo,
                                    onChange: (checked) => updateQuery({ missingLogo: checked ? "1" : undefined, page: undefined }),
                                },
                                {
                                    key: "missingGallery", type: "toggle", label: "Missing gallery",
                                    value: missingGallery,
                                    onChange: (checked) => updateQuery({ missingGallery: checked ? "1" : undefined, page: undefined }),
                                },
                            ]}
                        />
                    }
                    bulkActions={
                        <button className="btn btn-sm btn-success" onClick={startFromSelection}>
                            <i className="fas fa-tags me-1"></i>Create one post from {selectedIds.size} product(s)
                        </button>
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
                        onToggleExpand={togglePosts}
                        renderExpandedContent={renderProductPosts}
                        renderRowActions={renderRowActions}
                    />}
                </ListPageLayout>
            </Layout>
        </ProtectedRoute>
    );
}
