import { useEffect, useState } from "react";
import Link from "next/link";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { AppContextEndpoints, CashRegistersEndpoints } from "@rutba/api-provider/endpoints/index.js";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { isAppAdmin } from "@rutba/pos-shared/lib/roles";
import { useUtil } from "@rutba/pos-shared/context/UtilContext";
import ListPageLayout from "@rutba/pos-shared/components/ListPageLayout";
import ListPagination from "@rutba/pos-shared/components/ListPagination";

const STATUS_OPTIONS = ["Active", "Open", "Closed", "Expired", "Cancelled"];

export default function CashRegisterHistoryPage() {
    const { currency } = useUtil();
    const { adminAppAccess } = useAuth();
    const userIsAdmin = isAppAdmin(adminAppAccess, AppContextEndpoints.getAppName());
    const [registers, setRegisters] = useState([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
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
    }, [page, pageSize]);

    const loadRegisters = async () => {
        setLoading(true);
        try {
            const filters = {};
            if (filterStatus) filters.status = { $eq: filterStatus };
            if (filterDesk) filters.desk_name = { $containsi: filterDesk };
            if (filterUser) filters.opened_by = { $containsi: filterUser };
            if (filterDateFrom) filters.opened_at = { ...(filters.opened_at || {}), $gte: filterDateFrom };
            if (filterDateTo) filters.opened_at = { ...(filters.opened_at || {}), $lte: filterDateTo + 'T23:59:59.999Z' };

            // Non-admin users can only see registers from the last 7 days
            if (!userIsAdmin) {
                const oneWeekAgo = new Date();
                oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
                const minDate = oneWeekAgo.toISOString().split('T')[0];
                const existingGte = filters.opened_at?.$gte;
                if (!existingGte || existingGte < minDate) {
                    filters.opened_at = { ...(filters.opened_at || {}), $gte: minDate };
                }
            }

            const res = await CashRegistersEndpoints.list({
                filters,
                sort: ["opened_at:desc"],
                page,
                pageSize,
                populate: ["opened_by_user", "closed_by_user"],
            });
            setRegisters(res?.data ?? []);
            setTotal(res?.meta?.pagination?.total ?? 0);
        } catch (err) {
            console.error("Failed to load registers", err);
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = () => {
        setPage(1);
        setTimeout(() => loadRegisters(), 0);
    };

    const handleClearFilters = () => {
        setFilterStatus("");
        setFilterDesk("");
        setFilterUser("");
        setFilterDateFrom("");
        setFilterDateTo("");
        setPage(1);
        setTimeout(() => loadRegisters(), 0);
    };

    const fmt = (v) => `${currency}${Number(v || 0).toFixed(2)}`;

    const statusBadge = (status) => {
        const cls = {
            Active: 'bg-success',
            Open: 'bg-success',
            Closed: 'bg-secondary',
            Expired: 'bg-warning text-dark',
            Cancelled: 'bg-danger'
        }[status] || 'bg-light text-dark';
        return <span className={`list-status ${cls}`}>{status}</span>;
    };

    const filterNodes = [
        <select key="status" className="form-select form-select-sm" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} title="Status">
            <option value="">Status: All</option>
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>,
        <input key="desk" type="text" className="form-control form-control-sm" value={filterDesk}
            onChange={(e) => setFilterDesk(e.target.value)} placeholder="Desk name" />,
        <input key="user" type="text" className="form-control form-control-sm" value={filterUser}
            onChange={(e) => setFilterUser(e.target.value)} placeholder="Opened by" />,
        <input key="from" type="date" className="form-control form-control-sm" value={filterDateFrom}
            onChange={(e) => setFilterDateFrom(e.target.value)} title="From" />,
        <input key="to" type="date" className="form-control form-control-sm" value={filterDateTo}
            onChange={(e) => setFilterDateTo(e.target.value)} title="To" />,
        <div key="actions" className="d-flex gap-1">
            <button type="button" className="btn btn-primary btn-sm" onClick={handleSearch}>
                <i className="fas fa-search me-1"></i>Search
            </button>
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={handleClearFilters}>
                <i className="fas fa-times"></i>
            </button>
        </div>,
    ];

    const headerActions = (
        <Link href="/cash-register" className="btn btn-outline-primary btn-sm">
            <i className="fas fa-cash-register me-1"></i>Current Register
        </Link>
    );

    const title = (
        <h4 className="mb-0"><i className="fas fa-history me-2"></i>Cash Register History</h4>
    );

    return (
        <ProtectedRoute>
            <Layout>
                <ListPageLayout
                    title={title}
                    subtitle={total != null ? `${total} total${!userIsAdmin ? ' • last 7 days' : ''}` : undefined}
                    headerActions={headerActions}
                    filters={filterNodes}
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
                    emptyState={<div>No registers found.</div>}
                >
                    <div className="table-responsive">
                        <table className="table table-hover list-table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Desk</th>
                                    <th>Opened By</th>
                                    <th>Open Time</th>
                                    <th>Close Time</th>
                                    <th style={{ textAlign: 'right' }}>Opening</th>
                                    <th style={{ textAlign: 'right' }}>Expected</th>
                                    <th style={{ textAlign: 'right' }}>Counted</th>
                                    <th style={{ textAlign: 'right' }}>Difference</th>
                                    <th>Status</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {registers.length === 0 ? (
                                    <tr>
                                        <td colSpan={11}>
                                            <div className="text-muted text-center py-3">No registers found.</div>
                                        </td>
                                    </tr>
                                ) : registers.map((reg) => (
                                    <tr key={reg.documentId ?? reg.id}>
                                        <td>{reg.id}</td>
                                        <td>{reg.desk_name || `Desk ${reg.desk_id}`}</td>
                                        <td>{reg.opened_by || '-'}</td>
                                        <td className="small">{reg.opened_at ? new Date(reg.opened_at).toLocaleString() : '-'}</td>
                                        <td className="small">{reg.closed_at ? new Date(reg.closed_at).toLocaleString() : '-'}</td>
                                        <td style={{ textAlign: 'right' }}>{fmt(reg.opening_cash)}</td>
                                        <td style={{ textAlign: 'right' }}>{reg.expected_cash != null ? fmt(reg.expected_cash) : '-'}</td>
                                        <td style={{ textAlign: 'right' }}>{reg.counted_cash != null ? fmt(reg.counted_cash) : '-'}</td>
                                        <td style={{ textAlign: 'right' }}>
                                            {reg.difference != null ? (
                                                <span className={reg.difference >= 0 ? 'text-success' : 'text-danger'}>
                                                    {reg.difference >= 0 ? '+' : ''}{fmt(reg.difference)}
                                                </span>
                                            ) : '-'}
                                        </td>
                                        <td>{statusBadge(reg.status)}</td>
                                        <td>
                                            <div className="list-actions">
                                                <Link href={`/${reg.documentId}/cash-register-detail`} className="btn btn-outline-primary btn-sm">
                                                    <i className="fas fa-eye"></i>
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
