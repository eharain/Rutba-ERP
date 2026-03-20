import { useEffect, useState, useCallback, useMemo } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import PermissionCheck from "@rutba/pos-shared/components/PermissionCheck";
import { fetchSales } from "@rutba/pos-shared/lib/pos";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { isAppAdmin } from "@rutba/pos-shared/lib/roles";
import { getBranches, getAdminMode, authApi } from "@rutba/pos-shared/lib/api";
import SaleApi from "@rutba/pos-shared/lib/saleApi";
import Link from "next/link";
import { Table, TableHead, TableRow, TableCell, TableBody, CircularProgress, TablePagination } from "@rutba/pos-shared/components/Table";
import { useUtil } from "@rutba/pos-shared/context/UtilContext";

const PAYMENT_STATUSES = ["Paid", "Partial", "Unpaid"];
const RETURN_STATUSES = ["None", "Returned", "PartiallyReturned"];

const SEARCH_FIELDS = [
    { key: "stock_item", label: "Stock Item" },
    { key: "customer", label: "Customer" },
    { key: "invoice_no", label: "Invoice No" },
   
];
const ADMIN_SEARCH_FIELDS = [
    { key: "owner", label: "Owner" },
    { key: "desk", label: "Desk" },
];

const COLUMNS = [
    { key: "id", label: "#" },
    { key: "invoice_no", label: "Invoice" },
    { key: "sale_date", label: "Date" },
    { key: "customer", label: "Customer", relation: true },
    { key: "employee", label: "Employee", relation: true },
    { key: "total", label: "Total", align: "right" },
    { key: "payment_status", label: "Payment" },
    { key: "status", label: "Status" },
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
    const elevated = admin && getAdminMode();
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [cancellingId, setCancellingId] = useState(null);
    const [refreshKey, setRefreshKey] = useState(0);
    const { currency } = useUtil();

    // Toggle total column visibility (hidden by default)
    const [showTotal, setShowTotal] = useState(false);

    // Multi-select for combined receipt
    const [selectedIds, setSelectedIds] = useState(new Set());

    // Filters
    const [paymentStatus, setPaymentStatus] = useState("");
    const [returnStatus, setReturnStatus] = useState("");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [totalMin, setTotalMin] = useState("");
    const [totalMax, setTotalMax] = useState("");
    const [priceByItem, setPriceByItem] = useState(false);

    // Consolidated text search
    const [searchText, setSearchText] = useState("");
    const [searchField, setSearchField] = useState("customer");

    // Admin-only filters
    const [branchFilter, setBranchFilter] = useState("");
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

        // Text search — route based on selected field (stock_item handled in useEffect)
        const term = searchText.trim();
        if (term && searchField !== "stock_item") {
            switch (searchField) {
                case "customer":
                    filters.customer = { name: { $containsi: term } };
                    break;
                case "invoice_no":
                    filters.invoice_no = { $containsi: term };
                    break;
                case "owner":
                    if (admin) filters.owners = { username: { $containsi: term } };
                    break;
                case "desk":
                    if (admin) filters.cash_register = { desk_name: { $containsi: term } };
                    break;
            }
        }

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

        // Total range (only when filtering by sale total, not item price)
        if (!priceByItem && (totalMin !== "" || totalMax !== "")) {
            filters.total = {};
            if (totalMin !== "") filters.total.$gte = parseFloat(totalMin);
            if (totalMax !== "") filters.total.$lte = parseFloat(totalMax);
        }

        // Admin-only branch filter
        if (admin && branchFilter) {
            filters.branches = { documentId: { $eq: branchFilter } };
        }

        return Object.keys(filters).length > 0 ? filters : undefined;
    }, [paymentStatus, returnStatus, searchText, searchField, dateFrom, dateTo, totalMin, totalMax, priceByItem, branchFilter, admin]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const filters = buildFilters() || {};

                // Stock item search: resolve matching sale documentIds via custom endpoint
                if (searchField === "stock_item" && searchText.trim()) {
                    const stockRes = await authApi.fetch(`/sales/search-by-stock-item?term=${encodeURIComponent(searchText.trim())}`);
                    const matchedIds = stockRes?.data ?? [];
                    if (matchedIds.length === 0) {
                        if (!cancelled) { setSales([]); setTotal(0); setLoading(false); }
                        return;
                    }
                    filters.documentId = { $in: matchedIds };
                }

                // Item price range: resolve matching sale documentIds via custom endpoint
                if (priceByItem && (totalMin !== "" || totalMax !== "")) {
                    const params = new URLSearchParams();
                    if (totalMin !== "") params.set("min", totalMin);
                    if (totalMax !== "") params.set("max", totalMax);
                    const priceRes = await authApi.fetch(`/sales/search-by-item-price?${params.toString()}`);
                    const priceMatchedIds = priceRes?.data ?? [];
                    if (priceMatchedIds.length === 0) {
                        if (!cancelled) { setSales([]); setTotal(0); setLoading(false); }
                        return;
                    }
                    // Intersect with any existing documentId filter (e.g. from stock search)
                    if (filters.documentId?.$in) {
                        const existing = new Set(filters.documentId.$in);
                        filters.documentId.$in = priceMatchedIds.filter(id => existing.has(id));
                        if (filters.documentId.$in.length === 0) {
                            if (!cancelled) { setSales([]); setTotal(0); setLoading(false); }
                            return;
                        }
                    } else {
                        filters.documentId = { $in: priceMatchedIds };
                    }
                }

                const res = await fetchSales(page + 1, rowsPerPage, {
                    sort: [`${sortField}:${sortOrder}`],
                    filters: Object.keys(filters).length > 0 ? filters : undefined,
                    populate,
                });
                if (!cancelled) {
                    setSales(res.data || []);
                    setTotal(res.meta?.pagination?.total ?? 0);
                    setLoading(false);
                }
            } catch (err) {
                console.error('Failed to fetch sales', err);
                if (!cancelled) { setLoading(false); }
            }
        })();
        return () => { cancelled = true; };
    }, [jwt, page, rowsPerPage, sortField, sortOrder, buildFilters, populate, refreshKey, searchText, searchField, priceByItem, totalMin, totalMax]);

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
        setSearchText("");
        setSearchField("customer");
        setDateFrom("");
        setDateTo("");
        setTotalMin("");
        setTotalMax("");
        setPriceByItem(false);
        setBranchFilter("");
        setPage(0);
    };

    const hasFilters = paymentStatus || returnStatus || searchText || dateFrom || dateTo || totalMin || totalMax || priceByItem || branchFilter;

    const toggleSelect = (docId) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(docId)) next.delete(docId); else next.add(docId);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === sales.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(sales.map(s => s.documentId)));
        }
    };

    const handlePrintCombined = () => {
        const ids = Array.from(selectedIds).join(',');
        window.open(`/print-combined-invoice?saleIds=${encodeURIComponent(ids)}`, '_blank');
    };

    const handleCancelSale = async (sale) => {
        const label = sale.invoice_no || sale.documentId;
        if (!window.confirm(`Are you sure you want to cancel sale ${label}?\n\nThis will restore stock to InStock and reverse any payments on the register.`)) {
            return;
        }
        setCancellingId(sale.documentId);
        try {
            await SaleApi.cancelSale(sale.documentId);
            setRefreshKey(k => k + 1);
        } catch (err) {
            console.error('Cancel failed', err);
            alert('Failed to cancel sale. ' + (err?.response?.data?.error?.message || 'See console for details.'));
        } finally {
            setCancellingId(null);
        }
    };

    const sortIcon = (field) => {
        if (sortField !== field) return <i className="fas fa-sort ms-1" style={{ opacity: 0.3 }}></i>;
        return sortOrder === "asc"
            ? <i className="fas fa-sort-up ms-1"></i>
            : <i className="fas fa-sort-down ms-1"></i>;
    };

    const visibleColumns = showTotal ? COLUMNS : COLUMNS.filter(c => c.key !== 'total');
    const colCount = visibleColumns.length + 2;

    return (
        <ProtectedRoute>
            <PermissionCheck required="api::sale.sale.find">
                <Layout>
                    <div className="mb-3">
                        <div className="d-flex align-items-center justify-content-between mb-3">
                            <h2 className="mb-0">Sales</h2>
                            <div className="d-flex align-items-center gap-2">
                                {selectedIds.size >= 2 && (
                                    <button className="btn btn-sm btn-outline-info" onClick={handlePrintCombined}>
                                        <i className="fas fa-print me-1"></i>Print Combined Receipt ({selectedIds.size})
                                    </button>
                                )}
                                <button
                                    className="btn btn-sm btn-outline-secondary"
                                    onClick={() => setShowTotal(v => !v)}
                                    title={showTotal ? 'Hide totals' : 'Show totals'}
                                >
                                    <i className={`fas ${showTotal ? 'fa-eye-slash' : 'fa-eye'} me-1`}></i>{showTotal ? 'Hide' : 'Show'} Totals
                                </button>
                                <span className="text-muted small">
                                    {total} record{total !== 1 ? "s" : ""}
                                    {!admin && <span className="ms-2 badge bg-secondary">Last 24 hours</span>}
                                </span>
                            </div>
                        </div>

                        {/* Filters */}
                        <div className="row g-2 mb-3 align-items-end">
                            <div className="col-auto">
                                <label className="form-label small mb-1">Search In</label>
                                <div className="input-group input-group-sm">
                                    <select
                                        className="form-select form-select-sm"
                                        value={searchField}
                                        onChange={e => { setSearchField(e.target.value); setPage(0); }}
                                        style={{ maxWidth: 140 }}
                                    >
                                        {SEARCH_FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                                        {admin && ADMIN_SEARCH_FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                                    </select>
                                    <input
                                        type="text"
                                        className="form-control form-control-sm"
                                        placeholder="Search…"
                                        value={searchText}
                                        onChange={e => { setSearchText(e.target.value); setPage(0); }}
                                        style={{ minWidth: 180 }}
                                    />
                                </div>
                            </div>
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
                                <label className="form-label small mb-1">{priceByItem ? 'Item Price Min' : 'Total Min'}</label>
                                <input type="number" className="form-control form-control-sm" placeholder="0" min="0" step="any" value={totalMin} onChange={e => { setTotalMin(e.target.value); setPage(0); }} />
                            </div>
                            <div className="col-auto">
                                <label className="form-label small mb-1">{priceByItem ? 'Item Price Max' : 'Total Max'}</label>
                                <input type="number" className="form-control form-control-sm" placeholder="∞" min="0" step="any" value={totalMax} onChange={e => { setTotalMax(e.target.value); setPage(0); }} />
                            </div>
                            <div className="col-auto d-flex align-items-end pb-1">
                                <div className="form-check form-check-inline">
                                    <input
                                        className="form-check-input"
                                        type="checkbox"
                                        id="priceByItem"
                                        checked={priceByItem}
                                        onChange={e => { setPriceByItem(e.target.checked); setPage(0); }}
                                    />
                                    <label className="form-check-label small" htmlFor="priceByItem">By Item Price</label>
                                </div>
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
                                        <label className="form-label small mb-1">Branch</label>
                                        <select className="form-select form-select-sm" value={branchFilter} onChange={e => { setBranchFilter(e.target.value); setPage(0); }}>
                                            <option value="">All</option>
                                            {branches.map(b => <option key={b.documentId || b.id} value={b.documentId || b.id}>{b.name}</option>)}
                                        </select>
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
                                        <TableCell style={{ width: '30px' }}>
                                            <input type="checkbox" checked={sales.length > 0 && selectedIds.size === sales.length} onChange={toggleSelectAll} title="Select all" />
                                        </TableCell>
                                        {visibleColumns.map(col => (
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
                                                <TableCell>
                                                    <input type="checkbox" checked={selectedIds.has(s.documentId)} onChange={() => toggleSelect(s.documentId)} />
                                                </TableCell>
                                                <TableCell>{s.id}</TableCell>
                                                <TableCell>{s.invoice_no}</TableCell>
                                                <TableCell style={{ whiteSpace: "nowrap" }}>{new Date(s.sale_date).toLocaleDateString()}</TableCell>
                                                <TableCell>{s?.customer?.name || "—"}</TableCell>
                                                <TableCell>{s?.employee?.name || "—"}</TableCell>
                                                {showTotal && <TableCell align="right">{currency}{parseFloat(s.total || 0).toFixed(2)}</TableCell>}
                                                <TableCell>
                                                    <span className={`badge ${getPaymentBadgeClass(s.payment_status)}`}>{s.payment_status}</span>
                                                </TableCell>
                                                <TableCell>
                                                    {s.status === 'Cancelled'
                                                        ? <span className="badge bg-danger">Cancelled</span>
                                                        : <span className="badge bg-light text-muted">{s.status || 'Draft'}</span>
                                                    }
                                                </TableCell>
                                                <TableCell>
                                                    <span className={`badge ${getReturnBadgeClass(s.return_status)}`}>{s.return_status || "None"}</span>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="d-flex gap-1">
                                                        <Link href={`/${s.documentId}/sale`} className="btn btn-sm btn-outline-primary" style={{ textDecoration: "none" }}>
                                                            <i className="fas fa-edit me-1"></i>Edit
                                                        </Link>
                                                        {elevated && s.payment_status !== 'Paid' && s.status !== 'Cancelled' && (
                                                            <button
                                                                className="btn btn-sm btn-outline-danger"
                                                                onClick={() => handleCancelSale(s)}
                                                                disabled={cancellingId === s.documentId}
                                                            >
                                                                {cancellingId === s.documentId
                                                                    ? <><span className="spinner-border spinner-border-sm me-1"></span>Cancelling…</>
                                                                    : <><i className="fas fa-ban me-1"></i>Cancel</>
                                                                }
                                                            </button>
                                                        )}
                                                    </div>
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
