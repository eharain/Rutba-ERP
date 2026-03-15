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

export default function Products() {
    const router = useRouter();
    const { jwt } = useAuth();
    const { currency } = useUtil();
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [pageSize] = useState(25);
    const [pageCount, setPageCount] = useState(1);
    const [total, setTotal] = useState(0);

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
    const [searchText, setSearchText] = useState("");
    const [filters, setFilters] = useState({ parentOnly: true, status: "draft" });
    const [filtersInitialized, setFiltersInitialized] = useState(false);

    const [expandedProducts, setExpandedProducts] = useState({});
    const [variantsMap, setVariantsMap] = useState({});
    const [loadingVariants, setLoadingVariants] = useState({});

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

    useEffect(() => {
        if (!router.isReady || filtersInitialized) return;
        const getQueryValue = (v) => (Array.isArray(v) ? v[0] : v);
        const q = router.query;
        if (q.brands) setSelectedBrand(getQueryValue(q.brands));
        if (q.categories) setSelectedCategory(getQueryValue(q.categories));
        if (q.suppliers) setSelectedSupplier(getQueryValue(q.suppliers));
        if (q.terms) setSelectedTerm(getQueryValue(q.terms));
        if (q.purchases) setSelectedPurchase(getQueryValue(q.purchases));
        if (q.searchText) setSearchText(getQueryValue(q.searchText));
        setFiltersInitialized(true);
    }, [router.isReady, router.query, filtersInitialized]);

    useEffect(() => {
        if (!filtersInitialized) return;
        const updatedFilters = {
            brands: [selectedBrand].filter(Boolean),
            categories: [selectedCategory].filter(Boolean),
            suppliers: [selectedSupplier].filter(Boolean),
            terms: [selectedTerm].filter(Boolean),
            purchases: [selectedPurchase].filter(Boolean),
            searchText,
            parentOnly: true,
            status: "draft",
        };
        const query = {};
        if (selectedBrand) query.brands = selectedBrand;
        if (selectedCategory) query.categories = selectedCategory;
        if (selectedSupplier) query.suppliers = selectedSupplier;
        if (selectedTerm) query.terms = selectedTerm;
        if (selectedPurchase) query.purchases = selectedPurchase;
        if (searchText) query.searchText = searchText;
        router.replace({ pathname: router.pathname, query }, undefined, { shallow: true });

        for (const [key, value] of Object.entries(updatedFilters)) {
            if (Array.isArray(value) && value.length === 0) {
                delete updatedFilters[key];
            }
        }
        setFilters(updatedFilters);
        setPage(1);
    }, [selectedBrand, selectedCategory, selectedSupplier, selectedTerm, selectedPurchase, searchText, filtersInitialized]);

    const loadProducts = useCallback(async () => {
        if (!jwt || !filtersInitialized) return;
        setLoading(true);
        try {
            const [productRes, pubRes] = await Promise.all([
                fetchProducts(filters, page, pageSize, "createdAt:desc"),
                authApi.get("/products", { status: 'published', fields: ["documentId"], pagination: { pageSize: 500 } }),
            ]);
            const pubIds = new Set((pubRes.data || []).map(p => p.documentId));
            setProducts((productRes.data || []).map(p => ({ ...p, _isPublished: pubIds.has(p.documentId) })));
            setPageCount(productRes.meta?.pagination?.pageCount ?? 1);
            setTotal(productRes.meta?.pagination?.total ?? 0);
        } catch (err) {
            console.error("Failed to load products", err);
        } finally {
            setLoading(false);
        }
    }, [jwt, page, filters, filtersInitialized]);

    useEffect(() => { loadProducts(); }, [loadProducts]);

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
                    onBrandChange={(v) => { setSelectedBrand(v); setPage(1); }}
                    onCategoryChange={(v) => { setSelectedCategory(v); setPage(1); }}
                    onSupplierChange={(v) => { setSelectedSupplier(v); setPage(1); }}
                    onTermChange={(v) => { setSelectedTerm(v); setPage(1); }}
                    onPurchaseChange={(v) => { setSelectedPurchase(v); setPage(1); }}
                    onSearchTextChange={(v) => { setSearchText(v); setPage(1); }}
                />

                <div className="d-flex align-items-center justify-content-between my-2">
                    <small className="text-muted">{total} products found</small>
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
                                    <th></th>
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
                    <nav>
                        <ul className="pagination pagination-sm">
                            {Array.from({ length: pageCount }, (_, i) => (
                                <li key={i + 1} className={`page-item ${page === i + 1 ? "active" : ""}`}>
                                    <button className="page-link" onClick={() => setPage(i + 1)}>{i + 1}</button>
                                </li>
                            ))}
                        </ul>
                    </nav>
                )}
            </Layout>
        </ProtectedRoute>
    );
}

export async function getServerSideProps() { return { props: {} }; }
