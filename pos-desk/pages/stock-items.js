// file: /pos-desk/pages/stock-items.js
import React, { useEffect, useState, useRef } from "react";
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
import { authApi, getStockStatus } from "../lib/api";
import { useUtil } from "../context/UtilContext";
import { searchStockItems } from "../lib/pos";


export default function StockItemsPage() {
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
    const lastSearchRef = useRef("");
    const firstLoadRef = useRef(true);

    useEffect(() => {
        (async () => {
            setStockStatus(await getStockStatus());
        })();
    }, [])

    useEffect(() => {
        loadStockItems();
    }, [page, rowsPerPage, statusFilter]);

    // Search stock items with debounce
    useEffect(() => {
        const trimmed = searchTerm.trim();
    
        const handler = setTimeout(() => {
            if (firstLoadRef.current) {
                firstLoadRef.current = false;
                return;
            }
            
            if (trimmed.length === 0) {
                lastSearchRef.current = "";
                setPage(0);
                loadStockItems();
                return;
            }
            
            if (trimmed.length < 3) {
                return;
            }
            
            if (trimmed === lastSearchRef.current) {
                return;
            }
    
            lastSearchRef.current = trimmed;
            handleStockItemsSearch(trimmed);
    
        }, 400);
    
        return () => clearTimeout(handler);
    }, [searchTerm]);

    async function loadStockItems() {
        setLoading(true);
        try {
           
            const response = await authApi.get("/stock-items", {
                populate: {
                    product: true,
                    purchase_item: {
                    populate: {
                            purchase: true
                        }
                    }
                },
                filters: {
                    status: statusFilter
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
    

    const handleStockItemsSearch = async (searchText) => {
        setLoading(true);
        try {
            const stockItemsResult = await searchStockItems(searchText, page + 1, rowsPerPage, statusFilter);
            setStockItems(stockItemsResult.data);
            setFilteredItems(stockItemsResult.data);
            setTotal(stockItemsResult.meta?.pagination?.total ?? 0);
            setPage(0);
        } catch (error) {
            console.error('Error searching stock items:', error);
            setStockItems([]);
            setFilteredItems([]);
        } finally {
            setLoading(false);
        }
    };

    const handleStockInStock = async () => {
        setLoading(true);
        const documentIdsToUpdate = Array.from(selectedItems);
        try {
            for (const documentId of documentIdsToUpdate) {
                await authApi.put(`/stock-items/${documentId}`, {
                    data: {
                        status: 'InStock'
                    }
                });
            }
            alert(`Stock in stock status updated successfully for ${documentIdsToUpdate.length} items`);
            setSelectedItems(new Set());
            loadStockItems();
        }
        catch (error) {
            console.error('Error updating stock in stock status:', error);
            setSelectedItems(new Set());
        } finally {
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
                <div style={{ padding: '20px' }}>
                    <h2 style={{ marginBottom: '20px' }}>Stock Items - Bulk Print</h2>

                    {/* Enhanced Filters and Actions */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr auto auto auto',
                        gap: '15px',
                        marginBottom: '20px',
                        alignItems: 'end'
                    }}>
                        {/* Status Filter */}
                        <div>
                            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                                Status Filter:
                            </label>
                            <select
                                value={statusFilter}
                                onChange={handleStatusFilterChange}
                                style={{
                                    width: '100%',
                                    padding: '8px',
                                    border: '1px solid #ccc',
                                    borderRadius: '4px'
                                }}
                            >
                                <option value="">All Statuses</option>
                                {stock_status.statuses.map(status => (
                                    <option key={status} value={status}>
                                        {status}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Search */}
                        <div>
                            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                                Search:
                            </label>
                            <input
                                type="text"
                                placeholder="SKU, barcode, product name, purchase no..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '8px',
                                    border: '1px solid #ccc',
                                    borderRadius: '4px'
                                }}
                            />
                        </div>

                        {statusFilter === 'Received' && <button
                            onClick={handleStockInStock}
                            disabled={selectedItems.size === 0}
                            style={{
                                padding: '10px 16px',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: selectedItems.size > 0 ? 'pointer' : 'not-allowed',
                                background: selectedItems.size > 0 ? '#007bff' : '#6c757d',
                            }}
                            title={`Update ${selectedItems.size} selected items to stock in stock status`}
                        >
                            Update to Stock In Stock Status
                        </button>}

                        {/* Bulk Print Buttons */}
                        <button
                            onClick={handleBulkPrintSelected}
                            disabled={selectedItems.size === 0}
                            style={{
                                padding: '10px 16px',
                                background: selectedItems.size > 0 ? '#dc3545' : '#6c757d',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: selectedItems.size > 0 ? 'pointer' : 'not-allowed',
                                fontWeight: 'bold',
                                fontSize: '14px'
                            }}
                            title={`Print ${selectedItems.size} selected items`}
                        >
                            🖨️ Bulk Print Selected
                        </button>

                        <button
                            onClick={handleBulkPrintAllFiltered}
                            disabled={filteredItems.length === 0}
                            style={{
                                padding: '10px 16px',
                                background: filteredItems.length > 0 ? '#28a745' : '#6c757d',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: filteredItems.length > 0 ? 'pointer' : 'not-allowed',
                                fontWeight: 'bold',
                                fontSize: '14px'
                            }}
                            title={`Print all ${filteredItems.length} filtered items`}
                        >
                            🖨️ Bulk Print All
                        </button>

                        {/* Selection Info */}
                        <div style={{
                            padding: '8px 12px',
                            background: '#f8f9fa',
                            border: '1px solid #dee2e6',
                            borderRadius: '4px',
                            textAlign: 'center',
                            minWidth: '120px'
                        }}>
                            <div style={{ fontSize: '12px', color: '#6c757d' }}>Selected</div>
                            <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#007bff' }}>
                                {selectedItems.size} / {filteredItems.length}
                            </div>
                        </div>
                    </div>

                    {/* Stock Items Table */}
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
                                <TableCell>Actions</TableCell>
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
                                                {item.purchase_item?.purchase?.purchase_no || 'N/A'}
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
                                            <TableCell>
                                                <button
                                                    onClick={() => handleQuickPrint(item)}
                                                    style={{
                                                        padding: '4px 12px',
                                                        background: 'transparent',
                                                        color: '#007bff',
                                                        border: '1px solid #007bff',
                                                        borderRadius: '4px',
                                                        cursor: 'pointer',
                                                        fontSize: '12px'
                                                    }}
                                                    title="Print single label"
                                                >
                                                    🖨️ Print
                                                </button>
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

