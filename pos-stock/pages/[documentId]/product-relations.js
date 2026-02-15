import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '../../components/Layout';
import ProtectedRoute from '@rutba/pos-shared/components/ProtectedRoute';
import { authApi } from '@rutba/pos-shared/lib/api';
import { loadProduct } from '@rutba/pos-shared/lib/pos';
import { useUtil } from '@rutba/pos-shared/context/UtilContext';
import StrapiImage from '@rutba/pos-shared/components/StrapiImage';

export default function ProductRelationsPage() {
    const router = useRouter();
    const { documentId } = router.query;
    const { currency } = useUtil();

    const [product, setProduct] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Merge search
    const [mergeSearch, setMergeSearch] = useState('');
    const [mergeResults, setMergeResults] = useState([]);
    const [mergeSearchLoading, setMergeSearchLoading] = useState(false);
    const [mergeSelection, setMergeSelection] = useState(new Set());
    const [merging, setMerging] = useState(false);
    const [mergeLog, setMergeLog] = useState([]);

    // Options for merge
    const [transferItems, setTransferItems] = useState(true);
    const [transferPurchaseItems, setTransferPurchaseItems] = useState(true);
    const [transferRelations, setTransferRelations] = useState(true);
    const [deleteSource, setDeleteSource] = useState(false);

    function getEntryId(entry) {
        return entry?.documentId || entry?.id;
    }

    useEffect(() => {
        if (documentId && documentId !== 'new') {
            loadData();
        }
    }, [documentId]);

    async function loadData() {
        setLoading(true);
        try {
            const prod = await loadProduct(documentId);
            setProduct(prod);

            // Load stock items count
            const itemsRes = await authApi.fetch('/stock-items', {
                filters: { product: { documentId } },
                pagination: { page: 1, pageSize: 1 },
            });
            prod._stockItemsCount = itemsRes?.meta?.pagination?.total ?? 0;

            // Load purchase items count
            const purchaseItemsRes = await authApi.fetch('/purchase-items', {
                filters: { product: { documentId } },
                pagination: { page: 1, pageSize: 1 },
            });
            prod._purchaseItemsCount = purchaseItemsRes?.meta?.pagination?.total ?? 0;

            setProduct({ ...prod });
        } catch (err) {
            setError('Failed to load product data');
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    // Debounced merge search
    useEffect(() => {
        const searchValue = mergeSearch.trim();
        if (!searchValue || searchValue.length < 2) {
            setMergeResults([]);
            return;
        }

        let isActive = true;
        const timer = setTimeout(async () => {
            setMergeSearchLoading(true);
            try {
                const res = await authApi.fetch('/products', {
                    sort: ['name:asc'],
                    filters: {
                        documentId: { $ne: documentId },
                        $or: [
                            { name: { $containsi: searchValue } },
                            { sku: { $containsi: searchValue } },
                            { barcode: { $containsi: searchValue } },
                        ],
                    },
                    populate: { categories: true, brands: true, suppliers: true, terms: true, logo: true },
                    pagination: { page: 1, pageSize: 20 },
                });
                const data = res?.data ?? res;
                if (isActive) setMergeResults(data || []);
            } catch (err) {
                console.error('Merge search failed', err);
                if (isActive) setMergeResults([]);
            } finally {
                if (isActive) setMergeSearchLoading(false);
            }
        }, 300);

        return () => { isActive = false; clearTimeout(timer); };
    }, [mergeSearch, documentId]);

    function toggleMergeSelection(docId) {
        setMergeSelection(prev => {
            const next = new Set(prev);
            if (next.has(docId)) next.delete(docId);
            else next.add(docId);
            return next;
        });
    }

    async function handleMerge() {
        if (mergeSelection.size === 0) return alert('Select at least one product to merge');
        const sourceNames = mergeResults
            .filter(p => mergeSelection.has(getEntryId(p)))
            .map(p => p.name || p.sku || getEntryId(p))
            .join(', ');
        if (!confirm(`Merge ${mergeSelection.size} product(s) (${sourceNames}) into "${product?.name}"?\n\nThis will transfer stock items, purchase items, and relations to this product.`)) return;

        setMerging(true);
        setError('');
        setSuccess('');
        const log = [];

        try {
            for (const sourceDocId of mergeSelection) {
                const sourceProduct = mergeResults.find(p => getEntryId(p) === sourceDocId);
                const sourceName = sourceProduct?.name || sourceDocId;
                log.push(`--- Merging "${sourceName}" ---`);

                // 1) Transfer stock items
                if (transferItems) {
                    let page = 1;
                    let totalPages = 1;
                    let itemCount = 0;
                    do {
                        const res = await authApi.fetch('/stock-items', {
                            filters: { product: { documentId: sourceDocId } },
                            pagination: { page, pageSize: 100 },
                        });
                        const items = res?.data ?? res ?? [];
                        totalPages = res?.meta?.pagination?.pageCount || 1;
                        for (const item of items) {
                            await authApi.put(`/stock-items/${getEntryId(item)}`, {
                                data: { product: { connect: [documentId], disconnect: [sourceDocId] } },
                            });
                            itemCount++;
                        }
                        page++;
                    } while (page <= totalPages);
                    log.push(`  Transferred ${itemCount} stock item(s)`);
                }

                // 2) Transfer purchase items
                if (transferPurchaseItems) {
                    let page = 1;
                    let totalPages = 1;
                    let itemCount = 0;
                    do {
                        const res = await authApi.fetch('/purchase-items', {
                            filters: { product: { documentId: sourceDocId } },
                            pagination: { page, pageSize: 100 },
                        });
                        const items = res?.data ?? res ?? [];
                        totalPages = res?.meta?.pagination?.pageCount || 1;
                        for (const item of items) {
                            await authApi.put(`/purchase-items/${getEntryId(item)}`, {
                                data: { product: { connect: [documentId], disconnect: [sourceDocId] } },
                            });
                            itemCount++;
                        }
                        page++;
                    } while (page <= totalPages);
                    log.push(`  Transferred ${itemCount} purchase item(s)`);
                }

                // 3) Transfer relations (categories, brands, suppliers, terms)
                if (transferRelations && sourceProduct) {
                    const sourceCategories = (sourceProduct.categories || []).map(c => getEntryId(c)).filter(Boolean);
                    const sourceBrands = (sourceProduct.brands || []).map(b => getEntryId(b)).filter(Boolean);
                    const sourceSuppliers = (sourceProduct.suppliers || []).map(s => getEntryId(s)).filter(Boolean);
                    const sourceTerms = (sourceProduct.terms || []).map(t => getEntryId(t)).filter(Boolean);

                    const relPayload = {};
                    if (sourceCategories.length) relPayload.categories = { connect: sourceCategories };
                    if (sourceBrands.length) relPayload.brands = { connect: sourceBrands };
                    if (sourceSuppliers.length) relPayload.suppliers = { connect: sourceSuppliers };
                    if (sourceTerms.length) relPayload.terms = { connect: sourceTerms };

                    if (Object.keys(relPayload).length > 0) {
                        await authApi.put(`/products/${documentId}`, { data: relPayload });
                        log.push(`  Transferred relations: ${Object.keys(relPayload).join(', ')}`);
                    }
                }

                // 4) Transfer variants (child products)
                const variantsRes = await authApi.fetch('/products', {
                    filters: { parent: { documentId: sourceDocId } },
                    pagination: { page: 1, pageSize: 500 },
                });
                const variants = variantsRes?.data ?? variantsRes ?? [];
                if (variants.length > 0) {
                    for (const variant of variants) {
                        await authApi.put(`/products/${getEntryId(variant)}`, {
                            data: { parent: { connect: [documentId], disconnect: [sourceDocId] } },
                        });
                    }
                    log.push(`  Transferred ${variants.length} variant(s)`);
                }

                // 5) Optionally delete source product
                if (deleteSource) {
                    await authApi.del(`/products/${sourceDocId}`);
                    log.push(`  Deleted source product "${sourceName}"`);
                } else {
                    log.push(`  Source product "${sourceName}" kept (not deleted)`);
                }
            }

            setMergeLog(log);
            setMergeSelection(new Set());
            setMergeSearch('');
            setMergeResults([]);
            setSuccess(`Merge complete — ${mergeSelection.size} product(s) merged into "${product?.name}".`);
            await loadData();
        } catch (err) {
            console.error('Merge failed', err);
            log.push(`ERROR: ${err.message || 'Merge failed'}`);
            setMergeLog(log);
            setError('Merge failed. Check the log below for details.');
        } finally {
            setMerging(false);
        }
    }

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
                    {/* Page navigation */}
                    <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
                        <Link href={`/${documentId}/product-edit`} className="btn btn-outline-secondary btn-sm">
                            <i className="fas fa-edit me-1" /> Edit
                        </Link>
                        <Link href={`/${documentId}/product-stock-items`} className="btn btn-outline-secondary btn-sm">
                            <i className="fas fa-boxes me-1" /> Stock Control
                        </Link>
                        <Link href={`/${documentId}/product-variants`} className="btn btn-outline-secondary btn-sm">
                            <i className="fas fa-layer-group me-1" /> Variants
                        </Link>
                        <Link href={`/stock-items?product=${documentId}`} className="btn btn-outline-secondary btn-sm">
                            <i className="fas fa-barcode me-1" /> Stock Items
                        </Link>
                        <span className="btn btn-primary btn-sm">
                            <i className="fas fa-compress-arrows-alt me-1" /> Relations &amp; Merge
                        </span>
                        <Link href="/products" className="btn btn-outline-dark btn-sm ms-auto">
                            <i className="fas fa-arrow-left me-1" /> Products
                        </Link>
                    </div>

                    <h2 className="mb-3">
                        <i className="fas fa-compress-arrows-alt me-2" />
                        Relations &amp; Merge: {product?.name || '...'}
                    </h2>

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

                    <div className="row">
                        {/* Left column: Current product overview */}
                        <div className="col-lg-4">
                            <div className="card mb-3">
                                <div className="card-body">
                                    <h5 className="card-title">Current Product</h5>
                                    <div className="d-flex gap-3 mb-3">
                                        {product?.logo && (
                                            <StrapiImage media={product.logo} format="thumbnail" maxWidth={80} maxHeight={80} />
                                        )}
                                        <div>
                                            <strong>{product?.name}</strong>
                                            <div className="small text-muted">SKU: {product?.sku || '—'}</div>
                                            <div className="small text-muted">Barcode: {product?.barcode || '—'}</div>
                                            <div className="small text-muted">Price: {currency}{parseFloat(product?.selling_price || 0).toFixed(2)}</div>
                                        </div>
                                    </div>
                                    <dl className="mb-0 small">
                                        <dt className="text-muted">Stock Items</dt>
                                        <dd>{product?._stockItemsCount ?? '—'}</dd>
                                        <dt className="text-muted">Purchase Items</dt>
                                        <dd>{product?._purchaseItemsCount ?? '—'}</dd>
                                        <dt className="text-muted">Categories</dt>
                                        <dd>{(product?.categories || []).map(c => c.name).join(', ') || '—'}</dd>
                                        <dt className="text-muted">Brands</dt>
                                        <dd>{(product?.brands || []).map(b => b.name).join(', ') || '—'}</dd>
                                        <dt className="text-muted">Suppliers</dt>
                                        <dd>{(product?.suppliers || []).map(s => s.name).join(', ') || '—'}</dd>
                                        <dt className="text-muted">Terms</dt>
                                        <dd>{(product?.terms || []).map(t => t.name).join(', ') || '—'}</dd>
                                    </dl>
                                </div>
                            </div>

                            {/* Merge options */}
                            <div className="card mb-3">
                                <div className="card-body">
                                    <h5 className="card-title">Merge Options</h5>
                                    <div className="form-check mb-2">
                                        <input className="form-check-input" type="checkbox" id="opt-items" checked={transferItems} onChange={e => setTransferItems(e.target.checked)} />
                                        <label className="form-check-label" htmlFor="opt-items">Transfer stock items</label>
                                    </div>
                                    <div className="form-check mb-2">
                                        <input className="form-check-input" type="checkbox" id="opt-purchase" checked={transferPurchaseItems} onChange={e => setTransferPurchaseItems(e.target.checked)} />
                                        <label className="form-check-label" htmlFor="opt-purchase">Transfer purchase items</label>
                                    </div>
                                    <div className="form-check mb-2">
                                        <input className="form-check-input" type="checkbox" id="opt-relations" checked={transferRelations} onChange={e => setTransferRelations(e.target.checked)} />
                                        <label className="form-check-label" htmlFor="opt-relations">Transfer relations (categories, brands, suppliers, terms)</label>
                                    </div>
                                    <div className="form-check mb-2">
                                        <input className="form-check-input" type="checkbox" id="opt-delete" checked={deleteSource} onChange={e => setDeleteSource(e.target.checked)} />
                                        <label className="form-check-label text-danger" htmlFor="opt-delete">Delete source product(s) after merge</label>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Right column: Merge search & selection */}
                        <div className="col-lg-8">
                            <div className="card mb-3">
                                <div className="card-body">
                                    <h5 className="card-title">
                                        Merge Products Into &quot;{product?.name}&quot;
                                        {mergeSelection.size > 0 && (
                                            <span className="badge bg-primary ms-2">{mergeSelection.size} selected</span>
                                        )}
                                    </h5>
                                    <p className="text-muted small mb-2">
                                        Search for products to merge. Their stock items, purchase items, variants and relations will be transferred to this product.
                                    </p>

                                    <input
                                        className="form-control mb-3"
                                        placeholder="Search by name, SKU, or barcode..."
                                        value={mergeSearch}
                                        onChange={e => setMergeSearch(e.target.value)}
                                        disabled={merging}
                                    />

                                    {mergeSearchLoading && <div className="text-muted small mb-2">Searching...</div>}

                                    {mergeSearch.trim().length >= 2 && !mergeSearchLoading && (
                                        <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                                            <table className="table table-sm table-hover mb-0">
                                                <thead className="table-light">
                                                    <tr>
                                                        <th style={{ width: 40 }}></th>
                                                        <th>Product</th>
                                                        <th>SKU</th>
                                                        <th>Barcode</th>
                                                        <th>Price</th>
                                                        <th>Categories</th>
                                                        <th>Brands</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {mergeResults.map(p => {
                                                        const pId = getEntryId(p);
                                                        const isSelected = mergeSelection.has(pId);
                                                        return (
                                                            <tr key={pId} className={isSelected ? 'table-warning' : ''}>
                                                                <td>
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={isSelected}
                                                                        onChange={() => toggleMergeSelection(pId)}
                                                                    />
                                                                </td>
                                                                <td>
                                                                    <div className="d-flex align-items-center gap-2">
                                                                        {p.logo && <StrapiImage media={p.logo} format="thumbnail" maxWidth={32} maxHeight={32} />}
                                                                        <span>{p.name || '—'}</span>
                                                                    </div>
                                                                </td>
                                                                <td><code>{p.sku || '—'}</code></td>
                                                                <td><code className="small">{p.barcode || '—'}</code></td>
                                                                <td>{currency}{parseFloat(p.selling_price || 0).toFixed(2)}</td>
                                                                <td className="small">{(p.categories || []).map(c => c.name).join(', ') || '—'}</td>
                                                                <td className="small">{(p.brands || []).map(b => b.name).join(', ') || '—'}</td>
                                                            </tr>
                                                        );
                                                    })}
                                                    {mergeResults.length === 0 && (
                                                        <tr><td colSpan={7} className="text-muted text-center">No products found.</td></tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}

                                    {mergeSelection.size > 0 && (
                                        <div className="d-flex justify-content-between align-items-center mt-3 pt-3 border-top">
                                            <div>
                                                <strong>{mergeSelection.size}</strong> product(s) selected to merge
                                                {deleteSource && <span className="badge bg-danger ms-2">Will delete sources</span>}
                                            </div>
                                            <button
                                                type="button"
                                                className="btn btn-danger"
                                                onClick={handleMerge}
                                                disabled={merging}
                                            >
                                                {merging ? (
                                                    <>
                                                        <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true" />
                                                        Merging...
                                                    </>
                                                ) : (
                                                    <>
                                                        <i className="fas fa-compress-arrows-alt me-1" />
                                                        Merge {mergeSelection.size} into &quot;{product?.name}&quot;
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Merge log */}
                            {mergeLog.length > 0 && (
                                <div className="card mb-3">
                                    <div className="card-body">
                                        <div className="d-flex justify-content-between align-items-center mb-2">
                                            <h5 className="card-title mb-0">Merge Log</h5>
                                            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setMergeLog([])}>
                                                Clear
                                            </button>
                                        </div>
                                        <pre className="bg-light p-3 mb-0 small" style={{ maxHeight: 300, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
                                            {mergeLog.join('\n')}
                                        </pre>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </Layout>
        </ProtectedRoute>
    );
}

export async function getServerSideProps() { return { props: {} }; }
