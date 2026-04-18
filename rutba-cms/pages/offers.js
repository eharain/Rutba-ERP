import { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi } from "@rutba/pos-shared/lib/api";
import Link from "next/link";

export default function Offers() {
    const { jwt } = useAuth();
    const [offers, setOffers] = useState([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        try {
            const [draftRes, pubRes] = await Promise.all([
                authApi.get("/offers", {
                    status: 'draft',
                    sort: ["createdAt:desc"],
                    populate: ["product_groups", "cms_pages", "categories"],
                    pagination: { pageSize: 50 },
                }),
                authApi.get("/offers", { status: 'published', fields: ["documentId"], pagination: { pageSize: 200 } }),
            ]);
            const pubIds = new Set((pubRes.data || []).map(o => o.documentId));
            const mapped = (draftRes.data || []).map(o => ({ ...o, _isPublished: pubIds.has(o.documentId) }));
            setOffers(mapped);
        } catch (err) {
            console.error("Failed to load offers", err);
        } finally {
            setLoading(false);
        }
    }, [jwt]);

    useEffect(() => { load(); }, [load]);

    const formatDate = (iso) => {
        if (!iso) return "—";
        return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    };

    const getStatus = (o) => {
        if (!o.active) return { label: "Inactive", cls: "bg-secondary" };
        const now = Date.now();
        if (o.start_date && new Date(o.start_date).getTime() > now) return { label: "Upcoming", cls: "bg-warning text-dark" };
        if (o.end_date && new Date(o.end_date).getTime() < now) return { label: "Expired", cls: "bg-dark" };
        return { label: "Active", cls: "bg-success" };
    };

    return (
        <ProtectedRoute>
            <Layout>
                <div className="d-flex align-items-center justify-content-between mb-3">
                    <h2 className="mb-0">Offers</h2>
                    <Link className="btn btn-primary btn-sm" href="/new/offer">
                        <i className="fas fa-plus me-1"></i>New Offer
                    </Link>
                </div>

                <p className="text-muted small mb-3">
                    Offers can be linked to product groups, CMS pages, and categories to display promotions uniformly across the site.
                </p>

                {loading && <p>Loading offers...</p>}

                {!loading && offers.length === 0 && (
                    <div className="alert alert-info">No offers found.</div>
                )}

                {!loading && offers.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-striped table-hover">
                            <thead className="table-dark">
                                <tr>
                                    <th>Name</th>
                                    <th>Status</th>
                                    <th>Start</th>
                                    <th>End</th>
                                    <th>Groups</th>
                                    <th>Pages</th>
                                    <th>Categories</th>
                                    <th>Published</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {offers.map(o => {
                                    const status = getStatus(o);
                                    return (
                                        <tr key={o.id}>
                                            <td><Link href={`/${o.documentId}/offer`} className="text-decoration-none fw-semibold">{o.name}</Link></td>
                                            <td><span className={`badge ${status.cls}`}>{status.label}</span></td>
                                            <td className="small">{formatDate(o.start_date)}</td>
                                            <td className="small">{formatDate(o.end_date)}</td>
                                            <td>{(o.product_groups || []).length}</td>
                                            <td>{(o.cms_pages || []).length}</td>
                                            <td>{(o.categories || []).length}</td>
                                            <td>
                                                {o._isPublished
                                                    ? <span className="badge bg-success">Yes</span>
                                                    : <span className="badge bg-secondary">Draft</span>}
                                            </td>
                                            <td>
                                                <Link href={`/${o.documentId}/offer`} className="btn btn-sm btn-outline-primary">
                                                    <i className="fas fa-edit"></i>
                                                </Link>
                                            </td>
                                        </tr>
                                    );
                                })}
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
