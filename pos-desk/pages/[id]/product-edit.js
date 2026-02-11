import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout';
import ProtectedRoute from '../../components/ProtectedRoute';
import { authApi, relationConnects } from '../../lib/api';
import { saveProduct, loadProduct } from '../../lib/pos';
import { useUtil } from '../../context/UtilContext';
import FileView from '../../components/FileView';
import MarkdownEditor from '../../components/MarkdownEditor';
import { MultiSelect } from 'primereact/multiselect';

export default function ProductEditPage() {
    const router = useRouter();
    const { id: documentId } = router.query;
    const { currency } = useUtil();

    const [productId, setProductId] = useState(null);
    const [product, setProduct] = useState({});
    const [categories, setCategories] = useState([]);
    const [brands, setBrands] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [terms, setTerms] = useState([]);
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [activeTab, setActiveTab] = useState('basic');

    async function fetchAllRecords(endpoint) {
        let allRecords = [];
        let page = 1;
        let totalPages = 1;
        do {
            const response = await authApi.get(`${endpoint}?pagination[page]=${page}&pagination[pageSize]=100`);
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
                const [categoriesRes, brandsRes, suppliersRes, termsRes, productsRes] = await Promise.all([
                    fetchAllRecords('/categories'),
                    fetchAllRecords('/brands'),
                    fetchAllRecords('/suppliers'),
                    fetchAllRecords('/terms'),
                    fetchAllRecords('/products'),
                ]);
                setCategories(categoriesRes || []);
                setBrands(brandsRes || []);
                setSuppliers(suppliersRes || []);
                setTerms(termsRes || []);
                setProducts((productsRes || []).filter(p => p.documentId !== documentId));

                if (documentId && documentId !== 'new') {
                    const productData = await loadProduct(documentId);
                    setProductId(productData.id);
                    setProduct(productData);
                } else {
                    setProduct({
                        categories: [],
                        brands: [],
                        suppliers: [],
                        terms: [],
                        keywords: [],
                        is_active: true,
                        is_variant: false,
                        bundle_units: 1,
                    });
                }
            } catch (err) {
                setError('Failed to fetch data');
                console.error('Error fetching data:', err);
            } finally {
                setLoading(false);
            }
        };
        if (documentId) fetchData();
    }, [documentId]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        if (type === 'checkbox') {
            product[name] = checked;
        } else if (type === 'number') {
            product[name] = value === '' ? '' : parseFloat(value);
        } else {
            product[name] = value;
        }
        setProduct({ ...product });
    };

    const handleFileChange = (field, files, multiple) => {
        if (multiple) {
            let fa = product[field];
            if (Array.isArray(fa)) {
                while (fa.length > 0) fa.pop();
            } else {
                fa = product[field] = [];
            }
            fa.push(...files);
        } else {
            product[field] = files;
        }
        setProduct({ ...product });
    };

    const handleKeywordsChange = (e) => {
        const raw = e.target.value;
        product.keywords = raw.split(',').map(k => k.trim()).filter(Boolean);
        setProduct({ ...product });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError('');
        setSuccess('');
        try {
            const payload = {
                ...product,
                ...relationConnects({
                    categories: product.categories,
                    brands: product.brands,
                    suppliers: product.suppliers,
                    terms: product.terms,
                    parent: product.parent,
                }),
                logo: product.logo?.id ? product.logo.id : null,
                gallery: product.gallery?.map(g => g.id) ?? null,
            };

            delete payload.createdAt;
            delete payload.updatedAt;
            delete payload.publishedAt;
            delete payload.id;
            delete payload.documentId;
            delete payload.items;
            delete payload.purchase_items;
            delete payload.users;
            delete payload.branches;
            delete payload.variants;

            const response = await saveProduct(documentId, payload);
            if (response.data?.documentId) {
                setSuccess('Product saved successfully!');
                if (documentId === 'new') {
                    setTimeout(() => router.push(`/${response.data.documentId}/product-edit`), 1500);
                }
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

    const isEdit = documentId && documentId !== 'new';

    const categoryOptions = categories.map(c => ({ label: c.name ?? '', value: c }));
    const brandOptions = brands.map(b => ({ label: b.name ?? '', value: b }));
    const supplierOptions = suppliers.map(s => ({ label: (s.name ?? '') + (s.contact_person ? ' – ' + s.contact_person : ''), value: s }));
    const termOptions = terms.map(t => ({ label: t.name ?? '', value: t }));
    const parentOptions = [{ label: '— None —', value: null }, ...products.map(p => ({ label: p.name ?? p.sku ?? p.documentId, value: p }))];

    const tabs = [
        { key: 'basic', label: 'Basic Info', icon: 'fa-info-circle' },
        { key: 'pricing', label: 'Pricing & Stock', icon: 'fa-tags' },
        { key: 'content', label: 'Content', icon: 'fa-file-alt' },
        { key: 'relations', label: 'Relations', icon: 'fa-project-diagram' },
        { key: 'media', label: 'Media', icon: 'fa-images' },
    ];

    if (loading) {
        return (
            <ProtectedRoute>
                <Layout>
                    <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '60vh' }}>
                        <div className="spinner-border text-primary" role="status" />
                        <span className="ms-3">Loading product data...</span>
                    </div>
                </Layout>
            </ProtectedRoute>
        );
    }

    return (
        <ProtectedRoute>
            <Layout>
                <div className="container-fluid p-4" style={{ maxWidth: 1100 }}>
                    {/* Header */}
                    <div className="d-flex justify-content-between align-items-center mb-3">
                        <h2 className="mb-0">
                            <i className={`fas ${isEdit ? 'fa-edit' : 'fa-plus-circle'} me-2`} />
                            {isEdit ? 'Edit Product' : 'Create New Product'}
                        </h2>
                        <button type="button" className="btn btn-outline-secondary" onClick={() => router.push('/products')}>
                            <i className="fas fa-arrow-left me-1" /> Back to Products
                        </button>
                    </div>

                    {/* Alerts */}
                    {error && (
                        <div className="alert alert-danger alert-dismissible fade show" role="alert">
                            {error}
                            <button type="button" className="btn-close" onClick={() => setError('')} />
                        </div>
                    )}
                    {success && (
                        <div className="alert alert-success alert-dismissible fade show" role="alert">
                            {success}
                            <button type="button" className="btn-close" onClick={() => setSuccess('')} />
                        </div>
                    )}

                    <form onSubmit={handleSubmit}>
                        {/* Tabs */}
                        <ul className="nav nav-tabs mb-3">
                            {tabs.map(tab => (
                                <li className="nav-item" key={tab.key}>
                                    <button
                                        type="button"
                                        className={`nav-link ${activeTab === tab.key ? 'active' : ''}`}
                                        onClick={() => setActiveTab(tab.key)}
                                    >
                                        <i className={`fas ${tab.icon} me-1`} /> {tab.label}
                                    </button>
                                </li>
                            ))}
                        </ul>

                        {/* ---- BASIC INFO TAB ---- */}
                        {activeTab === 'basic' && (
                            <div className="card">
                                <div className="card-body">
                                    <div className="row g-3">
                                        <div className="col-md-8">
                                            <label className="form-label fw-bold">Product Name *</label>
                                            <input
                                                type="text"
                                                name="name"
                                                value={product.name ?? ''}
                                                onChange={handleChange}
                                                required
                                                className="form-control"
                                                placeholder="Product Name"
                                            />
                                        </div>
                                        <div className="col-md-4">
                                            <label className="form-label fw-bold">SKU</label>
                                            <input
                                                type="text"
                                                name="sku"
                                                value={product.sku ?? ''}
                                                onChange={handleChange}
                                                className="form-control"
                                                placeholder="SKU"
                                            />
                                        </div>
                                        <div className="col-md-4">
                                            <label className="form-label fw-bold">Barcode</label>
                                            <input
                                                type="text"
                                                name="barcode"
                                                value={product.barcode ?? ''}
                                                onChange={handleChange}
                                                className="form-control"
                                                placeholder="Barcode"
                                            />
                                        </div>
                                        <div className="col-md-4">
                                            <label className="form-label fw-bold">Supplier Code</label>
                                            <input
                                                type="text"
                                                name="supplierCode"
                                                value={product.supplierCode ?? ''}
                                                onChange={handleChange}
                                                className="form-control"
                                                placeholder="Supplier Code"
                                            />
                                        </div>
                                        <div className="col-md-4">
                                            <label className="form-label fw-bold">Keywords</label>
                                            <input
                                                type="text"
                                                value={Array.isArray(product.keywords) ? product.keywords.join(', ') : ''}
                                                onChange={handleKeywordsChange}
                                                className="form-control"
                                                placeholder="keyword1, keyword2, ..."
                                            />
                                            <div className="form-text">Comma separated</div>
                                        </div>
                                        <div className="col-md-6">
                                            <div className="form-check mt-4">
                                                <input
                                                    className="form-check-input"
                                                    type="checkbox"
                                                    name="is_active"
                                                    id="is_active"
                                                    checked={product.is_active ?? true}
                                                    onChange={handleChange}
                                                />
                                                <label className="form-check-label" htmlFor="is_active">Product is active</label>
                                            </div>
                                        </div>
                                        <div className="col-md-6">
                                            <div className="form-check mt-4">
                                                <input
                                                    className="form-check-input"
                                                    type="checkbox"
                                                    name="is_variant"
                                                    id="is_variant"
                                                    checked={product.is_variant ?? false}
                                                    onChange={handleChange}
                                                />
                                                <label className="form-check-label" htmlFor="is_variant">Is a variant</label>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ---- PRICING & STOCK TAB ---- */}
                        {activeTab === 'pricing' && (
                            <div className="card">
                                <div className="card-body">
                                    <div className="row g-3">
                                        {
                                            product.product.cost_price <= 0 &&
                                            (                                   
                                                <div className="col-md-4">
                                                    <label className="form-label fw-bold">Cost Price</label>
                                                    <div className="input-group">
                                                        <span className="input-group-text">{currency}</span>
                                                        <input
                                                            type="number"
                                                            name="cost_price"
                                                            step="0.01"
                                                            min="0"
                                                            value={product.cost_price ?? ''}
                                                            onChange={handleChange}
                                                            className="form-control"
                                                            placeholder="0.00"
                                                        />
                                                    </div></div>) 
                                        }
                                        
                                        <div className="col-md-4">
                                            <label className="form-label fw-bold">Selling Price *</label>
                                            <div className="input-group">
                                                <span className="input-group-text">{currency}</span>
                                                <input
                                                    type="number"
                                                    name="selling_price"
                                                    step="0.01"
                                                    min="0"
                                                    value={product.selling_price ?? ''}
                                                    onChange={handleChange}
                                                    required
                                                    className="form-control"
                                                    placeholder="0.00"
                                                />
                                            </div>
                                        </div>
                                        <div className="col-md-4">
                                            <label className="form-label fw-bold">Offer Price</label>
                                            <div className="input-group">
                                                <span className="input-group-text">{currency}</span>
                                                <input
                                                    type="number"
                                                    name="offer_price"
                                                    step="0.01"
                                                    min="0"
                                                    value={product.offer_price ?? ''}
                                                    onChange={handleChange}
                                                    className="form-control"
                                                    placeholder="0.00"
                                                />
                                            </div>
                                        </div>
                                        <div className="col-md-3">
                                            <label className="form-label fw-bold">Tax Rate (%)</label>
                                            <input
                                                type="number"
                                                name="tax_rate"
                                                step="0.01"
                                                min="0"
                                                value={product.tax_rate ?? ''}
                                                onChange={handleChange}
                                                className="form-control"
                                                placeholder="0.00"
                                            />
                                        </div>
                                        <div className="col-md-3">
                                            <label className="form-label fw-bold">Stock Quantity</label>
                                            <input
                                                type="number"
                                                name="stock_quantity"
                                                min="0"
                                                value={product.stock_quantity ?? ''}
                                                onChange={handleChange}
                                                className="form-control"
                                                placeholder="0"
                                            />
                                        </div>
                                        <div className="col-md-3">
                                            <label className="form-label fw-bold">Reorder Level</label>
                                            <input
                                                type="number"
                                                name="reorder_level"
                                                min="0"
                                                value={product.reorder_level ?? ''}
                                                onChange={handleChange}
                                                className="form-control"
                                                placeholder="0"
                                            />
                                        </div>
                                        <div className="col-md-3">
                                            <label className="form-label fw-bold">Bundle Units</label>
                                            <input
                                                type="number"
                                                name="bundle_units"
                                                min="1"
                                                value={product.bundle_units ?? 1}
                                                onChange={handleChange}
                                                className="form-control"
                                                placeholder="1"
                                            />
                                        </div>
                                    </div>
                                    {/* Margin preview */}
                                    {(product.cost_price > 0 && product.selling_price > 0) && (
                                        <div className="alert alert-info mt-3 mb-0 py-2 d-flex gap-4">
                                            <span><strong>Margin:</strong> {currency}{(product.selling_price - product.cost_price).toFixed(2)}</span>
                                            <span><strong>Markup:</strong> {((product.selling_price - product.cost_price) / product.cost_price * 100).toFixed(1)}%</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* ---- CONTENT TAB ---- */}
                        {activeTab === 'content' && (
                            <div className="card">
                                <div className="card-body">
                                    <div className="mb-4">
                                        <label className="form-label fw-bold">Summary (Markdown)</label>
                                        <MarkdownEditor
                                            name="summary"
                                            value={product.summary ?? ''}
                                            onChange={handleChange}
                                            rows={6}
                                            placeholder="Write a short product summary..."
                                        />
                                    </div>
                                    <div>
                                        <label className="form-label fw-bold">Description (Markdown)</label>
                                        <MarkdownEditor
                                            name="description"
                                            value={product.description ?? ''}
                                            onChange={handleChange}
                                            rows={14}
                                            placeholder="Write a detailed product description..."
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ---- RELATIONS TAB ---- */}
                        {activeTab === 'relations' && (
                            <div className="card">
                                <div className="card-body">
                                    <div className="row g-3">
                                        <div className="col-md-6">
                                            <label className="form-label fw-bold">Categories</label>
                                            <MultiSelect
                                                value={product.categories ?? []}
                                                options={categoryOptions}
                                                onChange={(e) => { product.categories = e.value; setProduct({ ...product }); }}
                                                optionLabel="label"
                                                optionValue="value"
                                                placeholder="Select categories"
                                                display="chip"
                                                className="w-100"
                                            />
                                        </div>
                                        <div className="col-md-6">
                                            <label className="form-label fw-bold">Brands</label>
                                            <MultiSelect
                                                value={product.brands ?? []}
                                                options={brandOptions}
                                                onChange={(e) => { product.brands = e.value; setProduct({ ...product }); }}
                                                optionLabel="label"
                                                optionValue="value"
                                                placeholder="Select brands"
                                                display="chip"
                                                className="w-100"
                                            />
                                        </div>
                                        <div className="col-md-6">
                                            <label className="form-label fw-bold">Suppliers</label>
                                            <MultiSelect
                                                value={product.suppliers ?? []}
                                                options={supplierOptions}
                                                onChange={(e) => { product.suppliers = e.value; setProduct({ ...product }); }}
                                                optionLabel="label"
                                                optionValue="value"
                                                placeholder="Select suppliers"
                                                display="chip"
                                                className="w-100"
                                            />
                                        </div>
                                        <div className="col-md-6">
                                            <label className="form-label fw-bold">Terms / Tags</label>
                                            <MultiSelect
                                                value={product.terms ?? []}
                                                options={termOptions}
                                                onChange={(e) => { product.terms = e.value; setProduct({ ...product }); }}
                                                optionLabel="label"
                                                optionValue="value"
                                                placeholder="Select terms"
                                                display="chip"
                                                className="w-100"
                                            />
                                        </div>
                                        <div className="col-md-6">
                                            <label className="form-label fw-bold">Parent Product</label>
                                            <select
                                                className="form-select"
                                                value={product.parent?.documentId ?? ''}
                                                onChange={(e) => {
                                                    const selected = products.find(p => p.documentId === e.target.value);
                                                    product.parent = selected || null;
                                                    setProduct({ ...product });
                                                }}
                                            >
                                                <option value="">— None —</option>
                                                {products.map(p => (
                                                    <option key={p.documentId} value={p.documentId}>{p.name ?? p.sku ?? p.documentId}</option>
                                                ))}
                                            </select>
                                            <div className="form-text">Set a parent to make this product a variant</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ---- MEDIA TAB ---- */}
                        {activeTab === 'media' && (
                            <div className="card">
                                <div className="card-body">
                                    <div className="row g-4">
                                        <div className="col-md-6">
                                            <label className="form-label fw-bold">Logo</label>
                                            <FileView
                                                onFileChange={handleFileChange}
                                                single={product.logo}
                                                multiple={false}
                                                refName="product"
                                                refId={productId}
                                                field="logo"
                                                name={product.name}
                                            />
                                        </div>
                                        <div className="col-12">
                                            <label className="form-label fw-bold">Gallery</label>
                                            <FileView
                                                onFileChange={handleFileChange}
                                                gallery={product.gallery}
                                                multiple={true}
                                                refName="product"
                                                refId={productId}
                                                field="gallery"
                                                name={product.name}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Action buttons */}
                        <div className="d-flex gap-2 mt-4">
                            <button type="submit" className="btn btn-primary" disabled={submitting}>
                                {submitting ? (
                                    <>
                                        <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true" />
                                        Saving...
                                    </>
                                ) : (
                                    <>
                                        <i className="fas fa-save me-1" />
                                        {isEdit ? 'Update Product' : 'Create Product'}
                                    </>
                                )}
                            </button>
                            <button type="button" className="btn btn-outline-secondary" onClick={() => router.push('/products')}>
                                Cancel
                            </button>
                            {isEdit && (
                                <>
                                    <button type="button" className="btn btn-outline-info ms-auto" onClick={() => router.push(`/${documentId}/product-variants`)}>
                                        <i className="fas fa-fighter-jet me-1" /> Variants
                                    </button>
                                    <button type="button" className="btn btn-outline-info" onClick={() => router.push(`/stock-items?product=${documentId}`)}>
                                        <i className="fas fa-boxes me-1" /> Stock Items
                                    </button>
                                    <button type="button" className="btn btn-outline-warning" onClick={() => router.push(`/${documentId}/product-stock-items?product=${documentId}`)}>
                                        <i className="fas fa-boxes me-1" /> Stock Control
                                    </button>
                                </>
                            )}
                        </div>
                    </form>
                </div>
            </Layout>
        </ProtectedRoute>
    );
}
