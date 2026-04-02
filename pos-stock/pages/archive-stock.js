import React, { useEffect, useState, useCallback } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { authApi, getBranches } from "@rutba/pos-shared/lib/api";
import {
    Table,
    TableHead,
    TableRow,
    TableCell,
    TableBody,
    CircularProgress,
    TablePagination,
} from "@rutba/pos-shared/components/Table";

const TERMINAL_STATUSES = [
    'Sold',
    'Returned',
    'ReturnedDamaged',
    'ReturnedToSupplier',
    'Damaged',
    'Lost',
    'Expired',
];

export default function ArchiveStockPage() {
    const [branches, setBranches] = useState([]);
    const [selectedBranch, setSelectedBranch] = useState('');
    const [cutoffDate, setCutoffDate] = useState('');
    const [selectedStatuses, setSelectedStatuses] = useState(new Set(TERMINAL_STATUSES));
    const [stats, setStats] = useState(null);
    const [preview, setPreview] = useState(null);
    const [loading, setLoading] = useState(false);
    const [archiving, setArchiving] = useState(false);
    const [result, setResult] = useState(null);

    // Archived items list
    const [archivedItems, setArchivedItems] = useState([]);
    const [archivedPage, setArchivedPage] = useState(0);
    const [archivedRowsPerPage, setArchivedRowsPerPage] = useState(20);
    const [archivedTotal, setArchivedTotal] = useState(0);
    const [loadingArchived, setLoadingArchived] = useState(false);
    const [selectedArchivedItems, setSelectedArchivedItems] = useState(new Set());
    const [restoringItems, setRestoringItems] = useState(false);

    useEffect(() => {
        (async () => {
            const res = await getBranches();
            setBranches(res.data || []);
        })();
        // Default cutoff: 6 months ago
        const d = new Date();
        d.setMonth(d.getMonth() - 6);
        setCutoffDate(d.toISOString().split('T')[0]);
    }, []);

    const loadStats = useCallback(async () => {
        if (!selectedBranch) return;
        setLoading(true);
        try {
            const res = await authApi.get(`/branches/${selectedBranch}/archive-stats`);
            setStats(res.data || res);
        } catch (err) {
            console.error('Error loading stats:', err);
        } finally {
            setLoading(false);
        }
    }, [selectedBranch]);

    useEffect(() => {
        if (selectedBranch) {
            loadStats();
            loadArchivedItems();
        } else {
            setStats(null);
            setArchivedItems([]);
            setArchivedTotal(0);
        }
    }, [selectedBranch]);

    useEffect(() => {
        if (selectedBranch) {
            loadArchivedItems();
        }
    }, [archivedPage, archivedRowsPerPage]);

    const loadArchivedItems = async () => {
        if (!selectedBranch) return;
        setLoadingArchived(true);
        try {
            const res = await authApi.get("/me/stock-items-search", {
                filters: {
                    branch: { documentId: selectedBranch },
                    archived: true,
                },
                populate: {
                    product: true,
                    purchase_item: { populate: { purchase: true } },
                },
                pagination: {
                    page: archivedPage + 1,
                    pageSize: archivedRowsPerPage,
                },
                sort: ["archived_at:desc"],
            });
            const data = res.data || [];
            setArchivedItems(data);
            setArchivedTotal(res.meta?.pagination?.total || 0);
        } catch (err) {
            console.error('Error loading archived items:', err);
        } finally {
            setLoadingArchived(false);
        }
    };

    const handlePreview = async () => {
        if (!selectedBranch || !cutoffDate) return;
        setLoading(true);
        setResult(null);
        try {
            const res = await authApi.post(`/branches/${selectedBranch}/archive-stock`, {
                cutoffDate,
                statuses: Array.from(selectedStatuses),
                dryRun: true,
            });
            setPreview(res.data || res);
        } catch (err) {
            console.error('Error previewing archive:', err);
            alert('Error previewing archive: ' + (err?.message || 'Unknown error'));
        } finally {
            setLoading(false);
        }
    };

    const handleArchive = async () => {
        if (!selectedBranch || !cutoffDate) return;
        if (!preview || preview.matchingItems === 0) return;

        const confirmed = confirm(
            `Are you sure you want to archive ${preview.matchingItems} stock items?\n\nBranch: ${preview.branch?.name}\nCutoff: ${cutoffDate}\nStatuses: ${Array.from(selectedStatuses).join(', ')}\n\nThis can be undone by restoring items.`
        );
        if (!confirmed) return;

        setArchiving(true);
        setResult(null);
        try {
            const res = await authApi.post(`/branches/${selectedBranch}/archive-stock`, {
                cutoffDate,
                statuses: Array.from(selectedStatuses),
                dryRun: false,
            });
            setResult(res.data || res);
            setPreview(null);
            loadStats();
            loadArchivedItems();
        } catch (err) {
            console.error('Error archiving:', err);
            alert('Error archiving: ' + (err?.message || 'Unknown error'));
        } finally {
            setArchiving(false);
        }
    };

    const handleStatusToggle = (status) => {
        setSelectedStatuses(prev => {
            const next = new Set(prev);
            if (next.has(status)) {
                next.delete(status);
            } else {
                next.add(status);
            }
            return next;
        });
        setPreview(null);
    };

    const handleSelectArchivedItem = (docId) => {
        setSelectedArchivedItems(prev => {
            const next = new Set(prev);
            if (next.has(docId)) next.delete(docId);
            else next.add(docId);
            return next;
        });
    };

    const handleSelectAllArchived = () => {
        if (selectedArchivedItems.size === archivedItems.length) {
            setSelectedArchivedItems(new Set());
        } else {
            setSelectedArchivedItems(new Set(archivedItems.map(i => i.documentId || i.id)));
        }
    };

    const handleRestore = async () => {
        if (selectedArchivedItems.size === 0 || !selectedBranch) return;

        const confirmed = confirm(`Restore ${selectedArchivedItems.size} item(s) from archive?`);
        if (!confirmed) return;

        setRestoringItems(true);
        try {
            const res = await authApi.post(`/branches/${selectedBranch}/unarchive-stock`, {
                stockItemIds: Array.from(selectedArchivedItems),
            });
            const data = res.data || res;
            alert(`Restored ${data.restored} item(s) from archive.`);
            setSelectedArchivedItems(new Set());
            loadStats();
            loadArchivedItems();
        } catch (err) {
            console.error('Error restoring:', err);
            alert('Error restoring items: ' + (err?.message || 'Unknown error'));
        } finally {
            setRestoringItems(false);
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case "Sold": return "#6c757d";
            case "Returned": return "#17a2b8";
            case "ReturnedDamaged": return "#dc3545";
            case "ReturnedToSupplier": return "#fd7e14";
            case "Damaged": return "#dc3545";
            case "Lost": return "#343a40";
            case "Expired": return "#6f42c1";
            default: return "#6c757d";
        }
    };

    return (
        <ProtectedRoute>
            <Layout>
                <div className="p-4">
                    <h2 className="mb-3"><i className="fas fa-archive me-2"></i>Archive Stock Items</h2>
                    <p className="text-muted">
                        Archive old stock items in terminal statuses to reduce data load. Archived items are hidden from
                        default views but can be restored at any time.
                    </p>

                    {/* Branch selector + Stats */}
                    <div className="row mb-4">
                        <div className="col-md-4">
                            <div className="card">
                                <div className="card-body">
                                    <h6 className="card-title">Select Branch</h6>
                                    <select
                                        className="form-select"
                                        value={selectedBranch}
                                        onChange={(e) => {
                                            setSelectedBranch(e.target.value);
                                            setPreview(null);
                                            setResult(null);
                                            setArchivedPage(0);
                                            setSelectedArchivedItems(new Set());
                                        }}
                                    >
                                        <option value="">Choose a branch...</option>
                                        {branches.map(b => (
                                            <option key={b.id} value={b.documentId}>{b.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>

                        {stats && (
                            <div className="col-md-8">
                                <div className="card">
                                    <div className="card-body">
                                        <h6 className="card-title">Branch Stats — {stats.branch?.name}</h6>
                                        <div className="row text-center">
                                            <div className="col">
                                                <div className="fs-4 fw-bold text-primary">{stats.totalItems}</div>
                                                <small className="text-muted">Total Items</small>
                                            </div>
                                            <div className="col">
                                                <div className="fs-4 fw-bold text-success">{stats.activeItems}</div>
                                                <small className="text-muted">Active</small>
                                            </div>
                                            <div className="col">
                                                <div className="fs-4 fw-bold text-secondary">{stats.archivedItems}</div>
                                                <small className="text-muted">Archived</small>
                                            </div>
                                        </div>
                                        <hr />
                                        <div className="row">
                                            <small className="text-muted mb-1">Archivable (non-archived, terminal status):</small>
                                            {Object.entries(stats.terminalStatusCounts || {}).map(([status, count]) => (
                                                <div key={status} className="col-auto mb-1">
                                                    <span className="badge" style={{ backgroundColor: getStatusColor(status) }}>
                                                        {status}: {count}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Archive Controls */}
                    {selectedBranch && (
                        <div className="card mb-4">
                            <div className="card-header bg-warning text-dark">
                                <strong><i className="fas fa-box-archive me-2"></i>Archive Configuration</strong>
                            </div>
                            <div className="card-body">
                                <div className="row g-3 align-items-end">
                                    <div className="col-md-3">
                                        <label className="form-label">Cutoff Date</label>
                                        <input
                                            type="date"
                                            className="form-control"
                                            value={cutoffDate}
                                            onChange={(e) => { setCutoffDate(e.target.value); setPreview(null); }}
                                        />
                                        <small className="text-muted">Items last updated before this date</small>
                                    </div>
                                    <div className="col-md-6">
                                        <label className="form-label">Statuses to Archive</label>
                                        <div className="d-flex flex-wrap gap-2">
                                            {TERMINAL_STATUSES.map(status => (
                                                <div key={status} className="form-check">
                                                    <input
                                                        className="form-check-input"
                                                        type="checkbox"
                                                        id={`status-${status}`}
                                                        checked={selectedStatuses.has(status)}
                                                        onChange={() => handleStatusToggle(status)}
                                                    />
                                                    <label className="form-check-label" htmlFor={`status-${status}`}>
                                                        <span className="badge" style={{ backgroundColor: getStatusColor(status) }}>
                                                            {status}
                                                        </span>
                                                    </label>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="col-md-3 d-grid gap-2">
                                        <button
                                            className="btn btn-outline-primary"
                                            onClick={handlePreview}
                                            disabled={loading || selectedStatuses.size === 0}
                                        >
                                            {loading ? <><CircularProgress size={16} /> Counting...</> : <><i className="fas fa-search me-1"></i>Preview</>}
                                        </button>
                                        <button
                                            className="btn btn-warning"
                                            onClick={handleArchive}
                                            disabled={archiving || !preview || preview.matchingItems === 0}
                                        >
                                            {archiving ? <><CircularProgress size={16} /> Archiving...</> : <><i className="fas fa-archive me-1"></i>Archive Now</>}
                                        </button>
                                    </div>
                                </div>

                                {/* Preview result */}
                                {preview && (
                                    <div className="alert alert-info mt-3 mb-0">
                                        <strong>Preview:</strong> {preview.matchingItems} stock item(s) match the criteria
                                        and will be archived.
                                        {preview.matchingItems === 0 && (
                                            <span className="ms-2 text-muted">— No items to archive with these settings.</span>
                                        )}
                                    </div>
                                )}

                                {/* Archive result */}
                                {result && (
                                    <div className="alert alert-success mt-3 mb-0">
                                        <strong>Done!</strong> {result.archived} stock item(s) have been archived.
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Archived Items Table */}
                    {selectedBranch && (
                        <div className="card">
                            <div className="card-header d-flex justify-content-between align-items-center">
                                <strong><i className="fas fa-boxes me-2"></i>Archived Items ({archivedTotal})</strong>
                                {selectedArchivedItems.size > 0 && (
                                    <button
                                        className="btn btn-sm btn-outline-success"
                                        onClick={handleRestore}
                                        disabled={restoringItems}
                                    >
                                        {restoringItems
                                            ? <><CircularProgress size={14} /> Restoring...</>
                                            : <><i className="fas fa-undo me-1"></i>Restore Selected ({selectedArchivedItems.size})</>
                                        }
                                    </button>
                                )}
                            </div>
                            <div className="table-responsive">
                                <Table>
                                    <TableHead>
                                        <TableRow>
                                            <TableCell style={{ width: '40px' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={selectedArchivedItems.size === archivedItems.length && archivedItems.length > 0}
                                                    onChange={handleSelectAllArchived}
                                                />
                                            </TableCell>
                                            <TableCell>SKU</TableCell>
                                            <TableCell>Barcode</TableCell>
                                            <TableCell>Product</TableCell>
                                            <TableCell>Purchase No</TableCell>
                                            <TableCell>Status</TableCell>
                                            <TableCell>Archived At</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {loadingArchived ? (
                                            <TableRow>
                                                <TableCell colSpan={7} align="center">
                                                    <CircularProgress size={24} />
                                                    <div style={{ marginTop: '10px' }}>Loading archived items...</div>
                                                </TableCell>
                                            </TableRow>
                                        ) : archivedItems.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={7} align="center">
                                                    No archived items for this branch.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            archivedItems.map((item) => {
                                                const docId = item.documentId || item.id;
                                                return (
                                                    <TableRow key={docId}>
                                                        <TableCell>
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedArchivedItems.has(docId)}
                                                                onChange={() => handleSelectArchivedItem(docId)}
                                                            />
                                                        </TableCell>
                                                        <TableCell><strong>{item.sku || 'N/A'}</strong></TableCell>
                                                        <TableCell>
                                                            {item.barcode ? (
                                                                <code style={{ background: '#f8f9fa', padding: '2px 6px', borderRadius: '4px' }}>
                                                                    {item.barcode}
                                                                </code>
                                                            ) : 'N/A'}
                                                        </TableCell>
                                                        <TableCell>{item.product?.name || 'N/A'}</TableCell>
                                                        <TableCell>{item.purchase_item?.purchase?.orderId || 'N/A'}</TableCell>
                                                        <TableCell>
                                                            <span className="badge" style={{ backgroundColor: getStatusColor(item.status) }}>
                                                                {item.status}
                                                            </span>
                                                        </TableCell>
                                                        <TableCell>
                                                            {item.archived_at
                                                                ? new Date(item.archived_at).toLocaleDateString()
                                                                : 'N/A'}
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })
                                        )}
                                    </TableBody>
                                </Table>
                                <TablePagination
                                    count={archivedTotal}
                                    page={archivedPage}
                                    onPageChange={(e, newPage) => setArchivedPage(newPage)}
                                    rowsPerPage={archivedRowsPerPage}
                                    onRowsPerPageChange={(e) => { setArchivedRowsPerPage(parseInt(e.target.value, 10)); setArchivedPage(0); }}
                                    rowsPerPageOptions={[10, 20, 50, 100]}
                                />
                            </div>
                        </div>
                    )}
                </div>
            </Layout>
        </ProtectedRoute>
    );
}

