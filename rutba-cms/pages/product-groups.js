import { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi, StraipImageUrl } from "@rutba/pos-shared/lib/api";
import Link from "next/link";

export default function ProductGroups() {
    const { jwt } = useAuth();
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        try {
            const res = await authApi.get("/product-groups", {
                sort: ["createdAt:desc"],
                populate: ["gallery", "cover_image", "products"],
                pagination: { pageSize: 50 },
            });
            setGroups(res.data || []);
        } catch (err) {
            console.error("Failed to load product groups", err);
        } finally {
            setLoading(false);
        }
    }, [jwt]);

    useEffect(() => { load(); }, [load]);

    return (
        <ProtectedRoute>
            <Layout>
                <div className="d-flex align-items-center justify-content-between mb-3">
                    <h2 className="mb-0">Product Groups</h2>
                    <Link className="btn btn-primary btn-sm" href="/new/product-group">
                        <i className="fas fa-plus me-1"></i>New Group
                    </Link>
                </div>

                <p className="text-muted small mb-3">
                    Product groups power the homepage banners, featured sections, and collections on the website.
                </p>

                {loading && <p>Loading product groups...</p>}

                {!loading && groups.length === 0 && (
                    <div className="alert alert-info">No product groups found.</div>
                )}

                {!loading && groups.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-striped table-hover">
                            <thead className="table-dark">
                                <tr>
                                    <th style={{ width: 50 }}></th>
                                    <th>Name</th>
                                    <th>Slug</th>
                                    <th>Products</th>
                                    <th>Published</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {groups.map(g => (
                                    <tr key={g.id}>
                                        <td>
                                            {g.gallery?.url ? (
                                                <img src={StraipImageUrl(g.gallery)} alt={g.name} style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 4 }} />
                                            ) : g.cover_image?.url ? (
                                                <img src={StraipImageUrl(g.cover_image)} alt={g.name} style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 4 }} />
                                            ) : (
                                                <span className="text-muted"><i className="fas fa-layer-group"></i></span>
                                            )}
                                        </td>
                                        <td>{g.name}</td>
                                        <td><code>{g.slug}</code></td>
                                        <td><span className="badge bg-primary">{(g.products || []).length}</span></td>
                                        <td>
                                            {g.publishedAt
                                                ? <span className="badge bg-success">Published</span>
                                                : <span className="badge bg-secondary">Draft</span>
                                            }
                                        </td>
                                        <td>
                                            <Link className="btn btn-sm btn-outline-primary" href={`/${g.documentId}/product-group`}>
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
