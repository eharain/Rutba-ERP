// file: /pos-desk/pages/stock-items.js
import React, { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import {
    Table,
    TableHead,
    TableRow,
    TableCell,
    TableBody,
    CircularProgress,
    TablePagination,
} from "../components/Table";
import Layout from "../components/Layout";
import ProtectedRoute from "../components/ProtectedRoute";
import { authApi, getStockStatus, getBranches } from "../lib/api";
import { useUtil } from "../context/UtilContext";
import { loadProduct } from "../lib/pos/fetchs";
import { searchStockItems } from "../lib/pos";

export default function StockItemsPage() {
    const router = useRouter();
    const { currency } = useUtil();
    const [stockItems, setStockItems] = useState([]);
    const [stock_status, setStockStatus] = useState({ statuses: [] });
    const [filteredItems, setFilteredItems] = useState([]);
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(20);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [selectedItems, setSelectedItems] = useState(new Set());
    const [statusFilter, setStatusFilter] = useState("Received");
    const [searchTerm, setSearchTerm] = useState("");
    const [branches, setBranches] = useState([]);
    const [selectedBranch, setSelectedBranch] = useState(null);
    const [selectedDestinationBranch, setSelectedDestinationBranch] = useState(null);
    const [productName, setProductName] = useState(null);

    const productFilter = Array.isArray(router.query.product) ? router.query.product[0] : router.query.product;

    useEffect(() => {
        (async () => {
            setStockStatus(await getStockStatus());
            const branches = await getBranches();
            setBranches(branches.data);
        })();
    }, [])

    useEffect(() => {
        setPage(0);
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
        // Handle Debounce for Search
        const handler = setTimeout(() => {
            // If there's a search term (3+ chars), use search logic
            if (trimmed.length >= 2) {
                handleStockItemsSearch(trimmed);
            } else {
                // Otherwise, load default list (Received/InStock etc)
                loadStockItems();
            }
        }, 200);

        return () => clearTimeout(handler);
    }, [page, rowsPerPage, statusFilter, searchTerm, selectedBranch, productFilter]);

    const handleStockItemsSearch = async (searchText) => {
        setLoading(true);
        try {
            // We pass current 'page + 1' so pagination works while searching
            const stockItemsResult = await searchStockItems(searchText, page + 1, rowsPerPage, statusFilter, selectedBranch, productFilter);
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
        setPage(0); // Reset to first page because results will change entirely
    };

    async function loadStockItems() {
        setLoading(true);
        try {

            const response = await authApi.get("/me/stock-items-search", {
                populate: {
                    product: true,
                    purchase_item: {
                        populate: {
                            purchase: true
                        }
                    }
                },
                filters: {
                    ...(statusFilter ? { status: statusFilter } : {}),
                    ...(selectedBranch ? { branch: { documentId: selectedBranch } } : {}),
                    ...(productFilter ? { product: { documentId: productFilter } } : {})
                },
                pagination: {
                    page: page + 1,
                    pageSize: rowsPerPage
                },
                sort: ["createdAt:desc"]
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
        setPage(0);
    };

    const sendStockToBranch = async (destinationBranch) => {
        setLoading(true);
        const documentIdsToUpdate = Array.from(selectedItems);
        try {
            await Promise.all(documentIdsToUpdate.map(id =>
                authApi.put(`/stock-items/${id}`, { data: { status: 'InStock', branch: destinationBranch } })
            ));
            alert(`Stock sent to ${destinationBranch} successfully for ${documentIdsToUpdate.length} items`);
            loadStockItems();
        }
        catch (error) {
            console.error('Error updating stock in stock status:', error);
        } finally {
            setSelectedItems(new Set());
            setSelectedDestinationBranch(null);
            setLoading(false);
        }
    };

    const handleChangePage = (event, newPage) => {
        setPage(newPage);
    };

    const handleChangeRowsPerPage = (event) => {
        setRowsPerPage(parseInt(event.target.value, 10));
        setPage(0);
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

        // Get document IDs
        const documentIdsToPrint = Array.from(selectedItems);

        // Store data in localStorage and get a key
        const storageKey = `bulk_print_data_${Date.now()}`;
        localStorage.setItem(storageKey, JSON.stringify({
            documentIds: documentIdsToPrint,
            timestamp: Date.now()
        }));

        const title = `Bulk Barcode Labels - ${documentIdsToPrint.length} Items`;
        const titleParam = encodeURIComponent(title);

        // Pass only the storage key in URL
        window.open(`/print-bulk-barcodes?key=${storageKey}&title=${titleParam}`, '_blank', 'width=1200,height=800');
    };

    const handleBulkPrintAllFiltered = () => {
        if (filteredItems.length === 0) {
            alert("No items to print");
            return;
        }

        // Get document IDs
        const documentIdsToPrint = filteredItems.map(item => item.documentId || item.id);

        // Store data in localStorage and get a key
        const storageKey = `bulk_print_data_${Date.now()}`;
        localStorage.setItem(storageKey, JSON.stringify({
            documentIds: documentIdsToPrint,
            timestamp: Date.now()
        }));

        const title = `Bulk ${statusFilter} Items - ${documentIdsToPrint.length} Total`;
        const titleParam = encodeURIComponent(title);

        // Pass only the storage key in URL
        window.open(`/print-bulk-barcodes?key=${storageKey}&title=${titleParam}`, '_blank', 'width=1200,height=800');
    };

    const handleQuickPrint = (item) => {
        // Get document ID
        const documentId = item.documentId || item.id;

        // Store data in localStorage and get a key
        const storageKey = `bulk_print_data_${Date.now()}`;
        localStorage.setItem(storageKey, JSON.stringify({
            documentIds: [documentId],
            timestamp: Date.now()
        }));

        const title = `Single Label - ${item.sku || item.product?.name || 'Item'}`;
        const titleParam = encodeURIComponent(title);

        // Pass only the storage key in URL
        window.open(`/print-bulk-barcodes?key=${storageKey}&title=${titleParam}`, '_blank', 'width=800,height=600');
    };

    const handleStatusFilterChange = (event) => {
        setStatusFilter(event.target.value);
        setPage(0);
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

    return (
        <ProtectedRoute>
            <Layout>
                <div className="p-4">
                    <div className="d-flex justify-content-between align-items-center mb-3">
                        <div>
                            <h2 className="mb-0">
                                Stock Items - Bulk Print
                                {productName && (
                                    <span className="ms-2 text-muted">{productName}</span>
                                )}
                            </h2>
                            {productFilter && (
                                <div className="small">
                                    <Link href="/stock-items">View all stock items</Link>
                                </div>
                            )}
                        </div>
                        <div className="text-end">
                            <div className="small text-muted">Selected</div>
                            <div className="badge bg-primary">{selectedItems.size} / {filteredItems.length}</div>
                        </div>
                    </div>
                </div>
                {/* Filters and actions toolbar */}
                <div className="card mb-3">
                    <div className="card-body">
                        <div className="row g-2 align-items-end">
                            <div className="col-sm-12 col-md-3">
                                <label className="form-label small mb-1">Status</label>
                                <select className="form-select form-select-sm" value={statusFilter} onChange={handleStatusFilterChange}>
                                    <option value="">All Statuses</option>
                                    {stock_status.statuses.map(status => (
                                        <option key={status} value={status}>{status}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="col-sm-12 col-md-4">
                                <label className="form-label small mb-1">Search</label>
                                <input type="text" value={searchTerm} onChange={handleSearchChange} className="form-control form-control-sm" placeholder="SKU, barcode, product name, purchase no..." />
                            </div>

                            <div className="col-sm-12 col-md-3">
                                <label className="form-label small mb-1">Branch</label>
                                <select className="form-select form-select-sm" value={selectedBranch || ''} onChange={(e) => onBranchChange(e.target.value)}>
                                    <option value="">Select Branch...</option>
                                    {branches.map(branch => (
                                        <option key={branch.id} value={branch.documentId}>{branch.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="col-sm-12 col-md-2 d-grid">
                                <button className="btn btn-danger btn-sm mb-2" onClick={handleBulkPrintSelected} disabled={selectedItems.size === 0}>🖨️ Bulk Print Selected</button>
                                <button className="btn btn-success btn-sm" onClick={handleBulkPrintAllFiltered} disabled={filteredItems.length === 0}>🖨️ Bulk Print All</button>
                                   <select className="form-select form-select-sm" value={selectedDestinationBranch || ''} disabled={selectedItems.size === 0} onChange={(e) => sendStockToBranch(e.target.value)}>
                                    <option value="">Send selected to branch...</option>
                                    {branches.map(branch => (
                                        <option key={branch.id} value={branch.documentId}>{branch.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
            
                    </div>
                </div>

                <div className="table-responsive">
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell style={{ width: '50px' }}>
                                    <input
                                        type="checkbox"
                                        checked={selectedItems.size === filteredItems.length && filteredItems.length > 0}
                                        onChange={handleSelectAll}
                                    />
                                </TableCell>
                                <TableCell>SKU</TableCell>
                                <TableCell>Barcode</TableCell>
                                <TableCell>Purchase No</TableCell>
                                <TableCell>Product</TableCell>
                                <TableCell>Offer Price</TableCell>
                                <TableCell>Selling Price</TableCell>
                                <TableCell>Status</TableCell>
                                <TableCell style={{ width: '120px' }} className="text-center">Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={8} align="center">
                                        <CircularProgress size={24} />
                                        <div style={{ marginTop: '10px' }}>Loading stock items...</div>
                                    </TableCell>
                                </TableRow>
                            ) : filteredItems.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={8} align="center">
                                        No stock items found.
                                        {stockItems.length > 0 && searchTerm && (
                                            <div style={{ marginTop: '10px', color: '#666' }}>
                                                Try changing your search term
                                            </div>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredItems.map((item) => {
                                    const itemId = item.documentId || item.id;
                                    const isSelected = selectedItems.has(itemId);

                                    return (
                                        <TableRow key={itemId}>
                                            <TableCell>
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => handleSelectItem(itemId)}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <strong>{item.sku || 'N/A'}</strong>
                                            </TableCell>
                                            <TableCell>
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
                                            </TableCell>
                                            <TableCell>
                                                {item.purchase_item?.purchase?.orderId || 'N/A'}
                                            </TableCell>
                                            <TableCell>
                                                {item.product?.name || 'N/A'}
                                            </TableCell>
                                            <TableCell>
                                                {currency}{parseFloat(item.offer_price || 0).toFixed(2)}
                                            </TableCell>
                                            <TableCell>
                                                {currency}{parseFloat(item.selling_price || 0).toFixed(2)}
                                            </TableCell>
                                            <TableCell>
                                                <span
                                                    style={{
                                                        padding: '4px 8px',
                                                        borderRadius: '4px',
                                                        backgroundColor: getStatusColor(item.status),
                                                        color: 'white',
                                                        fontSize: '12px',
                                                        fontWeight: 'bold'
                                                    }}
                                                >
                                                    {item.status}
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <button className="btn btn-sm btn-outline-primary" onClick={() => handleQuickPrint(item)} title="Print single label">🖨️</button>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>

                    <TablePagination
                        count={total}
                        page={page}
                        onPageChange={handleChangePage}
                        rowsPerPage={rowsPerPage}
                        onRowsPerPageChange={handleChangeRowsPerPage}
                        rowsPerPageOptions={[10, 20, 50, 100]}
                    />
                </div>
            </Layout>
        </ProtectedRoute>
    );
}

