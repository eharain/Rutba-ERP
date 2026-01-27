import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout';
import ProtectedRoute from '../../components/ProtectedRoute';
import { authApi, relationConnects } from '../../lib/api';
import { saveProduct, loadProduct } from '../../lib/pos';
import StrapiImage from '../../components/StrapiImage';
import FileView from '../../components/FileView';
// Replaced local MultiSelect with PrimeReact MultiSelect
import { MultiSelect } from 'primereact/multiselect';



export default function EditProduct() {
    const router = useRouter();
    const { id: documentId } = router.query;

    const [productId, setProductId] = useState([]);
    const [product, setProduct] = useState({});
    const [categories, setCategories] = useState([]);
    const [brands, setBrands] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

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

                // Fetch categories, brands, and suppliers
                const [categoriesRes, brandsRes, suppliersRes] = await Promise.all([
                    fetchAllRecords('/categories'),
                    fetchAllRecords('/brands'),
                    fetchAllRecords('/suppliers')
                ]);

                setCategories(categoriesRes || []);
                setBrands(brandsRes || []);
                setSuppliers(suppliersRes || []);

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

    // Simple Markdown preview renderer (safe-ish, minimal features)
    const renderMarkdownPreview = (md) => {
        if (!md) return { __html: '' };
        const escapeHtml = (s) => s
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        let html = escapeHtml(md);

        html = html
            .replace(/^### (.*$)/gim, '<h3>$1</h3>')
            .replace(/^## (.*$)/gim, '<h2>$1</h2>')
            .replace(/^# (.*$)/gim, '<h1>$1</h1>')
            .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/gim, '<em>$1</em>')
            .replace(/\[(.*?)\]\((.*?)\)/gim, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
            .replace(/\n/g, '<br/>');

        return { __html: html };
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
                        {/* Name + Description (markdown editor + preview) */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                            <div>
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

                            <div>
                                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: 'black' }}>
                                    Description (Markdown)
                                </label>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                    <textarea
                                        name="description"
                                        value={product.description ?? ""}
                                        onChange={handleChange}
                                        rows="6"
                                        style={{
                                            width: '100%',
                                            padding: '8px',
                                            border: '1px solid #ccc',
                                            borderRadius: '4px',
                                            minHeight: '140px',
                                            resize: 'vertical'
                                        }}
                                        placeholder="Write product description in markdown..."
                                    />
                                    <div style={{
                                        border: '1px solid #e0e0e0',
                                        borderRadius: '4px',
                                        padding: '8px',
                                        background: '#fff',
                                        minHeight: '140px',
                                        overflowY: 'auto'
                                    }}>
                                        <div style={{ fontSize: '12px', color: '#666', marginBottom: '6px' }}>Preview</div>
                                        <div dangerouslySetInnerHTML={renderMarkdownPreview(product.description)} />
                                    </div>
                                </div>
                            </div>
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
                </div>
            </Layout>
        </ProtectedRoute>
    );
}


