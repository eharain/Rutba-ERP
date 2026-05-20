import { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { SaleOffersEndpoints } from "@rutba/api-provider/endpoints";
import Link from "next/link";
import ListPageLayout, { AddButton } from "@rutba/pos-shared/components/ListPageLayout";
import ListPagination from "@rutba/pos-shared/components/ListPagination";
import ExcelIO from "../components/ExcelIO";

// Server-side coerceForSchema (cms-bulk controller) converts string cells
// back to the schema's declared type on import — booleans accept
// true/1/yes, numbers accept any numeric string, datetimes pass through
// as ISO strings. So scalar columns here just need a key + width; the
// format on booleans is for human readability on export.
const SALE_OFFER_EXCEL_COLUMNS = [
    { key: "name", isLabel: true, width: 36 },
    { key: "description", width: 80 },
    { key: "active", width: 10, format: (r) => (r.active ? "true" : "false") },
    { key: "start_date", width: 22 },
    { key: "end_date", width: 22 },
    { key: "discount_mode", width: 22 },
    { key: "discount_value", width: 14 },
    { key: "free_shipping", width: 12, format: (r) => (r.free_shipping ? "true" : "false") },
    { key: "priority", width: 10 },
];

const DEFAULT_PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 200];

export default function Offers() {
    const { jwt } = useAuth();
    const [offers, setOffers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
    const [total, setTotal] = useState(0);

    const load = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        try {
            const [draftRes, pubRes] = await Promise.all([
                SaleOffersEndpoints.listDraft({ sort: ["createdAt:desc"], populate: ["product_groups", "cms_pages", "categories"], page, pageSize }),
                SaleOffersEndpoints.listPublished({ pageSize: 200 }),
            ]);
            const pubIds = new Set((pubRes.data || []).map(o => o.documentId));
            const mapped = (draftRes.data || []).map(o => ({ ...o, _isPublished: pubIds.has(o.documentId) }));
            setOffers(mapped);
            setTotal(draftRes.meta?.pagination?.total ?? 0);
        } catch (err) {
            console.error("Failed to load sale offers", err);
        } finally {
            setLoading(false);
        }
    }, [jwt, page, pageSize]);

    useEffect(() => { load(); }, [load]);

    const fetchAllOffers = useCallback(async () => {
        const out = [];
        let p = 1;
        const PAGE = 100;
        while (true) {
            const res = await SaleOffersEndpoints.listDraft({
                sort: ["createdAt:desc"],
                populate: ["product_groups", "cms_pages", "categories"],
                page: p,
                pageSize: PAGE,
            });
            const arr = res.data || [];
            out.push(...arr);
            if (arr.length < PAGE) break;
            p += 1;
            if (p > 500) break;
        }
        return out;
    }, []);

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
                    headerActions={
                        <>
                            <ExcelIO
                                entityLabel="Sale Offers"
                                contentType="api::sale-offer.sale-offer"
                                columns={SALE_OFFER_EXCEL_COLUMNS}
                                rows={offers}
                                total={total}
                                fetchAll={fetchAllOffers}
                                findExisting={async (row) => {
                                    if (!row.name) return null;
                                    try {
                                        const res = await SaleOffersEndpoints.listDraft({ pagination: { pageSize: 1 }, filters: { name: { $eq: row.name } } });
                                        return res.data?.[0] || null;
                                    } catch { return null; }
                                }}
                                create={(data) => SaleOffersEndpoints.create(data)}
                                update={(documentId, data) => SaleOffersEndpoints.updateDraft(documentId, data)}
                                onAfterImport={load}
                            />
                            <AddButton label="New Sale Offer" href="/new/sale-offer" />
                        </>
                    }
                    loading={loading}
                    pagination={
                        <ListPagination
                            page={page}
                            pageSize={pageSize}
                            total={total}
                            onPage={setPage}
                            onPageSize={(s) => { setPageSize(s); setPage(1); }}
                            pageSizeOptions={PAGE_SIZE_OPTIONS}
                        />
                    }
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
