import { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi, StraipImageUrl } from "@rutba/pos-shared/lib/api";
import Link from "next/link";

export default function Categories() {
    const { jwt } = useAuth();
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    const load = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        try {
            const params = {
                sort: ["name:asc"],
                populate: ["logo", "parent"],
                pagination: { pageSize: 100 },
            };
            if (search.trim()) {
                params.filters = { name: { $containsi: search.trim() } };
            }
            const res = await authApi.get("/categories", params);
            setCategories(res.data || []);
        } catch (err) {
            console.error("Failed to load categories", err);
        } finally {
            setLoading(false);
        }
    }, [jwt, search]);

    useEffect(() => { load(); }, [load]);

    return (
        <ProtectedRoute>
            <Layout>
                <div className="d-flex align-items-center justify-content-between mb-3">
                    <h2 className="mb-0">Categories</h2>
                    <Link className="btn btn-primary btn-sm" href="/new/category">
                        <i className="fas fa-plus me-1"></i>New Category
                    </Link>
                </div>

                <div className="row g-2 mb-3">
                    <div className="col-md-4">
                        <input
                            type="text"
                            className="form-control form-control-sm"
                            placeholder="Search categories…"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                </div>

                {loading && <p>Loading categories...</p>}

                {!loading && categories.length === 0 && (
                    <div className="alert alert-info">No categories found.</div>
                )}

                {!loading && categories.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-striped table-hover">
                            <thead className="table-dark">
                                <tr>
                                    <th style={{ width: 50 }}></th>
                                    <th>Name</th>
                                    <th>Slug</th>
                                    <th>Parent</th>
                                    <th>Published</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {categories.map(c => (
                                    <tr key={c.id}>
                                        <td>
                                            {c.logo?.url ? (
                                                <img src={StraipImageUrl(c.logo)} alt={c.name} style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 4 }} />
                                            ) : (
                                                <span className="text-muted"><i className="fas fa-folder"></i></span>
                                            )}
                                        </td>
                                        <td>{c.name}</td>
                                        <td><code>{c.slug}</code></td>
                                        <td>{c.parent?.name || "—"}</td>
                                        <td>
                                            {c.publishedAt
                                                ? <span className="badge bg-success">Published</span>
                                                : <span className="badge bg-secondary">Draft</span>
                                            }
                                        </td>
                                        <td>
                                            <Link className="btn btn-sm btn-outline-primary" href={`/${c.documentId}/category`}>
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
