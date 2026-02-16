import { useEffect, useState } from "react";
import Link from "next/link";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { authApi } from "@rutba/pos-shared/lib/api";
import { useUtil } from "@rutba/pos-shared/context/UtilContext";
import { Table, TableHead, TableRow, TableCell, TableBody, TablePagination } from "@rutba/pos-shared/components/Table";

const STATUS_OPTIONS = ["Active", "Closed", "Expired", "Cancelled"];

export default function CashRegisterHistoryPage() {
    const { currency } = useUtil();
    const [registers, setRegisters] = useState([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [total, setTotal] = useState(0);

    // Filters
    const [filterStatus, setFilterStatus] = useState("");
    const [filterDesk, setFilterDesk] = useState("");
    const [filterUser, setFilterUser] = useState("");
    const [filterDateFrom, setFilterDateFrom] = useState("");
    const [filterDateTo, setFilterDateTo] = useState("");

    useEffect(() => {
        loadRegisters();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, rowsPerPage]);

    const loadRegisters = async () => {
        setLoading(true);
        try {
            const filters = {};
            if (filterStatus) filters.status = { $eq: filterStatus };
            if (filterDesk) filters.desk_name = { $containsi: filterDesk };
            if (filterUser) filters.opened_by = { $containsi: filterUser };
            if (filterDateFrom) filters.opened_at = { ...(filters.opened_at || {}), $gte: filterDateFrom };
            if (filterDateTo) filters.opened_at = { ...(filters.opened_at || {}), $lte: filterDateTo + 'T23:59:59.999Z' };

            const res = await authApi.fetch("/cash-registers", {
                filters,
                sort: ["opened_at:desc"],
                pagination: { page: page + 1, pageSize: rowsPerPage },
                populate: ["opened_by_user", "closed_by_user"]
            });
            setRegisters(res?.data ?? []);
            setTotal(res?.meta?.pagination?.total ?? 0);
        } catch (err) {
            console.error("Failed to load registers", err);
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = (e) => {
        e.preventDefault();
        setPage(0);
        loadRegisters();
    };

    const handleClearFilters = () => {
        setFilterStatus("");
        setFilterDesk("");
        setFilterUser("");
        setFilterDateFrom("");
        setFilterDateTo("");
        setPage(0);
        setTimeout(() => loadRegisters(), 0);
    };

    const fmt = (v) => `${currency}${Number(v || 0).toFixed(2)}`;

    const statusBadge = (status) => {
        const cls = {
            Active: 'bg-success',
            Closed: 'bg-secondary',
            Expired: 'bg-warning text-dark',
            Cancelled: 'bg-danger'
        }[status] || 'bg-light text-dark';
        return <span className={`badge ${cls}`}>{status}</span>;
    };

    return (
        <ProtectedRoute>
            <Layout>
                <div className="p-3">
                    <div className="d-flex align-items-center justify-content-between mb-3">
                        <h4 className="mb-0"><i className="fas fa-history me-2"></i>Cash Register History</h4>
                        <Link href="/cash-register" className="btn btn-outline-primary btn-sm">
                            <i className="fas fa-cash-register me-1"></i>Current Register
                        </Link>
                    </div>

                    {/* Filters */}
                    <form onSubmit={handleSearch} className="card mb-3">
                        <div className="card-body py-2">
                            <div className="row g-2 align-items-end">
                                <div className="col-sm-6 col-lg-2">
                                    <label className="form-label small mb-1">Status</label>
                                    <select className="form-select form-select-sm" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                                        <option value="">All</option>
                                        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                                <div className="col-sm-6 col-lg-2">
                                    <label className="form-label small mb-1">Desk</label>
                                    <input type="text" className="form-control form-control-sm" value={filterDesk}
                                        onChange={(e) => setFilterDesk(e.target.value)} placeholder="Desk name" />
                                </div>
                                <div className="col-sm-6 col-lg-2">
                                    <label className="form-label small mb-1">User</label>
                                    <input type="text" className="form-control form-control-sm" value={filterUser}
                                        onChange={(e) => setFilterUser(e.target.value)} placeholder="Opened by" />
                                </div>
                                <div className="col-sm-6 col-lg-2">
                                    <label className="form-label small mb-1">From</label>
                                    <input type="date" className="form-control form-control-sm" value={filterDateFrom}
                                        onChange={(e) => setFilterDateFrom(e.target.value)} />
                                </div>
                                <div className="col-sm-6 col-lg-2">
                                    <label className="form-label small mb-1">To</label>
                                    <input type="date" className="form-control form-control-sm" value={filterDateTo}
                                        onChange={(e) => setFilterDateTo(e.target.value)} />
                                </div>
                                <div className="col-sm-6 col-lg-2 d-flex gap-1">
                                    <button type="submit" className="btn btn-primary btn-sm flex-fill">
                                        <i className="fas fa-search me-1"></i>Search
                                    </button>
                                    <button type="button" className="btn btn-outline-secondary btn-sm" onClick={handleClearFilters}>
                                        <i className="fas fa-times"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </form>

                    {/* Table */}
                    {loading ? (
                        <div className="text-center text-muted p-4"><span className="spinner-border spinner-border-sm me-2"></span>Loading...</div>
                    ) : (
                        <>
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableCell>#</TableCell>
                                        <TableCell>Desk</TableCell>
                                        <TableCell>Opened By</TableCell>
                                        <TableCell>Open Time</TableCell>
                                        <TableCell>Close Time</TableCell>
                                        <TableCell align="right">Opening</TableCell>
                                        <TableCell align="right">Expected</TableCell>
                                        <TableCell align="right">Counted</TableCell>
                                        <TableCell align="right">Difference</TableCell>
                                        <TableCell>Status</TableCell>
                                        <TableCell></TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {registers.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={11}>
                                                <div className="text-muted text-center py-3">No registers found.</div>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                    {registers.map((reg) => (
                                        <TableRow key={reg.documentId ?? reg.id}>
                                            <TableCell>{reg.id}</TableCell>
                                            <TableCell>{reg.desk_name || `Desk ${reg.desk_id}`}</TableCell>
                                            <TableCell>{reg.opened_by || '-'}</TableCell>
                                            <TableCell className="small">{reg.opened_at ? new Date(reg.opened_at).toLocaleString() : '-'}</TableCell>
                                            <TableCell className="small">{reg.closed_at ? new Date(reg.closed_at).toLocaleString() : '-'}</TableCell>
                                            <TableCell align="right">{fmt(reg.opening_cash)}</TableCell>
                                            <TableCell align="right">{reg.expected_cash != null ? fmt(reg.expected_cash) : '-'}</TableCell>
                                            <TableCell align="right">{reg.counted_cash != null ? fmt(reg.counted_cash) : '-'}</TableCell>
                                            <TableCell align="right">
                                                {reg.difference != null ? (
                                                    <span className={reg.difference >= 0 ? 'text-success' : 'text-danger'}>
                                                        {reg.difference >= 0 ? '+' : ''}{fmt(reg.difference)}
                                                    </span>
                                                ) : '-'}
                                            </TableCell>
                                            <TableCell>{statusBadge(reg.status)}</TableCell>
                                            <TableCell>
                                                <Link href={`/${reg.documentId}/cash-register-detail`} className="btn btn-outline-primary btn-sm">
                                                    <i className="fas fa-eye"></i>
                                                </Link>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                            <TablePagination
                                count={total}
                                page={page}
                                onPageChange={(e, p) => setPage(p)}
                                rowsPerPage={rowsPerPage}
                                onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
                                rowsPerPageOptions={[5, 10, 25]}
                            />
                        </>
                    )}
                </div>
            </Layout>
        </ProtectedRoute>
    );
}

export async function getServerSideProps() { return { props: {} }; }
