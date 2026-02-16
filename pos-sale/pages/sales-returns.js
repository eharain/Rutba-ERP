import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { authApi } from "@rutba/pos-shared/lib/api";
import { useUtil } from "@rutba/pos-shared/context/UtilContext";
import Link from "next/link";
import { Table, TableHead, TableRow, TableCell, TableBody, TablePagination } from "@rutba/pos-shared/components/Table";

export default function SalesReturnsPage() {
    const { currency } = useUtil();
    const [returns, setReturns] = useState([]);
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        loadReturns();
    }, [page, rowsPerPage]);

    function getEntryId(entry) {
        return entry?.documentId || entry?.id;
    }

    async function loadReturns() {
        setLoading(true);
        try {
            const res = await authApi.fetch("/sale-returns", {
                sort: ["createdAt:desc"],
                populate: { sale: true, items: { populate: { product: true } } },
                pagination: { page: page + 1, pageSize: rowsPerPage }
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
                <div className="p-3">
                    <div className="d-flex justify-content-between align-items-center mb-3">
                        <h2 className="mb-0">Sales Returns</h2>
                        <Link href="/new/sale-return" className="btn btn-primary">
                            <i className="fas fa-plus me-1"></i>New Return
                        </Link>
                    </div>

                    <Table>
                        <TableHead>
                             <TableRow>
                                <TableCell>Return No</TableCell>
                                <TableCell>Type</TableCell>
                                <TableCell>Date</TableCell>
                                <TableCell>Sale Invoice</TableCell>
                                <TableCell>Items</TableCell>
                                <TableCell>Refund Method</TableCell>
                                <TableCell align="right">Refund</TableCell>
                                <TableCell>Status</TableCell>
                                <TableCell>View</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {loading && (
                                <TableRow>
                                    <TableCell colSpan={9} className="text-center">
                                        <span className="spinner-border spinner-border-sm me-1"></span>Loading...
                                    </TableCell>
                                </TableRow>
                            )}
                            {!loading && returns.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={9} className="text-center text-muted">No returns found.</TableCell>
                                </TableRow>
                            )}
                            {returns.map(ret => (
                                <TableRow key={getEntryId(ret)}>
                                    <TableCell><strong>{ret.return_no || "-"}</strong></TableCell>
                                    <TableCell>
                                        <span className={`badge ${ret.type === "Exchange" ? "bg-info" : "bg-secondary"}`}>
                                            {ret.type || "Return"}
                                        </span>
                                    </TableCell>
                                    <TableCell>{ret.return_date ? new Date(ret.return_date).toLocaleString() : "-"}</TableCell>
                                    <TableCell>{ret.sale?.invoice_no || "-"}</TableCell>
                                    <TableCell>{ret.items?.length || 0}</TableCell>
                                    <TableCell>{ret.refund_method || "—"}</TableCell>
                                    <TableCell align="right">{currency}{Number(ret.total_refund || 0).toFixed(2)}</TableCell>
                                    <TableCell>
                                        <span className={`badge ${ret.refund_status === "Refunded" ? "bg-success" : ret.refund_status === "Credited" ? "bg-info" : "bg-warning text-dark"}`}>
                                            {ret.refund_status || "Pending"}
                                        </span>
                                    </TableCell>
                                    <TableCell>
                                        <Link href={`/${getEntryId(ret)}/sale-return`} style={{ textDecoration: "none" }}>
                                            <i className="fas fa-eye me-1"></i>View
                                        </Link>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    <TablePagination
                        count={total}
                        page={page}
                        onPageChange={(e, newPage) => setPage(newPage)}
                        rowsPerPage={rowsPerPage}
                        onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
                        rowsPerPageOptions={[5, 10, 25]}
                    />
                </div>
            </Layout>
        </ProtectedRoute>
    );
}

export async function getServerSideProps() { return { props: {} }; }
