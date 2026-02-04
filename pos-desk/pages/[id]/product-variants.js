import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout';
import ProtectedRoute from '../../components/ProtectedRoute';
import { authApi } from '../../lib/api';
import { saveProduct } from '../../lib/pos/save';

export default function ProductVariantsPage() {
    const router = useRouter();
    const { id: documentId } = router.query;

    const [selectedProduct, setSelectedProduct] = useState(null);
    const [variants, setVariants] = useState([]);
    const [stockItems, setStockItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedItems, setSelectedItems] = useState(new Set());

    const [variantForm, setVariantForm] = useState({ name: '', sku: '', barcode: '', selling_price: 0, offer_price: 0, is_active: true });

    useEffect(() => {
        if (documentId) {
            loadProductDetails(documentId);
        }
    }, [documentId]);

    async function loadProductDetails(id) {
        setLoading(true);
        try {
            const res = await authApi.get(`/products/${id}`, { populate: { variants: true, items: true } });
            const prod = res.data || res;
            setSelectedProduct(prod);
            setVariants(prod.variants || []);

            const itemsRes = await authApi.fetch('/stock-items', {
                filters: { product: { documentId: id } },
                pagination: { page: 1, pageSize: 500 },
                sort: ['createdAt:desc']
            });
            const items = itemsRes?.data ?? itemsRes;
            setStockItems(items || []);
            setSelectedItems(new Set());
        } catch (err) {
            console.error('Failed to load product details', err);
        } finally {
            setLoading(false);
        }
    }

    function handleVariantFormChange(e) {
        const { name, value, type, checked } = e.target;
        setVariantForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    }

    async function handleCreateVariant(e) {
        e.preventDefault();
        if (!selectedProduct) return alert('Missing product');
        try {
            const parentDocumentId = selectedProduct.documentId || selectedProduct.id;
            const payload = {
                ...variantForm,
                parent: parentDocumentId,
                is_variant: true
            };
            await saveProduct('new', payload);
            await loadProductDetails(parentDocumentId);
            setVariantForm({ name: '', sku: '', barcode: '', selling_price: 0, offer_price: 0, is_active: true });
            alert('Variant created');
        } catch (err) {
            console.error('Failed to create variant', err);
            alert('Failed to create variant');
        }
    }

    function toggleSelectItem(itemId) {
        setSelectedItems(prev => {
            const s = new Set(prev);
            if (s.has(itemId)) s.delete(itemId); else s.add(itemId);
            return s;
        });
    }

    function selectAllVisible() {
        if (selectedItems.size === stockItems.length) {
            setSelectedItems(new Set());
        } else {
            setSelectedItems(new Set(stockItems.map(i => i.documentId || i.id)));
        }
    }

    async function moveSelectedToVariant(variant) {
        if (!variant) return alert('Choose a variant');
        if (selectedItems.size === 0) return alert('Select stock items to move');
        setLoading(true);
        try {
            const ids = Array.from(selectedItems);
            await Promise.all(ids.map(id => authApi.put(`/stock-items/${id}`, { data: { product: variant.documentId || variant.id, name: variant.name } })));
            alert(`Moved ${ids.length} items to variant ${variant.name}`);
            const parentId = selectedProduct.documentId || selectedProduct.id;
            await loadProductDetails(parentId);
        } catch (err) {
            console.error('Failed to move stock items', err);
            alert('Failed to move stock items');
        } finally {
            setLoading(false);
        }
    }

    return (
        <ProtectedRoute>
            <Layout>
                <div style={{ padding: 10 }}>
                    <h1>Variants for: {selectedProduct?.name}</h1>

                    <div className="row">
                        <div className="col-md-6">
                            <div className="card mb-3">
                                <div className="card-body">
                                    <h5>Variants</h5>
                                    <ul className="list-group mb-2">
                                        {variants.map(v => (
                                            <li key={v.id} className="list-group-item d-flex justify-content-between align-items-center">
                                                <div>
                                                    <strong>{v.name}</strong>
                                                    <div className="small text-muted">SKU: {v.sku} • Barcode: {v.barcode}</div>
                                                </div>
                                            </li>
                                        ))}
                                        {variants.length === 0 && <li className="list-group-item">No variants yet</li>}
                                    </ul>

                                    <form onSubmit={handleCreateVariant}>
                                        <div className="mb-2">
                                            <input name="name" value={variantForm.name} onChange={handleVariantFormChange} className="form-control" placeholder="Variant name (eg. Red / Size L)" required />
                                        </div>
                                        <div className="mb-2 d-flex gap-2">
                                            <input name="sku" value={variantForm.sku} onChange={handleVariantFormChange} className="form-control" placeholder="SKU" />
                                            <input name="barcode" value={variantForm.barcode} onChange={handleVariantFormChange} className="form-control" placeholder="Barcode" />
                                        </div>
                                        <div className="mb-2 d-flex gap-2">
                                            <input name="selling_price" type="number" step="0.01" value={variantForm.selling_price} onChange={handleVariantFormChange} className="form-control" placeholder="Selling price" />
                                            <input name="offer_price" type="number" step="0.01" value={variantForm.offer_price} onChange={handleVariantFormChange} className="form-control" placeholder="Offer price" />
                                        </div>
                                        <div className="mb-2 d-flex gap-2 align-items-center">
                                            <input name="is_active" type="checkbox" checked={variantForm.is_active} onChange={handleVariantFormChange} /> <label className="small mb-0 ms-2">Active</label>
                                        </div>
                                        <div className="d-flex gap-2">
                                            <button className="btn btn-primary" type="submit">Create Variant</button>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        </div>

                        <div className="col-md-6">
                            <div className="card mb-3">
                                <div className="card-body">
                                    <h5>Parent Stock Items</h5>
                                    <div className="mb-2 d-flex justify-content-between align-items-center">
                                        <div>
                                            <button className="btn btn-sm btn-outline-primary me-2" onClick={selectAllVisible} type="button">{selectedItems.size === stockItems.length ? 'Unselect All' : 'Select All'}</button>
                                        </div>
                                        <div>
                                            <select id="variantMoveSelect" className="form-select form-select-sm" style={{ display: 'inline-block', width: '220px' }}>
                                                <option value="">Choose variant to move to...</option>
                                                {variants.map(v => <option key={v.id} value={v.documentId || v.id}>{v.name}</option>)}
                                            </select>
                                            <button className="btn btn-sm btn-success ms-2" onClick={() => {
                                                const sel = document.getElementById('variantMoveSelect');
                                                const val = sel?.value;
                                                if (!val) return alert('Choose a variant');
                                                const variant = variants.find(v => (v.documentId || v.id) == val);
                                                moveSelectedToVariant(variant);
                                            }} type="button">Move Selected</button>
                                        </div>
                                    </div>

                                    <div style={{ maxHeight: '360px', overflowY: 'auto' }}>
                                        <ul className="list-group">
                                            {stockItems.map(item => {
                                                const id = item.documentId || item.id;
                                                return (
                                                    <li className="list-group-item d-flex justify-content-between align-items-center" key={id}>
                                                        <div>
                                                            <div><strong>{item.sku || item.name || 'Stock'}</strong> <span className="small text-muted">({item.barcode || 'No barcode'})</span></div>
                                                            <div className="small text-muted">Status: {item.status}</div>
                                                        </div>
                                                        <div>
                                                            <input type="checkbox" checked={selectedItems.has(id)} onChange={() => toggleSelectItem(id)} />
                                                        </div>
                                                    </li>
                                                );
                                            })}
                                            {stockItems.length === 0 && <li className="list-group-item">No stock items for this product</li>}
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </Layout>
        </ProtectedRoute>
    );
}
