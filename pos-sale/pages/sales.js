import { useEffect, useState, useCallback, useMemo } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import PermissionCheck from "@rutba/pos-shared/components/PermissionCheck";
import { fetchSales } from "@rutba/api-provider/pos";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { isAppAdmin, isActiveAdminRole } from "@rutba/pos-shared/lib/roles";
import { BranchesEndpoints, SalesEndpoints } from "@rutba/api-provider/endpoints";
import SaleApi from "@rutba/pos-shared/lib/saleApi";
import Link from "next/link";
import { useUtil } from "@rutba/pos-shared/context/UtilContext";
import ListPageLayout, { AddButton } from "@rutba/pos-shared/components/ListPageLayout";
import ListPagination from "@rutba/pos-shared/components/ListPagination";

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
    const { jwt, adminAppAccess, activeRoleKey } = useAuth();
    const admin = isAppAdmin(adminAppAccess, "sale");
    const elevated = admin && isActiveAdminRole(activeRoleKey);
    // 1-based page for ListPagination
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
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
                const res = await BranchesEndpoints.list();
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
                    const stockRes = await SalesEndpoints.searchByStockItem(searchText.trim());
                    const matchedIds = stockRes?.data ?? [];
                    if (matchedIds.length === 0) {
                        if (!cancelled) { setSales([]); setTotal(0); setLoading(false); }
                        return;
                    }
                    filters.documentId = { $in: matchedIds };
                }

                // Item price range: resolve matching sale documentIds via custom endpoint
                if (priceByItem && (totalMin !== "" || totalMax !== "")) {
                    const priceRes = await SalesEndpoints.searchByItemPrice({ min: totalMin, max: totalMax });
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

                const res = await fetchSales(page, pageSize, {
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
    }, [jwt, page, pageSize, sortField, sortOrder, buildFilters, populate, refreshKey, searchText, searchField, priceByItem, totalMin, totalMax]);

    const handleSort = (field) => {
        if (sortField === field) {
            setSortOrder(prev => prev === "asc" ? "desc" : "asc");
        } else {
            setSortField(field);
            setSortOrder("asc");
        }
        setPage(1);
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
        setPage(1);
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

    const filterNodes = [
        <div key="search" className="input-group input-group-sm">
            <select
                className="form-select form-select-sm"
                value={searchField}
                onChange={e => { setSearchField(e.target.value); setPage(1); }}
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
                onChange={e => { setSearchText(e.target.value); setPage(1); }}
            />
        </div>,
        <select key="payment" className="form-select form-select-sm" value={paymentStatus} onChange={e => { setPaymentStatus(e.target.value); setPage(1); }} title="Payment">
            <option value="">Payment: All</option>
            {PAYMENT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>,
        <select key="return" className="form-select form-select-sm" value={returnStatus} onChange={e => { setReturnStatus(e.target.value); setPage(1); }} title="Return">
            <option value="">Return: All</option>
            {RETURN_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>,
        <input key="min" type="number" className="form-control form-control-sm" placeholder={priceByItem ? 'Item Price Min' : 'Total Min'} min="0" step="any" value={totalMin} onChange={e => { setTotalMin(e.target.value); setPage(1); }} />,
        <input key="max" type="number" className="form-control form-control-sm" placeholder={priceByItem ? 'Item Price Max' : 'Total Max'} min="0" step="any" value={totalMax} onChange={e => { setTotalMax(e.target.value); setPage(1); }} />,
        <div key="byItem" className="form-check">
            <input
                className="form-check-input"
                type="checkbox"
                id="priceByItem"
                checked={priceByItem}
                onChange={e => { setPriceByItem(e.target.checked); setPage(1); }}
            />
            <label className="form-check-label small" htmlFor="priceByItem">By Item Price</label>
        </div>,
        ...(admin ? [
            <input key="from" type="date" className="form-control form-control-sm" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} title="From" />,
            <input key="to" type="date" className="form-control form-control-sm" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} title="To" />,
            <select key="branch" className="form-select form-select-sm" value={branchFilter} onChange={e => { setBranchFilter(e.target.value); setPage(1); }} title="Branch">
                <option value="">Branch: All</option>
                {branches.map(b => <option key={b.documentId || b.id} value={b.documentId || b.id}>{b.name}</option>)}
            </select>,
        ] : []),
        ...(hasFilters ? [
            <button key="clear" className="btn btn-outline-secondary btn-sm" onClick={handleClearFilters}>
                <i className="fas fa-times me-1"></i>Clear
            </button>
        ] : []),
    ];

    const headerActions = (
        <>
            <button
                className="btn btn-sm btn-outline-secondary"
                onClick={() => setShowTotal(v => !v)}
                title={showTotal ? 'Hide totals' : 'Show totals'}
            >
                <i className={`fas ${showTotal ? 'fa-eye-slash' : 'fa-eye'} me-1`}></i>{showTotal ? 'Hide' : 'Show'} Totals
            </button>
            {!admin && <span className="badge bg-secondary">Last 24 hours</span>}
            <AddButton label="New Sale" href="/new/sale" />
        </>
    );

    const bulkActions = selectedIds.size >= 2 ? (
        <button className="btn btn-sm btn-outline-info" onClick={handlePrintCombined}>
            <i className="fas fa-print me-1"></i>Print Combined Receipt
        </button>
    ) : null;

    const subtitle = total != null ? `${total} record${total !== 1 ? 's' : ''}` : undefined;

    return (
        <ProtectedRoute>
            <PermissionCheck required="sale">
                <Layout>
                    <ListPageLayout
                        title="Sales"
                        subtitle={subtitle}
                        headerActions={headerActions}
                        filters={filterNodes}
                        bulkActions={bulkActions}
                        selectedCount={selectedIds.size}
                        loading={loading}
                        pagination={
                            <ListPagination
                                page={page}
                                pageSize={pageSize}
                                total={total}
                                onPage={setPage}
                                onPageSize={(n) => { setPageSize(n); setPage(1); }}
                                pageSizeOptions={[5, 10, 25, 50]}
                            />
                        }
                        emptyState={<div>No sales found.</div>}
                    >
                        <div className="table-responsive">
                            <table className="table table-hover list-table">
                                <thead>
                                    <tr>
                                        <th style={{ width: '30px' }}>
                                            <input type="checkbox" checked={sales.length > 0 && selectedIds.size === sales.length} onChange={toggleSelectAll} title="Select all" />
                                        </th>
                                        {visibleColumns.map(col => (
                                            <th
                                                key={col.key}
                                                style={{ cursor: col.relation ? "default" : "pointer", userSelect: "none", whiteSpace: "nowrap", textAlign: col.align || 'left' }}
                                                onClick={() => !col.relation && handleSort(col.key)}
                                            >
                                                {col.label}{!col.relation && sortIcon(col.key)}
                                            </th>
                                        ))}
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sales.length === 0 ? (
                                        <tr>
                                            <td colSpan={colCount} className="text-center text-muted py-3">
                                                No sales found.
                                            </td>
                                        </tr>
                                    ) : (
                                        sales.map(s => (
                                            <tr key={s.id}>
                                                <td>
                                                    <input type="checkbox" checked={selectedIds.has(s.documentId)} onChange={() => toggleSelect(s.documentId)} />
                                                </td>
                                                <td>{s.id}</td>
                                                <td>{s.invoice_no}</td>
                                                <td style={{ whiteSpace: "nowrap" }}>{new Date(s.sale_date).toLocaleString([], { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                                                <td>{s?.customer?.name || "—"}</td>
                                                <td>{s?.employee?.name || "—"}</td>
                                                {showTotal && <td style={{ textAlign: 'right' }}>{currency}{parseFloat(s.total || 0).toFixed(2)}</td>}
                                                <td>
                                                    <span className={`list-status ${getPaymentBadgeClass(s.payment_status)}`}>{s.payment_status}</span>
                                                </td>
                                                <td>
                                                    {s.status === 'Cancelled'
                                                        ? <span className="list-status bg-danger">Cancelled</span>
                                                        : <span className="list-status bg-light text-muted">{s.status || 'Draft'}</span>
                                                    }
                                                </td>
                                                <td>
                                                    <span className={`list-status ${getReturnBadgeClass(s.return_status)}`}>{s.return_status || "None"}</span>
                                                </td>
                                                <td>
                                                    <div className="list-actions">
                                                        <Link href={`/${s.documentId}/sale`} className="btn btn-sm btn-outline-primary" style={{ textDecoration: "none" }}>
                                                            <i className="fas fa-edit me-1"></i>Edit
                                                        </Link>
                                                        {elevated && s.payment_status !== 'Paid' && s.status !== 'Cancelled'
                                                            && !(s.pay_later && s.pay_later_stock_status === 'Sold') && (
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
                                                        {s.pay_later && s.pay_later_stock_status === 'Sold' && s.status !== 'Cancelled' && (
                                                            <span
                                                                className="badge bg-warning text-dark"
                                                                title="Pay-later credit sale — goods released as Sold. Cannot be cancelled; process a return instead."
                                                            >
                                                                <i className="fas fa-lock me-1"></i>Credit
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </ListPageLayout>
                </Layout>
            </PermissionCheck>
        </ProtectedRoute>
    );
}
