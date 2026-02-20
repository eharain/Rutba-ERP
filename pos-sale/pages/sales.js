import { useEffect, useState, useCallback, useMemo } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import PermissionCheck from "@rutba/pos-shared/components/PermissionCheck";
import { fetchSales } from "@rutba/pos-shared/lib/pos";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { isAppAdmin } from "@rutba/pos-shared/lib/roles";
import { getBranches } from "@rutba/pos-shared/lib/api";
import Link from "next/link";
import { Table, TableHead, TableRow, TableCell, TableBody, CircularProgress, TablePagination } from "@rutba/pos-shared/components/Table";
import { useUtil } from "@rutba/pos-shared/context/UtilContext";

const PAYMENT_STATUSES = ["Paid", "Partial", "Unpaid"];
const RETURN_STATUSES = ["None", "Returned", "PartiallyReturned"];

const COLUMNS = [
    { key: "id", label: "#" },
    { key: "invoice_no", label: "Invoice" },
    { key: "sale_date", label: "Date" },
    { key: "customer", label: "Customer", relation: true },
    { key: "employee", label: "Employee", relation: true },
    { key: "total", label: "Total", align: "right" },
    { key: "payment_status", label: "Payment" },
    { key: "return_status", label: "Return" },
];

function getPaymentBadgeClass(status) {
    switch (status) {
        case "Paid": return "bg-success";
        case "Partial": return "bg-warning text-dark";
        case "Unpaid": return "bg-danger";
        default: return "bg-secondary";
    }
}

function getReturnBadgeClass(status) {
    switch (status) {
        case "Returned": return "bg-info";
        case "PartiallyReturned": return "bg-warning text-dark";
        case "None": return "bg-light text-muted";
        default: return "bg-secondary";
    }
}

function get24hAgo() {
    const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
}

