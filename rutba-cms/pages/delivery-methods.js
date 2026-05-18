import { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { DeliveryMethodsEndpoints } from "@rutba/api-provider/endpoints";
import Link from "next/link";
import ListPageLayout, { AddButton } from "@rutba/pos-shared/components/ListPageLayout";
import ListPagination from "@rutba/pos-shared/components/ListPagination";
import ExcelIO from "../components/ExcelIO";

const DELIVERY_METHOD_EXCEL_COLUMNS = [
    { key: "name", isLabel: true, width: 28 },
    { key: "description", width: 60 },
];

const DEFAULT_PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 200];

export default function DeliveryMethods() {
    const { jwt } = useAuth();
    const [methods, setMethods] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
    const [total, setTotal] = useState(0);

    const load = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        try {
            const res = await DeliveryMethodsEndpoints.list({
                sort: ["priority:asc", "createdAt:desc"],
                populate: ["product_groups", "cms_pages", "categories", "delivery_zones"],
                page,
                pageSize,
            });
            setMethods(res.data || []);
            setTotal(res.meta?.pagination?.total ?? 0);
        } catch (err) {
            console.error("Failed to load delivery methods", err);
        } finally {
            setLoading(false);
        }
    }, [jwt, page, pageSize]);

    useEffect(() => { load(); }, [load]);

    const fetchAllMethods = useCallback(async () => {
        const out = [];
        let p = 1;
        const PAGE = 100;
        while (true) {
            const res = await DeliveryMethodsEndpoints.list({
                sort: ["priority:asc", "createdAt:desc"],
                populate: ["product_groups", "cms_pages", "categories", "delivery_zones"],
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

    return (
        <ProtectedRoute>
            <Layout>
                <ListPageLayout
                    title="Delivery Methods"
                    subtitle="Manage delivery methods and link them to product groups, CMS pages, and categories."
                    headerActions={
                        <>
                            <ExcelIO
                                entityLabel="Delivery Methods"
                                contentType="api::delivery-method.delivery-method"
                                columns={DELIVERY_METHOD_EXCEL_COLUMNS}
                                rows={methods}
                                total={total}
                                fetchAll={fetchAllMethods}
                                findExisting={async (row) => {
                                    if (!row.name) return null;
                                    try {
                                        const res = await DeliveryMethodsEndpoints.list({ pagination: { pageSize: 1 }, filters: { name: { $eq: row.name } } });
                                        return res.data?.[0] || null;
                                    } catch { return null; }
                                }}
                                create={(data) => DeliveryMethodsEndpoints.create(data)}
                                update={(documentId, data) => DeliveryMethodsEndpoints.updateDraft(documentId, data)}
                                onAfterImport={load}
                            />
                            <AddButton label="New Delivery Method" href="/new/delivery-method" />
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
                    emptyState={<div>No delivery methods found.</div>}
                >
                    {methods.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-hover list-table">
                            <thead>
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
                                        <td><span className="list-status" style={{ background: '#0dcaf0', color: '#212529' }}>{m.service_provider || "—"}</span></td>
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
                                                ? <span className="list-status" style={{ background: '#198754', color: '#fff' }}>Yes</span>
                                                : <span className="list-status" style={{ background: '#6c757d', color: '#fff' }}>No</span>}
                                        </td>
                                        <td>
                                            <div className="list-actions">
                                                <Link href={`/${m.documentId}/delivery-method`} className="btn btn-outline-primary">
                                                    <i className="fas fa-edit"></i>
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

export async function getServerSideProps() {
    return { props: {} };
}
