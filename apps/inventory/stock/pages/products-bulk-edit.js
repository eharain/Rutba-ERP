import { useEffect, useState, useCallback, useRef, Fragment } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import {
    Table, TableHead, TableRow, TableCell, TableBody,
    CircularProgress, TablePagination
} from "@rutba/pos-shared/components/Table";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import PermissionCheck from "@rutba/pos-shared/components/PermissionCheck";
import { fetchProducts, saveProduct, MediaUtilsEndpoints, StockItemsEndpoints, BrandsEndpoints, CategoriesEndpoints, SuppliersEndpoints, TermTypesEndpoints, PurchasesEndpoints } from "@rutba/api-provider/endpoints";
import { ProductFilter } from "@rutba/pos-shared/components/filter/product-filter";
import { useUtil } from "@rutba/pos-shared/context/UtilContext";
import { getBranch } from "@rutba/pos-shared/lib/utils";

// Product boolean fields exposed as checkbox columns in the bulk editor.
// (Structural `is_variant` is intentionally excluded.)
const BOOL_FIELDS = [
    { key: 'is_active',       label: 'Active',      title: 'Active' },
    { key: 'divisible',       label: 'Divisible',   title: 'Divisible (sell by portion)' },
    { key: 'is_perishable',   label: 'Perishable',  title: 'Perishable / expiry tracked' },
    { key: 'is_returnable',   label: 'Returnable',  title: 'Returnable' },
    { key: 'is_exchangeable', label: 'Exchange',    title: 'Exchangeable' },
    { key: 'non_returnable',  label: 'Non-Ret.',    title: 'Non-returnable' },
];

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
    // Extra filters — kept in sync with /products so they carry across via the URL.
    const [stockStatus, setStockStatus] = useState(false);
    const [missingContent, setMissingContent] = useState(false);
    const [missingLogo, setMissingLogo] = useState(false);
    const [missingGallery, setMissingGallery] = useState(false);
    const [priceRange, setPriceRange] = useState({ min: "", max: "" });
    const [createdRange, setCreatedRange] = useState({ from: "", to: "" });
    const [updatedRange, setUpdatedRange] = useState({ from: "", to: "" });
    const [filtersInitialized, setFiltersInitialized] = useState(false);
    const [sortField, setSortField] = useState('id');
    const [sortOrder, setSortOrder] = useState('desc');

    // Bulk edit state: keyed by product documentId
    const [edits, setEdits] = useState({});
    const [saving, setSaving] = useState({});
    // Tracks rows with an in-flight save so auto-save (blur / checkbox) can't
    // fire a second concurrent save for the same row.
    const savingRef = useRef(new Set());
    const [savingAll, setSavingAll] = useState(false);
    // When on, a row saves itself on blur / checkbox toggle; when off, the user
    // saves manually via the row button or Save All.
    const [autoSave, setAutoSave] = useState(false);
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
                    const res = await StockItemsEndpoints.listByProduct(p.documentId, { pageSize: 1 });
                    counts[p.documentId] = res.meta?.pagination?.total || 0;
                } catch (err) {
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
            BrandsEndpoints.listAll(),
            CategoriesEndpoints.listAll(),
            SuppliersEndpoints.listAll(),
            TermTypesEndpoints.listWithTerms(),
            PurchasesEndpoints.list(1, 100, { sort: ['createdAt:desc'] }),
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
        const q = router.query;
        const { brands, categories, suppliers, terms, purchases, searchText, stockStatus } = q;

        if (brands) setSelectedBrand(getQueryValue(brands));
        if (categories) setSelectedCategory(getQueryValue(categories));
        if (suppliers) setSelectedSupplier(getQueryValue(suppliers));
        if (terms) setSelectedTerm(getQueryValue(terms));
        if (purchases) setSelectedPurchase(getQueryValue(purchases));
        if (searchText) setSearchText(getQueryValue(searchText));
        if (stockStatus) setStockStatus(getQueryValue(stockStatus));
        if (getQueryValue(q.missingContent) === "1") setMissingContent(true);
        if (getQueryValue(q.missingLogo) === "1") setMissingLogo(true);
        if (getQueryValue(q.missingGallery) === "1") setMissingGallery(true);
        if (q.priceMin || q.priceMax) setPriceRange({ min: getQueryValue(q.priceMin) || "", max: getQueryValue(q.priceMax) || "" });
        if (q.createdFrom || q.createdTo) setCreatedRange({ from: getQueryValue(q.createdFrom) || "", to: getQueryValue(q.createdTo) || "" });
        if (q.updatedFrom || q.updatedTo) setUpdatedRange({ from: getQueryValue(q.updatedFrom) || "", to: getQueryValue(q.updatedTo) || "" });

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
            stockStatus,
            searchText,
            parentOnly: true
        };
        if (missingContent) updatedFilters.missingContent = true;
        if (missingLogo) updatedFilters.missingLogo = true;
        if (missingGallery) updatedFilters.missingGallery = true;
        if (priceRange.min) updatedFilters.priceMin = priceRange.min;
        if (priceRange.max) updatedFilters.priceMax = priceRange.max;
        if (createdRange.from) updatedFilters.createdFrom = createdRange.from;
        if (createdRange.to) updatedFilters.createdTo = createdRange.to;
        if (updatedRange.from) updatedFilters.updatedFrom = updatedRange.from;
        if (updatedRange.to) updatedFilters.updatedTo = updatedRange.to;

        const query = {};
        if (selectedBrand) query.brands = selectedBrand;
        if (selectedCategory) query.categories = selectedCategory;
        if (selectedSupplier) query.suppliers = selectedSupplier;
        if (selectedTerm) query.terms = selectedTerm;
        if (selectedPurchase) query.purchases = selectedPurchase;
        if (searchText) query.searchText = searchText;
        if (stockStatus) query.stockStatus = stockStatus;
        if (missingContent) query.missingContent = "1";
        if (missingLogo) query.missingLogo = "1";
        if (missingGallery) query.missingGallery = "1";
        if (priceRange.min) query.priceMin = priceRange.min;
        if (priceRange.max) query.priceMax = priceRange.max;
        if (createdRange.from) query.createdFrom = createdRange.from;
        if (createdRange.to) query.createdTo = createdRange.to;
        if (updatedRange.from) query.updatedFrom = updatedRange.from;
        if (updatedRange.to) query.updatedTo = updatedRange.to;
        router.replace({ pathname: router.pathname, query }, undefined, { shallow: true });

        for (const [key, value] of Object.entries(updatedFilters)) {
            if (Array.isArray(value)) {
                updatedFilters[key] = value.filter((v) => v);
                if (updatedFilters[key].length === 0) delete updatedFilters[key];
            }
        }

        setFilters(updatedFilters);
        setPage(0);
    }, [selectedBrand, selectedCategory, selectedSupplier, selectedTerm, selectedPurchase, stockStatus, searchText, missingContent, missingLogo, missingGallery, priceRange, createdRange, updatedRange, filtersInitialized]);

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
        if (stockStatus) params.set('stockStatus', stockStatus);
        if (missingContent) params.set('missingContent', '1');
        if (missingLogo) params.set('missingLogo', '1');
        if (missingGallery) params.set('missingGallery', '1');
        if (priceRange.min) params.set('priceMin', priceRange.min);
        if (priceRange.max) params.set('priceMax', priceRange.max);
        if (createdRange.from) params.set('createdFrom', createdRange.from);
        if (createdRange.to) params.set('createdTo', createdRange.to);
        if (updatedRange.from) params.set('updatedFrom', updatedRange.from);
        if (updatedRange.to) params.set('updatedTo', updatedRange.to);
        const qs = params.toString();
        return qs ? `?${qs}` : '';
    };

    // Save a single product. `editArg` lets callers (e.g. a checkbox toggle)
    // pass the just-changed edit object without waiting for state to flush.
    // Returns { ok, skipped?, noop? } so callers (Save All) can count real
    // outcomes — it never rethrows, so per-row errors stay on the row.
    const handleSaveOne = async (product, editArg) => {
        const docId = product.documentId;
        const edit = editArg || edits[docId];
        if (!edit || Object.keys(edit).length === 0) return { ok: true, noop: true };
        // Guard against a blur + toggle firing two saves for the same row at once.
        if (savingRef.current.has(docId)) return { ok: false, skipped: true };
        // Snapshot exactly which fields this save is committing, so on success we
        // clear only those — a field edited WHILE the save is in flight survives.
        const savedKeys = Object.keys(edit);
        savingRef.current.add(docId);

        setSaving(prev => ({ ...prev, [docId]: true }));
        setMessages(prev => ({ ...prev, [docId]: null }));

        try {
            // 1. Save product field changes
            const payload = {};
            if (edit.name !== undefined) payload.name = edit.name;
            if (edit.barcode !== undefined) payload.barcode = edit.barcode;
            if (edit.selling_price !== undefined) payload.selling_price = parseFloat(edit.selling_price) || 0;
            if (edit.offer_price !== undefined) payload.offer_price = parseFloat(edit.offer_price) || 0;
            if (edit.stock_quantity !== undefined) payload.stock_quantity = parseInt(edit.stock_quantity, 10) || 0;
            for (const bf of BOOL_FIELDS) {
                if (edit[bf.key] !== undefined) payload[bf.key] = !!edit[bf.key];
            }

            if (Object.keys(payload).length > 0) {
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

            // Clear ONLY the fields this save committed — keep any keys added
            // while the request was in flight so a concurrent edit isn't lost.
            setEdits(prev => {
                const cur = prev[docId];
                if (!cur) return prev;
                const remaining = { ...cur };
                for (const k of savedKeys) delete remaining[k];
                const next = { ...prev };
                if (Object.keys(remaining).length === 0) delete next[docId];
                else next[docId] = remaining;
                return next;
            });

            const msg = `Saved${stockMsg ? '. ' + stockMsg : ''}`;
            setMessages(prev => ({ ...prev, [docId]: { type: 'success', text: msg } }));

            // Refresh stock counts
            fetchStockCounts(products, stockItemStatus);
            return { ok: true };
        } catch (err) {
            console.error('Error saving product:', err);
            setMessages(prev => ({
                ...prev,
                [docId]: { type: 'error', text: 'Failed to save: ' + (err?.response?.data?.error?.message || err.message) }
            }));
            return { ok: false, error: err };
        } finally {
            savingRef.current.delete(docId);
            setSaving(prev => ({ ...prev, [docId]: false }));
        }
    };

    // Auto-save a row as soon as it's edited (text/number on blur, checkbox on
    // toggle). No-op when the row has no pending edits. `editArg` carries the
    // fresh value for the checkbox path.
    const autoSaveRow = (product, editArg) => {
        if (!autoSave) return;
        const edit = editArg || edits[product.documentId];
        if (!edit || Object.keys(edit).length === 0) return;
        handleSaveOne(product, editArg);
    };

    // Reconcile stock items for a product
    async function reconcileStockItems(product, desiredQty) {
        const docId = product.documentId;
        const branch = getBranch();

        // Fetch existing stock items in Received + InStock statuses
        const res = await StockItemsEndpoints.listByProduct(docId, { pageSize: 1000 });
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

                await StockItemsEndpoints.create({
                        sku,
                        barcode,
                        name: product.name,
                        status: stockItemStatus,
                        selling_price: parseFloat(getEditValue(product, 'selling_price')) || parseFloat(product.selling_price) || 0,
                        offer_price: parseFloat(getEditValue(product, 'offer_price')) || parseFloat(product.offer_price) || 0,
                        product: docId,
                        branch: branch?.documentId || branch?.id || undefined,
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
                await StockItemsEndpoints.update(item.documentId || item.id, { status: 'Reduced' });
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
        let skippedCount = 0;

        for (const docId of editedDocIds) {
            const product = products.find(p => p.documentId === docId);
            if (!product) continue;
            // handleSaveOne reports outcome via its return value (it never throws).
            const res = await handleSaveOne(product);
            if (res?.ok) { if (!res.noop) successCount++; }
            else if (res?.skipped) skippedCount++;
            else failCount++;
        }

        setSavingAll(false);
        if (failCount === 0 && skippedCount === 0) {
            setGlobalMessage({ type: 'success', text: `All ${successCount} product(s) saved successfully.` });
        } else {
            const parts = [`${successCount} saved`];
            if (failCount) parts.push(`${failCount} failed`);
            if (skippedCount) parts.push(`${skippedCount} skipped (already saving)`);
            setGlobalMessage({ type: failCount ? 'warning' : 'info', text: `${parts.join(', ')}. Check individual rows for details.` });
        }
    };

    const editedCount = Object.keys(edits).filter(docId => edits[docId] && Object.keys(edits[docId]).length > 0).length;

    return (
        <ProtectedRoute>
            <PermissionCheck required="stock">
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
                            extra={[
                                {
                                    key: "stockStatus",
                                    type: "select",
                                    label: "Stock",
                                    value: stockStatus || "",
                                    onChange: (v) => setStockStatus(v || false),
                                    placeholder: "All stock",
                                    options: [
                                        { value: "inStock", label: "In stock" },
                                        { value: "outOfStock", label: "Out of stock" },
                                        { value: "low", label: "Low stock" },
                                    ],
                                },
                                {
                                    key: "price",
                                    type: "number-range",
                                    label: "Price",
                                    value: priceRange,
                                    onChange: setPriceRange,
                                },
                                {
                                    key: "created",
                                    type: "date-range",
                                    label: "Created",
                                    value: createdRange,
                                    onChange: setCreatedRange,
                                },
                                {
                                    key: "modified",
                                    type: "date-range",
                                    label: "Modified",
                                    value: updatedRange,
                                    onChange: setUpdatedRange,
                                },
                                {
                                    key: "missingContent",
                                    type: "toggle",
                                    label: "Missing content",
                                    value: missingContent,
                                    onChange: setMissingContent,
                                },
                                {
                                    key: "missingLogo",
                                    type: "toggle",
                                    label: "Missing logo",
                                    value: missingLogo,
                                    onChange: setMissingLogo,
                                },
                                {
                                    key: "missingGallery",
                                    type: "toggle",
                                    label: "Missing gallery",
                                    value: missingGallery,
                                    onChange: setMissingGallery,
                                },
                            ]}
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
                            <div className="d-flex align-items-center gap-3 ms-auto">
                                {editedCount > 0 && (
                                    <span className="badge bg-warning text-dark">{editedCount} product(s) modified</span>
                                )}
                                <div className="form-check form-switch mb-0">
                                    <input
                                        className="form-check-input"
                                        type="checkbox"
                                        role="switch"
                                        id="autoSaveToggle"
                                        checked={autoSave}
                                        onChange={(e) => setAutoSave(e.target.checked)}
                                    />
                                    <label className="form-check-label small" htmlFor="autoSaveToggle" title="Save each row automatically on edit">
                                        Auto-save
                                    </label>
                                </div>
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
                                    <TableCell style={{ minWidth: 150 }}>Barcode</TableCell>
                                    <TableCell align="right" style={{ width: 110 }}>Offer Price</TableCell>
                                    <TableCell align="right" style={{ width: 110 }}>Selling Price</TableCell>
                                    <TableCell align="right" style={{ width: 80 }}>Quantity</TableCell>
                                    <TableCell align="right">Stock Items</TableCell>
                                    {BOOL_FIELDS.map((bf) => (
                                        <TableCell key={bf.key} align="center" title={bf.title} style={{ width: 72 }}>{bf.label}</TableCell>
                                    ))}
                                    <TableCell style={{ width: 140 }}>Actions</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={16} align="center">
                                            <CircularProgress size={24} />
                                        </TableCell>
                                    </TableRow>
                                ) : products.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={16} align="center">
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
                                                                src={MediaUtilsEndpoints.strapiImageUrl(product.logo)}
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
                                                            onBlur={() => autoSaveRow(product)}
                                                        />
                                                    </TableCell>
                                                    <TableCell>{product.sku}</TableCell>
                                                    <TableCell>
                                                        <input
                                                            type="text"
                                                            className="form-control form-control-sm"
                                                            value={getEditValue(product, 'barcode')}
                                                            onChange={(e) => setEditValue(product, 'barcode', e.target.value)}
                                                            onBlur={() => autoSaveRow(product)}
                                                        />
                                                    </TableCell>
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
                                                                onBlur={() => autoSaveRow(product)}
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
                                                                onBlur={() => autoSaveRow(product)}
                                                            />
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <input
                                                            type="number"
                                                            className="form-control form-control-sm"
                                                            min="0"
                                                            style={{ maxWidth: 72 }}
                                                            value={getEditValue(product, 'stock_quantity')}
                                                            onChange={(e) => setEditValue(product, 'stock_quantity', e.target.value)}
                                                            onBlur={() => autoSaveRow(product)}
                                                        />
                                                    </TableCell>
                                                    <TableCell align="right">
                                                        <span className="badge bg-secondary">{siCount}</span>
                                                    </TableCell>
                                                    {BOOL_FIELDS.map((bf) => (
                                                        <TableCell key={bf.key} align="center">
                                                            <input
                                                                type="checkbox"
                                                                className="form-check-input"
                                                                checked={!!getEditValue(product, bf.key)}
                                                                onChange={(e) => {
                                                                    const value = e.target.checked;
                                                                    setEditValue(product, bf.key, value);
                                                                    // Save immediately with the fresh value (a checkbox
                                                                    // has no blur commit moment).
                                                                    const merged = { ...(edits[docId] || {}), [bf.key]: value };
                                                                    autoSaveRow(product, merged);
                                                                }}
                                                            />
                                                        </TableCell>
                                                    ))}
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
                                                        <TableCell colSpan={16}>
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

