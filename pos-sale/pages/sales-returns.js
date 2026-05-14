import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { SaleReturnsEndpoints } from "@rutba/api-provider/endpoints/index.js";
import { useUtil } from "@rutba/pos-shared/context/UtilContext";
import Link from "next/link";
import ListPageLayout, { AddButton } from "@rutba/pos-shared/components/ListPageLayout";
import ListPagination from "@rutba/pos-shared/components/ListPagination";

export default function SalesReturnsPage() {
    const { currency } = useUtil();
    const [returns, setReturns] = useState([]);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        loadReturns();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, pageSize]);

    function getEntryId(entry) {
        return entry?.documentId || entry?.id;
    }

    async function loadReturns() {
        setLoading(true);
        try {
            const res = await SaleReturnsEndpoints.list(page, pageSize, {
                populate: { sale: true, items: { populate: { product: true } } },
            });
            setReturns(res?.data ?? []);
            setTotal(res?.meta?.pagination?.total ?? 0);
        } catch (err) {
            console.error("Failed to load returns", err);
        } finally {
            setLoading(false);
        }
    }

    return (
        <ProtectedRoute>
            <Layout>
                <ListPageLayout
                    title="Sales Returns"
                    subtitle={total != null ? `${total} total` : undefined}
                    headerActions={<AddButton label="New Return" href="/new/sale-return" />}
                    loading={loading}
                    pagination={
                        <ListPagination
                            page={page}
                            pageSize={pageSize}
                            total={total}
                            onPage={setPage}
                            onPageSize={(n) => { setPageSize(n); setPage(1); }}
                            pageSizeOptions={[5, 10, 25]}
                        />
                    }
                    emptyState={<div>No returns found.</div>}
                >
                    <div className="table-responsive">
                        <table className="table table-hover list-table">
                            <thead>
                                <tr>
                                    <th>Return No</th>
                                    <th>Type</th>
                                    <th>Date</th>
                                    <th>Sale Invoice</th>
                                    <th>Items</th>
                                    <th>Refund Method</th>
                                    <th style={{ textAlign: 'right' }}>Refund</th>
                                    <th>Status</th>
                                    <th>View</th>
                                </tr>
                            </thead>
                            <tbody>
                                {returns.length === 0 ? (
                                    <tr>
                                        <td colSpan={9} className="text-center text-muted py-3">No returns found.</td>
                                    </tr>
                                ) : returns.map(ret => (
                                    <tr key={getEntryId(ret)}>
                                        <td><strong>{ret.return_no || "-"}</strong></td>
                                        <td>
                                            <span className={`list-status ${ret.type === "Exchange" ? "bg-info" : "bg-secondary"}`}>
                                                {ret.type || "Return"}
                                            </span>
                                        </td>
                                        <td>{ret.return_date ? new Date(ret.return_date).toLocaleString() : "-"}</td>
                                        <td>{ret.sale?.invoice_no || "-"}</td>
                                        <td>{ret.items?.length || 0}</td>
                                        <td>{ret.refund_method || "-"}</td>
                                        <td style={{ textAlign: 'right' }}>{currency}{Number(ret.total_refund || 0).toFixed(2)}</td>
                                        <td>
                                            <span className={`list-status ${ret.refund_status === "Refunded" ? "bg-success" : ret.refund_status === "Credited" ? "bg-info" : "bg-warning text-dark"}`}>
                                                {ret.refund_status || "Pending"}
                                            </span>
                                        </td>
                                        <td>
                                            <div className="list-actions">
                                                <Link href={`/${getEntryId(ret)}/sale-return`} className="btn btn-sm btn-outline-primary" style={{ textDecoration: "none" }}>
                                                    <i className="fas fa-eye me-1"></i>View
                                                </Link>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </ListPageLayout>
            </Layout>
        </ProtectedRoute>
    );
}
