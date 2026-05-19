// file: /pos-desk/pages/stock-items.js
import React, { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { BranchesEndpoints, StockHelpersEndpoints, StockItemsEndpoints } from "@rutba/api-provider/endpoints/index.js";
import { useUtil } from "@rutba/pos-shared/context/UtilContext";
import { loadProduct, searchStockItems } from "@rutba/api-provider/pos";
import ListPageLayout from "@rutba/pos-shared/components/ListPageLayout";
import ListPagination from "@rutba/pos-shared/components/ListPagination";

export default function StockItemsPage() {
    const router = useRouter();
    const { currency } = useUtil();
    const [stockItems, setStockItems] = useState([]);
    const [stock_status, setStockStatus] = useState({ statuses: [] });
    const [filteredItems, setFilteredItems] = useState([]);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [selectedItems, setSelectedItems] = useState(new Set());
    const [statusFilter, setStatusFilter] = useState("Received");
    const [searchTerm, setSearchTerm] = useState("");
    const [branches, setBranches] = useState([]);
    const [selectedBranch, setSelectedBranch] = useState(null);
    const [selectedDestinationBranch, setSelectedDestinationBranch] = useState(null);
    const [productName, setProductName] = useState(null);
    const [showArchived, setShowArchived] = useState(false);

    const productFilter = Array.isArray(router.query.product) ? router.query.product[0] : router.query.product;

    useEffect(() => {
        (async () => {
            setStockStatus(await StockHelpersEndpoints.getStockStatus());
            const branches = await BranchesEndpoints.list();
            setBranches(branches.data);
        })();
    }, [])

    useEffect(() => {
        setPage(1);
    }, [productFilter]);

    useEffect(() => {
        if (!productFilter) {
            setProductName(null);
            return;
        }

        (async () => {
            try {
                const product = await loadProduct(productFilter);
                setProductName(product?.name || null);
            } catch (error) {
                console.error("Error loading product name:", error);
                setProductName(null);
            }
        })();
    }, [productFilter]);


    useEffect(() => {
        const trimmed = searchTerm.trim();
        setSelectedItems(new Set()); // Clear selections on new load
        const handler = setTimeout(() => {
            if (trimmed.length >= 2) {
                handleStockItemsSearch(trimmed);
            } else {
                loadStockItems();
            }
        }, 200);

        return () => clearTimeout(handler);
    }, [page, pageSize, statusFilter, searchTerm, selectedBranch, productFilter, showArchived]);

    const handleStockItemsSearch = async (searchText) => {
        setLoading(true);
        try {
            const stockItemsResult = await searchStockItems(searchText, page, pageSize, statusFilter, selectedBranch, productFilter);
            setStockItems(stockItemsResult.data);
            setFilteredItems(stockItemsResult.data);
            setTotal(stockItemsResult.meta?.pagination?.total ?? 0);
        } catch (error) {
            console.error('Error searching stock items:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSearchChange = (e) => {
        setSearchTerm(e.target.value);
        setPage(1);
    };

    async function loadStockItems() {
        setLoading(true);
        try {
            const response = await StockItemsEndpoints.list(page, pageSize, {
                statusFilter,
                branchDocId: selectedBranch || undefined,
                productDocId: productFilter || undefined,
                showArchived,
            });
            const data = response.data || [];
            setStockItems(data);
            setFilteredItems(data);
            setTotal(response.meta?.pagination?.total || 0);
        } catch (error) {
            console.error("Error loading stock items:", error);
        } finally {
            setLoading(false);
        }
    };

    const onBranchChange = async (selectedBranch) => {
        setSelectedBranch(selectedBranch ? selectedBranch : null);
        setPage(1);
    };

    const sendStockToBranch = async (destinationBranch) => {
        setLoading(true);
        const documentIdsToUpdate = Array.from(selectedItems);
        try {
            const res = await StockItemsEndpoints.transfer({
                items: documentIdsToUpdate,
                toBranch: destinationBranch,
            });
            const moved = res?.transferred ?? documentIdsToUpdate.length;
            const failedCount = Array.isArray(res?.failed) ? res.failed.length : 0;
            alert(
                failedCount > 0
                    ? `Transferred ${moved} item(s); ${failedCount} failed (see console)`
                    : `Stock sent to ${res?.to?.name || destinationBranch} for ${moved} item(s)`
            );
            if (failedCount > 0) console.warn('[transfer] failures:', res.failed);
            loadStockItems();
        }
        catch (error) {
            console.error('Error transferring stock:', error);
        } finally {
            setSelectedItems(new Set());
            setSelectedDestinationBranch(null);
            setLoading(false);
        }
    };

    const handleSelectItem = (itemId) => {
        setSelectedItems(prev => {
            const newSet = new Set(prev);
            if (newSet.has(itemId)) {
                newSet.delete(itemId);
            } else {
                newSet.add(itemId);
            }
            return newSet;
        });
    };

    const handleSelectAll = () => {
        if (selectedItems.size === filteredItems.length) {
            setSelectedItems(new Set());
        } else {
            setSelectedItems(new Set(filteredItems.map(item => item.documentId || item.id)));
        }
    };

    const handleBulkPrintSelected = () => {
        if (selectedItems.size === 0) {
            alert("Please select items to print");
            return;
        }

        const documentIdsToPrint = Array.from(selectedItems);
        const storageKey = `bulk_print_data_${Date.now()}`;
        localStorage.setItem(storageKey, JSON.stringify({
            documentIds: documentIdsToPrint,
            timestamp: Date.now()
        }));

        const title = `Bulk Barcode Labels - ${documentIdsToPrint.length} Items`;
        const titleParam = encodeURIComponent(title);

        window.open(`/print-bulk-barcodes?key=${storageKey}&title=${titleParam}`, '_blank', 'width=1200,height=800');
    };

    const handleBulkPrintAllFiltered = () => {
        if (filteredItems.length === 0) {
            alert("No items to print");
            return;
        }

        const documentIdsToPrint = filteredItems.map(item => item.documentId || item.id);
        const storageKey = `bulk_print_data_${Date.now()}`;
        localStorage.setItem(storageKey, JSON.stringify({
            documentIds: documentIdsToPrint,
            timestamp: Date.now()
        }));

        const title = `Bulk ${statusFilter} Items - ${documentIdsToPrint.length} Total`;
        const titleParam = encodeURIComponent(title);

        window.open(`/print-bulk-barcodes?key=${storageKey}&title=${titleParam}`, '_blank', 'width=1200,height=800');
    };

    const handleQuickPrint = (item) => {
        const documentId = item.documentId || item.id;
        const storageKey = `bulk_print_data_${Date.now()}`;
        localStorage.setItem(storageKey, JSON.stringify({
            documentIds: [documentId],
            timestamp: Date.now()
        }));

        const title = `Single Label - ${item.sku || item.product?.name || 'Item'}`;
        const titleParam = encodeURIComponent(title);

        window.open(`/print-bulk-barcodes?key=${storageKey}&title=${titleParam}`, '_blank', 'width=800,height=600');
    };

    const handleStatusFilterChange = (event) => {
        setStatusFilter(event.target.value);
        setPage(1);
    };

    const getStatusColor = (status) => {
        switch (status) {
            case "Received": return "#28a745";
            case "InStock": return "#17a2b8";
            case "Sold": return "#6c757d";
            case "Reserved": return "#ffc107";
            case "Damaged": return "#dc3545";
            default: return "#6c757d";
        }
    };

    const filters = [
        <div key="status">
            <label className="form-label small mb-1">Status</label>
            <select className="form-select form-select-sm" value={statusFilter} onChange={handleStatusFilterChange}>
                <option value="">All Statuses</option>
                {stock_status.statuses.map(status => (
                    <option key={status} value={status}>{status}</option>
                ))}
            </select>
        </div>,
        <div key="search">
            <label className="form-label small mb-1">Search</label>
            <input type="text" value={searchTerm} onChange={handleSearchChange} className="form-control form-control-sm" placeholder="SKU, barcode, product name, purchase no..." />
        </div>,
        <div key="branch">
            <label className="form-label small mb-1">Branch</label>
            <select className="form-select form-select-sm" value={selectedBranch || ''} onChange={(e) => onBranchChange(e.target.value)}>
                <option value="">Select Branch...</option>
                {branches.map(branch => (
                    <option key={branch.id} value={branch.documentId}>{branch.name}</option>
                ))}
            </select>
        </div>,
        <div key="actions" className="d-grid gap-1">
            <button className="btn btn-danger btn-sm" onClick={handleBulkPrintSelected} disabled={selectedItems.size === 0}><i className="fas fa-print me-1"></i> Print Selected</button>
            <button className="btn btn-success btn-sm" onClick={handleBulkPrintAllFiltered} disabled={filteredItems.length === 0}><i className="fas fa-print me-1"></i> Print All</button>
            <select className="form-select form-select-sm" value={selectedDestinationBranch || ''} disabled={selectedItems.size === 0} onChange={(e) => sendStockToBranch(e.target.value)}>
                <option value="">Send selected to branch...</option>
                {branches.map(branch => (
                    <option key={branch.id} value={branch.documentId}>{branch.name}</option>
                ))}
            </select>
        </div>,
        <div key="archived" className="form-check form-switch mt-2">
            <input
                className="form-check-input"
                type="checkbox"
                id="showArchivedToggle"
                checked={showArchived}
                onChange={(e) => { setShowArchived(e.target.checked); setPage(1); }}
            />
            <label className="form-check-label small" htmlFor="showArchivedToggle">
                <i className="fas fa-archive me-1"></i>Show Archived Only
            </label>
        </div>,
    ];

    const title = (
        <div>
            <h4 className="mb-0">
                Stock Items - Bulk Print
                {productName && (
                    <span className="ms-2 text-muted small">{productName}</span>
                )}
            </h4>
            {productFilter && (
                <div className="small">
                    <Link href="/stock-items">View all stock items</Link>
                </div>
            )}
        </div>
    );

    return (
        <ProtectedRoute>
            <Layout>
                <ListPageLayout
                    title={title}
                    subtitle={total != null ? `${total} total · ${selectedItems.size} selected` : undefined}
                    filters={filters}
                    loading={loading}
                    pagination={
                        <ListPagination
                            page={page}
                            pageSize={pageSize}
                            total={total}
                            onPage={setPage}
                            onPageSize={(n) => { setPageSize(n); setPage(1); }}
                        />
                    }
                    emptyState={<div>No stock items found.</div>}
                >
                    <div className="table-responsive">
                        <table className="table table-hover list-table">
                            <thead>
                                <tr>
                                    <th style={{ width: '50px' }}>
                                        <input
                                            type="checkbox"
                                            checked={selectedItems.size === filteredItems.length && filteredItems.length > 0}
                                            onChange={handleSelectAll}
                                        />
                                    </th>
                                    <th>SKU</th>
                                    <th>Barcode</th>
                                    <th>Purchase No</th>
                                    <th>Product</th>
                                    <th>Return / Exchange</th>
                                    <th>Offer Price</th>
                                    <th>Selling Price</th>
                                    <th>Status</th>
                                    <th style={{ width: '120px' }} className="text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredItems.length === 0 ? (
                                    <tr>
                                        <td colSpan={10} className="text-center text-muted py-4">
                                            No stock items found.
                                            {stockItems.length > 0 && searchTerm && (
                                                <div style={{ marginTop: '10px' }}>
                                                    Try changing your search term
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ) : (
                                    filteredItems.map((item) => {
                                        const itemId = item.documentId || item.id;
                                        const isSelected = selectedItems.has(itemId);

                                        return (
                                            <tr key={itemId}>
                                                <td>
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={() => handleSelectItem(itemId)}
                                                    />
                                                </td>
                                                <td>
                                                    <strong>{item.sku || 'N/A'}</strong>
                                                </td>
                                                <td>
                                                    {item.barcode ? (
                                                        <code style={{
                                                            background: '#f8f9fa',
                                                            padding: '4px 8px',
                                                            borderRadius: '4px',
                                                            fontFamily: 'monospace'
                                                        }}>
                                                            {item.barcode}
                                                        </code>
                                                    ) : (
                                                        'No Barcode'
                                                    )}
                                                </td>
                                                <td>{item.purchase_item?.purchase?.orderId || 'N/A'}</td>
                                                <td>{item.product?.name || 'N/A'}</td>
                                                <td>
                                                    {item.product?.is_returnable === false ? (
                                                        <span className="badge bg-danger" title="Non-returnable"><i className="fas fa-ban"></i></span>
                                                    ) : (
                                                        <span className="badge bg-success" title="Returnable"><i className="fas fa-undo"></i></span>
                                                    )}
                                                    {' '}
                                                    {item.product?.is_exchangeable === false ? (
                                                        <span className="badge bg-warning text-dark" title="Non-exchangeable"><i className="fas fa-ban"></i></span>
                                                    ) : (
                                                        <span className="badge bg-success" title="Exchangeable"><i className="fas fa-exchange-alt"></i></span>
                                                    )}
                                                </td>
                                                <td>{currency}{parseFloat(item.offer_price || 0).toFixed(2)}</td>
                                                <td>{currency}{parseFloat(item.selling_price || 0).toFixed(2)}</td>
                                                <td>
                                                    <span
                                                        className="list-status"
                                                        style={{ backgroundColor: getStatusColor(item.status), color: 'white' }}
                                                    >
                                                        {item.status}
                                                    </span>
                                                </td>
                                                <td className="text-center">
                                                    <div className="list-actions justify-content-center">
                                                        <button className="btn btn-sm btn-outline-primary" onClick={() => handleQuickPrint(item)} title="Print single label"><i className="fas fa-print"></i></button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </ListPageLayout>
            </Layout>
        </ProtectedRoute>
    );
}
