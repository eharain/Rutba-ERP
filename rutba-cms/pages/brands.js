import { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi, StraipImageUrl } from "@rutba/pos-shared/lib/api";
import Link from "next/link";

export default function Brands() {
    const { jwt } = useAuth();
    const [brands, setBrands] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    const load = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        try {
            const params = {
                sort: ["name:asc"],
                populate: ["logo"],
                pagination: { pageSize: 100 },
            };
            if (search.trim()) {
                params.filters = { name: { $containsi: search.trim() } };
            }
            const res = await authApi.get("/brands", params);
            setBrands(res.data || []);
        } catch (err) {
            console.error("Failed to load brands", err);
        } finally {
            setLoading(false);
        }
    }, [jwt, search]);

    useEffect(() => { load(); }, [load]);

    return (
        <ProtectedRoute>
            <Layout>
                <div className="d-flex align-items-center justify-content-between mb-3">
                    <h2 className="mb-0">Brands</h2>
                    <Link className="btn btn-primary btn-sm" href="/new/brand">
                        <i className="fas fa-plus me-1"></i>New Brand
                    </Link>
                </div>

                <div className="row g-2 mb-3">
                    <div className="col-md-4">
                        <input
                            type="text"
                            className="form-control form-control-sm"
                            placeholder="Search brands…"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                </div>

                {loading && <p>Loading brands...</p>}

                {!loading && brands.length === 0 && (
                    <div className="alert alert-info">No brands found.</div>
                )}

                {!loading && brands.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-striped table-hover">
                            <thead className="table-dark">
                                <tr>
                                    <th style={{ width: 50 }}></th>
                                    <th>Name</th>
                                    <th>Slug</th>
                                    <th>Published</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {brands.map(b => (
                                    <tr key={b.id}>
                                        <td>
                                            {b.logo?.url ? (
                                                <img src={StraipImageUrl(b.logo)} alt={b.name} style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 4 }} />
                                            ) : (
                                                <span className="text-muted"><i className="fas fa-copyright"></i></span>
                                            )}
                                        </td>
                                        <td>{b.name}</td>
                                        <td><code>{b.slug}</code></td>
                                        <td>
                                            {b.publishedAt
                                                ? <span className="badge bg-success">Published</span>
                                                : <span className="badge bg-secondary">Draft</span>
                                            }
                                        </td>
                                        <td>
                                            <Link className="btn btn-sm btn-outline-primary" href={`/${b.documentId}/brand`}>
                                                Edit
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Layout>
        </ProtectedRoute>
    );
}

export async function getServerSideProps() { return { props: {} }; }
