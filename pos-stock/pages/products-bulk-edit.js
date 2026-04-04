import { useEffect, useState, useCallback, Fragment } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import {
    Table, TableHead, TableRow, TableCell, TableBody,
    CircularProgress, TablePagination
} from "@rutba/pos-shared/components/Table";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import PermissionCheck from "@rutba/pos-shared/components/PermissionCheck";
import { authApi, StraipImageUrl } from "@rutba/pos-shared/lib/api";
import { fetchProducts, saveProduct } from "@rutba/pos-shared/lib/pos";
import { ProductFilter } from "@rutba/pos-shared/components/filter/product-filter";
import { useUtil } from "@rutba/pos-shared/context/UtilContext";
import { getBranch } from "@rutba/pos-shared/lib/utils";

function SortableHeader({ label, field, sortField, sortOrder, onSort, align }) {
    const isActive = sortField === field;
    const arrow = isActive ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : '';
    return (
        <TableCell
            align={align}
            onClick={() => onSort(field)}
            style={{ cursor: 'pointer', userSelect: 'none' }}
        >
            {label}{arrow}
        </TableCell>
    );
}

export default function ProductsBulkEdit() {
    const router = useRouter();
    const { currency } = useUtil();
    const [products, setProducts] = useState([]);
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(25);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [filters, setFilters] = useState({});
    const [brands, setBrands] = useState([]);
    const [categories, setCategories] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [termTypes, setTermTypes] = useState([]);
    const [purchases, setPurchases] = useState([]);
    const [selectedBrand, setSelectedBrand] = useState("");
    const [selectedCategory, setSelectedCategory] = useState("");
    const [selectedSupplier, setSelectedSupplier] = useState("");
    const [selectedTerm, setSelectedTerm] = useState("");
    const [selectedPurchase, setSelectedPurchase] = useState("");
    const [searchText, setSearchText] = useState("");
    const [filtersInitialized, setFiltersInitialized] = useState(false);
    const [sortField, setSortField] = useState('id');
    const [sortOrder, setSortOrder] = useState('desc');

    // Bulk edit state: keyed by product documentId
    const [edits, setEdits] = useState({});
    const [saving, setSaving] = useState({});
    const [savingAll, setSavingAll] = useState(false);
    const [stockItemStatus, setStockItemStatus] = useState('Received');
    const [messages, setMessages] = useState({});
    const [globalMessage, setGlobalMessage] = useState({ type: '', text: '' });

    // Stock item counts per product (fetched once products load)
    const [stockCounts, setStockCounts] = useState({});

    const sortString = `${sortField}:${sortOrder}`;

    const handleSort = useCallback((field) => {
        if (sortField === field) {
            setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortField(field);
            setSortOrder('asc');
        }
        setPage(0);
    }, [sortField]);

    async function loadProductsData() {
        setLoading(true);
        const { data, meta } = await fetchProducts(filters, page + 1, rowsPerPage, sortString);
        setProducts(data);
        setTotal(meta.pagination.total);
        setEdits({});
        setMessages({});
        setLoading(false);

        // Fetch stock item counts per product for the selected status
        if (data.length > 0) {
            fetchStockCounts(data, stockItemStatus);
        }
    }

    async function fetchStockCounts(productsList, status) {
        const counts = {};
        await Promise.all(
            productsList.map(async (p) => {
                try {
                    const res = await authApi.get('/stock-items', {
                        filters: {
                            product: { documentId: p.documentId },
                            status: { $in: ['Received', 'InStock'] },
                        },
                        pagination: { pageSize: 1 },
                    });
                    counts[p.documentId] = res.meta?.pagination?.total || 0;
                } catch {
                    counts[p.documentId] = 0;
                }
            })
        );
        setStockCounts(counts);
    }

    useEffect(() => {
        if (!filtersInitialized) return;
        loadProductsData();
    }, [page, rowsPerPage, filters, filtersInitialized, sortString]);

    // Re-fetch stock counts when status changes
    useEffect(() => {
        if (products.length > 0) {
            fetchStockCounts(products, stockItemStatus);
        }
    }, [stockItemStatus]);

    useEffect(() => {
        Promise.all([
            authApi.getAll("/brands"),
            authApi.getAll("/categories"),
            authApi.getAll("/suppliers"),
            authApi.getAll("/term-types", { populate: ["terms"] }),
            authApi.getAll("/purchases", { sort: ["createdAt:desc"] }),
        ]).then(([b, c, s, t, p]) => {
            setBrands(b?.data || b || []);
            setCategories(c?.data || c || []);
            setSuppliers(s?.data || s || []);
            setTermTypes(t?.data || t || []);
            setPurchases(p?.data || p || []);
        });
    }, []);

    // Initialize filters from URL query
    useEffect(() => {
        if (!router.isReady || filtersInitialized) return;

        const getQueryValue = (value) => (Array.isArray(value) ? value[0] : value);
        const { brands, categories, suppliers, terms, purchases, searchText, stockStatus } = router.query;

        if (brands) setSelectedBrand(getQueryValue(brands));
        if (categories) setSelectedCategory(getQueryValue(categories));
        if (suppliers) setSelectedSupplier(getQueryValue(suppliers));
        if (terms) setSelectedTerm(getQueryValue(terms));
        if (purchases) setSelectedPurchase(getQueryValue(purchases));
        if (searchText) setSearchText(getQueryValue(searchText));

        setFiltersInitialized(true);
    }, [router.isReady, router.query, filtersInitialized]);

    // Sync filters to URL and state
    useEffect(() => {
        if (!filtersInitialized) return;

        const updatedFilters = {
            brands: [selectedBrand],
            categories: [selectedCategory],
            suppliers: [selectedSupplier],
            terms: [selectedTerm],
            purchases: [selectedPurchase],
            searchText,
            parentOnly: true
        };

        const query = {};
        if (selectedBrand) query.brands = selectedBrand;
        if (selectedCategory) query.categories = selectedCategory;
        if (selectedSupplier) query.suppliers = selectedSupplier;
        if (selectedTerm) query.terms = selectedTerm;
        if (selectedPurchase) query.purchases = selectedPurchase;
        if (searchText) query.searchText = searchText;
        router.replace({ pathname: router.pathname, query }, undefined, { shallow: true });

        for (const [key, value] of Object.entries(updatedFilters)) {
            if (Array.isArray(value)) {
                updatedFilters[key] = value.filter((v) => v);
                if (updatedFilters[key].length === 0) delete updatedFilters[key];
            }
        }

        setFilters(updatedFilters);
        setPage(0);
    }, [selectedBrand, selectedCategory, selectedSupplier, selectedTerm, selectedPurchase, searchText, filtersInitialized]);

    const handleChangePage = (event, newPage) => setPage(newPage);

    const handleChangeRowsPerPage = (event) => {
        setRowsPerPage(parseInt(event.target.value, 10));
        setPage(0);
    };

    // Get edit value or fall back to original product value
    // For stock_quantity, fall back to the actual stock item count (Received + InStock)
    const getEditValue = (product, field) => {
        const e = edits[product.documentId];
        if (e && e[field] !== undefined) return e[field];
        if (field === 'stock_quantity') {
            return stockCounts[product.documentId] ?? '';
        }
        return product[field] ?? '';
    };

    const setEditValue = (product, field, value) => {
        setEdits(prev => ({
            ...prev,
            [product.documentId]: {
                ...prev[product.documentId],
                [field]: value,
            }
        }));
    };

    const isEdited = (docId) => {
        return edits[docId] && Object.keys(edits[docId]).length > 0;
    };

    // Build query string from current filters for navigation links
    const buildFilterQuery = () => {
        const params = new URLSearchParams();
        if (selectedBrand) params.set('brands', selectedBrand);
        if (selectedCategory) params.set('categories', selectedCategory);
        if (selectedSupplier) params.set('suppliers', selectedSupplier);
        if (selectedTerm) params.set('terms', selectedTerm);
        if (selectedPurchase) params.set('purchases', selectedPurchase);
        if (searchText) params.set('searchText', searchText);
        const qs = params.toString();
        return qs ? `?${qs}` : '';
    };

    // Save a single product
    const handleSaveOne = async (product) => {
        const docId = product.documentId;
        const edit = edits[docId];
        if (!edit || Object.keys(edit).length === 0) return;

        setSaving(prev => ({ ...prev, [docId]: true }));
        setMessages(prev => ({ ...prev, [docId]: null }));

        try {
            // 1. Save product field changes
            const payload = {};
            if (edit.name !== undefined) payload.name = edit.name;
            if (edit.selling_price !== undefined) payload.selling_price = parseFloat(edit.selling_price) || 0;
            if (edit.offer_price !== undefined) payload.offer_price = parseFloat(edit.offer_price) || 0;
            if (edit.stock_quantity !== undefined) payload.stock_quantity = parseInt(edit.stock_quantity, 10) || 0;

            if (payload.name !== undefined || payload.selling_price !== undefined || payload.offer_price !== undefined || payload.stock_quantity !== undefined) {
                await saveProduct(docId, payload);
            }

            // 2. Reconcile stock items if quantity changed
            let stockMsg = '';
            if (edit.stock_quantity !== undefined) {
                const desiredQty = parseInt(edit.stock_quantity, 10) || 0;
                stockMsg = await reconcileStockItems(product, desiredQty);
            }

            // Update product in local list
            setProducts(prev => prev.map(p => {
                if (p.documentId !== docId) return p;
                return { ...p, ...payload };
            }));

            // Clear edits for this product
            setEdits(prev => {
                const copy = { ...prev };
                delete copy[docId];
                return copy;
            });

            const msg = `Saved${stockMsg ? '. ' + stockMsg : ''}`;
            setMessages(prev => ({ ...prev, [docId]: { type: 'success', text: msg } }));

            // Refresh stock counts
            fetchStockCounts(products, stockItemStatus);
        } catch (err) {
            console.error('Error saving product:', err);
            setMessages(prev => ({
                ...prev,
                [docId]: { type: 'error', text: 'Failed to save: ' + (err?.response?.data?.error?.message || err.message) }
            }));
        } finally {
            setSaving(prev => ({ ...prev, [docId]: false }));
        }
    };

    // Reconcile stock items for a product
    async function reconcileStockItems(product, desiredQty) {
        const docId = product.documentId;
        const branch = getBranch();

        // Fetch existing stock items in Received + InStock statuses
        const res = await authApi.get('/stock-items', {
            filters: {
                product: { documentId: docId },
                status: { $in: ['Received', 'InStock'] },
            },
            sort: ['createdAt:desc'],
            pagination: { pageSize: 1000 },
        });
        const existingItems = res.data || [];
        const currentCount = existingItems.length;

        if (desiredQty === currentCount) {
            return 'Stock items unchanged';
        }

        if (desiredQty > currentCount) {
            // Create new stock items
            const toCreate = desiredQty - currentCount;
            const baseSku = product.sku || product.id?.toString(22)?.toUpperCase() || '';
            const baseBarcode = product.barcode || '';

            // Find max barcode index among existing items
            let maxIdx = 0;
            if (baseBarcode) {
                const pfx = baseBarcode + '-';
                existingItems.forEach(item => {
                    if (item.barcode && item.barcode.startsWith(pfx)) {
                        const suffix = item.barcode.substring(pfx.length);
                        const num = parseInt(suffix, 10);
                        if (!isNaN(num) && num > maxIdx) maxIdx = num;
                    }
                });
            }

            for (let i = 0; i < toCreate; i++) {
                const barcodeNum = maxIdx + i + 1;
                const sku = `${baseSku}-${Date.now().toString(22)}-${barcodeNum.toString(22)}`.toUpperCase();
                const barcode = baseBarcode
                    ? `${baseBarcode}-${barcodeNum.toString().padStart(4, '0')}`
                    : undefined;

                await authApi.post('/stock-items', {
                    data: {
                        sku,
                        barcode,
                        name: product.name,
                        status: stockItemStatus,
                        selling_price: parseFloat(getEditValue(product, 'selling_price')) || parseFloat(product.selling_price) || 0,
                        offer_price: parseFloat(getEditValue(product, 'offer_price')) || parseFloat(product.offer_price) || 0,
                        cost_price: parseFloat(product.cost_price) || 0,
                        product: docId,
                        branch: branch?.documentId || branch?.id || undefined,
                    }
                });
            }
            return `Created ${toCreate} stock item(s) as ${stockItemStatus}`;
        }

        if (desiredQty < currentCount) {
            // Reduce excess stock items — mark as "Reduced"
            const toReduce = currentCount - desiredQty;
            // Pick the most recently created ones to reduce
            const itemsToReduce = existingItems.slice(0, toReduce);

            for (const item of itemsToReduce) {
                await authApi.put(`/stock-items/${item.documentId || item.id}`, {
                    data: { status: 'Reduced' }
                });
            }
            return `Reduced ${toReduce} stock item(s) to "Reduced" status`;
        }

        return '';
    }

    // Save all edited products
    const handleSaveAll = async () => {
        const editedDocIds = Object.keys(edits).filter(docId => Object.keys(edits[docId]).length > 0);
        if (editedDocIds.length === 0) return;

        setSavingAll(true);
        setGlobalMessage({ type: '', text: '' });

        let successCount = 0;
        let failCount = 0;

        for (const docId of editedDocIds) {
            const product = products.find(p => p.documentId === docId);
            if (!product) continue;
            try {
                await handleSaveOne(product);
                successCount++;
            } catch {
                failCount++;
            }
        }

        setSavingAll(false);
        if (failCount === 0) {
            setGlobalMessage({ type: 'success', text: `All ${successCount} product(s) saved successfully.` });
        } else {
            setGlobalMessage({ type: 'warning', text: `${successCount} saved, ${failCount} failed. Check individual rows for details.` });
        }
    };

    const editedCount = Object.keys(edits).filter(docId => edits[docId] && Object.keys(edits[docId]).length > 0).length;

    return (
        <ProtectedRoute>
            <PermissionCheck required="api::product.product.find">
                <Layout>
                    <div style={{ padding: 10 }}>
                        <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
                            <h1 className="mb-0">Bulk Edit Products</h1>
                            <Link href={`/products${buildFilterQuery()}`} className="btn btn-outline-dark btn-sm ms-auto">
                                <i className="fas fa-arrow-left me-1" /> Back to Products
                            </Link>
                        </div>

                        {globalMessage.text && (
                            <div className={`alert ${globalMessage.type === 'success' ? 'alert-success' : 'alert-warning'} alert-dismissible fade show`} role="alert">
                                {globalMessage.text}
                                <button type="button" className="btn-close" onClick={() => setGlobalMessage({ type: '', text: '' })} />
                            </div>
                        )}

                        <ProductFilter
                            brands={brands}
                            categories={categories}
                            suppliers={suppliers}
                            termTypes={termTypes}
                            purchases={purchases}
                            selectedBrand={selectedBrand}
                            selectedCategory={selectedCategory}
                            selectedSupplier={selectedSupplier}
                            selectedTerm={selectedTerm}
                            selectedPurchase={selectedPurchase}
                            searchText={searchText}
                            onBrandChange={setSelectedBrand}
                            onCategoryChange={setSelectedCategory}
                            onSupplierChange={setSelectedSupplier}
                            onTermChange={setSelectedTerm}
                            onPurchaseChange={setSelectedPurchase}
                            onSearchTextChange={setSearchText}
                        />

                        {/* Stock item status selector and save all button */}
                        <div className="d-flex flex-wrap align-items-center gap-3 my-3">
                            <div className="d-flex align-items-center gap-2">
                                <label className="form-label mb-0 fw-bold">New stock items status:</label>
                                <select
                                    className="form-select form-select-sm"
                                    style={{ width: 'auto' }}
                                    value={stockItemStatus}
                                    onChange={(e) => setStockItemStatus(e.target.value)}
                                >
                                    <option value="Received">Received</option>
                                    <option value="InStock">InStock</option>
                                </select>
                            </div>
                            <div className="d-flex align-items-center gap-2 ms-auto">
                                {editedCount > 0 && (
                                    <span className="badge bg-warning text-dark">{editedCount} product(s) modified</span>
                                )}
                                <button
                                    className="btn btn-primary btn-sm"
                                    onClick={handleSaveAll}
                                    disabled={savingAll || editedCount === 0}
                                >
                                    {savingAll ? (
                                        <><span className="spinner-border spinner-border-sm me-1" /> Saving All...</>
                                    ) : (
                                        <><i className="fas fa-save me-1" /> Save All Changes</>
                                    )}
                                </button>
                            </div>
                        </div>

                        <TablePagination
                            count={total}
                            page={page}
                            onPageChange={handleChangePage}
                            rowsPerPage={rowsPerPage}
                            onRowsPerPageChange={handleChangeRowsPerPage}
                            rowsPerPageOptions={[10, 25, 50, 100, 150, 200]}
                        />

                        <Table>
                            <TableHead>
                                <TableRow>
                                    <SortableHeader label="ID" field="id" sortField={sortField} sortOrder={sortOrder} onSort={handleSort} />
                                    <TableCell>Logo</TableCell>
                                    <TableCell style={{ minWidth: 220 }}>Product Name</TableCell>
                                    <SortableHeader label="SKU" field="sku" sortField={sortField} sortOrder={sortOrder} onSort={handleSort} />
                                    <TableCell align="right" style={{ minWidth: 130 }}>Offer Price</TableCell>
                                    <TableCell align="right" style={{ minWidth: 130 }}>Selling Price</TableCell>
                                    <TableCell align="right" style={{ minWidth: 120 }}>Quantity</TableCell>
                                    <TableCell align="right">Stock Items</TableCell>
                                    <TableCell style={{ width: 140 }}>Actions</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={9} align="center">
                                            <CircularProgress size={24} />
                                        </TableCell>
                                    </TableRow>
                                ) : products.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={9} align="center">
                                            No products found.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    products.map((product) => {
                                        const docId = product.documentId;
                                        const edited = isEdited(docId);
                                        const msg = messages[docId];
                                        const isSaving = saving[docId];
                                        const siCount = stockCounts[docId] ?? '…';

                                        return (
                                            <Fragment key={product.id}>
                                                <TableRow style={edited ? { background: '#fff8e1' } : undefined}>
                                                    <TableCell title={docId}>{product.id}</TableCell>
                                                    <TableCell>
                                                        {product.logo?.url ? (
                                                            <img
                                                                src={StraipImageUrl(product.logo)}
                                                                alt={product.name}
                                                                style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 4 }}
                                                            />
                                                        ) : (
                                                            <span style={{ color: '#999' }}><i className="fas fa-image"></i></span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        <input
                                                            type="text"
                                                            className="form-control form-control-sm"
                                                            value={getEditValue(product, 'name')}
                                                            onChange={(e) => setEditValue(product, 'name', e.target.value)}
                                                        />
                                                    </TableCell>
                                                    <TableCell>{product.sku}</TableCell>
                                                    <TableCell>
                                                        <div className="input-group input-group-sm">
                                                            <span className="input-group-text">{currency}</span>
                                                            <input
                                                                type="number"
                                                                className="form-control form-control-sm"
                                                                step="0.01"
                                                                min="0"
                                                                value={getEditValue(product, 'offer_price')}
                                                                onChange={(e) => setEditValue(product, 'offer_price', e.target.value)}
                                                            />
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="input-group input-group-sm">
                                                            <span className="input-group-text">{currency}</span>
                                                            <input
                                                                type="number"
                                                                className="form-control form-control-sm"
                                                                step="0.01"
                                                                min="0"
                                                                value={getEditValue(product, 'selling_price')}
                                                                onChange={(e) => setEditValue(product, 'selling_price', e.target.value)}
                                                            />
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <input
                                                            type="number"
                                                            className="form-control form-control-sm"
                                                            min="0"
                                                            value={getEditValue(product, 'stock_quantity')}
                                                            onChange={(e) => setEditValue(product, 'stock_quantity', e.target.value)}
                                                        />
                                                    </TableCell>
                                                    <TableCell align="right">
                                                        <span className="badge bg-secondary">{siCount}</span>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="d-flex gap-1">
                                                            <button
                                                                className="btn btn-sm btn-outline-primary"
                                                                onClick={() => handleSaveOne(product)}
                                                                disabled={isSaving || !edited}
                                                                title="Save this product"
                                                            >
                                                                {isSaving ? (
                                                                    <span className="spinner-border spinner-border-sm" />
                                                                ) : (
                                                                    <i className="fas fa-save"></i>
                                                                )}
                                                            </button>
                                                            <Link href={`/${docId}/product-edit`} className="btn btn-sm btn-outline-secondary" title="Full Edit">
                                                                <i className="fas fa-edit"></i>
                                                            </Link>
                                                            <Link href={`/${docId}/product-stock-items`} className="btn btn-sm btn-outline-info" title="Stock Control">
                                                                <i className="fas fa-boxes"></i>
                                                            </Link>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                                {msg && (
                                                    <TableRow>
                                                        <TableCell colSpan={9}>
                                                            <small className={msg.type === 'success' ? 'text-success' : 'text-danger'}>
                                                                <i className={`fas ${msg.type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'} me-1`}></i>
                                                                {msg.text}
                                                            </small>
                                                        </TableCell>
                                                    </TableRow>
                                                )}
                                            </Fragment>
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
                            rowsPerPageOptions={[10, 25, 50, 100, 150, 200]}
                        />
                    </div>
                </Layout>
            </PermissionCheck>
        </ProtectedRoute>
    );
}
