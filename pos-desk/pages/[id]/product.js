import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout';
import ProtectedRoute from '../../components/ProtectedRoute';
import { authApi } from '../../lib/api';
import { saveProduct, loadProduct } from '../../lib/pos';
import StrapiImage from '../../components/StrapiImage';
import FileView from '../../components/FileView';

export default function EditProduct() {
    const router = useRouter();
    const { id } = router.query;

    const [formData, setFormData] = useState({
        name: '',
        sku: '',
        barcode: '',
        offer_price: 0,
        selling_price: 0,
        tax_rate: 0,
        stock_quantity: 0,
        reorder_level: 0,
        bundle_units: 1,
        is_active: true,
        categories: [],
        brands: [],
        suppliers: [],
        description: ''
    });

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

                // If editing existing product, fetch product data
                if (id && id !== 'new') {
                    const productData = await loadProduct(id);
                    setFormData(prev => ({
                        ...prev,
                        ...productData,
                        categories: productData.categories[0]?.id || productData.categories || '',
                        brands: productData.brands[0]?.id || productData.brands || '',
                        suppliers: productData.suppliers || []
                    }));
                }
            } catch (err) {
                setError('Failed to fetch data');
                console.error('Error fetching data:', err);
            } finally {
                setLoading(false);
            }
        };

        if (id) {
            fetchData();
        }
    }, [id]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked :
                type === 'number' ? (value === '' ? '' : parseFloat(value)) :
                    value
        }));
    };

    const handleSupplierChange = (e) => {
        const selectedOptions = Array.from(e.target.selectedOptions, option =>
            suppliers.find(s => s.id == option.value)
        );
        setFormData(prev => ({ ...prev, suppliers: selectedOptions }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError('');
        setSuccess('');

        try {
            const productData = {
                ...formData,
                categories: formData.categories === "" ? [] : [parseInt(formData.categories)],
                brands: formData.brands === "" ? [] : [parseInt(formData.brands)],
                suppliers: formData.suppliers.length > 0 ? formData.suppliers.map(s => parseInt(s.id)) : [],
                description: formData.description === "" ? null : formData.description
            };
            const response = await saveProduct(id, productData);

            if (response.data?.id || response.data?.documentId) {
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
                        {id && id !== 'new' ? 'Edit Product' : 'Create New Product'}
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
                                    value={formData.name}
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
                                        value={formData.description}
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
                                        <div dangerouslySetInnerHTML={renderMarkdownPreview(formData.description)} />
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
                                    value={formData.sku}
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
                                    value={formData.barcode}
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
                                    value={formData.selling_price}
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
                                    value={formData.offer_price}
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
                                    value={formData.tax_rate}
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
                                    value={formData.stock_quantity}
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
                                    value={formData.reorder_level}
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
                                    value={formData.bundle_units}
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

                        {/* Category + Brand */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: 'black' }}>
                                    Category
                                </label>
                                <select
                                    name="categories"
                                    value={formData.categories}
                                    onChange={handleChange}
                                    style={{
                                        width: '100%',
                                        padding: '8px',
                                        border: '1px solid #ccc',
                                        borderRadius: '4px'
                                    }}
                                >
                                    <option value="">Select Category</option>
                                    {categories.map(cat => (
                                        <option key={cat.id} value={cat.id}>
                                            {cat.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: 'black' }}>
                                    Brand
                                </label>
                                <select
                                    name="brands"
                                    value={formData.brands}
                                    onChange={handleChange}
                                    style={{
                                        width: '100%',
                                        padding: '8px',
                                        border: '1px solid #ccc',
                                        borderRadius: '4px'
                                    }}
                                >
                                    <option value="">Select Brand</option>
                                    {brands.map(brand => (
                                        <option key={brand.id} value={brand.id}>
                                            {brand.name}
                                        </option>
                                    ))}
                                </select>
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
                                        checked={formData.is_active}
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
                                <select
                                    multiple
                                    value={formData.suppliers.map(s => s.id)}
                                    onChange={handleSupplierChange}
                                    style={{
                                        width: '100%',
                                        padding: '8px',
                                        border: '1px solid #ccc',
                                        borderRadius: '4px',
                                        height: '100px'
                                    }}
                                >
                                    {suppliers.map(supplier => (
                                        <option key={supplier.id} value={supplier.id}>
                                            {supplier.name} - {supplier.contact_person}
                                        </option>
                                    ))}
                                </select>
                                <small style={{ color: 'black' }}>Hold Ctrl/Cmd to select multiple suppliers</small>
                            </div>
                        </div>

                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: 'black' }}>
                                Product Images
                            </label>
                            <FileView multiple={true} />
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
                                {submitting ? 'Saving...' : (id && id !== 'new' ? 'Update Product' : 'Create Product')}
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