import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout';
import ProtectedRoute from '../../components/ProtectedRoute';
import { authApi, relationConnects } from '../../lib/api';
import { saveProduct } from '../../lib/pos/save';

export default function ProductVariantsPage() {
    const router = useRouter();
    const { id: documentId } = router.query;

    const [selectedProduct, setSelectedProduct] = useState(null);
    const [variants, setVariants] = useState([]);
    const [stockItems, setStockItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedItems, setSelectedItems] = useState(new Set());
    const [termTypes, setTermTypes] = useState([]);
    const [selectedTermTypeId, setSelectedTermTypeId] = useState('');
    const [termForms, setTermForms] = useState({});
    const [nameAffix, setNameAffix] = useState('suffix');
    const [variantBaseName, setVariantBaseName] = useState('');

    useEffect(() => {
        if (documentId) {
            loadProductDetails(documentId);
        }
    }, [documentId]);

    useEffect(() => {
        loadTermTypes();
    }, []);

    async function loadProductDetails(id) {
        setLoading(true);
        try {
            const res = await authApi.get(`/products/${id}`, { populate: { variants: { populate: ['terms'] }, items: true, terms: true } });
            const prod = res.data || res;
            setSelectedProduct(prod);
            setVariants(prod.variants || []);
            setVariantBaseName(prod?.name || '');

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

    async function loadTermTypes() {
        try {
            const res = await authApi.fetch('/term-types', {
                filters: { is_variant: true },
                populate: { terms: true },
                pagination: { page: 1, pageSize: 500 },
                sort: ['name:asc']
            });
            const types = res?.data ?? res;
            setTermTypes(types || []);
        } catch (err) {
            console.error('Failed to load term types', err);
        }
    }

    function buildVariantName(termName) {
        const baseName = variantBaseName || selectedProduct?.name || '';
        if (!termName) return baseName;
        if (!baseName) return termName;
        return nameAffix === 'prefix'
            ? `${termName} - ${baseName}`
            : `${baseName} - ${termName}`;
    }

    function getDefaultVariantForm() {
        return {
            sku: selectedProduct?.sku || '',
            barcode: selectedProduct?.barcode || '',
            selling_price: selectedProduct?.selling_price ?? 0,
            offer_price: selectedProduct?.offer_price ?? 0,
            is_active: selectedProduct?.is_active ?? true,
            move_count: 0
        };
    }

    function getTermForm(termId) {
        return termForms[termId] || getDefaultVariantForm();
    }

    function updateTermForm(termId, field, value) {
        setTermForms(prev => ({
            ...prev,
            [termId]: {
                ...getTermForm(termId),
                [field]: value
            }
        }));
    }

    async function handleCreateVariant(term) {
        if (!selectedProduct) return alert('Missing product');
        const selectedTermType = termTypes.find(t => (t.documentId || t.id) === selectedTermTypeId);
        if (!selectedTermType) return alert('Choose a term type');
        if (!term) return alert('Choose a term');
        const hasTermVariant = variants.some(v => (v.terms || []).some(t => (t.documentId || t.id) === (term.documentId || term.id)));
        if (hasTermVariant) return alert('Variant already exists for this term');
        const formValues = getTermForm(term.documentId || term.id);
        try {
            setLoading(true);
            const parentDocumentId = selectedProduct.documentId || selectedProduct.id;
            const name = buildVariantName(term.name);
            const payload = {
                sku: formValues.sku,
                barcode: formValues.barcode,
                selling_price: formValues.selling_price,
                offer_price: formValues.offer_price,
                is_active: formValues.is_active,
                name,
                parent: parentDocumentId,
                is_variant: true,
                ...relationConnects({ terms: [term] })
            };
            const response = await saveProduct('new', payload);
            const createdVariant = response?.data?.data ?? response?.data ?? response;
            const createdVariantId = createdVariant?.documentId || createdVariant?.id;
            const createdVariantName = createdVariant?.name || name;
            if (formValues.move_count > 0 && createdVariantId) {
                const itemsToMove = stockItems.slice(0, Math.min(formValues.move_count, stockItems.length));
                for (const item of itemsToMove) {
                    const itemId = item.documentId || item.id;
                    await authApi.put(`/stock-items/${itemId}`, { data: { product: { set: [createdVariantId] }, name: createdVariantName } });
                }
            }
            await loadProductDetails(parentDocumentId);
            setTermForms(prev => ({ ...prev, [term.documentId || term.id]: getDefaultVariantForm() }));
            alert('Variant created');
        } catch (err) {
            console.error('Failed to create variant', err);
            alert('Failed to create variant');
        } finally {
            setLoading(false);
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
            for (const id of ids) {
                await authApi.put(`/stock-items/${id}`, {
                    data: {
                        product: { set: [variant.documentId || variant.id] },
                        name: variant.name
                    }
                });
            }
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
                <div style={{ padding: 5 }}>
                    <h1>Variants for: {selectedProduct?.name}</h1>

                    {loading && <div className="alert alert-info">Loading...</div>}

                    <div className="row">
                        <div className="col-12">
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
                                    <div className="mb-3">
                                        <select
                                            className="form-select"
                                            value={selectedTermTypeId}
                                            onChange={(e) => setSelectedTermTypeId(e.target.value)}
                                            required
                                        >
                                            <option value="">Choose term type</option>
                                            {termTypes.map(tt => (
                                                <option key={tt.documentId || tt.id} value={tt.documentId || tt.id}>{tt.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="mb-3">
                                        <input
                                            className="form-control"
                                            value={variantBaseName}
                                            onChange={(e) => setVariantBaseName(e.target.value)}
                                            placeholder="Parent name"
                                        />
                                    </div>
                                    <div className="mb-3">
                                        <select
                                            className="form-select"
                                            value={nameAffix}
                                            onChange={(e) => setNameAffix(e.target.value)}
                                        >
                                            <option value="suffix">Append term to parent name</option>
                                            <option value="prefix">Prepend term to parent name</option>
                                        </select>
                                    </div>
                                    <div className="table-responsive">
                                        <table className="table table-sm align-middle">
                                            <thead>
                                                <tr>
                                                    <th>Term</th>
                                                    <th>Variant Name</th>
                                                    <th>SKU</th>
                                                    <th>Barcode</th>
                                                    <th>Selling</th>
                                                    <th>Offer</th>
                                                    <th>Move</th>
                                                    <th>Active</th>
                                                    <th></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(termTypes.find(tt => (tt.documentId || tt.id) === selectedTermTypeId)?.terms || []).map(term => {
                                                    const termId = term.documentId || term.id;
                                                    const formValues = getTermForm(termId);
                                                    return (
                                                        <tr key={termId}>
                                                            <td>{term.name}</td>
                                                            <td>
                                                                <input
                                                                    value={buildVariantName(term.name)}
                                                                    className="form-control form-control-sm"
                                                                    readOnly
                                                                />
                                                            </td>
                                                            <td>
                                                                <input
                                                                    value={formValues.sku}
                                                                    onChange={(e) => updateTermForm(termId, 'sku', e.target.value)}
                                                                    className="form-control form-control-sm"
                                                                    placeholder="SKU"
                                                                />
                                                            </td>
                                                            <td>
                                                                <input
                                                                    value={formValues.barcode}
                                                                    onChange={(e) => updateTermForm(termId, 'barcode', e.target.value)}
                                                                    className="form-control form-control-sm"
                                                                    placeholder="Barcode"
                                                                />
                                                            </td>
                                                            <td>
                                                                <input
                                                                    type="number"
                                                                    step="0.01"
                                                                    value={formValues.selling_price}
                                                                    onChange={(e) => updateTermForm(termId, 'selling_price', e.target.value)}
                                                                    className="form-control form-control-sm"
                                                                    placeholder="Selling"
                                                                />
                                                            </td>
                                                            <td>
                                                                <input
                                                                    type="number"
                                                                    step="0.01"
                                                                    value={formValues.offer_price}
                                                                    onChange={(e) => updateTermForm(termId, 'offer_price', e.target.value)}
                                                                    className="form-control form-control-sm"
                                                                    placeholder="Offer"
                                                                />
                                                            </td>
                                                            <td>
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    max={stockItems.length}
                                                                    value={formValues.move_count}
                                                                    onChange={(e) => updateTermForm(termId, 'move_count', Number(e.target.value))}
                                                                    className="form-control form-control-sm"
                                                                    placeholder="Count"
                                                                />
                                                            </td>
                                                            <td>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={formValues.is_active}
                                                                    onChange={(e) => updateTermForm(termId, 'is_active', e.target.checked)}
                                                                />
                                                            </td>
                                                            <td>
                                                                <button
                                                                    className="btn btn-sm btn-primary"
                                                                    type="button"
                                                                    onClick={() => handleCreateVariant(term)}
                                                                >
                                                                    Create
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                                {selectedTermTypeId && (termTypes.find(tt => (tt.documentId || tt.id) === selectedTermTypeId)?.terms || []).length === 0 && (
                                                    <tr>
                                                        <td colSpan="9" className="text-muted">No terms for this term type</td>
                                                    </tr>
                                                )}
                                                {!selectedTermTypeId && (
                                                    <tr>
                                                        <td colSpan="9" className="text-muted">Choose a term type to see terms</td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>
                   

                    <div className="row">
                        <div className="col-12">
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
                    <div>
                        <>
                            <button type="button" className="btn btn-outline-info ms-auto" onClick={() => router.push(`/${documentId}/product-edit`)}>
                                <i className="fas fa-fighter-jet me-1" /> Edit
                            </button>
                            <button type="button" className="btn btn-outline-info" onClick={() => router.push(`/stock-items?product=${documentId}`)}>
                                <i className="fas fa-boxes me-1" /> Stock Items
                            </button>
                            <button type="button" className="btn btn-outline-warning" onClick={() => router.push(`/${documentId}/product-stock-items?product=${documentId}`)}>
                                <i className="fas fa-boxes me-1" /> Stock Control
                            </button>
                        </>
                    </div>
                </div>
            </Layout>
        </ProtectedRoute>
    );
}
