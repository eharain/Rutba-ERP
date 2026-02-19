import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout';
import ProtectedRoute from '@rutba/pos-shared/components/ProtectedRoute';
import { authApi, relationConnects, getStockStatus } from '@rutba/pos-shared/lib/api';
import { saveProduct, loadProduct } from '@rutba/pos-shared/lib/pos';
import { useUtil } from '@rutba/pos-shared/context/UtilContext';
import { printStorage } from '@rutba/pos-shared/lib/printStorage';
import { getBranch } from '@rutba/pos-shared/lib/utils';
import FileView from '@rutba/pos-shared/components/FileView';
// Replaced local MultiSelect with PrimeReact MultiSelect
import { MultiSelect } from 'primereact/multiselect';



export default function EditProduct() {
    const router = useRouter();
    const { id: documentId } = router.query;
    const { currency } = useUtil();

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
    const [applyFields, setApplyFields] = useState({ name: true, selling_price: true, offer_price: true, status: false });
    const [applyStatus, setApplyStatus] = useState('');
    const [stockItemsTotal, setStockItemsTotal] = useState(0);
    const [showStockSection, setShowStockSection] = useState(false);

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

    async function fetchAllRecords(endpoint) {
        let allRecords = [];
        let page = 1;
        let totalPages = 1;

        do {
            // Fetch current page
            const response = await authApi.get(`${endpoint}?pagination[page]=${page}&pagination[pageSize]=100`);
            const { data, meta } = response;

            allRecords = [...allRecords, ...data];

            // Update pagination info
            totalPages = meta.pagination.pageCount;
            page++;
        } while (page <= totalPages);

        return allRecords;
    }

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);

                // Fetch categories, brands, suppliers, and stock statuses
                const [categoriesRes, brandsRes, suppliersRes, statusRes] = await Promise.all([
                    fetchAllRecords('/categories'),
                    fetchAllRecords('/brands'),
                    fetchAllRecords('/suppliers'),
                    getStockStatus()
                ]);

                setCategories(categoriesRes || []);
                setBrands(brandsRes || []);
                setSuppliers(suppliersRes || []);
                setStockStatuses(statusRes.statuses || []);

                if (documentId && documentId !== 'new') {
                    const productData = await loadProduct(documentId);
                    setProductId(productData.id);
                    setProduct(productData);
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
            const filters = {
                product: { documentId: documentId },
                ...(statusFilter ? { status: statusFilter } : {})
            };
            const response = await authApi.get('/me/stock-items-search', {
                populate: { product: true },
                filters,
                pagination: { page: 1, pageSize: 1000 },
                sort: ['createdAt:desc']
            });
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

    const handleStockSelectItem = (itemId) => {
        setSelectedStockItems(prev => {
            const newSet = new Set(prev);
            if (newSet.has(itemId)) newSet.delete(itemId);
            else newSet.add(itemId);
            return newSet;
        });
    };

    const handleStockSelectAll = () => {
        if (selectedStockItems.size === stockItems.length) {
            setSelectedStockItems(new Set());
        } else {
            setSelectedStockItems(new Set(stockItems.map(item => item.documentId || item.id)));
        }
    };

    const handleApplyToStockItems = async () => {
        if (selectedStockItems.size === 0) return;
        setApplyingChanges(true);
        try {
            const updates = {};
            if (applyFields.name) updates.name = product.name;
            if (applyFields.selling_price) updates.selling_price = parseFloat(product.selling_price) || 0;
            if (applyFields.offer_price) updates.offer_price = parseFloat(product.offer_price) || 0;
            if (applyFields.status && applyStatus) updates.status = applyStatus;

            if (Object.keys(updates).length === 0) {
                setError('Please select at least one field to apply');
                setApplyingChanges(false);
                return;
            }

            const ids = Array.from(selectedStockItems);
            await Promise.all(ids.map(id =>
                authApi.put(`/stock-items/${id}`, { data: updates })
            ));

            setSuccess(`Applied changes to ${ids.length} stock item(s)`);
            fetchStockItems(stockStatusFilter);
        } catch (err) {
            setError('Failed to apply changes to stock items');
            console.error('Error applying changes:', err);
        } finally {
            setApplyingChanges(false);
        }
    };

    // --- Method 1: Add new stock items in bulk with optional incremental barcodes ---
    const handleAddNewItems = async () => {
        if (!documentId || documentId === 'new' || addQty < 1) return;
        setAddingItems(true);
        setError('');
        try {
            const baseBarcode = product.barcode || '';
            const baseSku = product.sku || product.id?.toString(22)?.toUpperCase() || '';
            const branch = getBranch();
            const nextIndex = stockItemsTotal;

            for (let i = 0; i < addQty; i++) {
                const idx = nextIndex + i;
                const sku = `${baseSku}-${Date.now().toString(22)}-${idx.toString(22)}`.toUpperCase();
                const barcode = autoBarcode && baseBarcode
                    ? `${baseBarcode}-${(idx + 1).toString().padStart(4, '0')}`
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

                await authApi.post('/stock-items', { data });
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
            const existing = await authApi.get('/stock-items', {
                filters: { barcode: { $eq: code } },
                pagination: { pageSize: 1 }
            });
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

            await authApi.post('/stock-items', { data });
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
            const res = await authApi.get('/stock-items', {
                filters: { barcode: { $eq: code } },
                populate: { product: true },
                pagination: { pageSize: 1 }
            });
            const items = res?.data || [];
            if (items.length === 0) {
                setError(`No stock item found with barcode "${code}"`);
                setAttachLoading(false);
                return;
            }

            const item = items[0];
            const itemId = item.documentId || item.id;

            await authApi.put(`/stock-items/${itemId}`, {
                data: {
                    product: documentId,
                    name: product.name,
                    selling_price: parseFloat(product.selling_price) || 0,
                    offer_price: parseFloat(product.offer_price) || 0,
                }
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

    const handleFileChange = (field, files, multiple) => {
        if (multiple) {
            let fa = product[field];
            if (Array.isArray(fa)) {
                while (fa.length > 0) {
                    fa.pop();
                }
            } else {
                fa = product[field] = [];
            }
            fa.push(...files);
        } else {
            product[field] = files;
        }
        setProduct({ ...product });
    }

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError('');
        setSuccess('');

        try {

            console.log('Form Data to submit:', product);

            const payload = {
                ...product,
                ...relationConnects({
                    categories: product.categories,
                    brands: product.brands,
                    suppliers: product.suppliers
                }),

                logo: product.logo?.id ? product.logo?.id : null,
                gallery: product.gallery?.map(g => g.id) ?? null,
            };
      
            delete payload.createdAt;
            delete payload.updatedAt;
            delete payload.publishedAt;
            delete payload.id;
            delete payload.documentId;

            const response = await saveProduct(documentId, payload);

            if (response.data?.documentId || response.data?.documentId) {
                setSuccess('Product saved successfully!');
                setTimeout(() => {
                    router.push('/products');
                }, 1500);
            } else {
                setError('Failed to save product');
            }
        } catch (err) {
            setError('An error occurred while saving the product');
            console.error('Error saving product:', err);
        } finally {
            setSubmitting(false);
        }
    };

    const handleCancel = () => {
        router.push('/products');
    };

    // Prepare PrimeReact options (label/value shape)
    const categoryOptions = categories.map(c => ({ label: c.name ?? '', value: c }));
    const brandOptions = brands.map(b => ({ label: b.name ?? '', value: b }));
    const supplierOptions = suppliers.map(s => ({ label: (s.name ?? '') + (s.contact_person ? ' ' + s.contact_person : ''), value: s }));

    if (loading) {
        return (
            <ProtectedRoute>
                <Layout>
                    <div style={{ padding: '20px', textAlign: 'center' }}>
                        <p>Loading product data...</p>
                    </div>
                </Layout>
            </ProtectedRoute>
        );
    }

    return (
        <ProtectedRoute>
            <Layout>
                <div style={{ padding: '20px', maxWidth: '900px', margin: '0 auto' }}>
                    <h1 style={{ marginBottom: '20px' }}>
                        {documentId && documentId !== 'new' ? 'Edit Product' : 'Create New Product'}
                    </h1>

                    {error && (
                        <div style={{
                            background: '#fee',
                            border: '1px solid #fcc',
                            color: '#c00',
                            padding: '10px',
                            borderRadius: '4px',
                            marginBottom: '20px'
                        }}>
                            {error}
                        </div>
                    )}

                    {success && (
                        <div style={{
                            background: '#efe',
                            border: '1px solid #cfc',
                            color: '#0c0',
                            padding: '10px',
                            borderRadius: '4px',
                            marginBottom: '20px'
                        }}>
                            {success}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} style={{ background: '#f9f9f9', padding: '20px', borderRadius: '8px' }}>
                        {/* Name */}
                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: 'black' }}>
                                Product Name *
                            </label>
                            <input
                                type="text"
                                name="name"
                                value={product.name ?? ""}
                                onChange={handleChange}
                                required
                                style={{
                                    width: '100%',
                                    padding: '8px',
                                    border: '1px solid #ccc',
                                    borderRadius: '4px'
                                }}
                                placeholder="Product Name"
                            />
                        </div>

                        {/* SKU + Barcode */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: 'black' }}>
                                    SKU
                                </label>
                                <input
                                    type="text"
                                    name="sku"
                                    value={product.sku ?? ""}
                                    onChange={handleChange}
                                    style={{
                                        width: '100%',
                                        padding: '8px',
                                        border: '1px solid #ccc',
                                        borderRadius: '4px'
                                    }}
                                    placeholder="SKU"
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: 'black' }}>
                                    Barcode
                                </label>
                                <input
                                    type="text"
                                    name="barcode"
                                    value={product.barcode ?? ""}
                                    onChange={handleChange}
                                    style={{
                                        width: '100%',
                                        padding: '8px',
                                        border: '1px solid #ccc',
                                        borderRadius: '4px'
                                    }}
                                    placeholder="Barcode"
                                />
                            </div>
                        </div>

                        {/* Selling Price + Cost Price */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: 'black' }}>
                                    Selling Price *
                                </label>
                                <input
                                    type="number"
                                    name="selling_price"
                                    step="0.01"
                                    min="0"
                                    value={product.selling_price ?? 0}
                                    onChange={handleChange}
                                    required
                                    style={{
                                        width: '100%',
                                        padding: '8px',
                                        border: '1px solid #ccc',
                                        borderRadius: '4px'
                                    }}
                                    placeholder="0.00"
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: 'black' }}>
                                    Offer Price
                                </label>
                                <input
                                    type="number"
                                    name="offer_price"
                                    step="0.01"
                                    min="0"
                                    value={product.offer_price ?? 0}
                                    onChange={handleChange}
                                    style={{
                                        width: '100%',
                                        padding: '8px',
                                        border: '1px solid #ccc',
                                        borderRadius: '4px'
                                    }}
                                    placeholder="0.00"
                                />
                            </div>
                        </div>

                        {/* Tax Rate + Stock Quantity */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: 'black' }}>
                                    Tax Rate (%)
                                </label>
                                <input
                                    type="number"
                                    name="tax_rate"
                                    step="0.01"
                                    min="0"
                                    value={product.tax_rate ?? 0}
                                    onChange={handleChange}
                                    style={{
                                        width: '100%',
                                        padding: '8px',
                                        border: '1px solid #ccc',
                                        borderRadius: '4px'
                                    }}
                                    placeholder="0.00"
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: 'black' }}>
                                    Stock Quantity
                                </label>
                                <input
                                    type="number"
                                    name="stock_quantity"
                                    min="0"
                                    value={product.stock_quantity ?? 0}
                                    onChange={handleChange}
                                    style={{
                                        width: '100%',
                                        padding: '8px',
                                        border: '1px solid #ccc',
                                        borderRadius: '4px'
                                    }}
                                    placeholder="0"
                                />
                            </div>
                        </div>

                        {/* Reorder Level + Bundle Units */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: 'black' }}>
                                    Reorder Level
                                </label>
                                <input
                                    type="number"
                                    name="reorder_level"
                                    min="0"
                                    value={product.reorder_level ?? 0}
                                    onChange={handleChange}
                                    style={{
                                        width: '100%',
                                        padding: '8px',
                                        border: '1px solid #ccc',
                                        borderRadius: '4px'
                                    }}
                                    placeholder="0"
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: 'black' }}>
                                    Bundle Units
                                </label>
                                <input
                                    type="number"
                                    name="bundle_units"
                                    min="1"
                                    value={product.bundle_units ?? 0}
                                    onChange={handleChange}
                                    style={{
                                        width: '100%',
                                        padding: '8px',
                                        border: '1px solid #ccc',
                                        borderRadius: '4px'
                                    }}
                                    placeholder="1"
                                />
                            </div>
                        </div>

                        {/* Category + Brand (PrimeReact MultiSelect) */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: 'black' }}>
                                    Category
                                </label>
                                <MultiSelect
                                    value={product.categories ?? []}
                                    options={categoryOptions}
                                    onChange={(e) => {
                                        product.categories = e.value;
                                        setProduct({ ...product });
                                    }}
                                    optionLabel="label"
                                    optionValue="value"
                                    placeholder="Select categories"
                                    display="chip"
                                    style={{ width: '100%' }}
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: 'black' }}>
                                    Brands
                                </label>
                                <MultiSelect
                                    value={product.brands ?? []}
                                    options={brandOptions}
                                    onChange={(e) => {
                                        product.brands = e.value;
                                        setProduct({ ...product });
                                    }}
                                    optionLabel="label"
                                    optionValue="value"
                                    placeholder="Select brands"
                                    display="chip"
                                    style={{ width: '100%' }}
                                />
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: 'black' }}>
                                    Active Status
                                </label>
                                <div style={{ marginTop: '8px' }}>
                                    <input
                                        type="checkbox"
                                        name="is_active"
                                        checked={product.is_active ?? true}
                                        onChange={handleChange}
                                        style={{ marginRight: '8px' }}
                                    />
                                    <span style={{ color: 'black' }}>Product is active</span>
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: 'black' }}>
                                    Suppliers
                                </label>
                                <MultiSelect
                                    value={product.suppliers ?? []}
                                    options={supplierOptions}
                                    onChange={(e) => {
                                        product.suppliers = e.value;
                                        setProduct({ ...product });
                                    }}
                                    optionLabel="label"
                                    optionValue="value"
                                    placeholder="Select suppliers"
                                    display="chip"
                                    style={{ width: '100%' }}
                                />
                            </div>
                        </div>

                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: 'black' }}>
                                Logo
                            </label>
                            <FileView onFileChange={handleFileChange} single={product.logo} multiple={false} refName='product' refId={productId} field="logo" name={product.name} />
                            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: 'black' }}>
                                Gallery
                            </label>
                            <FileView onFileChange={handleFileChange} gallery={product.gallery} multiple={true} refName='product' refId={productId} field="gallery" name={product.name} />
                        </div>

                        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                            <button
                                type="submit"
                                disabled={submitting}
                                style={{
                                    padding: '10px 20px',
                                    background: '#007bff',
                                    color: 'black',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: submitting ? 'not-allowed' : 'pointer'
                                }}
                            >
                                {submitting ? 'Saving...' : (documentId && documentId !== 'new' ? 'Update Product' : 'Create Product')}
                            </button>
                            <button
                                type="button"
                                onClick={handleCancel}
                                style={{
                                    padding: '10px 20px',
                                    background: '#6c757d',
                                    color: 'black',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer'
                                }}
                            >
                                Cancel
                            </button>
                        </div>
                    </form>

    
                    {/* ====== ADD STOCK ITEMS SECTION ====== */}
                    {documentId && documentId !== 'new' && (
                        <div style={{ marginTop: '30px', background: '#f0f8ff', padding: '20px', borderRadius: '8px', border: '1px solid #b8daff' }}>
                            <h3 style={{ marginBottom: '16px', color: 'black' }}>
                                <i className="fas fa-plus-circle" style={{ marginRight: '8px' }} />
                                Add Stock Items
                            </h3>
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
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <input
                                            type="checkbox"
                                            id="autoBarcode"
                                            checked={autoBarcode}
                                            onChange={(e) => setAutoBarcode(e.target.checked)}
                                        />
                                        <label htmlFor="autoBarcode" style={{ fontSize: '13px', color: 'black', cursor: 'pointer' }}>
                                            Generate incremental barcodes
                                            {product.barcode ? ` (${product.barcode}-0001, …)` : ' (no product barcode set)'}
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

                    {/* Stock Items Section - only for existing products */}
                    {documentId && documentId !== 'new' && (
                        <div style={{ marginTop: '30px' }}>
                            <button
                                type="button"
                                onClick={() => setShowStockSection(!showStockSection)}
                                style={{
                                    background: 'none',
                                    border: '1px solid #ccc',
                                    borderRadius: '4px',
                                    padding: '10px 16px',
                                    cursor: 'pointer',
                                    fontWeight: 'bold',
                                    width: '100%',
                                    textAlign: 'left',
                                    fontSize: '16px'
                                }}
                            >
                                {showStockSection ? '▼' : '▶'} Apply Changes to Stock Items ({stockItemsTotal})
                            </button>

                            {showStockSection && (
                                <div style={{ background: '#f9f9f9', padding: '20px', borderRadius: '0 0 8px 8px', border: '1px solid #ccc', borderTop: 'none' }}>
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
                                                background: selectedStockItems.size === 0 ? '#aaa' : '#28a745',
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: '4px',
                                                cursor: selectedStockItems.size === 0 ? 'not-allowed' : 'pointer',
                                                fontWeight: 'bold'
                                            }}
                                        >
                                            {applyingChanges ? 'Applying...' : `Apply to ${selectedStockItems.size} selected`}
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => handlePrintBarcodes('selected')}
                                            disabled={selectedStockItems.size === 0}
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
                                            Print {selectedStockItems.size} Selected
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => handlePrintBarcodes('all')}
                                            disabled={stockItems.length === 0}
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
                                            Print All ({stockItems.length})
                                        </button>
                                    </div>

                                    {/* Preview of values to apply */}
                                    <div style={{ marginBottom: '12px', padding: '8px 12px', background: '#e9ecef', borderRadius: '4px', fontSize: '13px', color: 'black' }}>
                                        <strong>Values from product:</strong>
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
                    <>
                        <button type="button" className="btn btn-outline-info ms-auto" onClick={() => router.push(`/${documentId}/product-variants`)}>
                            <i className="fas fa-fighter-jet me-1" /> Variants
                        </button>
                        <button type="button" className="btn btn-outline-info" onClick={() => router.push(`/stock-items?product=${documentId}`)}>
                            <i className="fas fa-boxes me-1" /> Stock Items
                        </button>
                        <button type="button" className="btn btn-outline-warning" onClick={() => router.push(`/${documentId}/product-edit?product=${documentId}`)}>
                            <i className="fas fa-boxes me-1" /> Edit
                        </button>
                    </>
                </div>
            </Layout>
        </ProtectedRoute>
    );
}




export async function getServerSideProps() { return { props: {} }; }
