import { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi } from "@rutba/pos-shared/lib/api";
import Link from "next/link";

export default function BrandGroups() {
    const { jwt } = useAuth();
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        try {
            const [draftRes, pubRes] = await Promise.all([
                authApi.get("/brand-groups", {
                    status: 'draft',
                    sort: ["sort_order:asc", "createdAt:desc"],
                    populate: ["brands"],
                    pagination: { pageSize: 50 },
                }),
                authApi.get("/brand-groups", { status: 'published', fields: ["documentId"], pagination: { pageSize: 200 } }),
            ]);
            const pubIds = new Set((pubRes.data || []).map(g => g.documentId));
            setGroups((draftRes.data || []).map(g => ({ ...g, _isPublished: pubIds.has(g.documentId) })));
        } catch (err) {
            console.error("Failed to load brand groups", err);
        } finally {
            setLoading(false);
        }
    }, [jwt]);

    useEffect(() => { load(); }, [load]);

    return (
        <ProtectedRoute>
            <Layout>
                <div className="d-flex align-items-center justify-content-between mb-3">
                    <h2 className="mb-0">Brand Groups</h2>
                    <Link className="btn btn-primary btn-sm" href="/new/brand-group">
                        <i className="fas fa-plus me-1"></i>New Brand Group
                    </Link>
                </div>

                <p className="text-muted small mb-3">
                    Brand groups let you curate which brands appear on each CMS page. Link them to a page to display a branded section with the group name as its title.
                </p>

                {loading && <p>Loading brand groups...</p>}

                {!loading && groups.length === 0 && (
                    <div className="alert alert-info">No brand groups found.</div>
                )}

                {!loading && groups.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-striped table-hover">
                            <thead className="table-dark">
                                <tr>
                                    <th>Name</th>
                                    <th>Slug</th>
                                    <th>Brands</th>
                                    <th>Order</th>
                                    <th>Published</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {groups.map(g => (
                                    <tr key={g.id}>
                                        <td>{g.name}</td>
                                        <td><code>{g.slug}</code></td>
                                        <td><span className="badge bg-primary">{(g.brands || []).length}</span></td>
                                        <td>{g.sort_order}</td>
                                        <td>
                                            {g._isPublished
                                                ? <span className="badge bg-success">Published</span>
                                                : <span className="badge bg-secondary">Draft</span>
                                            }
                                        </td>
                                        <td>
                                            <Link className="btn btn-sm btn-outline-primary" href={`/${g.documentId}/brand-group`}>
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
