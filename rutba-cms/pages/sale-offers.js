import { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { SaleOffersEndpoints } from "@rutba/api-provider/endpoints";
import Link from "next/link";
import ListPageLayout, { AddButton } from "@rutba/pos-shared/components/ListPageLayout";

export default function Offers() {
    const { jwt } = useAuth();
    const [offers, setOffers] = useState([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        try {
            const [draftRes, pubRes] = await Promise.all([
                SaleOffersEndpoints.listDraft({ sort: ["createdAt:desc"], populate: ["product_groups", "cms_pages", "categories"], pagination: { pageSize: 50 } }),
                SaleOffersEndpoints.listPublished({ pageSize: 200 }),
            ]);
            const pubIds = new Set((pubRes.data || []).map(o => o.documentId));
            const mapped = (draftRes.data || []).map(o => ({ ...o, _isPublished: pubIds.has(o.documentId) }));
            setOffers(mapped);
        } catch (err) {
            console.error("Failed to load sale offers", err);
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
        if (!o.active) return { label: "Inactive", bg: "#6c757d", color: "#fff" };
        const now = Date.now();
        if (o.start_date && new Date(o.start_date).getTime() > now) return { label: "Upcoming", bg: "#ffc107", color: "#212529" };
        if (o.end_date && new Date(o.end_date).getTime() < now) return { label: "Expired", bg: "#212529", color: "#fff" };
        return { label: "Active", bg: "#198754", color: "#fff" };
    };

    return (
        <ProtectedRoute>
            <Layout>
                <ListPageLayout
                    title="Sale Offers"
                    subtitle="Sale offers can be linked to product groups, CMS pages, and categories to display promotions uniformly across the site."
                    headerActions={<AddButton label="New Sale Offer" href="/new/sale-offer" />}
                    loading={loading}
                    emptyState={<div>No sale offers found.</div>}
                >
                    {offers.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-hover list-table">
                            <thead>
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
                                            <td><Link href={`/${o.documentId}/sale-offer`} className="text-decoration-none fw-semibold">{o.name}</Link></td>
                                            <td><span className="list-status" style={{ background: status.bg, color: status.color }}>{status.label}</span></td>
                                            <td className="small">{formatDate(o.start_date)}</td>
                                            <td className="small">{formatDate(o.end_date)}</td>
                                            <td>{(o.product_groups || []).length}</td>
                                            <td>{(o.cms_pages || []).length}</td>
                                            <td>{(o.categories || []).length}</td>
                                            <td>
                                                {o._isPublished
                                                    ? <span className="list-status" style={{ background: '#198754', color: '#fff' }}>Yes</span>
                                                    : <span className="list-status" style={{ background: '#6c757d', color: '#fff' }}>Draft</span>}
                                            </td>
                                            <td>
                                                <div className="list-actions">
                                                    <Link href={`/${o.documentId}/sale-offer`} className="btn btn-outline-primary">
                                                        <i className="fas fa-edit"></i>
                                                    </Link>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    )}
                </ListPageLayout>
            </Layout>
        </ProtectedRoute>
    );
}

export async function getServerSideProps() {
    return { props: {} };
}
