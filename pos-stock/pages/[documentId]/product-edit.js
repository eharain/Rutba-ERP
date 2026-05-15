import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout';
import ProtectedRoute from '@rutba/pos-shared/components/ProtectedRoute';
import ProductPageShell, { buildStockProductTabs } from '@rutba/pos-shared/components/product/ProductPageShell';
import { StockHelpersEndpoints, CategoriesEndpoints, BrandsEndpoints, SuppliersEndpoints, ProductsEndpoints, StockItemsEndpoints, TermsEndpoints, fetchProducts, saveProduct, loadProduct } from '@rutba/api-provider/endpoints';

import { useUtil } from '@rutba/pos-shared/context/UtilContext';
import FileView from '@rutba/pos-shared/components/FileView';
import MarkdownEditor from '@rutba/pos-shared/components/MarkdownEditor';
import { MultiSelect } from 'primereact/multiselect';

export default function ProductEditPage() {
    const router = useRouter();
    const { documentId } = router.query;
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
    const [dirty, setDirty] = useState(false);

    // The page is now mounted from three top-level shell tabs (details,
    // categorization, media) — each navigates to /product-edit?tab=X. We
    // read the active section from the URL instead of internal nav-pills.
    const tabParam = Array.isArray(router.query.tab) ? router.query.tab[0] : router.query.tab;
    const activeTab = tabParam && ['details', 'categorization', 'media'].includes(tabParam)
        ? tabParam
        : 'details';

    async function fetchAllRecords(epBuilder) {
        let allRecords = [];
        let page = 1;
        let totalPages = 1;
        do {
            const response = await epBuilder(page);
            const { data, meta } = response;
            allRecords = [...allRecords, ...(data || [])];
            totalPages = meta?.pagination?.pageCount || 1;
            page++;
        } while (page <= totalPages);
        return allRecords;
    }

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                const [categoriesRes, brandsRes, suppliersRes, termsRes, productsRes] = await Promise.all([
                    CategoriesEndpoints.listAll({ pageSize: 100 }),
                    BrandsEndpoints.listAll({ pageSize: 100 }),
                    SuppliersEndpoints.listAll({ pageSize: 100 }),
                    TermsEndpoints.list({ pageSize: 100 }),
                    ProductsEndpoints.list(1, 100, { sort: 'name:asc' }),
                ]);
                const unwrap = (r) => r?.data || r || [];
                setCategories(unwrap(categoriesRes));
                setBrands(unwrap(brandsRes));
                setSuppliers(unwrap(suppliersRes));
                setTerms(unwrap(termsRes));
                setProducts(unwrap(productsRes).filter(p => p.documentId !== documentId));

                if (documentId && documentId !== 'new') {
                    const productData = await loadProduct(documentId);
                    setProductId(productData.id);

                    // Load stock_quantity as the count of Received + InStock stock items
                    try {
                        const siRes = await StockItemsEndpoints.listByProduct(documentId, { pageSize: 1 });
                        productData.stock_quantity = siRes.meta?.pagination?.total || 0;
                    } catch (_) {
                        // keep whatever value came from the product
                    }

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
        setDirty(true);
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
                ...StockHelpersEndpoints.relationConnects({
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
            delete payload.owners;
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

    const doSave = async () => {
        setSubmitting(true);
        setError('');
        setSuccess('');
        try {
            const payload = {
                ...product,
                ...StockHelpersEndpoints.relationConnects({
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
            delete payload.owners;
            delete payload.branches;
            delete payload.variants;

            const response = await saveProduct(documentId, payload);
            if (response.data?.documentId) {
                setSuccess('Product saved successfully!');
                setDirty(false);
                if (documentId === 'new') {
                    setTimeout(() => router.push(`/${response.data.documentId}/product-edit`), 1500);
                }
                return true;
            } else {
                setError('Failed to save product');
                return false;
            }
        } catch (err) {
            setError('An error occurred while saving the product');
            console.error('Error saving product:', err);
            return false;
        } finally {
            setSubmitting(false);
        }
    };

    const saveAndNavigate = async (href) => {
        if (dirty) {
            const saved = await doSave();
            if (!saved) return;
        }
        router.push(href);
    };

    const isEdit = documentId && documentId !== 'new';

    const categoryOptions = categories.map(c => ({ label: c.name ?? '', value: c }));
    const brandOptions = brands.map(b => ({ label: b.name ?? '', value: b }));
    const supplierOptions = suppliers.map(s => ({ label: (s.name ?? '') + (s.contact_person ? ' – ' + s.contact_person : ''), value: s }));
    const termOptions = terms.map(t => ({ label: t.name ?? '', value: t }));
    const parentOptions = [{ label: '— None —', value: null }, ...products.map(p => ({ label: p.name ?? p.sku ?? p.documentId, value: p }))];

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

    const statusPill = isEdit ? (
        product.is_active === false
            ? <span className="badge bg-secondary">Inactive</span>
            : <span className="badge bg-success">Active</span>
    ) : null;

    const headerActions = (
        <>
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => router.push('/products')}>
                Cancel
            </button>
            <button type="submit" form="product-edit-form" className="btn btn-primary btn-sm" disabled={submitting}>
                {submitting ? (
                    <><span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true" />Saving…</>
                ) : (
                    <><i className="fas fa-save me-1" />{isEdit ? 'Save' : 'Create'}</>
                )}
            </button>
        </>
    );

    return (
        <ProtectedRoute>
            <Layout>
                <ProductPageShell
                    product={isEdit ? product : null}
                    isNew={!isEdit}
                    backHref="/products"
                    titleOverride={isEdit ? undefined : 'New Product'}
                    tabs={isEdit ? buildStockProductTabs({
                        documentId,
                        onNavigate: saveAndNavigate,
                    }) : []}
                    currentTab={activeTab}
                    statusPill={statusPill}
                    actions={headerActions}
                    alert={{
                        error,
                        success,
                        onDismissError: () => setError(''),
                        onDismissSuccess: () => setSuccess(''),
                    }}
                >
                    <form id="product-edit-form" onSubmit={handleSubmit}>
                        {/* The three sections below are surfaced as separate top-level shell
                            tabs (Details / Categorization / Media). The URL ?tab= drives which
                            one renders, so there is no second nav-pill strip here. */}

                        {/* ---- DETAILS TAB (identity + flags + content) ----
                            Barcode and Supplier Code live on the Stock tab — they're stock-side
                            identifiers, not content-side. Pricing fields are also stock-side. */}
                        {activeTab === 'details' && (
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
                                        <div className="col-12">
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
                                        <div className="col-md-3">
                                            <div className="form-check mt-2">
                                                <input className="form-check-input" type="checkbox"
                                                    name="is_active" id="is_active"
                                                    checked={product.is_active ?? true} onChange={handleChange} />
                                                <label className="form-check-label" htmlFor="is_active">Product is active</label>
                                            </div>
                                        </div>
                                        <div className="col-md-3">
                                            <div className="form-check mt-2">
                                                <input className="form-check-input" type="checkbox"
                                                    name="is_variant" id="is_variant"
                                                    checked={product.is_variant ?? false} onChange={handleChange} />
                                                <label className="form-check-label" htmlFor="is_variant">Is a variant</label>
                                            </div>
                                        </div>
                                        <div className="col-md-3">
                                            <div className="form-check mt-2">
                                                <input className="form-check-input" type="checkbox"
                                                    name="is_returnable" id="is_returnable"
                                                    checked={product.is_returnable ?? true} onChange={handleChange} />
                                                <label className="form-check-label" htmlFor="is_returnable">
                                                    <i className="fas fa-undo me-1 text-muted" />Returnable
                                                </label>
                                            </div>
                                        </div>
                                        <div className="col-md-3">
                                            <div className="form-check mt-2">
                                                <input className="form-check-input" type="checkbox"
                                                    name="is_exchangeable" id="is_exchangeable"
                                                    checked={product.is_exchangeable ?? true} onChange={handleChange} />
                                                <label className="form-check-label" htmlFor="is_exchangeable">
                                                    <i className="fas fa-exchange-alt me-1 text-muted" />Exchangeable
                                                </label>
                                            </div>
                                        </div>
                                        <div className="col-12 mt-3">
                                            <label className="form-label fw-bold">Summary (Markdown)</label>
                                            <MarkdownEditor
                                                name="summary"
                                                value={product.summary ?? ''}
                                                onChange={handleChange}
                                                rows={6}
                                                placeholder="Write a short product summary..."
                                            />
                                        </div>
                                        <div className="col-12">
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
                            </div>
                        )}

                        {/* ---- RELATIONS TAB ---- */}
                        {activeTab === 'categorization' && (
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
                                                refDocumentId={documentId}
                                                refDraft
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
                                                refDocumentId={documentId}
                                                refDraft
                                                field="gallery"
                                                name={product.name}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                    </form>
                </ProductPageShell>
            </Layout>
        </ProtectedRoute>
    );
}


