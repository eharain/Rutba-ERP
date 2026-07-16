import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { MediaUtilsEndpoints, ProductsEndpoints } from "@rutba/api-provider/endpoints";
import { useToast } from "../components/Toast";

// Product catalog = the starting point for social posts. Every social post for
// a product should originate here (from the real product + its content) and
// link back to the storefront. Pick a product (or several) and "Create Post"
// hands them to the shoppable-post generator (/posts/from-product), which turns
// the product name/price/summary/image into a draft with a Shop-now deep link.

const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL || "http://localhost:4000";
const CURRENCY = process.env.NEXT_PUBLIC_CURRENCY || "Rs";
const PAGE_SIZE = 24;

const money = (n) => `${CURRENCY} ${Number(n || 0).toLocaleString()}`;
const storefrontUrl = (p) => `${WEB_URL}/product/${encodeURIComponent(p.slug || p.documentId)}`;

function priceInfo(p) {
    const sp = Number(p.selling_price) || 0;
    const op = Number(p.offer_price) || 0;
    const onSale = op > 0 && op < sp;
    return { price: onSale ? op : sp, was: onSale ? sp : null };
}

export default function ProductsPage() {
    const { jwt } = useAuth();
    const { toast, ToastContainer } = useToast();
    const router = useRouter();

    const [search, setSearch] = useState("");
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [pageCount, setPageCount] = useState(1);
    const [total, setTotal] = useState(0);
    const [selected, setSelected] = useState([]); // documentId[]

    const load = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        try {
            const term = search.trim();
            const filters = term ? { filters: { name: { $containsi: term } } } : {};
            const res = await ProductsEndpoints.list(page, PAGE_SIZE, filters);
            setProducts(res.data || []);
            const pg = res.meta?.pagination || {};
            setPageCount(pg.pageCount || 1);
            setTotal(pg.total ?? (res.data || []).length);
        } catch (err) {
            console.error("Failed to load products", err);
            toast("Failed to load products.", "danger");
        } finally {
            setLoading(false);
        }
    }, [jwt, search, page, toast]);

    // Debounce the search term; reset to page 1 when it changes.
    useEffect(() => {
        const t = setTimeout(load, 350);
        return () => clearTimeout(t);
    }, [load]);

    const onSearchChange = (v) => { setSearch(v); setPage(1); };

    const isSelected = (docId) => selected.includes(docId);
    const toggle = (docId) =>
        setSelected((prev) => (prev.includes(docId) ? prev.filter((x) => x !== docId) : [...prev, docId]));
    const clearSelection = () => setSelected([]);

    const startSingle = (docId) => router.push(`/posts/from-product?product=${encodeURIComponent(docId)}`);
    const startFromSelection = () => {
        if (selected.length === 0) return;
        router.push(`/posts/from-product?products=${selected.map(encodeURIComponent).join(",")}`);
    };

    return (
        <ProtectedRoute>
            <Layout>
                <ToastContainer />
                <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
                    <h3 className="mb-0"><i className="fas fa-box-open me-2"></i>Products</h3>
                    <div className="d-flex gap-2">
                        {selected.length > 0 && (
                            <button className="btn btn-outline-secondary btn-sm" onClick={clearSelection}>
                                Clear ({selected.length})
                            </button>
                        )}
                        <button className="btn btn-success btn-sm" onClick={startFromSelection} disabled={selected.length === 0} title="Create one post featuring the selected products">
                            <i className="fas fa-tags me-1"></i>Create Post{selected.length > 0 ? ` (${selected.length})` : ""}
                        </button>
                    </div>
                </div>

                <p className="text-muted small mb-3">
                    Pick a product to turn it into a shoppable social post. The generated post is built from the
                    product's name, price and image, and links back to its page on your storefront.
                </p>

                <div className="row g-2 mb-3">
                    <div className="col-md-6">
                        <input
                            className="form-control form-control-sm"
                            placeholder="Search products by name…"
                            value={search}
                            onChange={(e) => onSearchChange(e.target.value)}
                        />
                    </div>
                    <div className="col-md-6 d-flex align-items-center justify-content-md-end">
                        <span className="text-muted small">
                            {loading ? "Loading…" : `${total} product${total === 1 ? "" : "s"}`}
                        </span>
                    </div>
                </div>

                {!loading && products.length === 0 && (
                    <div className="alert alert-light border text-center text-muted">
                        No products found{search.trim() ? ` for “${search.trim()}”` : ""}.
                    </div>
                )}

                <div className="row g-3">
                    {products.map((p) => {
                        const { price, was } = priceInfo(p);
                        const sel = isSelected(p.documentId);
                        return (
                            <div className="col-6 col-md-4 col-lg-3" key={p.documentId}>
                                <div className={`card h-100 ${sel ? "border-success" : ""}`}>
                                    <div className="position-relative">
                                        <div className="form-check position-absolute top-0 start-0 m-2" style={{ zIndex: 1 }}>
                                            <input
                                                className="form-check-input"
                                                type="checkbox"
                                                checked={sel}
                                                onChange={() => toggle(p.documentId)}
                                                title="Select to feature in one combined post"
                                            />
                                        </div>
                                        {p.logo?.url
                                            ? <img src={MediaUtilsEndpoints.strapiImageUrl(p.logo)} alt={p.name} className="card-img-top" style={{ height: 150, objectFit: "cover" }} />
                                            : <div className="bg-light d-flex align-items-center justify-content-center text-muted" style={{ height: 150 }}><i className="fas fa-image fa-2x"></i></div>}
                                    </div>
                                    <div className="card-body d-flex flex-column p-2">
                                        <div className="fw-semibold text-truncate" title={p.name}>{p.name}</div>
                                        <div className="small mb-2">
                                            <span className="text-success fw-semibold">{money(price)}</span>
                                            {was && <span className="text-muted text-decoration-line-through ms-1">{money(was)}</span>}
                                        </div>
                                        <div className="mt-auto d-flex gap-1">
                                            <button className="btn btn-success btn-sm flex-grow-1" onClick={() => startSingle(p.documentId)}>
                                                <i className="fas fa-tags me-1"></i>Create Post
                                            </button>
                                            <a className="btn btn-outline-secondary btn-sm" href={storefrontUrl(p)} target="_blank" rel="noreferrer" title="View on storefront">
                                                <i className="fas fa-arrow-up-right-from-square"></i>
                                            </a>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {pageCount > 1 && (
                    <div className="d-flex align-items-center justify-content-center gap-2 mt-4">
                        <button className="btn btn-sm btn-outline-secondary" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                            <i className="fas fa-chevron-left"></i>
                        </button>
                        <span className="small text-muted">Page {page} of {pageCount}</span>
                        <button className="btn btn-sm btn-outline-secondary" disabled={page >= pageCount || loading} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>
                            <i className="fas fa-chevron-right"></i>
                        </button>
                    </div>
                )}
            </Layout>
        </ProtectedRoute>
    );
}
