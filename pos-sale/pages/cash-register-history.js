import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Layout from "../components/Layout";
import CloseRegisterModal from "../components/CloseRegisterModal";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { AppContextEndpoints, CashRegistersEndpoints } from "@rutba/api-provider/endpoints/index.js";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { isAppAdmin, isActiveManagerRole, isEffectiveAdmin } from "@rutba/pos-shared/lib/roles";
import { useUtil } from "@rutba/pos-shared/context/UtilContext";
import ListPageLayout from "@rutba/pos-shared/components/ListPageLayout";
import ListPagination from "@rutba/pos-shared/components/ListPagination";

const STATUS_OPTIONS = ["Active", "Open", "Closed", "Expired", "Cancelled"];
// Sentinel status filter: every register still holding the drawer open —
// Active/Open/Expired with no closed_at. This is the admin's work queue.
const NEEDS_CLOSING = "__needs_closing__";
// Statuses a register can still be closed from.
const CLOSABLE = ["Active", "Open", "Expired"];

// Sortable columns. Every key is a scalar column on the register, so sorting
// is done server-side and holds across pages (a client-side sort of the
// current page would silently lie about "the biggest difference").
const COLUMNS = [
    { key: "id", label: "#" },
    { key: "desk_name", label: "Desk" },
    { key: "opened_by", label: "Opened By" },
    { key: "opened_at", label: "Open Time" },
    { key: "closed_at", label: "Close Time" },
    { key: "opening_cash", label: "Opening", align: "right" },
    { key: "expected_cash", label: "Expected", align: "right" },
    { key: "counted_cash", label: "Counted", align: "right" },
    { key: "difference", label: "Difference", align: "right" },
    { key: "status", label: "Status" },
];