export default function Sales() {
    const [sales, setSales] = useState([]);
    const { jwt, adminAppAccess } = useAuth();
    const admin = isAppAdmin(adminAppAccess, "sale");
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const { currency } = useUtil();

    // Filters
    const [paymentStatus, setPaymentStatus] = useState("");
    const [returnStatus, setReturnStatus] = useState("");
    const [customerSearch, setCustomerSearch] = useState("");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");

    // Admin-only filters
    const [ownerSearch, setOwnerSearch] = useState("");
    const [branchFilter, setBranchFilter] = useState("");
    const [deskSearch, setDeskSearch] = useState("");
    const [branches, setBranches] = useState([]);

    // Sort
    const [sortField, setSortField] = useState("createdAt");
    const [sortOrder, setSortOrder] = useState("desc");

    // Load branches for admin dropdown
    useEffect(() => {
        if (!admin) return;
        (async () => {
            try {
                const res = await getBranches();
                const data = res?.data ?? res;
                setBranches(Array.isArray(data) ? data : []);
            } catch { setBranches([]); }
        })();
    }, [admin]);

    // Populate includes owners & branches only for admin
    const populate = useMemo(() => {
        const base = { customer: true, employee: true, cash_register: true };
        if (admin) {
            base.owners = { fields: ["id", "username"] };
            base.branches = { fields: ["id", "name"] };
        }
        return base;
    }, [admin]);

    const buildFilters = useCallback(() => {
        const filters = {};
        if (paymentStatus) filters.payment_status = { $eq: paymentStatus };
        if (returnStatus) filters.return_status = { $eq: returnStatus };
        if (customerSearch.trim()) filters.customer = { name: { $containsi: customerSearch.trim() } };

        // Date range — non-admins are locked to last 24 hours
        if (admin) {
            if (dateFrom || dateTo) {
                filters.sale_date = {};
                if (dateFrom) filters.sale_date.$gte = dateFrom;
                if (dateTo) filters.sale_date.$lte = dateTo + "T23:59:59";
            }
        } else {
            filters.sale_date = { $gte: get24hAgo() };
        }

        // Admin-only relation filters
        if (admin) {
            if (ownerSearch.trim()) filters.owners = { username: { $containsi: ownerSearch.trim() } };
            if (branchFilter) filters.branches = { documentId: { $eq: branchFilter } };
            if (deskSearch.trim()) filters.cash_register = { desk_name: { $containsi: deskSearch.trim() } };
        }

        return Object.keys(filters).length > 0 ? filters : undefined;
    }, [paymentStatus, returnStatus, customerSearch, dateFrom, dateTo, ownerSearch, branchFilter, deskSearch, admin]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            const res = await fetchSales(page + 1, rowsPerPage, {
                sort: [`${sortField}:${sortOrder}`],
                filters: buildFilters(),
                populate,
            });
            if (!cancelled) {
                setSales(res.data || []);
                setTotal(res.meta?.pagination?.total ?? 0);
                setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [jwt, page, rowsPerPage, sortField, sortOrder, buildFilters, populate]);

    const handleChangePage = (_, newPage) => setPage(newPage);

    const handleChangeRowsPerPage = (e) => {
        setRowsPerPage(parseInt(e.target.value, 10));
        setPage(0);
    };

    const handleSort = (field) => {
        if (sortField === field) {
            setSortOrder(prev => prev === "asc" ? "desc" : "asc");
        } else {
            setSortField(field);
            setSortOrder("asc");
        }
        setPage(0);
    };

    const handleClearFilters = () => {
        setPaymentStatus("");
        setReturnStatus("");
        setCustomerSearch("");
        setDateFrom("");
        setDateTo("");
        setOwnerSearch("");
        setBranchFilter("");
        setDeskSearch("");
        setPage(0);
    };

    const hasFilters = paymentStatus || returnStatus || customerSearch || dateFrom || dateTo || ownerSearch || branchFilter || deskSearch;

    const sortIcon = (field) => {
        if (sortField !== field) return <i className="fas fa-sort ms-1" style={{ opacity: 0.3 }}></i>;
        return sortOrder === "asc"
            ? <i className="fas fa-sort-up ms-1"></i>
            : <i className="fas fa-sort-down ms-1"></i>;
    };

    const colCount = COLUMNS.length + 1;

    return (
        <ProtectedRoute>
            <PermissionCheck required="api::sale.sale.find">
                <Layout>
                    <div className="mb-3">
                        <div className="d-flex align-items-center justify-content-between mb-3">
                            <h2 className="mb-0">Sales</h2>
                            <span className="text-muted small">
                                {total} record{total !== 1 ? "s" : ""}
                                {!admin && <span className="ms-2 badge bg-secondary">Last 24 hours</span>}
                            </span>
                        </div>

                        {/* Filters */}
                        <div className="row g-2 mb-3 align-items-end">
                            <div className="col-auto">
                                <label className="form-label small mb-1">Payment</label>
                                <select className="form-select form-select-sm" value={paymentStatus} onChange={e => { setPaymentStatus(e.target.value); setPage(0); }}>
                                    <option value="">All</option>
                                    {PAYMENT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                            <div className="col-auto">
                                <label className="form-label small mb-1">Return</label>
                                <select className="form-select form-select-sm" value={returnStatus} onChange={e => { setReturnStatus(e.target.value); setPage(0); }}>
                                    <option value="">All</option>
                                    {RETURN_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                            <div className="col-auto">
                                <label className="form-label small mb-1">Customer</label>
                                <input type="text" className="form-control form-control-sm" placeholder="Search customer…" value={customerSearch} onChange={e => { setCustomerSearch(e.target.value); setPage(0); }} />
                            </div>
                            {admin && (
                                <>
                                    <div className="col-auto">
                                        <label className="form-label small mb-1">From</label>
                                        <input type="date" className="form-control form-control-sm" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(0); }} />
                                    </div>
                                    <div className="col-auto">
                                        <label className="form-label small mb-1">To</label>
                                        <input type="date" className="form-control form-control-sm" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(0); }} />
                                    </div>
                                    <div className="col-auto">
                                        <label className="form-label small mb-1">Owner</label>
                                        <input type="text" className="form-control form-control-sm" placeholder="Username…" value={ownerSearch} onChange={e => { setOwnerSearch(e.target.value); setPage(0); }} />
                                    </div>
                                    <div className="col-auto">
                                        <label className="form-label small mb-1">Branch</label>
                                        <select className="form-select form-select-sm" value={branchFilter} onChange={e => { setBranchFilter(e.target.value); setPage(0); }}>
                                            <option value="">All</option>
                                            {branches.map(b => <option key={b.documentId || b.id} value={b.documentId || b.id}>{b.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="col-auto">
                                        <label className="form-label small mb-1">Desk</label>
                                        <input type="text" className="form-control form-control-sm" placeholder="Desk name…" value={deskSearch} onChange={e => { setDeskSearch(e.target.value); setPage(0); }} />
                                    </div>
                                </>
                            )}
                            {hasFilters && (
                                <div className="col-auto">
                                    <button className="btn btn-outline-secondary btn-sm" onClick={handleClearFilters}>
                                        <i className="fas fa-times me-1"></i>Clear
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Table */}
                        <div>
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        {COLUMNS.map(col => (
                                            <TableCell
                                                key={col.key}
                                                align={col.align}
                                                onClick={() => !col.relation && handleSort(col.key)}
                                                style={{ cursor: col.relation ? "default" : "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                                            >
                                                {col.label}{!col.relation && sortIcon(col.key)}
                                            </TableCell>
                                        ))}
                                        <TableCell>Actions</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {loading ? (
                                        <TableRow>
                                            <TableCell colSpan={colCount} align="center">
                                                <CircularProgress size={24} />
                                            </TableCell>
                                        </TableRow>
                                    ) : sales.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={colCount} align="center">
                                                No sales found.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        sales.map(s => (
                                            <TableRow key={s.id}>
                                                <TableCell>{s.id}</TableCell>
                                                <TableCell>{s.invoice_no}</TableCell>
                                                <TableCell style={{ whiteSpace: "nowrap" }}>{new Date(s.sale_date).toLocaleDateString()}</TableCell>
                                                <TableCell>{s?.customer?.name || "—"}</TableCell>
                                                <TableCell>{s?.employee?.name || "—"}</TableCell>
                                                <TableCell align="right">{currency}{parseFloat(s.total || 0).toFixed(2)}</TableCell>
                                                <TableCell>
                                                    <span className={`badge ${getPaymentBadgeClass(s.payment_status)}`}>{s.payment_status}</span>
                                                </TableCell>
                                                <TableCell>
                                                    <span className={`badge ${getReturnBadgeClass(s.return_status)}`}>{s.return_status || "None"}</span>
                                                </TableCell>
                                                <TableCell>
                                                    <Link href={`/${s.documentId}/sale`} className="btn btn-sm btn-outline-primary" style={{ textDecoration: "none" }}>
                                                        <i className="fas fa-edit me-1"></i>Edit
                                                    </Link>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                            <TablePagination
                                count={total}
                                page={page}
                                onPageChange={handleChangePage}
                                rowsPerPage={rowsPerPage}
                                onRowsPerPageChange={handleChangeRowsPerPage}
                                rowsPerPageOptions={[5, 10, 25, 50]}
                            />
                        </div>
                    </div>
                </Layout>
            </PermissionCheck>
        </ProtectedRoute>
    );
}

export async function getServerSideProps() { return { props: {} }; }
