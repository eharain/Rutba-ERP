import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '../../components/Layout';
import ProtectedRoute from '@rutba/pos-shared/components/ProtectedRoute';
import { StockItemsEndpoints, PurchaseItemsEndpoints, ProductsEndpoints } from '@rutba/api-provider/endpoints/index.js';
import { loadProduct } from '@rutba/api-provider/pos';
import { useUtil } from '@rutba/pos-shared/context/UtilContext';
import StrapiImage from '@rutba/pos-shared/components/StrapiImage';
import ProductPageShell, { buildStockProductTabs } from '@rutba/pos-shared/components/product/ProductPageShell';

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
    const [mergeSearchError, setMergeSearchError] = useState('');
    const [mergeSelection, setMergeSelection] = useState(new Set());
    const [merging, setMerging] = useState(false);
    const [mergeLog, setMergeLog] = useState([]);

    // Variants of THIS product (the inverse merge — collapse selected variants
    // back into the parent). Uses the same transfer-steps engine as the
    // search-based merge, just with sourceDocId=variant / targetDocId=this.
    const [variants, setVariants] = useState([]);
    const [variantSelection, setVariantSelection] = useState(new Set());
    const [mergingVariants, setMergingVariants] = useState(false);

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
            const itemsRes = await StockItemsEndpoints.byProduct(documentId, { pageSize: 1 });
            prod._stockItemsCount = itemsRes?.meta?.pagination?.total ?? 0;

            // Load purchase items count
            const purchaseItemsRes = await PurchaseItemsEndpoints.byProduct(documentId, { pageSize: 1 });
            prod._purchaseItemsCount = purchaseItemsRes?.meta?.pagination?.total ?? 0;

            setProduct({ ...prod });

            // Load variants of this product so the "Merge variants into parent"
            // section can list them. Populate categorisation refs so transfer
            // can copy them onto the parent without an extra round-trip.
            const variantsRes = await ProductsEndpoints.byParent(documentId, {
                pageSize: 100,
                populate: { categories: true, brands: true, suppliers: true, terms: true, logo: true },
            });
            setVariants(variantsRes?.data ?? variantsRes ?? []);
        } catch (err) {
            setError('Failed to load product data');
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    function toggleVariantSelection(docId) {
        setVariantSelection(prev => {
            const next = new Set(prev);
            if (next.has(docId)) next.delete(docId);
            else next.add(docId);
            return next;
        });
    }

    // Run the same transfer pipeline as handleMerge, but with the current
    // product as the target and each selected variant as a source. Always
    // deletes the variant rows on success (a variant merged back into its
    // parent has no remaining meaning).
    async function handleMergeVariants() {
        if (variantSelection.size === 0) return alert('Select at least one variant to merge');
        const sourceNames = variants
            .filter(v => variantSelection.has(getEntryId(v)))
            .map(v => v.name || v.sku || getEntryId(v))
            .join(', ');
        if (!confirm(`Merge ${variantSelection.size} variant(s) (${sourceNames}) back into parent "${product?.name}"?\n\nStock items, purchase items, and terms will move to the parent; the variant rows will be deleted.`)) return;

        setMergingVariants(true);
        setError('');
        setSuccess('');
        const log = [];

        try {
            for (const sourceDocId of variantSelection) {
                const sourceVariant = variants.find(v => getEntryId(v) === sourceDocId);
                const sourceName = sourceVariant?.name || sourceDocId;
                log.push(`--- Merging variant "${sourceName}" into parent ---`);

                // 1) Transfer stock items to parent
                if (transferItems) {
                    let page = 1;
                    let totalPages = 1;
                    let itemCount = 0;
                    do {
                        const res = await StockItemsEndpoints.byProduct(sourceDocId, { page, pageSize: 100 });
                        const items = res?.data ?? res ?? [];
                        totalPages = res?.meta?.pagination?.pageCount || 1;
                        for (const item of items) {
                            await StockItemsEndpoints.update(getEntryId(item), {
                                product: { connect: [documentId], disconnect: [sourceDocId] },
                                name: product?.name,
                            });
                            itemCount++;
                        }
                        page++;
                    } while (page <= totalPages);
                    log.push(`  Transferred ${itemCount} stock item(s)`);
                }

                // 2) Transfer purchase items to parent
                if (transferPurchaseItems) {
                    let page = 1;
                    let totalPages = 1;
                    let itemCount = 0;
                    do {
                        const res = await PurchaseItemsEndpoints.byProduct(sourceDocId, { page, pageSize: 100 });
                        const items = res?.data ?? res ?? [];
                        totalPages = res?.meta?.pagination?.pageCount || 1;
                        for (const item of items) {
                            await PurchaseItemsEndpoints.update(getEntryId(item), {
                                product: { connect: [documentId], disconnect: [sourceDocId] },
                            });
                            itemCount++;
                        }
                        page++;
                    } while (page <= totalPages);
                    log.push(`  Transferred ${itemCount} purchase item(s)`);
                }

                // 3) Copy categorisation onto parent (best-effort)
                if (transferRelations && sourceVariant) {
                    const srcCategories = (sourceVariant.categories || []).map(c => getEntryId(c)).filter(Boolean);
                    const srcBrands = (sourceVariant.brands || []).map(b => getEntryId(b)).filter(Boolean);
                    const srcSuppliers = (sourceVariant.suppliers || []).map(s => getEntryId(s)).filter(Boolean);
                    const srcTerms = (sourceVariant.terms || []).map(t => getEntryId(t)).filter(Boolean);

                    const relPayload = {};
                    if (srcCategories.length) relPayload.categories = { connect: srcCategories };
                    if (srcBrands.length) relPayload.brands = { connect: srcBrands };
                    if (srcSuppliers.length) relPayload.suppliers = { connect: srcSuppliers };
                    if (srcTerms.length) relPayload.terms = { connect: srcTerms };

                    if (Object.keys(relPayload).length > 0) {
                        await ProductsEndpoints.update(documentId, relPayload);
                        log.push(`  Copied relations: ${Object.keys(relPayload).join(', ')}`);
                    }
                }

                // 4) Delete the variant. Unlike the search-based merge (where
                //    deleteSource is optional), collapsing a variant back into
                //    its parent has no use-case for keeping the variant row.
                await ProductsEndpoints.del(sourceDocId);
                log.push(`  Deleted variant "${sourceName}"`);
            }

            setMergeLog(log);
            setVariantSelection(new Set());
            setSuccess(`Merge complete — ${variantSelection.size} variant(s) merged back into "${product?.name}".`);
            await loadData();
        } catch (err) {
            console.error('Variant merge failed', err);
            setError('Variant merge failed: ' + (err.message || 'Unknown error'));
            setMergeLog(log);
        } finally {
            setMergingVariants(false);
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
            setMergeSearchError('');
            try {
                // search takes (searchText, page, pageSize) — exclude current
                // product on the client since the API has no excludeDocId param.
                const res = await ProductsEndpoints.search(searchValue, 1, 20);
                const data = Array.isArray(res) ? res : (res?.data ?? []);
                const filtered = data.filter(p => getEntryId(p) !== documentId);
                if (isActive) setMergeResults(filtered);
            } catch (err) {
                console.error('Merge search failed', err);
                if (isActive) {
                    setMergeResults([]);
                    const status = err?.response?.status;
                    const reason = err?.response?.data?.error?.message || err?.message || 'Unknown error';
                    setMergeSearchError(status ? `Search failed (HTTP ${status}): ${reason}` : `Search failed: ${reason}`);
                }
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
                        const res = await StockItemsEndpoints.byProduct(sourceDocId, { page, pageSize: 100 });
                        const items = res?.data ?? res ?? [];
                        totalPages = res?.meta?.pagination?.pageCount || 1;
                        for (const item of items) {
                            await StockItemsEndpoints.update(getEntryId(item), {
                                product: { connect: [documentId], disconnect: [sourceDocId] },
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
                        const res = await PurchaseItemsEndpoints.byProduct(sourceDocId, { page, pageSize: 100 });
                        const items = res?.data ?? res ?? [];
                        totalPages = res?.meta?.pagination?.pageCount || 1;
                        for (const item of items) {
                            await PurchaseItemsEndpoints.update(getEntryId(item), {
                                product: { connect: [documentId], disconnect: [sourceDocId] },
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
                        await ProductsEndpoints.update(documentId, relPayload);
                        log.push(`  Transferred relations: ${Object.keys(relPayload).join(', ')}`);
                    }
                }

                // 4) Transfer variants (child products)
                const variantsRes = await ProductsEndpoints.byParent(sourceDocId);
                const variants = variantsRes?.data ?? variantsRes ?? [];
                if (variants.length > 0) {
                    for (const variant of variants) {
                        await ProductsEndpoints.update(getEntryId(variant), {
                            parent: { connect: [documentId], disconnect: [sourceDocId] },
                        });
                    }
                    log.push(`  Transferred ${variants.length} variant(s)`);
                }

                // 5) Optionally delete source product
                if (deleteSource) {
                    await ProductsEndpoints.del(sourceDocId);
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

    const statusPill = product?.is_active === false
        ? <span className="badge bg-secondary">Inactive</span>
        : product ? <span className="badge bg-success">Active</span> : null;

    return (
        <ProtectedRoute>
            <Layout>
                <ProductPageShell
                    product={product}
                    backHref="/products"
                    tabs={buildStockProductTabs({ documentId })}
                    currentTab="relations"
                    statusPill={statusPill}
                    alert={{
                        error,
                        success,
                        onDismissError: () => setError(''),
                        onDismissSuccess: () => setSuccess(''),
                    }}
                >

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

                        {/* Right column: variant collapse + product merge */}
                        <div className="col-lg-8">
                            {/* Merge variants into parent — the inverse of the search-based merge.
                                Lists this product's variants; selected ones are absorbed back into
                                the parent and their rows deleted. */}
                            {variants.length > 0 && (
                                <div className="card mb-3 border-warning">
                                    <div className="card-body">
                                        <h5 className="card-title">
                                            <i className="fas fa-compress me-2 text-warning" />
                                            Merge Variants Into Parent
                                            {variantSelection.size > 0 && (
                                                <span className="badge bg-warning text-dark ms-2">{variantSelection.size} selected</span>
                                            )}
                                        </h5>
                                        <p className="text-muted small mb-3">
                                            Collapse a variant back into this parent product. Stock items and
                                            purchase items move to the parent; the variant row is deleted.
                                            Useful when a variant was created in error or is no longer needed.
                                            The Merge Options on the left control which data transfers.
                                        </p>
                                        <div className="table-responsive">
                                            <table className="table table-sm align-middle">
                                                <thead className="table-light">
                                                    <tr>
                                                        <th style={{ width: 30 }}>
                                                            <input
                                                                type="checkbox"
                                                                checked={variantSelection.size > 0 && variantSelection.size === variants.length}
                                                                onChange={() => {
                                                                    if (variantSelection.size === variants.length) {
                                                                        setVariantSelection(new Set());
                                                                    } else {
                                                                        setVariantSelection(new Set(variants.map(getEntryId)));
                                                                    }
                                                                }}
                                                            />
                                                        </th>
                                                        <th>Variant</th>
                                                        <th>SKU</th>
                                                        <th>Barcode</th>
                                                        <th className="text-end">Selling</th>
                                                        <th>Terms</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {variants.map(v => {
                                                        const vId = getEntryId(v);
                                                        return (
                                                            <tr key={vId}>
                                                                <td>
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={variantSelection.has(vId)}
                                                                        onChange={() => toggleVariantSelection(vId)}
                                                                    />
                                                                </td>
                                                                <td>
                                                                    <strong>{v.name || '—'}</strong>
                                                                </td>
                                                                <td className="small">{v.sku || '—'}</td>
                                                                <td className="small">{v.barcode || '—'}</td>
                                                                <td className="text-end small">{currency}{parseFloat(v.selling_price || 0).toFixed(2)}</td>
                                                                <td className="small">{(v.terms || []).map(t => t.name).join(', ') || '—'}</td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                        <div className="d-flex justify-content-end">
                                            <button
                                                type="button"
                                                className="btn btn-warning"
                                                onClick={handleMergeVariants}
                                                disabled={mergingVariants || variantSelection.size === 0}
                                            >
                                                {mergingVariants ? (
                                                    <><span className="spinner-border spinner-border-sm me-1" />Merging…</>
                                                ) : (
                                                    <><i className="fas fa-compress me-1" />Merge {variantSelection.size || ''} variant(s) into parent</>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="card mb-3">
                                <div className="card-body">
                                    <h5 className="card-title">
                                        Merge Other Products Into &quot;{product?.name}&quot;
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
                                    {mergeSearchError && (
                                        <div className="alert alert-warning py-2 small mb-2">
                                            <i className="fas fa-exclamation-triangle me-1" />{mergeSearchError}
                                        </div>
                                    )}

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
                </ProductPageShell>
            </Layout>
        </ProtectedRoute>
    );
}