export default function CashRegisterHistoryPage() {
    const { currency, desk, user } = useUtil();
    const { adminAppAccess, activeRoleKey } = useAuth();
    const appName = AppContextEndpoints.getAppName();
    const userIsAdmin = isAppAdmin(adminAppAccess, appName);
    // Who may close someone else's register: an admin (active, or before the
    // active role resolves) or a manager. Mirrors the /cash-register rule that
    // an expired register needs a manager or admin.
    const canCloseAny = isEffectiveAdmin(activeRoleKey, adminAppAccess, appName)
        || isActiveManagerRole(activeRoleKey);
    const [registers, setRegisters] = useState([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [total, setTotal] = useState(0);
    // Registers still holding a drawer open — the count on the queue button.
    const [openCount, setOpenCount] = useState(null);
    // The register the close modal is working on.
    const [closingRegister, setClosingRegister] = useState(null);
    const [closedNotice, setClosedNotice] = useState(null);

    // Sort — server-side, so it applies to the whole result set.
    const [sortField, setSortField] = useState("opened_at");
    const [sortOrder, setSortOrder] = useState("desc");
    // Bumped to re-run the search. Filters are applied on demand (Search /
    // Clear / the queue button), and a state bump re-runs the effect AFTER the
    // new filter values have rendered — calling loadRegisters() directly from
    // the handler would read the filter state it just replaced.
    const [searchKey, setSearchKey] = useState(0);

    // Current-register pointer for this desk/user (drives the hub banner).
    const [current, setCurrent] = useState(null);        // active register | null
    const [currentExpired, setCurrentExpired] = useState(null);
    const [currentLoaded, setCurrentLoaded] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const userId = user?.documentId ?? user?.id;
                if (!desk?.id && !userId) { setCurrentLoaded(true); return; }
                const res = await CashRegistersEndpoints.fetchActive({ deskId: desk?.id, userId });
                if (cancelled) return;
                setCurrent(res?.data ?? null);
                setCurrentExpired(res?.meta?.expired ?? null);
            } catch (e) {
                if (!cancelled) { setCurrent(null); setCurrentExpired(null); }
            } finally {
                if (!cancelled) setCurrentLoaded(true);
            }
        })();
        return () => { cancelled = true; };
    }, [desk?.id, user?.documentId, user?.id]);

    // Filters
    const [filterStatus, setFilterStatus] = useState("");
    const [filterDesk, setFilterDesk] = useState("");
    const [filterUser, setFilterUser] = useState("");
    const [filterDateFrom, setFilterDateFrom] = useState("");
    const [filterDateTo, setFilterDateTo] = useState("");

    useEffect(() => {
        loadRegisters();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, pageSize, sortField, sortOrder, searchKey]);

    // Apply the non-admin recency clamp: staff only ever see the last 7 days.
    const clampRecency = (filters) => {
        if (userIsAdmin) return filters;
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        const minDate = oneWeekAgo.toISOString().split('T')[0];
        const existingGte = filters.opened_at?.$gte;
        if (!existingGte || existingGte < minDate) {
            filters.opened_at = { ...(filters.opened_at || {}), $gte: minDate };
        }
        return filters;
    };

    const buildFilters = () => {
        const filters = {};
        if (filterStatus === NEEDS_CLOSING) {
            filters.status = { $in: CLOSABLE };
            filters.closed_at = { $null: true };
        } else if (filterStatus) {
            filters.status = { $eq: filterStatus };
        }
        if (filterDesk) filters.desk_name = { $containsi: filterDesk };
        if (filterUser) filters.opened_by = { $containsi: filterUser };
        if (filterDateFrom) filters.opened_at = { ...(filters.opened_at || {}), $gte: filterDateFrom };
        if (filterDateTo) filters.opened_at = { ...(filters.opened_at || {}), $lte: filterDateTo + 'T23:59:59.999Z' };
        return clampRecency(filters);
    };

    const loadRegisters = async () => {
        setLoading(true);
        try {
            const res = await CashRegistersEndpoints.list({
                filters: buildFilters(),
                sort: [`${sortField}:${sortOrder}`],
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

    // How many drawers are still open anywhere — drives the queue button.
    // Only privileged users can act on it, so don't spend the request otherwise.
    const loadOpenCount = useCallback(async () => {
        if (!canCloseAny) { setOpenCount(null); return; }
        try {
            const res = await CashRegistersEndpoints.list({
                filters: clampRecency({ status: { $in: CLOSABLE }, closed_at: { $null: true } }),
                page: 1,
                pageSize: 1,
                fields: ["id"],
            });
            setOpenCount(res?.meta?.pagination?.total ?? 0);
        } catch (err) {
            setOpenCount(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userIsAdmin, canCloseAny]);

    useEffect(() => { loadOpenCount(); }, [loadOpenCount]);

    const handleSort = (field) => {
        if (sortField === field) {
            setSortOrder(prev => prev === "asc" ? "desc" : "asc");
        } else {
            setSortField(field);
            // Dates and money read most usefully largest-first; names A→Z.
            setSortOrder(field === "desk_name" || field === "opened_by" || field === "status" ? "asc" : "desc");
        }
        setPage(1);
    };

    const sortIcon = (field) => {
        if (sortField !== field) return <i className="fas fa-sort ms-1" style={{ opacity: 0.3 }}></i>;
        return sortOrder === "asc"
            ? <i className="fas fa-sort-up ms-1"></i>
            : <i className="fas fa-sort-down ms-1"></i>;
    };

    const handleSearch = () => {
        setPage(1);
        setSearchKey(k => k + 1);
    };

    // A register just closed: refresh the page of rows and the queue count.
    const handleClosed = (updated) => {
        const label = updated?.id ? `Register #${updated.id}` : 'Register';
        setClosedNotice(updated?.force_closed
            ? `${label} force-closed — counted cash recorded as unknown.`
            : `${label} closed.`);
        setClosingRegister(null);
        loadRegisters();
        loadOpenCount();
    };

    const handleClearFilters = () => {
        setFilterStatus("");
        setFilterDesk("");
        setFilterUser("");
        setFilterDateFrom("");
        setFilterDateTo("");
        setPage(1);
        setSearchKey(k => k + 1);
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
            <option value={NEEDS_CLOSING}>Needs closing (still open)</option>
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

    const showQueueButton = canCloseAny && openCount != null && openCount > 0 && filterStatus !== NEEDS_CLOSING;

    const headerActions = (
        <div className="d-flex gap-1">
            {showQueueButton && (
                <button
                    type="button"
                    className="btn btn-outline-danger btn-sm"
                    onClick={() => { setFilterStatus(NEEDS_CLOSING); setPage(1); setSearchKey(k => k + 1); }}
                    title="Show every register whose drawer is still open"
                >
                    <i className="fas fa-door-open me-1"></i>Needs closing
                    <span className="badge bg-danger ms-1">{openCount}</span>
                </button>
            )}
            <Link href="/cash-register-report" className="btn btn-outline-warning btn-sm">
                <i className="fas fa-triangle-exclamation me-1"></i>Report
            </Link>
            {current ? (
                <Link href="/cash-register" className="btn btn-primary btn-sm">
                    <i className="fas fa-cash-register me-1"></i>Current Register
                </Link>
            ) : (
                <Link href="/cash-register" className="btn btn-success btn-sm">
                    <i className="fas fa-plus me-1"></i>New Register
                </Link>
            )}
        </div>
    );

    const title = (
        <h4 className="mb-0"><i className="fas fa-money-bill-wave me-2"></i>Cash Registers</h4>
    );

    // Hub banner: where's "current"? active → open it; expired → close it; none → open new.
    const currentBanner = !currentLoaded ? null : current ? (
        <div className="alert alert-success py-2 d-flex align-items-center justify-content-between mb-2">
            <span>
                <i className="fas fa-circle-check me-2"></i>
                <strong>Register #{current.id}</strong> is open on {current.desk_name || `Desk ${current.desk_id}`}
                {current.opened_at ? ` since ${new Date(current.opened_at).toLocaleString()}` : ''}
                {' '}· Opening {fmt(current.opening_cash)}
            </span>
            <Link href="/cash-register" className="btn btn-sm btn-light">Open <i className="fas fa-arrow-right ms-1"></i></Link>
        </div>
    ) : currentExpired ? (
        <div className="alert alert-danger py-2 d-flex align-items-center justify-content-between mb-2">
            <span>
                <i className="fas fa-exclamation-triangle me-2"></i>
                Register #{currentExpired.id} <strong>expired</strong> and is still open — close it before starting a new one.
            </span>
            <Link href="/cash-register" className="btn btn-sm btn-light">Close it <i className="fas fa-arrow-right ms-1"></i></Link>
        </div>
    ) : (
        <div className="alert alert-secondary py-2 d-flex align-items-center justify-content-between mb-2">
            <span><i className="fas fa-circle-info me-2"></i>No open register on this desk.</span>
            <Link href="/cash-register" className="btn btn-sm btn-success"><i className="fas fa-plus me-1"></i>Open New Register</Link>
        </div>
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
                    {currentBanner}
                    {closedNotice && (
                        <div className="alert alert-success py-2 d-flex align-items-center mb-2">
                            <i className="fas fa-circle-check me-2"></i>
                            <span className="flex-grow-1">{closedNotice}</span>
                            <button type="button" className="btn-close" onClick={() => setClosedNotice(null)}></button>
                        </div>
                    )}
                    <div className="table-responsive">
                        <table className="table table-hover list-table">
                            <thead>
                                <tr>
                                    {COLUMNS.map(col => (
                                        <th
                                            key={col.key}
                                            style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', textAlign: col.align || 'left' }}
                                            onClick={() => handleSort(col.key)}
                                            title={`Sort by ${col.label}`}
                                        >
                                            {col.label}{sortIcon(col.key)}
                                        </th>
                                    ))}
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {registers.length === 0 ? (
                                    <tr>
                                        <td colSpan={COLUMNS.length + 1}>
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
                                        <td>
                                            {statusBadge(reg.status)}
                                            {reg.force_closed && (
                                                <span className="list-status bg-danger ms-1"
                                                    title={reg.force_close_reason || 'Force-closed without a cash count'}>
                                                    Forced
                                                </span>
                                            )}
                                        </td>
                                        <td>
                                            <div className="list-actions">
                                                <Link href={`/${reg.documentId}/cash-register-detail`} className="btn btn-outline-primary btn-sm">
                                                    <i className="fas fa-eye"></i>
                                                </Link>
                                                {canCloseAny && CLOSABLE.includes(reg.status) && !reg.closed_at && (
                                                    <button
                                                        type="button"
                                                        className={`btn btn-sm ${reg.status === 'Expired' ? 'btn-danger' : 'btn-outline-dark'}`}
                                                        onClick={() => setClosingRegister(reg)}
                                                        title={`Close register #${reg.id}${reg.opened_by ? ` (opened by ${reg.opened_by})` : ''}`}
                                                    >
                                                        <i className="fas fa-lock me-1"></i>Close
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </ListPageLayout>
                <CloseRegisterModal
                    register={closingRegister}
                    allowForce={canCloseAny}
                    onCancel={() => setClosingRegister(null)}
                    onClosed={handleClosed}
                />
            </Layout>
        </ProtectedRoute>
    );
}
