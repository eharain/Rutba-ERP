import { useState, useEffect, useCallback, Fragment } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi, StraipImageUrl } from "@rutba/pos-shared/lib/api";
import { useUtil } from "@rutba/pos-shared/context/UtilContext";
import { ProductFilter } from "@rutba/pos-shared/components/filter/product-filter";
import { fetchProducts } from "@rutba/pos-shared/lib/pos";
import Link from "next/link";

const DEFAULT_PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = [5, 10, 25, 50, 100, 150, 200];

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
    const [brands, setBrands] = useState([]);
    const [categories, setCategories] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [termTypes, setTermTypes] = useState([]);
    const [purchases, setPurchases] = useState([]);

    // --- variant expansion ---
    const [expandedProducts, setExpandedProducts] = useState({});
    const [variantsMap, setVariantsMap] = useState({});
    const [loadingVariants, setLoadingVariants] = useState({});

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

    // helper: merge params into the current URL (falsy values are removed)
    const updateQuery = useCallback((params) => {
        const merged = { ...router.query, ...params };
        const cleaned = {};
        for (const [k, v] of Object.entries(merged)) {
            if (v != null && v !== "" && v !== undefined) cleaned[k] = String(v);
        }
        router.push({ pathname: router.pathname, query: cleaned }, undefined, { shallow: true });
    }, [router]);

    // fetch lookup data once
    useEffect(() => {
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
        });
    }, []);

    // single effect: fetch products whenever URL params or jwt change
    useEffect(() => {
        if (!router.isReady || !jwt) return;

        const filters = { parentOnly: true, status: "draft", searchText };
        if (selectedBrand) filters.brands = [selectedBrand];
        if (selectedCategory) filters.categories = [selectedCategory];
        if (selectedSupplier) filters.suppliers = [selectedSupplier];
        if (selectedTerm) filters.terms = [selectedTerm];
        if (selectedPurchase) filters.purchases = [selectedPurchase];

        let cancelled = false;
        setLoading(true);

        Promise.all([
            fetchProducts(filters, page, pageSize, "createdAt:desc"),
            authApi.get("/products", { status: 'published', fields: ["documentId"], pagination: { pageSize: 500 } }),
        ]).then(([productRes, pubRes]) => {
            if (cancelled) return;
            const pubIds = new Set((pubRes.data || []).map(p => p.documentId));
            setProducts((productRes.data || []).map(p => ({ ...p, _isPublished: pubIds.has(p.documentId) })));
            setPageCount(productRes.meta?.pagination?.pageCount ?? 1);
            setTotal(productRes.meta?.pagination?.total ?? 0);
        }).catch(err => {
            if (cancelled) return;
            console.error("Failed to load products", err);
        }).finally(() => {
            if (!cancelled) setLoading(false);
        });

        return () => { cancelled = true; };
    }, [router.isReady, jwt, page, pageSize, selectedBrand, selectedCategory, selectedSupplier, selectedTerm, selectedPurchase, searchText]);

    const fromItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
    const toItem = Math.min(page * pageSize, total);
    const [goToPage, setGoToPage] = useState("");

    const paginationItems = (() => {
        if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
        if (page <= 4) return [1, 2, 3, 4, 5, "…", pageCount];
        if (page >= pageCount - 3) return [1, "…", pageCount - 4, pageCount - 3, pageCount - 2, pageCount - 1, pageCount];
        return [1, "…", page - 1, page, page + 1, "…", pageCount];
    })();

    const toggleVariants = async (product) => {
        const docId = product.documentId;
        if (expandedProducts[docId]) {
            setExpandedProducts(prev => ({ ...prev, [docId]: false }));
            return;
        }
        if (!variantsMap[docId]) {
            setLoadingVariants(prev => ({ ...prev, [docId]: true }));
            try {
                const res = await authApi.get("/products", {
                    status: "draft",
                    filters: { parent: { documentId: docId } },
                    populate: { logo: true, categories: true, brands: true, purchase_items: { populate: ["purchase"] } },
                    pagination: { pageSize: 100 },
                });
                const pubRes = await authApi.get("/products", {
                    status: "published",
                    filters: { parent: { documentId: docId } },
                    fields: ["documentId"],
                    pagination: { pageSize: 100 },
                });
                const pubIds = new Set((pubRes.data || []).map(p => p.documentId));
                setVariantsMap(prev => ({
                    ...prev,
                    [docId]: (res.data || []).map(v => ({ ...v, _isPublished: pubIds.has(v.documentId) })),
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
                <div className="d-flex align-items-center justify-content-between mb-3">
                    <h2 className="mb-0">Products</h2>
                </div>

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

                <div className="d-flex align-items-center justify-content-between my-2">
                    <small className="text-muted">{total} products found{total > 0 ? ` · Showing ${fromItem}-${toItem}` : ""}</small>
                    <div className="d-flex align-items-center gap-2">
                        <label className="small text-muted mb-0">Rows:</label>
                        <select
                            className="form-select form-select-sm"
                            style={{ width: 90 }}
                            value={pageSize}
                            onChange={(e) => updateQuery({ pageSize: e.target.value, page: undefined })}
                        >
                            {PAGE_SIZE_OPTIONS.map((size) => (
                                <option key={size} value={size}>{size}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {loading && <p>Loading products...</p>}

                {!loading && products.length === 0 && (
                    <div className="alert alert-info">No products found.</div>
                )}

                {!loading && products.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-striped table-hover">
                            <thead className="table-dark">
                                <tr>
                                    <th style={{ width: 30 }}></th>
                                    <th style={{ width: 50 }}></th>
                                    <th>Name</th>
                                    <th>SKU</th>
                                    <th>Price</th>
                                    <th>Stock</th>
                                    <th>Categories</th>
                                    <th>Brands</th>
                                    <th>Purchase #</th>
                                    <th>Published</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {products.map(p => (
                                    <Fragment key={p.id}>
                                        <tr>
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
                                                        src={StraipImageUrl(p.logo)}
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
                                            <td>
                                                {p._isPublished
                                                    ? <span className="badge bg-success">Published</span>
                                                    : <span className="badge bg-secondary">Draft</span>
                                                }
                                            </td>
                                            <td>
                                                <Link className="btn btn-sm btn-outline-primary" href={`/${p.documentId}/product`}>
                                                    Edit
                                                </Link>
                                            </td>
                                        </tr>
                                        {expandedProducts[p.documentId] && (
                                            loadingVariants[p.documentId] ? (
                                                <tr>
                                                    <td colSpan={11} className="text-center text-muted">
                                                        Loading variants...
                                                    </td>
                                                </tr>
                                            ) : (variantsMap[p.documentId] || []).length === 0 ? (
                                                <tr>
                                                    <td colSpan={11} className="text-center text-muted">
                                                        No variants
                                                    </td>
                                                </tr>
                                            ) : (
                                                (variantsMap[p.documentId] || []).map(v => (
                                                    <tr key={`variant-${v.id}`} className="table-light">
                                                        <td></td>
                                                        <td>
                                                            {v.logo?.url ? (
                                                                <img
                                                                    src={StraipImageUrl(v.logo)}
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
                                                        <td>
                                                            {v._isPublished
                                                                ? <span className="badge bg-success">Published</span>
                                                                : <span className="badge bg-secondary">Draft</span>
                                                            }
                                                        </td>
                                                        <td>
                                                            <Link className="btn btn-sm btn-outline-primary" href={`/${v.documentId}/product`}>
                                                                Edit
                                                            </Link>
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

                {pageCount > 1 && (
                    <nav className="d-flex align-items-center justify-content-between">
                        <div>
                            <button
                                className="btn btn-sm btn-outline-secondary me-1"
                                disabled={page <= 1}
                                onClick={() => updateQuery({ page: page - 1 > 1 ? page - 1 : undefined })}
                            >
                                &laquo; Prev
                            </button>
                            <button
                                className="btn btn-sm btn-outline-secondary"
                                disabled={page >= pageCount}
                                onClick={() => updateQuery({ page: page + 1 })}
                            >
                                Next &raquo;
                            </button>
                        </div>
                        <div className="d-flex align-items-center gap-2">
                            <ul className="pagination pagination-sm mb-0">
                                {paginationItems.map((item, idx) => (
                                    typeof item === "number" ? (
                                        <li key={item} className={`page-item ${page === item ? "active" : ""}`}>
                                            <button className="page-link" onClick={() => updateQuery({ page: item > 1 ? item : undefined })}>{item}</button>
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
                                    max={pageCount}
                                    className="form-control form-control-sm"
                                    style={{ width: 80 }}
                                    value={goToPage}
                                    onChange={(e) => setGoToPage(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key !== "Enter") return;
                                        const target = Math.max(1, Math.min(pageCount, parseInt(goToPage, 10) || 1));
                                        updateQuery({ page: target > 1 ? target : undefined });
                                        setGoToPage("");
                                    }}
                                />
                                <button
                                    className="btn btn-sm btn-outline-secondary"
                                    onClick={() => {
                                        const target = Math.max(1, Math.min(pageCount, parseInt(goToPage, 10) || 1));
                                        updateQuery({ page: target > 1 ? target : undefined });
                                        setGoToPage("");
                                    }}
                                >
                                    Go
                                </button>
                            </div>
                        </div>
                    </nav>
                )}
            </Layout>
        </ProtectedRoute>
    );
}

export async function getServerSideProps() { return { props: {} }; }
