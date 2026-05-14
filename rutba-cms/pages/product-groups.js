import { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { MediaUtilsEndpoints, ProductGroupsEndpoints } from "@rutba/api-provider/endpoints";
import Link from "next/link";
import ListPageLayout, { AddButton } from "@rutba/pos-shared/components/ListPageLayout";

export default function ProductGroups() {
    const { jwt } = useAuth();
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        try {
            const [draftRes, pubRes] = await Promise.all([
                ProductGroupsEndpoints.listDraft({ sort: ["createdAt:desc"], populate: ["gallery", "cover_image", "products"], pagination: { pageSize: 50 } }),
                ProductGroupsEndpoints.listPublished({ pageSize: 200 }),
            ]);
            const pubIds = new Set((pubRes.data || []).map(g => g.documentId));
            const mapped = (draftRes.data || []).map(g => ({ ...g, _isPublished: pubIds.has(g.documentId) }));
            mapped.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
            setGroups(mapped);
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
                <ListPageLayout
                    title="Product Groups"
                    subtitle="Product groups power the homepage banners, featured sections, and collections on the website."
                    headerActions={<AddButton label="New Group" href="/new/product-group" />}
                    loading={loading}
                    emptyState={<div>No product groups found.</div>}
                >
                    {groups.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-hover list-table">
                            <thead>
                                <tr>
                                    <th style={{ width: 50 }}></th>
                                    <th>Name</th>
                                    <th>Layout</th>
                                    <th>Priority</th>
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
                                                <img src={MediaUtilsEndpoints.strapiImageUrl(g.gallery)} alt={g.name} style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 4 }} />
                                            ) : g.cover_image?.url ? (
                                                <img src={MediaUtilsEndpoints.strapiImageUrl(g.cover_image)} alt={g.name} style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 4 }} />
                                            ) : (
                                                <span className="text-muted"><i className="fas fa-layer-group"></i></span>
                                            )}
                                        </td>
                                        <td>{g.name}</td>
                                        <td><span className="list-status" style={{ background: '#0dcaf0', color: '#212529' }}>{g.layout || 'grid-4'}</span></td>
                                        <td>{g.priority ?? 0}</td>
                                        <td><code>{g.slug}</code></td>
                                        <td><span className="list-status" style={{ background: '#0d6efd', color: '#fff' }}>{(g.products || []).length}</span></td>
                                        <td>
                                            {g._isPublished
                                                ? <span className="list-status" style={{ background: '#198754', color: '#fff' }}>Published</span>
                                                : <span className="list-status" style={{ background: '#6c757d', color: '#fff' }}>Draft</span>
                                            }
                                        </td>
                                        <td>
                                            <div className="list-actions">
                                                <Link className="btn btn-outline-primary" href={`/${g.documentId}/product-group`}>
                                                    Edit
                                                </Link>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    )}
                </ListPageLayout>
            </Layout>
        </ProtectedRoute>
    );
}

