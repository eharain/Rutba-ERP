import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '../../components/Layout';
import ProtectedRoute from '@rutba/pos-shared/components/ProtectedRoute';
import { BranchesEndpoints, StockHelpersEndpoints, StockItemsEndpoints, ProductsEndpoints, CategoriesEndpoints, BrandsEndpoints, SuppliersEndpoints, fetchProducts, saveProduct, loadProduct } from '@rutba/api-provider/endpoints';
import { useUtil } from '@rutba/pos-shared/context/UtilContext';
import { printStorage } from '@rutba/pos-shared/lib/printStorage';
import { getBranch } from '@rutba/pos-shared/lib/utils';
import ProductPageShell, { buildStockProductTabs } from '@rutba/pos-shared/components/product/ProductPageShell';
import { useAuth } from '@rutba/pos-shared/context/AuthContext';
import { isActiveAdminRole, isAppAdmin } from '@rutba/pos-shared/lib/roles';

/**
 * Generate a short barcode prefix from a product name.
 * Single word  → word uppercased (e.g. "Bracelet" → "BRACELET")
 * Multi-word   → first letter of each significant word (e.g. "Gold Plated Ring" → "GPR")
 */
function generateSmartPrefix(name) {
    if (!name) return '';
    const stopWords = new Set(['the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'for', 'and', 'or', 'with', 'is', 'it']);
    const words = name.trim().split(/\s+/).filter(w => w.length > 0);
    if (words.length === 0) return '';
    if (words.length === 1) return words[0].toUpperCase();
    const significant = words.filter(w => !stopWords.has(w.toLowerCase()));
    const picked = significant.length > 0 ? significant : words;
    return picked.map(w => w[0].toUpperCase()).join('');
}

export default function EditProduct() {
    const router = useRouter();
    const { documentId } = router.query;
    // Top-level shell tabs route here for two distinct workflows:
    //   ?tab=pricing → show ONLY the Stock Pricing form (no stock-item ops).
    //   default      → show Stock: Apply Changes + three add-mode sub-tabs.
    const tabParam = Array.isArray(router.query.tab) ? router.query.tab[0] : router.query.tab;
    const isPricingView = tabParam === 'pricing';
    const stockSubTabParam = Array.isArray(router.query.sub) ? router.query.sub[0] : router.query.sub;
    // Sub-tabs:
    //   list     — see existing stock items, print barcodes, apply price changes (default)
    //   generate — auto-generate N items
    //   scan     — continuous barcode scan to create
    //   reduce   — mark items as gone (mistaken / lost / damaged)
    //   assign   — assign selected items to a branch (sets status=InStock + branch)
    const stockSubTab = ['list', 'generate', 'scan', 'reduce', 'assign'].includes(stockSubTabParam) ? stockSubTabParam : 'list';
    const { currency } = useUtil();

    // Cost price is admin-only on the Pricing tab. Non-admins see a masked,
    // read-only placeholder so they know the field exists without being able
    // to read the margin. Admins start masked too with a show/hide toggle so
    // the number isn't visible by default to anyone walking past the screen.
    const { activeRoleKey, adminAppAccess } = useAuth();
    const isAdmin = activeRoleKey
        ? isActiveAdminRole(activeRoleKey)
        : isAppAdmin(adminAppAccess, 'stock');
    const [showCostPrice, setShowCostPrice] = useState(false);

    const [productId, setProductId] = useState([]);
    const [product, setProduct] = useState({});
    const [categories, setCategories] = useState([]);
    const [brands, setBrands] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Stock items state
    const [stockItems, setStockItems] = useState([]);
    const [stockItemsLoading, setStockItemsLoading] = useState(false);
    const [stockStatusFilter, setStockStatusFilter] = useState('');
    const [stockStatuses, setStockStatuses] = useState([]);
    const [selectedStockItems, setSelectedStockItems] = useState(new Set());
    const [applyingChanges, setApplyingChanges] = useState(false);
    const [applyFields, setApplyFields] = useState({ name: true, sku: false, cost_price: false, selling_price: true, offer_price: true, status: false });
    const [applyStatus, setApplyStatus] = useState('');

    // Branch assignment — moves selected items into a destination branch.
    // Used by the "Assign" sub-tab; mirrors the global stock-items page's
    // sendStockToBranch() but scoped to this product's items.
    const [branches, setBranches] = useState([]);
    const [assignBranch, setAssignBranch] = useState('');
    const [assigning, setAssigning] = useState(false);
    const [stockItemsTotal, setStockItemsTotal] = useState(0);

    // Statuses where the item is still in our possession and editable by an
    // Apply action. Items that have left our hands (Sold, Lost, Transferred,
    // Returned to supplier, etc.) or are finalised (Damaged, Expired, Reduced)
    // must not have their pricing/SKU silently rewritten — the historical
    // record on the sale/return needs to stay intact.
    const APPLYABLE_STATUSES = new Set(['Received', 'InStock', 'Reserved']);
    const isApplyable = (item) => APPLYABLE_STATUSES.has(item?.status);
    const [showStockSection, setShowStockSection] = useState(false);
    const [showAddSection, setShowAddSection] = useState(false);

    // Add new stock items in bulk
    const [addQty, setAddQty] = useState(1);
    const [autoBarcode, setAutoBarcode] = useState(true);
    const [addingItems, setAddingItems] = useState(false);

    // Scan barcode to create new stock item
    const [scanBarcode, setScanBarcode] = useState('');
    const [scanAdding, setScanAdding] = useState(false);
    const scanInputRef = useRef(null);

    // Scan barcode to attach existing stock item
    const [attachBarcode, setAttachBarcode] = useState('');
    const [attachLoading, setAttachLoading] = useState(false);
    const attachInputRef = useRef(null);

    // Customizable barcode prefix for bulk add
    const [barcodePrefix, setBarcodePrefix] = useState('');

    // Multi-scan section: continuous barcode scanning with running list
    const [showMultiScanSection, setShowMultiScanSection] = useState(false);
    const [multiScanBarcode, setMultiScanBarcode] = useState('');
    const [multiScanAdding, setMultiScanAdding] = useState(false);
    const [multiScanItems, setMultiScanItems] = useState([]);
    const multiScanInputRef = useRef(null);

    async function fetchAllRecords(fetchPage) {
        let allRecords = [];
        let page = 1;
        let totalPages = 1;

        do {
            const response = await fetchPage(page);
            const { data, meta } = response;

            allRecords = [...allRecords, ...data];

            totalPages = meta.pagination.pageCount;
            page++;
        } while (page <= totalPages);

        return allRecords;
    }

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);

                // Fetch categories, brands, suppliers, stock statuses, and branches
                const [categoriesRes, brandsRes, suppliersRes, statusRes, branchesRes] = await Promise.all([
                    fetchAllRecords(p => CategoriesEndpoints.list({ page: p, pageSize: 100 })),
                    fetchAllRecords(p => BrandsEndpoints.list({ page: p, pageSize: 100 })),
                    fetchAllRecords(p => SuppliersEndpoints.list({ page: p, pageSize: 100 })),
                    StockHelpersEndpoints.getStockStatus(),
                    BranchesEndpoints.list(),
                ]);

                setCategories(categoriesRes || []);
                setBrands(brandsRes || []);
                setSuppliers(suppliersRes || []);
                setStockStatuses(statusRes.statuses || []);
                setBranches(branchesRes?.data ?? branchesRes ?? []);

                if (documentId && documentId !== 'new') {
                    const productData = await loadProduct(documentId);
                    setProductId(productData.id);
                    setProduct(productData);

                    // Smart barcode prefix: product barcode or abbreviation from name
                    const smartPrefix = productData.barcode || generateSmartPrefix(productData.name);
                    setBarcodePrefix(smartPrefix);

                    // Override with most recent stock item's barcode prefix if available
                    try {
                        const res = await StockItemsEndpoints.listByProduct(documentId, {
                            page: 1,
                            pageSize: 5,
                            fields: ['barcode'],
                        });
                        const items = res?.data || [];
                        const recentWithBarcode = items.find(item => item.barcode);
                        if (recentWithBarcode?.barcode) {
                            const match = recentWithBarcode.barcode.match(/^(.+)-\d{2,}$/);
                            if (match) setBarcodePrefix(match[1]);
                        }
                    } catch (e) { /* keep smart prefix */ }
                } else {
                    // ensure arrays exist for new product
                    setProduct(p => ({ ...p, categories: [], brands: [], suppliers: [] }));
                }
            } catch (err) {
                setError('Failed to fetch data');
                console.error('Error fetching data:', err);
            } finally {
                setLoading(false);
            }
        };

        if (documentId) {
            fetchData();
        }
    }, [documentId]);

    // Fetch stock items for this product
    const fetchStockItems = async (statusFilter) => {
        if (!documentId || documentId === 'new') return;
        setStockItemsLoading(true);
        try {
            const response = await StockItemsEndpoints.listByProduct(documentId, { statusFilter, page: 1, pageSize: 1000 });
            const data = response.data || [];
            setStockItems(data);
            setStockItemsTotal(response.meta?.pagination?.total || 0);
            setSelectedStockItems(new Set());
        } catch (err) {
            console.error('Error loading stock items:', err);
        } finally {
            setStockItemsLoading(false);
        }
    };

    useEffect(() => {
        if (showStockSection && documentId && documentId !== 'new') {
            fetchStockItems(stockStatusFilter);
        }
    }, [showStockSection, stockStatusFilter]);

    // Pricing tab also needs the stock items list so the user can apply
    // pricing fields onto specific items without leaving this tab.
    useEffect(() => {
        if (isPricingView && documentId && documentId !== 'new') {
            fetchStockItems(stockStatusFilter);
        }
    }, [isPricingView, stockStatusFilter, documentId]);

    // Auto-expand the section that matches the active stock sub-tab. The
    // accordion toggle states (showStockSection / showAddSection /
    // showMultiScanSection) pre-date the sub-tab IA — we still drive the
    // bodies through them, but now the sub-tab is the source of truth.
    useEffect(() => {
        if (isPricingView) return;
        setShowStockSection(stockSubTab === 'list' || stockSubTab === 'reduce' || stockSubTab === 'assign');
        setShowAddSection(stockSubTab === 'generate');
        setShowMultiScanSection(stockSubTab === 'scan');
        // Reduce mode pre-configures the Apply-Changes panel for status-only updates.
        // The user just picks which items and confirms — no need to re-tick the boxes.
        if (stockSubTab === 'reduce') {
            setApplyFields({ name: false, selling_price: false, offer_price: false, status: true });
            if (!applyStatus) setApplyStatus('Reduced');
        }
    }, [stockSubTab, isPricingView]);

    const handleStockSelectItem = (itemId) => {
        setSelectedStockItems(prev => {
            const newSet = new Set(prev);
            if (newSet.has(itemId)) newSet.delete(itemId);
            else newSet.add(itemId);
            return newSet;
        });
    };

    // On the Pricing tab, "select all" only ticks items still in possession.
    // On the Stock tab (Reduce / Assign workflows) we may legitimately need to
    // touch non-in-possession items (e.g. flip Lost → Reduced), so the broader
    // select-all stays available there.
    const handleStockSelectAll = () => {
        const eligible = isPricingView ? stockItems.filter(isApplyable) : stockItems;
        const eligibleIds = eligible.map(item => item.documentId || item.id);
        const allSelected = eligibleIds.length > 0 && eligibleIds.every(id => selectedStockItems.has(id));
        if (allSelected) {
            setSelectedStockItems(new Set());
        } else {
            setSelectedStockItems(new Set(eligibleIds));
        }
    };

    const handleApplyToStockItems = async () => {
        if (selectedStockItems.size === 0) return;
        setApplyingChanges(true);
        try {
            const updates = {};
            if (applyFields.name) updates.name = product.name;
            if (applyFields.sku) updates.sku = product.sku || '';
            // cost_price is admin-only; defence-in-depth in case applyFields was
            // dirtied before isAdmin loaded.
            if (isAdmin && applyFields.cost_price) updates.cost_price = parseFloat(product.cost_price) || 0;
            if (applyFields.selling_price) updates.selling_price = parseFloat(product.selling_price) || 0;
            if (applyFields.offer_price) updates.offer_price = parseFloat(product.offer_price) || 0;
            if (applyFields.status && applyStatus) updates.status = applyStatus;

            if (Object.keys(updates).length === 0) {
                setError('Please select at least one field to apply');
                setApplyingChanges(false);
                return;
            }

            // Pricing/identity rewrites must skip items that have left our
            // possession (Sold, Lost, Transferred, …). When the only update is
            // a status change (Reduce / Assign workflows on the Stock tab) we
            // intentionally allow the broader set.
            const isStatusOnly = applyFields.status && !applyFields.name && !applyFields.sku
                && !applyFields.cost_price && !applyFields.selling_price && !applyFields.offer_price;

            const itemsById = new Map(stockItems.map(it => [(it.documentId || it.id), it]));
            const allIds = Array.from(selectedStockItems);
            const eligibleIds = isStatusOnly
                ? allIds
                : allIds.filter(id => isApplyable(itemsById.get(id)));
            const skipped = allIds.length - eligibleIds.length;

            if (eligibleIds.length === 0) {
                setError(
                    skipped > 0
                        ? `Cannot apply pricing/SKU updates: all ${skipped} selected item(s) are no longer in possession (Sold, Lost, Transferred, etc.).`
                        : 'No eligible stock items selected.'
                );
                setApplyingChanges(false);
                return;
            }

            for (const id of eligibleIds) {
                await StockItemsEndpoints.update(id, updates);
            }

            setSuccess(
                skipped > 0
                    ? `Applied changes to ${eligibleIds.length} stock item(s). Skipped ${skipped} not in possession (Sold, Lost, Transferred, etc.).`
                    : `Applied changes to ${eligibleIds.length} stock item(s)`
            );
            fetchStockItems(stockStatusFilter);
        } catch (err) {
            setError('Failed to apply changes to stock items');
            console.error('Error applying changes:', err);
        } finally {
            setApplyingChanges(false);
        }
    };

    // Helper: find the max incremental barcode suffix among existing stock items
    const getMaxBarcodeIndex = (prefix) => {
        const pfx = (prefix || '') + '-';
        let max = 0;
        stockItems.forEach(item => {
            if (item.barcode && item.barcode.startsWith(pfx)) {
                const suffix = item.barcode.substring(pfx.length);
                const num = parseInt(suffix, 10);
                if (!isNaN(num) && num > max) max = num;
            }
        });
        return max;
    };

    // --- Method 1: Add new stock items in bulk with optional incremental barcodes ---
    const handleAddNewItems = async () => {
        if (!documentId || documentId === 'new' || addQty < 1) return;
        setAddingItems(true);
        setError('');
        try {
            const baseBarcode = barcodePrefix || product.barcode || '';
            const baseSku = product.sku || product.id?.toString(22)?.toUpperCase() || '';
            const branch = getBranch();
            const maxIndex = getMaxBarcodeIndex(baseBarcode);

            for (let i = 0; i < addQty; i++) {
                const barcodeNum = maxIndex + i + 1;
                const sku = `${baseSku}-${Date.now().toString(22)}-${barcodeNum.toString(22)}`.toUpperCase();
                const barcode = autoBarcode && baseBarcode
                    ? `${baseBarcode}-${barcodeNum.toString().padStart(4, '0')}`
                    : undefined;

                const data = {
                    sku,
                    barcode,
                    name: product.name,
                    status: 'Received',
                    selling_price: parseFloat(product.selling_price) || 0,
                    offer_price: parseFloat(product.offer_price) || 0,
                    cost_price: parseFloat(product.cost_price) || 0,
                    product: documentId,
                    branch: branch?.documentId || branch?.id || undefined,
                };

                await StockItemsEndpoints.create(data);
            }

            setSuccess(`Created ${addQty} new stock item(s)`);
            setAddQty(1);
            fetchStockItems(stockStatusFilter);
        } catch (err) {
            setError('Failed to create stock items: ' + (err?.response?.data?.error?.message || err.message));
            console.error('Error adding stock items:', err);
        } finally {
            setAddingItems(false);
        }
    };

    // --- Method 2: Scan barcode to create a new stock item with that barcode ---
    const handleScanBarcodeAdd = async () => {
        const code = scanBarcode.trim();
        if (!code || !documentId || documentId === 'new') return;
        setScanAdding(true);
        setError('');
        try {
            const existing = await StockItemsEndpoints.checkBarcode(code);
            if (existing?.data?.length > 0) {
                setError(`Barcode "${code}" is already in use by another stock item`);
                setScanAdding(false);
                return;
            }

            const baseSku = product.sku || product.id?.toString(22)?.toUpperCase() || '';
            const branch = getBranch();

            const data = {
                sku: `${baseSku}-${Date.now().toString(22)}`.toUpperCase(),
                barcode: code,
                name: product.name,
                status: 'Received',
                selling_price: parseFloat(product.selling_price) || 0,
                offer_price: parseFloat(product.offer_price) || 0,
                cost_price: parseFloat(product.cost_price) || 0,
                product: documentId,
                branch: branch?.documentId || branch?.id || undefined,
            };

            await StockItemsEndpoints.create(data);
            setSuccess(`Stock item created with barcode "${code}"`);
            setScanBarcode('');
            if (scanInputRef.current) scanInputRef.current.focus();
            fetchStockItems(stockStatusFilter);
        } catch (err) {
            setError('Failed to create stock item: ' + (err?.response?.data?.error?.message || err.message));
            console.error('Error scan-adding stock item:', err);
        } finally {
            setScanAdding(false);
        }
    };

    // --- Method 3: Scan barcode to find and attach an existing stock item ---
    const handleAttachByBarcode = async () => {
        const code = attachBarcode.trim();
        if (!code || !documentId || documentId === 'new') return;
        setAttachLoading(true);
        setError('');
        try {
            const res = await StockItemsEndpoints.searchByBarcode(code);
            const items = res?.data || [];
            if (items.length === 0) {
                setError(`No stock item found with barcode "${code}"`);
                setAttachLoading(false);
                return;
            }

            const item = items[0];
            const itemId = item.documentId || item.id;

            await StockItemsEndpoints.update(itemId, {
                product: documentId,
                name: product.name,
                selling_price: parseFloat(product.selling_price) || 0,
                offer_price: parseFloat(product.offer_price) || 0,
            });

            const prevProduct = item.product?.name || 'none';
            setSuccess(`Attached stock item "${code}" to this product (was: ${prevProduct})`);
            setAttachBarcode('');
            if (attachInputRef.current) attachInputRef.current.focus();
            fetchStockItems(stockStatusFilter);
        } catch (err) {
            setError('Failed to attach stock item: ' + (err?.response?.data?.error?.message || err.message));
            console.error('Error attaching stock item:', err);
        } finally {
            setAttachLoading(false);
        }
    };

    // --- Assign selected stock items to a destination branch ---
    // Sets branch + flips status to 'InStock' (intent: "this stock is now at
    // the destination, available for sale"). Mirrors the bulk action on the
    // global /stock-items page so the per-product flow is consistent.
    const handleAssignToBranch = async () => {
        if (selectedStockItems.size === 0) return setError('Tick at least one stock item to assign');
        if (!assignBranch) return setError('Pick a destination branch');
        const branch = branches.find(b => (b.documentId || b.id) === assignBranch);
        const branchName = branch?.name || assignBranch;
        if (!confirm(`Assign ${selectedStockItems.size} stock item(s) to "${branchName}"?\n\nThis sets their branch and marks them InStock.`)) return;
        setAssigning(true);
        setError('');
        try {
            const ids = Array.from(selectedStockItems);
            const res = await StockItemsEndpoints.transfer({
                items: ids,
                toBranch: assignBranch,
            });
            const moved = res?.transferred ?? ids.length;
            const failedCount = Array.isArray(res?.failed) ? res.failed.length : 0;
            setSuccess(
                failedCount > 0
                    ? `Assigned ${moved} item(s) to ${branchName}; ${failedCount} failed`
                    : `Assigned ${moved} stock item(s) to ${branchName}`
            );
            if (failedCount > 0) console.warn('[transfer] failures:', res.failed);
            setSelectedStockItems(new Set());
            fetchStockItems(stockStatusFilter);
        } catch (err) {
            console.error('Failed to assign to branch', err);
            setError('Failed to assign stock items');
        } finally {
            setAssigning(false);
        }
    };

    // --- Attach product barcode directly to selected stock items ---
    const handleAttachProductBarcode = async () => {
        if (selectedStockItems.size === 0 || !product.barcode) return;
        setApplyingChanges(true);
        setError('');
        try {
            const ids = Array.from(selectedStockItems);
            for (const id of ids) {
                await StockItemsEndpoints.update(id, { barcode: product.barcode });
            }
            setSuccess(`Assigned product barcode "${product.barcode}" to ${ids.length} stock item(s)`);
            fetchStockItems(stockStatusFilter);
        } catch (err) {
            setError('Failed to attach barcode: ' + (err?.response?.data?.error?.message || err.message));
            console.error('Error attaching product barcode:', err);
        } finally {
            setApplyingChanges(false);
        }
    };

    // --- Multi-scan: continuously scan barcodes to create stock items ---
    const handleMultiScanAdd = async () => {
        const code = multiScanBarcode.trim();
        if (!code || !documentId || documentId === 'new') return;
        setMultiScanAdding(true);
        setError('');
        try {
            const existing = await StockItemsEndpoints.checkBarcode(code);
            if (existing?.data?.length > 0) {
                setError(`Barcode "${code}" is already in use by another stock item`);
                setMultiScanAdding(false);
                return;
            }

            const baseSku = product.sku || product.id?.toString(22)?.toUpperCase() || '';
            const branch = getBranch();

            const data = {
                sku: `${baseSku}-${Date.now().toString(22)}`.toUpperCase(),
                barcode: code,
                name: product.name,
                status: 'Received',
                selling_price: parseFloat(product.selling_price) || 0,
                offer_price: parseFloat(product.offer_price) || 0,
                cost_price: parseFloat(product.cost_price) || 0,
                product: documentId,
                branch: branch?.documentId || branch?.id || undefined,
            };

            const res = await StockItemsEndpoints.create(data);
            setMultiScanItems(prev => [
                { barcode: code, sku: data.sku, id: res.data?.documentId || res.data?.id, time: new Date().toLocaleTimeString() },
                ...prev
            ]);
            setSuccess(`Stock item created with barcode "${code}" (${multiScanItems.length + 1} scanned)`);
            setMultiScanBarcode('');
            if (multiScanInputRef.current) multiScanInputRef.current.focus();
            fetchStockItems(stockStatusFilter);
        } catch (err) {
            setError('Failed to create stock item: ' + (err?.response?.data?.error?.message || err.message));
            console.error('Error multi-scan adding stock item:', err);
        } finally {
            setMultiScanAdding(false);
        }
    };

    const handlePrintBarcodes = (mode) => {
        const ids = mode === 'all'
            ? stockItems.map(item => item.documentId || item.id)
            : Array.from(selectedStockItems);
        if (ids.length === 0) return;
        const storageKey = printStorage.storePrintData({ documentIds: ids });
        if (storageKey) {
            const title = encodeURIComponent(`${product.name || 'Product'} - Barcodes`);
            window.open(`/print-bulk-barcodes?key=${storageKey}&title=${title}`, '_blank');
        }
    };

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        if (type === 'checkbox') {
            product[name] = checked ? true : false;
        } else if (type === 'number') {
            product[name] = parseFloat(value);
        } else {
            product[name] = value;
        }
        // keep product state in sync for re-render
        setProduct({ ...product });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError('');
        setSuccess('');
        try {
            // Stock Pricing section only writes pricing-related fields. Identity,
            // taxonomy, content and media are owned by the Details page — sending
            // them here would risk overwriting concurrent edits from CMS.
            const payload = {
                sku: product.sku ?? null,
                cost_price: product.cost_price ?? null,
                selling_price: product.selling_price ?? null,
                offer_price: product.offer_price ?? null,
                tax_rate: product.tax_rate ?? null,
                reorder_level: product.reorder_level ?? null,
                bundle_units: product.bundle_units ?? null,
            };
            const response = await saveProduct(documentId, payload);
            if (response.data?.documentId) {
                setSuccess('Pricing saved.');
            } else {
                setError('Failed to save pricing.');
            }
        } catch (err) {
            setError('An error occurred while saving pricing.');
            console.error('Error saving pricing:', err);
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <ProtectedRoute>
                <Layout>
                    <div className="page-content" style={{ textAlign: 'center' }}>
                        <p>Loading product data...</p>
                    </div>
                </Layout>
            </ProtectedRoute>
        );
    }

    const statusPill = product?.is_active === false
        ? <span className="badge bg-secondary">Inactive</span>
        : <span className="badge bg-success">Active</span>;

    return (
        <ProtectedRoute>
            <Layout>
                <ProductPageShell
                    product={product}
                    backHref="/products"
                    tabs={buildStockProductTabs({ documentId, badges: { stock: stockItemsTotal || undefined } })}
                    currentTab={isPricingView ? 'pricing' : 'stock'}
                    statusPill={statusPill}
                    extraInfo={stockItemsTotal != null && (
                        <span><i className="fas fa-cubes me-1 opacity-50" />{stockItemsTotal} stock item{stockItemsTotal === 1 ? '' : 's'}</span>
                    )}
                    alert={{
                        error,
                        success,
                        onDismissError: () => setError(''),
                        onDismissSuccess: () => setSuccess(''),
                    }}
                >
                    {/* Stock Pricing — surfaced as the "Pricing" top-level tab. Stock-item ops
                        (Apply / Generate / Scan / Reduce) live on the "Stock" tab and are
                        hidden when ?tab=pricing. */}
                    {isPricingView && (
                    <form onSubmit={handleSubmit} className="card mb-3">
                        <div className="card-header py-2 d-flex align-items-center justify-content-between">
                            <h6 className="mb-0"><i className="fas fa-tags me-2" />Stock Pricing</h6>
                            <button type="submit" className="btn btn-sm btn-primary" disabled={submitting}>
                                {submitting ? (
                                    <><span className="spinner-border spinner-border-sm me-1" />Saving…</>
                                ) : (
                                    <><i className="fas fa-save me-1" />Save Pricing</>
                                )}
                            </button>
                        </div>
                        <div className="card-body">
                            <div className="row g-3">
                                <div className="col-md-4">
                                    <label className="form-label fw-bold">SKU</label>
                                    <input type="text" name="sku"
                                        value={product.sku ?? ''} onChange={handleChange}
                                        className="form-control" placeholder="SKU" />
                                </div>
                                <div className="col-md-4">
                                    <label className="form-label fw-bold">Barcode</label>
                                    <input type="text" name="barcode"
                                        value={product.barcode ?? ''} onChange={handleChange}
                                        className="form-control" placeholder="Barcode" />
                                </div>
                                <div className="col-md-4">
                                    <label className="form-label fw-bold">Supplier Code</label>
                                    <input type="text" name="supplierCode"
                                        value={product.supplierCode ?? ''} onChange={handleChange}
                                        className="form-control" placeholder="Supplier Code" />
                                </div>
                                <div className="col-md-3">
                                    <label className="form-label fw-bold d-flex align-items-center gap-2">
                                        Cost Price
                                        {isAdmin
                                            ? <span className="badge bg-secondary" title="Admins only">admin</span>
                                            : <i className="fas fa-lock text-muted" title="Hidden — admin only" />}
                                    </label>
                                    <div className="input-group">
                                        <span className="input-group-text">{currency}</span>
                                        {isAdmin ? (
                                            <>
                                                <input
                                                    type={showCostPrice ? 'number' : 'password'}
                                                    name="cost_price"
                                                    step="0.01"
                                                    min="0"
                                                    value={product.cost_price ?? ''}
                                                    onChange={handleChange}
                                                    className="form-control"
                                                    placeholder="0.00"
                                                    autoComplete="off"
                                                />
                                                <button
                                                    type="button"
                                                    className="btn btn-outline-secondary"
                                                    onClick={() => setShowCostPrice(v => !v)}
                                                    title={showCostPrice ? 'Hide cost price' : 'Show cost price'}
                                                    aria-label={showCostPrice ? 'Hide cost price' : 'Show cost price'}
                                                >
                                                    <i className={`fas ${showCostPrice ? 'fa-eye-slash' : 'fa-eye'}`} />
                                                </button>
                                            </>
                                        ) : (
                                            <input
                                                type="password"
                                                value="••••••"
                                                readOnly
                                                disabled
                                                className="form-control"
                                                aria-label="Cost price (hidden — admin only)"
                                            />
                                        )}
                                    </div>
                                    {!isAdmin && (
                                        <div className="form-text">Hidden — admin only.</div>
                                    )}
                                </div>
                                <div className="col-md-3">
                                    <label className="form-label fw-bold">Selling Price *</label>
                                    <div className="input-group">
                                        <span className="input-group-text">{currency}</span>
                                        <input type="number" name="selling_price" step="0.01" min="0" required
                                            value={product.selling_price ?? ''} onChange={handleChange}
                                            className="form-control" placeholder="0.00" />
                                    </div>
                                </div>
                                <div className="col-md-3">
                                    <label className="form-label fw-bold">Offer Price</label>
                                    <div className="input-group">
                                        <span className="input-group-text">{currency}</span>
                                        <input type="number" name="offer_price" step="0.01" min="0"
                                            value={product.offer_price ?? ''} onChange={handleChange}
                                            className="form-control" placeholder="0.00" />
                                    </div>
                                </div>
                                <div className="col-md-3">
                                    <label className="form-label fw-bold">Tax Rate (%)</label>
                                    <input type="number" name="tax_rate" step="0.01" min="0"
                                        value={product.tax_rate ?? ''} onChange={handleChange}
                                        className="form-control" placeholder="0.00" />
                                </div>
                                <div className="col-md-3">
                                    <label className="form-label fw-bold">Reorder Level</label>
                                    <input type="number" name="reorder_level" min="0"
                                        value={product.reorder_level ?? ''} onChange={handleChange}
                                        className="form-control" placeholder="0" />
                                </div>
                                <div className="col-md-3">
                                    <label className="form-label fw-bold">Bundle Units</label>
                                    <input type="number" name="bundle_units" min="1"
                                        value={product.bundle_units ?? 1} onChange={handleChange}
                                        className="form-control" placeholder="1" />
                                </div>
                            </div>
                            {isAdmin && (product.cost_price > 0 && product.selling_price > 0) && (
                                <div className="alert alert-info mt-3 mb-0 py-2 d-flex gap-4 small">
                                    <span><strong>Margin:</strong> {currency}{(product.selling_price - product.cost_price).toFixed(2)}</span>
                                    <span><strong>Markup:</strong> {((product.selling_price - product.cost_price) / product.cost_price * 100).toFixed(1)}%</span>
                                </div>
                            )}
                        </div>
                    </form>
                    )}

                    {/* Apply pricing fields onto stock items — sister panel on the Pricing tab.
                        Mirrors the apply flow on the Stock tab but is focused on pricing fields
                        (SKU, cost/selling/offer prices). Reads values directly from the in-memory
                        product state, so the user does NOT need to save the product first. */}
                    {isPricingView && documentId && documentId !== 'new' && (
                        <div className="card mb-3">
                            <div className="card-header py-2 d-flex align-items-center justify-content-between">
                                <h6 className="mb-0"><i className="fas fa-cubes me-2" />Apply to Stock Items</h6>
                                <span className="text-muted small">Writes the ticked fields onto selected stock items — no need to save the product first.</span>
                            </div>
                            <div className="card-body">
                                <div className="d-flex flex-wrap gap-3 align-items-end mb-3">
                                    <div>
                                        <label className="form-label small fw-bold mb-1 d-block">Filter by Status</label>
                                        <select
                                            value={stockStatusFilter}
                                            onChange={(e) => setStockStatusFilter(e.target.value)}
                                            className="form-select form-select-sm"
                                            style={{ minWidth: 160 }}
                                        >
                                            <option value="">All Statuses</option>
                                            {stockStatuses.map(s => (
                                                <option key={s} value={s}>{s}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="d-flex flex-wrap gap-3 align-items-center">
                                        <span className="small fw-bold">Fields to apply:</span>
                                        <label className="small d-inline-flex align-items-center gap-1 mb-0">
                                            <input type="checkbox" checked={applyFields.sku} onChange={(e) => setApplyFields(f => ({ ...f, sku: e.target.checked }))} />
                                            SKU
                                        </label>
                                        {isAdmin && (
                                            <label className="small d-inline-flex align-items-center gap-1 mb-0">
                                                <input type="checkbox" checked={applyFields.cost_price} onChange={(e) => setApplyFields(f => ({ ...f, cost_price: e.target.checked }))} />
                                                Cost Price
                                            </label>
                                        )}
                                        <label className="small d-inline-flex align-items-center gap-1 mb-0">
                                            <input type="checkbox" checked={applyFields.selling_price} onChange={(e) => setApplyFields(f => ({ ...f, selling_price: e.target.checked }))} />
                                            Selling Price
                                        </label>
                                        <label className="small d-inline-flex align-items-center gap-1 mb-0">
                                            <input type="checkbox" checked={applyFields.offer_price} onChange={(e) => setApplyFields(f => ({ ...f, offer_price: e.target.checked }))} />
                                            Offer Price
                                        </label>
                                        <label className="small d-inline-flex align-items-center gap-1 mb-0">
                                            <input type="checkbox" checked={applyFields.name} onChange={(e) => setApplyFields(f => ({ ...f, name: e.target.checked }))} />
                                            Name
                                        </label>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={handleApplyToStockItems}
                                        disabled={applyingChanges || selectedStockItems.size === 0}
                                        className="btn btn-sm btn-success"
                                        title={selectedStockItems.size === 0
                                            ? 'Tick at least one stock item below'
                                            : `Write the ticked field values onto ${selectedStockItems.size} item(s)`}
                                    >
                                        {applyingChanges
                                            ? (<><span className="spinner-border spinner-border-sm me-1" />Updating…</>)
                                            : (<><i className="fas fa-check me-1" />Apply to {selectedStockItems.size} item{selectedStockItems.size === 1 ? '' : 's'}</>)}
                                    </button>
                                </div>

                                <div className="alert alert-light border py-2 mb-3 small">
                                    <strong>Values that will be written:</strong>
                                    {applyFields.sku && <span className="ms-3">SKU: <em>{product.sku || '—'}</em></span>}
                                    {isAdmin && applyFields.cost_price && <span className="ms-3">Cost: <em>{currency}{parseFloat(product.cost_price || 0).toFixed(2)}</em></span>}
                                    {applyFields.selling_price && <span className="ms-3">Selling: <em>{currency}{parseFloat(product.selling_price || 0).toFixed(2)}</em></span>}
                                    {applyFields.offer_price && <span className="ms-3">Offer: <em>{currency}{parseFloat(product.offer_price || 0).toFixed(2)}</em></span>}
                                    {applyFields.name && <span className="ms-3">Name: <em>{product.name || '—'}</em></span>}
                                </div>

                                <div style={{ overflowX: 'auto' }}>
                                    <table className="table table-sm table-hover mb-0">
                                        <thead className="table-light">
                                            <tr>
                                                <th style={{ width: 40 }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedStockItems.size === stockItems.length && stockItems.length > 0}
                                                        onChange={handleStockSelectAll}
                                                    />
                                                </th>
                                                <th>SKU</th>
                                                <th>Barcode</th>
                                                <th>Name</th>
                                                <th>Cost</th>
                                                <th>Selling</th>
                                                <th>Offer</th>
                                                <th>Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {stockItemsLoading ? (
                                                <tr><td colSpan={8} className="text-center text-muted py-3">Loading stock items…</td></tr>
                                            ) : stockItems.length === 0 ? (
                                                <tr><td colSpan={8} className="text-center text-muted py-3">No stock items found for this product.</td></tr>
                                            ) : (
                                                stockItems.map((item) => {
                                                    const itemId = item.documentId || item.id;
                                                    const isSelected = selectedStockItems.has(itemId);
                                                    const eligible = isApplyable(item);
                                                    const rowClass = isSelected ? 'table-success' : (!eligible ? 'text-muted' : '');
                                                    return (
                                                        <tr key={itemId} className={rowClass} style={!eligible ? { opacity: 0.55 } : undefined}>
                                                            <td>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={isSelected}
                                                                    disabled={!eligible}
                                                                    onChange={() => handleStockSelectItem(itemId)}
                                                                    title={eligible ? '' : `Cannot edit — status "${item.status}" means this item is no longer in possession.`}
                                                                />
                                                            </td>
                                                            <td>{item.sku || '—'}</td>
                                                            <td style={{ fontFamily: 'monospace' }}>{item.barcode || '—'}</td>
                                                            <td>{item.name || '—'}</td>
                                                            <td>{currency}{parseFloat(item.cost_price || 0).toFixed(2)}</td>
                                                            <td>{currency}{parseFloat(item.selling_price || 0).toFixed(2)}</td>
                                                            <td>{currency}{parseFloat(item.offer_price || 0).toFixed(2)}</td>
                                                            <td><span className="badge bg-secondary">{item.status}</span></td>
                                                        </tr>
                                                    );
                                                })
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                                {stockItems.length > 0 && (
                                    <div className="small text-muted mt-2">
                                        Showing {stockItems.length} of {stockItemsTotal} stock items
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Stock sub-tab strip — three modes for entering/managing stock items.
                        Apply Changes (below) is transverse and stays visible across all modes. */}
                    {!isPricingView && documentId && documentId !== 'new' && (
                        <ul className="nav nav-pills mb-3 gap-1">
                            <li className="nav-item">
                                <a
                                    href={`/${documentId}/product-stock-items`}
                                    className={`nav-link ${stockSubTab === 'list' ? 'active' : ''}`}
                                >
                                    <i className="fas fa-list me-1" /> Stock List
                                    {stockItemsTotal != null && stockItemsTotal > 0 && (
                                        <span className="badge bg-secondary ms-1">{stockItemsTotal}</span>
                                    )}
                                </a>
                            </li>
                            <li className="nav-item">
                                <a
                                    href={`/${documentId}/product-stock-items?sub=generate`}
                                    className={`nav-link ${stockSubTab === 'generate' ? 'active' : ''}`}
                                >
                                    <i className="fas fa-plus-circle me-1" /> Generate
                                </a>
                            </li>
                            <li className="nav-item">
                                <a
                                    href={`/${documentId}/product-stock-items?sub=scan`}
                                    className={`nav-link ${stockSubTab === 'scan' ? 'active' : ''}`}
                                >
                                    <i className="fas fa-barcode me-1" /> Scan
                                </a>
                            </li>
                            <li className="nav-item">
                                <a
                                    href={`/${documentId}/product-stock-items?sub=reduce`}
                                    className={`nav-link ${stockSubTab === 'reduce' ? 'active' : ''}`}
                                >
                                    <i className="fas fa-minus-circle me-1" /> Reduce
                                </a>
                            </li>
                            <li className="nav-item">
                                <a
                                    href={`/${documentId}/product-stock-items?sub=assign`}
                                    className={`nav-link ${stockSubTab === 'assign' ? 'active' : ''}`}
                                >
                                    <i className="fas fa-store me-1" /> Assign
                                </a>
                            </li>
                        </ul>
                    )}

                    {/* Stock List / Apply Changes — visible on the "list" and "reduce" sub-tabs.
                        The same table powers both: list-mode prints barcodes & applies pricing;
                        reduce-mode lets you select items and change their status to remove them. */}
                    {!isPricingView && (stockSubTab === 'list' || stockSubTab === 'reduce' || stockSubTab === 'assign') && documentId && documentId !== 'new' && (
                        <div style={{ marginTop: '30px' }}>
                            {stockSubTab === 'reduce' && (
                                <div className="alert alert-warning py-2 mb-3 d-flex align-items-center gap-2">
                                    <i className="fas fa-minus-circle" />
                                    <div>
                                        <strong>Reduce Stock</strong> — select items below to mark them as gone
                                        (mistaken creates, lost, damaged). The Apply panel is pre-set to update
                                        status only; pick the status and confirm.
                                    </div>
                                </div>
                            )}
                            {stockSubTab === 'assign' && (
                                <div className="alert alert-primary py-2 mb-3">
                                    <div className="d-flex align-items-center gap-2 mb-2">
                                        <i className="fas fa-store" />
                                        <strong>Assign to Branch</strong>
                                        <span className="text-muted small">
                                            — picks a destination branch, sets status to InStock, and moves
                                            the selected items there.
                                        </span>
                                    </div>
                                    <div className="d-flex flex-wrap gap-2 align-items-end">
                                        <div>
                                            <label className="form-label small fw-bold mb-1 d-block">Destination branch</label>
                                            <select
                                                value={assignBranch}
                                                onChange={(e) => setAssignBranch(e.target.value)}
                                                className="form-select form-select-sm"
                                                style={{ minWidth: 220 }}
                                            >
                                                <option value="">— pick a branch —</option>
                                                {branches.map(b => (
                                                    <option key={b.id || b.documentId} value={b.documentId || b.id}>{b.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleAssignToBranch}
                                            disabled={assigning || selectedStockItems.size === 0 || !assignBranch}
                                            className="btn btn-primary btn-sm"
                                            title={
                                                selectedStockItems.size === 0
                                                    ? 'Tick at least one stock item below'
                                                    : !assignBranch
                                                        ? 'Pick a destination branch'
                                                        : `Move ${selectedStockItems.size} item(s) to the selected branch`
                                            }
                                        >
                                            {assigning ? (
                                                <><span className="spinner-border spinner-border-sm me-1" />Assigning…</>
                                            ) : (
                                                <><i className="fas fa-arrow-right me-1" />Assign {selectedStockItems.size} item{selectedStockItems.size === 1 ? '' : 's'}</>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            )}
                            <div className="d-flex justify-content-between align-items-center mb-2">
                                <h6 className="mb-0">
                                    <i className={`fas ${stockSubTab === 'reduce' ? 'fa-minus-circle' : stockSubTab === 'assign' ? 'fa-store' : 'fa-list'} me-2`} />
                                    {stockSubTab === 'reduce'
                                        ? `Reduce — Stock Items (${stockItemsTotal})`
                                        : stockSubTab === 'assign'
                                            ? `Assign — Stock Items (${stockItemsTotal})`
                                            : `Stock Items (${stockItemsTotal})`}
                                </h6>
                                <span className="text-muted small">
                                    {stockSubTab === 'reduce'
                                        ? 'Select items, set the new status, then confirm.'
                                        : stockSubTab === 'assign'
                                            ? 'Select items, pick the destination branch above, then Assign.'
                                            : 'Select items to update prices, status, or print barcodes.'}
                                </span>
                            </div>
                            {true && (
                                <div style={{ background: '#f9f9f9', padding: '20px', borderRadius: '8px', border: '1px solid #ccc' }}>
                                    {/* Toolbar */}
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end', marginBottom: '16px' }}>
                                        <div>
                                            <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 'bold', color: 'black' }}>Filter by Status</label>
                                            <select
                                                value={stockStatusFilter}
                                                onChange={(e) => { setStockStatusFilter(e.target.value); }}
                                                style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: '4px' }}
                                            >
                                                <option value="">All Statuses</option>
                                                {stockStatuses.map(s => (
                                                    <option key={s} value={s}>{s}</option>
                                                ))}
                                            </select>
                                        </div>

                                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                            <label style={{ fontSize: '13px', fontWeight: 'bold', color: 'black' }}>Fields to apply:</label>
                                            <label style={{ fontSize: '13px', color: 'black' }}>
                                                <input type="checkbox" checked={applyFields.name} onChange={(e) => setApplyFields(f => ({ ...f, name: e.target.checked }))} style={{ marginRight: '4px' }} />
                                                Name
                                            </label>
                                            <label style={{ fontSize: '13px', color: 'black' }}>
                                                <input type="checkbox" checked={applyFields.selling_price} onChange={(e) => setApplyFields(f => ({ ...f, selling_price: e.target.checked }))} style={{ marginRight: '4px' }} />
                                                Selling Price
                                            </label>
                                            <label style={{ fontSize: '13px', color: 'black' }}>
                                                <input type="checkbox" checked={applyFields.offer_price} onChange={(e) => setApplyFields(f => ({ ...f, offer_price: e.target.checked }))} style={{ marginRight: '4px' }} />
                                                Offer Price
                                            </label>
                                            <label style={{ fontSize: '13px', color: 'black' }}>
                                                <input type="checkbox" checked={applyFields.status} onChange={(e) => setApplyFields(f => ({ ...f, status: e.target.checked }))} style={{ marginRight: '4px' }} />
                                                Status
                                            </label>
                                        </div>

                                        {applyFields.status && (
                                            <div>
                                                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 'bold', color: 'black' }}>Set Status To</label>
                                                <select
                                                    value={applyStatus}
                                                    onChange={(e) => setApplyStatus(e.target.value)}
                                                    style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: '4px' }}
                                                >
                                                    <option value="">— Select —</option>
                                                    {stockStatuses.map(s => (
                                                        <option key={s} value={s}>{s}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}

                                        <button
                                            type="button"
                                            onClick={handleApplyToStockItems}
                                            disabled={applyingChanges || selectedStockItems.size === 0}
                                            style={{
                                                padding: '8px 16px',
                                                background: selectedStockItems.size === 0 ? '#aaa' : (stockSubTab === 'reduce' ? '#dc3545' : '#28a745'),
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: '4px',
                                                cursor: selectedStockItems.size === 0 ? 'not-allowed' : 'pointer',
                                                fontWeight: 'bold'
                                            }}
                                            title={
                                                selectedStockItems.size === 0
                                                    ? 'Tick at least one stock item to enable this action.'
                                                    : stockSubTab === 'reduce'
                                                        ? `Set status of ${selectedStockItems.size} item(s) to "${applyStatus || '— pick a status —'}". Items remain in the database (reversible).`
                                                        : `Write the ticked field values onto ${selectedStockItems.size} item(s).`
                                            }
                                        >
                                            {applyingChanges
                                                ? (stockSubTab === 'reduce' ? 'Reducing…' : 'Updating…')
                                                : (stockSubTab === 'reduce'
                                                    ? `Mark ${selectedStockItems.size} item${selectedStockItems.size === 1 ? '' : 's'} as ${applyStatus || '…'}`
                                                    : `Update ${selectedStockItems.size} item${selectedStockItems.size === 1 ? '' : 's'}`)}
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => handlePrintBarcodes('selected')}
                                            disabled={selectedStockItems.size === 0}
                                            title="Open a print preview with one barcode label per selected item."
                                            style={{
                                                padding: '8px 16px',
                                                background: selectedStockItems.size === 0 ? '#aaa' : '#17a2b8',
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: '4px',
                                                cursor: selectedStockItems.size === 0 ? 'not-allowed' : 'pointer',
                                                fontWeight: 'bold'
                                            }}
                                        >
                                            <i className="fas fa-print" style={{ marginRight: '6px' }} />
                                            Print barcodes — {selectedStockItems.size} selected
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => handlePrintBarcodes('all')}
                                            disabled={stockItems.length === 0}
                                            title="Open a print preview with one barcode label per stock item on this product."
                                            style={{
                                                padding: '8px 16px',
                                                background: stockItems.length === 0 ? '#aaa' : '#6c757d',
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: '4px',
                                                cursor: stockItems.length === 0 ? 'not-allowed' : 'pointer',
                                                fontWeight: 'bold'
                                            }}
                                        >
                                            <i className="fas fa-print" style={{ marginRight: '6px' }} />
                                            Print barcodes — all {stockItems.length}
                                        </button>

                                        <button
                                            type="button"
                                            onClick={handleAttachProductBarcode}
                                            disabled={applyingChanges || selectedStockItems.size === 0 || !product.barcode}
                                            title={!product.barcode ? 'No barcode set on the product' : `Assign "${product.barcode}" to selected items`}
                                            style={{
                                                padding: '8px 16px',
                                                background: (selectedStockItems.size === 0 || !product.barcode) ? '#aaa' : '#6f42c1',
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: '4px',
                                                cursor: (selectedStockItems.size === 0 || !product.barcode) ? 'not-allowed' : 'pointer',
                                                fontWeight: 'bold'
                                            }}
                                        >
                                            <i className="fas fa-barcode" style={{ marginRight: '6px' }} />
                                            {applyingChanges
                                                ? 'Copying…'
                                                : `Copy product barcode to ${selectedStockItems.size} item${selectedStockItems.size === 1 ? '' : 's'}`}
                                        </button>
                                    </div>

                                    {/* Preview of values to apply */}
                                    <div style={{ marginBottom: '12px', padding: '8px 12px', background: '#e9ecef', borderRadius: '4px', fontSize: '13px', color: 'black' }}>
                                        <strong>Values that will be written:</strong>
                                        {applyFields.name && <span style={{ marginLeft: '12px' }}>Name: <em>{product.name || '—'}</em></span>}
                                        {applyFields.selling_price && <span style={{ marginLeft: '12px' }}>Selling Price: <em>{currency}{parseFloat(product.selling_price || 0).toFixed(2)}</em></span>}
                                        {applyFields.offer_price && <span style={{ marginLeft: '12px' }}>Offer Price: <em>{currency}{parseFloat(product.offer_price || 0).toFixed(2)}</em></span>}
                                        {applyFields.status && <span style={{ marginLeft: '12px' }}>Status: <em>{applyStatus || '— not selected —'}</em></span>}
                                    </div>

                                    {/* Stock Items Table */}
                                    <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                                            <thead>
                                                <tr style={{ background: '#dee2e6' }}>
                                                    <th style={{ padding: '8px', textAlign: 'left', width: '40px' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedStockItems.size === stockItems.length && stockItems.length > 0}
                                                            onChange={handleStockSelectAll}
                                                        />
                                                    </th>
                                                    <th style={{ padding: '8px', textAlign: 'left', color: 'black' }}>SKU</th>
                                                    <th style={{ padding: '8px', textAlign: 'left', color: 'black' }}>Barcode</th>
                                                    <th style={{ padding: '8px', textAlign: 'left', color: 'black' }}>Name</th>
                                                    <th style={{ padding: '8px', textAlign: 'left', color: 'black' }}>Selling Price</th>
                                                    <th style={{ padding: '8px', textAlign: 'left', color: 'black' }}>Offer Price</th>
                                                    <th style={{ padding: '8px', textAlign: 'left', color: 'black' }}>Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {stockItemsLoading ? (
                                                    <tr><td colSpan={7} style={{ padding: '20px', textAlign: 'center' }}>Loading stock items...</td></tr>
                                                ) : stockItems.length === 0 ? (
                                                    <tr><td colSpan={7} style={{ padding: '20px', textAlign: 'center', color: '#666' }}>No stock items found for this product.</td></tr>
                                                ) : (
                                                    stockItems.map((item) => {
                                                        const itemId = item.documentId || item.id;
                                                        const isSelected = selectedStockItems.has(itemId);
                                                        return (
                                                            <tr key={itemId} style={{ background: isSelected ? '#d4edda' : '#fff', borderBottom: '1px solid #dee2e6' }}>
                                                                <td style={{ padding: '8px' }}>
                                                                    <input type="checkbox" checked={isSelected} onChange={() => handleStockSelectItem(itemId)} />
                                                                </td>
                                                                <td style={{ padding: '8px', color: 'black' }}>{item.sku || '—'}</td>
                                                                <td style={{ padding: '8px', fontFamily: 'monospace', color: 'black' }}>{item.barcode || '—'}</td>
                                                                <td style={{ padding: '8px', color: 'black' }}>{item.name || '—'}</td>
                                                                <td style={{ padding: '8px', color: 'black' }}>{currency}{parseFloat(item.selling_price || 0).toFixed(2)}</td>
                                                                <td style={{ padding: '8px', color: 'black' }}>{currency}{parseFloat(item.offer_price || 0).toFixed(2)}</td>
                                                                <td style={{ padding: '8px' }}>
                                                                    <span style={{
                                                                        padding: '3px 8px',
                                                                        borderRadius: '4px',
                                                                        backgroundColor: item.status === 'InStock' ? '#17a2b8' : item.status === 'Received' ? '#28a745' : item.status === 'Sold' ? '#6c757d' : item.status === 'Reserved' ? '#ffc107' : item.status === 'Damaged' ? '#dc3545' : '#6c757d',
                                                                        color: 'white',
                                                                        fontSize: '12px',
                                                                        fontWeight: 'bold'
                                                                    }}>
                                                                        {item.status}
                                                                    </span>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                    {stockItems.length > 0 && (
                                        <div style={{ marginTop: '8px', fontSize: '13px', color: '#666' }}>
                                            Showing {stockItems.length} of {stockItemsTotal} stock items
                                        </div>
                                    )}


                                </div>
                            )}
                        </div>
                    )}

                    {/* ====== ADD STOCK ITEMS — "Generate" sub-tab ====== */}
                    {!isPricingView && stockSubTab === 'generate' && documentId && documentId !== 'new' && (
                        <div style={{ marginTop: '30px' }}>
                            <button
                                type="button"
                                onClick={() => setShowAddSection(!showAddSection)}
                                style={{
                                    background: 'none',
                                    border: '1px solid #b8daff',
                                    borderRadius: '4px',
                                    padding: '10px 16px',
                                    cursor: 'pointer',
                                    fontWeight: 'bold',
                                    width: '100%',
                                    textAlign: 'left',
                                    fontSize: '16px'
                                }}
                            >
                                {showAddSection ? '▼' : '▶'} <i className="fas fa-plus-circle" style={{ marginRight: '8px' }} />Add Stock Items
                            </button>

                            {showAddSection && (
                                <div style={{ background: '#f0f8ff', padding: '20px', borderRadius: '0 0 8px 8px', border: '1px solid #b8daff', borderTop: 'none' }}>
                                    <div style={{ marginBottom: '10px', padding: '8px 12px', background: '#e9ecef', borderRadius: '4px', fontSize: '13px', color: 'black' }}>
                                        <strong>Values copied from product:</strong>
                                        <span style={{ marginLeft: '12px' }}>Name: <em>{product.name || '—'}</em></span>
                                        <span style={{ marginLeft: '12px' }}>Selling: <em>{currency}{parseFloat(product.selling_price || 0).toFixed(2)}</em></span>
                                        <span style={{ marginLeft: '12px' }}>Offer: <em>{currency}{parseFloat(product.offer_price || 0).toFixed(2)}</em></span>
                                        <span style={{ marginLeft: '12px' }}>Cost: <em>{currency}{parseFloat(product.cost_price || 0).toFixed(2)}</em></span>
                                    </div>

                                    {/* --- Method 1: Bulk add new items --- */}
                                    <div style={{ background: '#fff', padding: '16px', borderRadius: '6px', border: '1px solid #dee2e6', marginBottom: '16px' }}>
                                        <h5 style={{ marginBottom: '12px', color: 'black' }}>
                                            <i className="fas fa-layer-group" style={{ marginRight: '6px', color: '#007bff' }} />
                                            Create New Items in Bulk
                                        </h5>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' }}>
                                            <div>
                                                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 'bold', color: 'black' }}>Quantity</label>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    max="500"
                                                    value={addQty}
                                                    onChange={(e) => setAddQty(Math.max(1, parseInt(e.target.value) || 1))}
                                                    style={{ width: '80px', padding: '6px 10px', border: '1px solid #ccc', borderRadius: '4px' }}
                                                />
                                            </div>
                                            <div>
                                                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 'bold', color: 'black' }}>Barcode Prefix</label>
                                                <input
                                                    type="text"
                                                    value={barcodePrefix}
                                                    onChange={(e) => setBarcodePrefix(e.target.value)}
                                                    style={{ width: '180px', padding: '6px 10px', border: '1px solid #ccc', borderRadius: '4px', fontFamily: 'monospace' }}
                                                    placeholder={product.barcode || generateSmartPrefix(product.name) || 'e.g. ABC'}
                                                />
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <input
                                                    type="checkbox"
                                                    id="autoBarcode"
                                                    checked={autoBarcode}
                                                    onChange={(e) => setAutoBarcode(e.target.checked)}
                                                />
                                                <label htmlFor="autoBarcode" style={{ fontSize: '13px', color: 'black', cursor: 'pointer' }}>
                                                    Generate incremental barcodes
                                                    {(barcodePrefix || product.barcode) ? ` (${barcodePrefix || product.barcode}-0001, …)` : ' (no barcode prefix set)'}
                                                </label>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={handleAddNewItems}
                                                disabled={addingItems}
                                                style={{
                                                    padding: '8px 16px',
                                                    background: addingItems ? '#aaa' : '#007bff',
                                                    color: 'white',
                                                    border: 'none',
                                                    borderRadius: '4px',
                                                    cursor: addingItems ? 'not-allowed' : 'pointer',
                                                    fontWeight: 'bold'
                                                }}
                                            >
                                                {addingItems ? 'Creating...' : `Create ${addQty} Item(s)`}
                                            </button>
                                        </div>
                                    </div>

                                    {/* --- Method 2: Scan barcode to create new item --- */}
                                    <div style={{ background: '#fff', padding: '16px', borderRadius: '6px', border: '1px solid #dee2e6', marginBottom: '16px' }}>
                                        <h5 style={{ marginBottom: '12px', color: 'black' }}>
                                            <i className="fas fa-barcode" style={{ marginRight: '6px', color: '#28a745' }} />
                                            Scan Barcode → Create New Item
                                        </h5>
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                                            <div style={{ flex: 1 }}>
                                                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 'bold', color: 'black' }}>Scan or type barcode</label>
                                                <input
                                                    ref={scanInputRef}
                                                    type="text"
                                                    value={scanBarcode}
                                                    onChange={(e) => setScanBarcode(e.target.value)}
                                                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleScanBarcodeAdd(); } }}
                                                    style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', fontFamily: 'monospace' }}
                                                    placeholder="Scan barcode here..."
                                                    autoComplete="off"
                                                />
                                            </div>
                                            <button
                                                type="button"
                                                onClick={handleScanBarcodeAdd}
                                                disabled={scanAdding || !scanBarcode.trim()}
                                                style={{
                                                    padding: '8px 16px',
                                                    background: scanAdding || !scanBarcode.trim() ? '#aaa' : '#28a745',
                                                    color: 'white',
                                                    border: 'none',
                                                    borderRadius: '4px',
                                                    cursor: scanAdding || !scanBarcode.trim() ? 'not-allowed' : 'pointer',
                                                    fontWeight: 'bold',
                                                    whiteSpace: 'nowrap'
                                                }}
                                            >
                                                {scanAdding ? 'Adding...' : 'Add Item'}
                                            </button>
                                        </div>
                                        <div style={{ marginTop: '6px', fontSize: '12px', color: '#666' }}>
                                            Creates a new stock item with the scanned barcode. Checks for duplicates. Press Enter to add.
                                        </div>
                                    </div>

                                    {/* --- Method 3: Scan barcode to attach existing item --- */}
                                    <div style={{ background: '#fff', padding: '16px', borderRadius: '6px', border: '1px solid #dee2e6' }}>
                                        <h5 style={{ marginBottom: '12px', color: 'black' }}>
                                            <i className="fas fa-link" style={{ marginRight: '6px', color: '#fd7e14' }} />
                                            Scan Barcode → Attach Existing Item
                                        </h5>
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                                            <div style={{ flex: 1 }}>
                                                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 'bold', color: 'black' }}>Scan or type barcode of existing item</label>
                                                <input
                                                    ref={attachInputRef}
                                                    type="text"
                                                    value={attachBarcode}
                                                    onChange={(e) => setAttachBarcode(e.target.value)}
                                                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAttachByBarcode(); } }}
                                                    style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', fontFamily: 'monospace' }}
                                                    placeholder="Scan existing item barcode..."
                                                    autoComplete="off"
                                                />
                                            </div>
                                            <button
                                                type="button"
                                                onClick={handleAttachByBarcode}
                                                disabled={attachLoading || !attachBarcode.trim()}
                                                style={{
                                                    padding: '8px 16px',
                                                    background: attachLoading || !attachBarcode.trim() ? '#aaa' : '#fd7e14',
                                                    color: 'white',
                                                    border: 'none',
                                                    borderRadius: '4px',
                                                    cursor: attachLoading || !attachBarcode.trim() ? 'not-allowed' : 'pointer',
                                                    fontWeight: 'bold',
                                                    whiteSpace: 'nowrap'
                                                }}
                                            >
                                                {attachLoading ? 'Searching...' : 'Attach Item'}
                                            </button>
                                        </div>
                                        <div style={{ marginTop: '6px', fontSize: '12px', color: '#666' }}>
                                            Finds an existing stock item by barcode and re-assigns it to this product. Updates name and pricing. Press Enter to attach.
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ====== MULTI-SCAN — "Continuous Scan" sub-tab ====== */}
                    {!isPricingView && stockSubTab === 'scan' && documentId && documentId !== 'new' && (
                        <div style={{ marginTop: '30px' }}>
                            <button
                                type="button"
                                onClick={() => {
                                    setShowMultiScanSection(!showMultiScanSection);
                                    if (!showMultiScanSection) {
                                        setTimeout(() => { if (multiScanInputRef.current) multiScanInputRef.current.focus(); }, 100);
                                    }
                                }}
                                style={{
                                    background: 'none',
                                    border: '1px solid #c3e6cb',
                                    borderRadius: '4px',
                                    padding: '10px 16px',
                                    cursor: 'pointer',
                                    fontWeight: 'bold',
                                    width: '100%',
                                    textAlign: 'left',
                                    fontSize: '16px'
                                }}
                            >
                                {showMultiScanSection ? '▼' : '▶'} <i className="fas fa-qrcode" style={{ marginRight: '8px' }} />Continuous Barcode Scan {multiScanItems.length > 0 ? `(${multiScanItems.length} scanned)` : ''}
                            </button>

                            {showMultiScanSection && (
                                <div style={{ background: '#f0fff0', padding: '20px', borderRadius: '0 0 8px 8px', border: '1px solid #c3e6cb', borderTop: 'none' }}>
                                    <div style={{ marginBottom: '10px', padding: '8px 12px', background: '#e9ecef', borderRadius: '4px', fontSize: '13px', color: 'black' }}>
                                        <strong>Continuous scan mode:</strong> Each barcode scan creates a new stock item for this product. Duplicates are checked automatically.
                                    </div>

                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', marginBottom: '16px' }}>
                                        <div style={{ flex: 1 }}>
                                            <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 'bold', color: 'black' }}>
                                                <i className="fas fa-barcode" style={{ marginRight: '4px' }} />
                                                Scan barcode
                                            </label>
                                            <input
                                                ref={multiScanInputRef}
                                                type="text"
                                                value={multiScanBarcode}
                                                onChange={(e) => setMultiScanBarcode(e.target.value)}
                                                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleMultiScanAdd(); } }}
                                                style={{
                                                    width: '100%',
                                                    padding: '12px',
                                                    border: '2px solid #28a745',
                                                    borderRadius: '4px',
                                                    fontFamily: 'monospace',
                                                    fontSize: '16px'
                                                }}
                                                placeholder="Scan barcode here... (auto-adds on Enter)"
                                                autoComplete="off"
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleMultiScanAdd}
                                            disabled={multiScanAdding || !multiScanBarcode.trim()}
                                            style={{
                                                padding: '12px 20px',
                                                background: multiScanAdding || !multiScanBarcode.trim() ? '#aaa' : '#28a745',
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: '4px',
                                                cursor: multiScanAdding || !multiScanBarcode.trim() ? 'not-allowed' : 'pointer',
                                                fontWeight: 'bold',
                                                whiteSpace: 'nowrap',
                                                fontSize: '16px'
                                            }}
                                        >
                                            {multiScanAdding ? 'Adding...' : 'Add'}
                                        </button>
                                        {multiScanItems.length > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => setMultiScanItems([])}
                                                style={{
                                                    padding: '12px 16px',
                                                    background: '#dc3545',
                                                    color: 'white',
                                                    border: 'none',
                                                    borderRadius: '4px',
                                                    cursor: 'pointer',
                                                    fontWeight: 'bold',
                                                    whiteSpace: 'nowrap'
                                                }}
                                            >
                                                Clear List
                                            </button>
                                        )}
                                    </div>

                                    {multiScanItems.length > 0 && (
                                        <div style={{ background: '#fff', borderRadius: '6px', border: '1px solid #dee2e6' }}>
                                            <div style={{ padding: '10px 16px', background: '#d4edda', borderRadius: '6px 6px 0 0', fontWeight: 'bold', fontSize: '14px', color: 'black' }}>
                                                <i className="fas fa-list" style={{ marginRight: '6px' }} />
                                                Scanned Items ({multiScanItems.length})
                                            </div>
                                            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                                    <thead>
                                                        <tr style={{ background: '#f8f9fa' }}>
                                                            <th style={{ padding: '8px', textAlign: 'left', color: 'black', width: '40px' }}>#</th>
                                                            <th style={{ padding: '8px', textAlign: 'left', color: 'black' }}>Barcode</th>
                                                            <th style={{ padding: '8px', textAlign: 'left', color: 'black' }}>SKU</th>
                                                            <th style={{ padding: '8px', textAlign: 'left', color: 'black' }}>Time</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {multiScanItems.map((item, idx) => (
                                                            <tr key={idx} style={{ borderBottom: '1px solid #eee', background: idx === 0 ? '#d4edda' : '#fff' }}>
                                                                <td style={{ padding: '6px 8px', color: '#666' }}>{multiScanItems.length - idx}</td>
                                                                <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontWeight: idx === 0 ? 'bold' : 'normal', color: 'black' }}>{item.barcode}</td>
                                                                <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: '#666', fontSize: '12px' }}>{item.sku}</td>
                                                                <td style={{ padding: '6px 8px', color: '#666', fontSize: '12px' }}>{item.time}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </ProductPageShell>
            </Layout>
        </ProtectedRoute>
    );
}




