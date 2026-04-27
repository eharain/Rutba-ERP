import { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi } from "@rutba/pos-shared/lib/api";
import Link from "next/link";

export default function DeliveryMethods() {
    const { jwt } = useAuth();
    const [methods, setMethods] = useState([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        try {
            const res = await authApi.get("/delivery-methods", {
                sort: ["priority:asc", "createdAt:desc"],
                populate: ["product_groups", "cms_pages", "categories", "delivery_zones"],
                pagination: { pageSize: 200 },
            });
            setMethods(res.data || []);
        } catch (err) {
            console.error("Failed to load delivery methods", err);
        } finally {
            setLoading(false);
        }
    }, [jwt]);

    useEffect(() => { load(); }, [load]);

    return (
        <ProtectedRoute>
            <Layout>
                <div className="d-flex align-items-center justify-content-between mb-3">
                    <h2 className="mb-0">Delivery Methods</h2>
                    <Link className="btn btn-primary btn-sm" href="/new/delivery-method">
                        <i className="fas fa-plus me-1"></i>New Delivery Method
                    </Link>
                </div>

                <p className="text-muted small mb-3">
                    Manage delivery methods and link them to product groups, CMS pages, and categories.
                </p>

                {loading && <p>Loading delivery methods...</p>}

                {!loading && methods.length === 0 && (
                    <div className="alert alert-info">No delivery methods found.</div>
                )}

                {!loading && methods.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-striped table-hover">
                            <thead className="table-dark">
                                <tr>
                                    <th>Name</th>
                                    <th>Provider</th>
                                    <th>Cost</th>
                                    <th>Days</th>
                                    <th>Groups</th>
                                    <th>Pages</th>
                                    <th>Categories</th>
                                    <th>Zones</th>
                                    <th>Priority</th>
                                    <th>Active</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {methods.map(m => (
                                    <tr key={m.id}>
                                        <td><Link href={`/${m.documentId}/delivery-method`} className="text-decoration-none fw-semibold">{m.name}</Link></td>
                                        <td><span className="badge bg-info text-dark">{m.service_provider || "—"}</span></td>
                                        <td className="small">
                                            Base: {Number(m.base_cost || 0).toFixed(2)}<br />
                                            /Kg: {Number(m.per_kg_rate || 0).toFixed(2)}
                                        </td>
                                        <td>{m.estimated_days_min ?? 0} - {m.estimated_days_max ?? 0}</td>
                                        <td>{(m.product_groups || []).length}</td>
                                        <td>{(m.cms_pages || []).length}</td>
                                        <td>{(m.categories || []).length}</td>
                                        <td>{(m.delivery_zones || []).length}</td>
                                        <td>{m.priority ?? 0}</td>
                                        <td>
                                            {m.is_active
                                                ? <span className="badge bg-success">Yes</span>
                                                : <span className="badge bg-secondary">No</span>}
                                        </td>
                                        <td>
                                            <Link href={`/${m.documentId}/delivery-method`} className="btn btn-sm btn-outline-primary">
                                                <i className="fas fa-edit"></i>
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

export async function getServerSideProps() {
    return { props: {} };
}
