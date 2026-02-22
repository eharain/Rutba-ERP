import { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi, StraipImageUrl } from "@rutba/pos-shared/lib/api";
import { useUtil } from "@rutba/pos-shared/context/UtilContext";
import Link from "next/link";

export default function Products() {
    const { jwt } = useAuth();
    const { currency } = useUtil();
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [pageCount, setPageCount] = useState(1);
    const [search, setSearch] = useState("");

    const loadProducts = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        try {
            const params = {
                sort: ["createdAt:desc"],
                pagination: { page, pageSize: 25 },
                populate: ["logo", "categories", "brands", { purchase_items: { populate: ["purchase"] } }],
            };
            if (search.trim()) {
                params.filters = { name: { $containsi: search.trim() } };
            }
            const res = await authApi.get("/products", params);
            setProducts(res.data || []);
            setPageCount(res.meta?.pagination?.pageCount ?? 1);
        } catch (err) {
            console.error("Failed to load products", err);
        } finally {
            setLoading(false);
        }
    }, [jwt, page, search]);

    useEffect(() => { loadProducts(); }, [loadProducts]);

    return (
        <ProtectedRoute>
            <Layout>
                <div className="d-flex align-items-center justify-content-between mb-3">
                    <h2 className="mb-0">Products</h2>
                </div>

                <div className="row g-2 mb-3">
                    <div className="col-md-4">
                        <input
                            type="text"
                            className="form-control form-control-sm"
                            placeholder="Search products…"
                            value={search}
                            onChange={e => { setSearch(e.target.value); setPage(1); }}
                        />
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
                                    <tr key={p.id}>
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
                                        <td>{p.name}</td>
                                        <td>{p.sku || "—"}</td>
                                        <td>{currency}{parseFloat(p.selling_price || 0).toFixed(2)}</td>
                                        <td>{p.stock_quantity ?? "—"}</td>
                                        <td>{(p.categories || []).map(c => c.name).join(", ") || "—"}</td>
                                        <td>{(p.brands || []).map(b => b.name).join(", ") || "—"}</td>
                                        <td>{(p.purchase_items || []).map(pi => pi.purchase?.orderId).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", ") || "—"}</td>
                                        <td>
                                            {p.publishedAt
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
