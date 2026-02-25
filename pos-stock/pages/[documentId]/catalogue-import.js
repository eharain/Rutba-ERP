import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '../../components/Layout';
import ProtectedRoute from '@rutba/pos-shared/components/ProtectedRoute';
import { authApi, relationConnects } from '@rutba/pos-shared/lib/api';
import { saveProduct } from '@rutba/pos-shared/lib/pos/save';

function getEntryId(entry) {
    return entry?.documentId || entry?.id;
}

/**
 * Render a single PDF page to a canvas, then return a Blob (PNG).
 */
async function renderPageToBlob(pdfDoc, pageNum, scale = 1.5) {
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    return new Promise((resolve) => {
        canvas.toBlob((blob) => resolve(blob), 'image/png');
    });
}

/**
 * Render a page to a data URL for preview thumbnails.
 */
async function renderPageToDataUrl(pdfDoc, pageNum, scale = 0.5) {
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas.toDataURL('image/png');
}

export default function CatalogueImportPage() {
    const router = useRouter();
    const { documentId } = router.query;
    const fileInputRef = useRef(null);

    const [product, setProduct] = useState(null);
    const [variants, setVariants] = useState([]);
    const [termTypes, setTermTypes] = useState([]);
    const [selectedTermTypeId, setSelectedTermTypeId] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // PDF state
    const [pdfDoc, setPdfDoc] = useState(null);
    const [pdfFileName, setPdfFileName] = useState('');
    const [pages, setPages] = useState([]);
    const [parsing, setParsing] = useState(false);

    // Creation config
    const [nameAffix, setNameAffix] = useState('suffix');
    const [baseName, setBaseName] = useState('');
    const [creating, setCreating] = useState(false);
    const [uploadScale, setUploadScale] = useState(2);

    useEffect(() => {
        if (documentId) loadProduct(documentId);
    }, [documentId]);

    useEffect(() => {
        loadTermTypes();
    }, []);

    useEffect(() => {
        if (success || error) {
            const timer = setTimeout(() => { setSuccess(''); setError(''); }, 6000);
            return () => clearTimeout(timer);
        }
    }, [success, error]);

    async function loadProduct(id) {
        setLoading(true);
        try {
            const res = await authApi.get(`/products/${id}`, {
                populate: { variants: { populate: ['terms'] }, terms: true }
            });
            const prod = res.data || res;
            setProduct(prod);
            setVariants(prod.variants || []);
            setBaseName(prod?.name || '');
        } catch (err) {
            console.error('Failed to load product', err);
            setError('Failed to load product');
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
            setTermTypes(res?.data ?? res ?? []);
        } catch (err) {
            console.error('Failed to load term types', err);
        }
    }

    function buildName(pageName) {
        const base = baseName || product?.name || '';
        if (!pageName) return base;
        if (!base) return pageName;
        return nameAffix === 'prefix'
            ? `${pageName} - ${base}`
            : `${base} - ${pageName}`;
    }

    async function handlePdfUpload(e) {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.type !== 'application/pdf') {
            setError('Please select a PDF file');
            return;
        }
        setParsing(true);
        setError('');
        setPages([]);
        setPdfDoc(null);
        setPdfFileName(file.name);

        try {
            const pdfjsLib = await import('pdfjs-dist');
            pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

            const arrayBuffer = await file.arrayBuffer();
            const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            setPdfDoc(doc);

            const pageList = [];
            for (let i = 1; i <= doc.numPages; i++) {
                const thumbUrl = await renderPageToDataUrl(doc, i, 0.4);
                pageList.push({
                    pageNum: i,
                    thumbUrl,
                    selected: true,
                    name: `Page ${i}`,
                    sku: product?.sku || '',
                    barcode: '',
                    selling_price: product?.selling_price ?? 0,
                    offer_price: product?.offer_price ?? 0,
                    is_active: true,
                    termId: '',
                    status: '',
                });
            }
            setPages(pageList);
            setSuccess(`Loaded ${doc.numPages} page(s) from "${file.name}"`);
        } catch (err) {
            console.error('PDF parse failed', err);
            setError('Failed to parse PDF: ' + (err.message || 'Unknown error'));
        } finally {
            setParsing(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    }

    function updatePage(index, field, value) {
        setPages(prev => prev.map((p, i) => i === index ? { ...p, [field]: value } : p));
    }

    function togglePage(index) {
        setPages(prev => prev.map((p, i) => i === index ? { ...p, selected: !p.selected } : p));
    }

    function toggleAllPages() {
        const allSelected = pages.every(p => p.selected);
        setPages(prev => prev.map(p => ({ ...p, selected: !allSelected })));
    }

    function autoAssignTerms() {
        const termType = termTypes.find(t => getEntryId(t) === selectedTermTypeId);
        if (!termType) return setError('Select a term type first');
        const terms = termType.terms || [];
        if (terms.length === 0) return setError('No terms in this term type');
        setPages(prev => prev.map((p, i) => {
            const term = terms[i % terms.length];
            return term ? {
                ...p,
                termId: getEntryId(term),
                name: term.name
            } : p;
        }));
        setSuccess(`Auto-assigned ${terms.length} term(s) across ${pages.length} page(s)`);
    }

    const selectedPages = pages.filter(p => p.selected);
    const selectedTermType = termTypes.find(t => getEntryId(t) === selectedTermTypeId);
    const availableTerms = selectedTermType?.terms || [];

    async function handleCreateVariants() {
        if (!product) return setError('Product not loaded');
        if (selectedPages.length === 0) return setError('Select at least one page');
        if (!pdfDoc) return setError('No PDF loaded');
        if (!confirm(`Create ${selectedPages.length} variant(s) from PDF pages?\n\nEach page image will be uploaded as the variant logo.`)) return;

        setCreating(true);
        let created = 0;
        try {
            const parentDocumentId = getEntryId(product);

            for (let i = 0; i < pages.length; i++) {
                const page = pages[i];
                if (!page.selected) continue;

                const variantName = buildName(page.name);

                // Check if variant with same name already exists
                const exists = variants.some(v => v.name === variantName);
                if (exists) {
                    updatePage(i, 'status', 'duplicate');
                    continue;
                }

                try {
                    // Build variant payload
                    const payload = {
                        name: variantName,
                        sku: page.sku || undefined,
                        barcode: page.barcode || undefined,
                        selling_price: page.selling_price,
                        offer_price: page.offer_price,
                        is_active: page.is_active,
                        parent: parentDocumentId,
                        is_variant: true,
                    };

                    // Connect term if selected
                    if (page.termId) {
                        const term = availableTerms.find(t => getEntryId(t) === page.termId);
                        if (term) {
                            Object.assign(payload, relationConnects({ terms: [term] }));
                        }
                    }

                    // Create the variant product
                    const response = await saveProduct('new', payload);
                    const createdVariant = response?.data?.data ?? response?.data ?? response;
                    const createdVariantId = getEntryId(createdVariant);
                    // Strapi upload requires the numeric id, not the documentId string
                    const createdVariantNumericId = createdVariant?.id;

                    if (createdVariantId) {
                        // Render the page at upload quality and upload as logo
                        if (createdVariantNumericId) {
                            try {
                                const blob = await renderPageToBlob(pdfDoc, page.pageNum, uploadScale);
                                const imageFile = new File(
                                    [blob],
                                    `${variantName.replace(/[^a-zA-Z0-9-_ ]/g, '')}-page${page.pageNum}.png`,
                                    { type: 'image/png' }
                                );
                                await authApi.uploadFile(
                                    [imageFile],
                                    'product',
                                    'logo',
                                    createdVariantNumericId,
                                    { name: variantName, alt: variantName, caption: `Page ${page.pageNum} from ${pdfFileName}` }
                                );
                            } catch (uploadErr) {
                                console.error(`Image upload failed for page ${page.pageNum}`, uploadErr);
                                // Variant was created, just logo upload failed — continue
                            }
                        }
                    }

                    updatePage(i, 'status', 'created');
                    created++;
                } catch (err) {
                    console.error(`Failed to create variant for page ${page.pageNum}`, err);
                    updatePage(i, 'status', 'error');
                }
            }

            await loadProduct(parentDocumentId);
            setSuccess(`Created ${created} variant(s) from catalogue`);
        } catch (err) {
            console.error('Catalogue import failed', err);
            setError('Catalogue import failed: ' + (err.message || 'Unknown error'));
        } finally {
            setCreating(false);
        }
    }

    async function handleCreateSingleVariant(index) {
        const page = pages[index];
        if (!page || !product || !pdfDoc) return;
        const variantName = buildName(page.name);

        setCreating(true);
        try {
            const parentDocumentId = getEntryId(product);
            const payload = {
                name: variantName,
                sku: page.sku || undefined,
                barcode: page.barcode || undefined,
                selling_price: page.selling_price,
                offer_price: page.offer_price,
                is_active: page.is_active,
                parent: parentDocumentId,
                is_variant: true,
            };

            if (page.termId) {
                const term = availableTerms.find(t => getEntryId(t) === page.termId);
                if (term) Object.assign(payload, relationConnects({ terms: [term] }));
            }

            const response = await saveProduct('new', payload);
            const createdVariant = response?.data?.data ?? response?.data ?? response;
            const createdVariantId = getEntryId(createdVariant);
            // Strapi upload requires the numeric id, not the documentId string
            const createdVariantNumericId = createdVariant?.id;

            if (createdVariantId && createdVariantNumericId) {
                try {
                    const blob = await renderPageToBlob(pdfDoc, page.pageNum, uploadScale);
                    const imageFile = new File(
                        [blob],
                        `${variantName.replace(/[^a-zA-Z0-9-_ ]/g, '')}-page${page.pageNum}.png`,
                        { type: 'image/png' }
                    );
                    await authApi.uploadFile(
                        [imageFile],
                        'product',
                        'logo',
                        createdVariantNumericId,
                        { name: variantName, alt: variantName, caption: `Page ${page.pageNum} from ${pdfFileName}` }
                    );
                } catch (uploadErr) {
                    console.error(`Image upload failed for page ${page.pageNum}`, uploadErr);
                }
            }

            updatePage(index, 'status', 'created');
            await loadProduct(parentDocumentId);
            setSuccess(`Variant "${variantName}" created`);
        } catch (err) {
            console.error('Failed to create variant', err);
            updatePage(index, 'status', 'error');
            setError('Failed to create variant');
        } finally {
            setCreating(false);
        }
    }

    function clearPdf() {
        setPages([]);
        setPdfDoc(null);
        setPdfFileName('');
        if (fileInputRef.current) fileInputRef.current.value = '';
    }

    return (
        <ProtectedRoute>
            <Layout>
                <div style={{ padding: 5 }}>
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
                        <span className="btn btn-primary btn-sm">
                            <i className="fas fa-file-pdf me-1" /> Catalogue Import
                        </span>
                        <Link href={`/stock-items?product=${documentId}`} className="btn btn-outline-secondary btn-sm">
                            <i className="fas fa-barcode me-1" /> Stock Items
                        </Link>
                        <Link href={`/${documentId}/product-relations`} className="btn btn-outline-secondary btn-sm">
                            <i className="fas fa-compress-arrows-alt me-1" /> Relations &amp; Merge
                        </Link>
                        <Link href="/products" className="btn btn-outline-dark btn-sm ms-auto">
                            <i className="fas fa-arrow-left me-1" /> Products
                        </Link>
                    </div>

                    <h5 className="mb-3">
                        <i className="fas fa-file-pdf me-2" />
                        Catalogue Import: {product?.name}
                        {variants.length > 0 && <span className="badge bg-secondary ms-2">{variants.length} existing variant(s)</span>}
                    </h5>

                    {error && <div className="alert alert-danger alert-dismissible py-2">{error}<button type="button" className="btn-close" onClick={() => setError('')} /></div>}
                    {success && <div className="alert alert-success alert-dismissible py-2">{success}<button type="button" className="btn-close" onClick={() => setSuccess('')} /></div>}
                    {loading && <div className="alert alert-info py-2"><i className="fas fa-spinner fa-spin me-2" />Loading...</div>}

                    {/* Upload & Configuration */}
                    <div className="card mb-3">
                        <div className="card-header py-2">
                            <h6 className="mb-0"><i className="fas fa-upload me-2" />Upload PDF Catalogue</h6>
                        </div>
                        <div className="card-body">
                            <div className="row g-3 align-items-end">
                                <div className="col-md-4">
                                    <label className="form-label small fw-bold mb-1">PDF File</label>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        className="form-control form-control-sm"
                                        accept=".pdf"
                                        onChange={handlePdfUpload}
                                        disabled={parsing || creating}
                                    />
                                    {parsing && <div className="text-muted small mt-1"><i className="fas fa-spinner fa-spin me-1" />Parsing PDF pages...</div>}
                                    {pdfFileName && !parsing && <div className="small mt-1"><i className="fas fa-file-pdf text-danger me-1" />{pdfFileName} — {pages.length} page(s)</div>}
                                </div>
                                <div className="col-md-3">
                                    <label className="form-label small fw-bold mb-1">Base Name</label>
                                    <input
                                        className="form-control form-control-sm"
                                        value={baseName}
                                        onChange={(e) => setBaseName(e.target.value)}
                                        placeholder="Product name"
                                    />
                                </div>
                                <div className="col-md-2">
                                    <label className="form-label small fw-bold mb-1">Naming</label>
                                    <select className="form-select form-select-sm" value={nameAffix} onChange={(e) => setNameAffix(e.target.value)}>
                                        <option value="suffix">Base - Page</option>
                                        <option value="prefix">Page - Base</option>
                                    </select>
                                </div>
                                <div className="col-md-3">
                                    <label className="form-label small fw-bold mb-1">Image Quality</label>
                                    <select className="form-select form-select-sm" value={uploadScale} onChange={(e) => setUploadScale(Number(e.target.value))}>
                                        <option value={1}>Low (1x — fast)</option>
                                        <option value={1.5}>Medium (1.5x)</option>
                                        <option value={2}>High (2x — default)</option>
                                        <option value={3}>Very High (3x — slow)</option>
                                    </select>
                                </div>
                            </div>

                            {pages.length > 0 && (
                                <div className="row g-3 mt-1 align-items-end">
                                    <div className="col-md-4">
                                        <label className="form-label small fw-bold mb-1">Term Type (optional)</label>
                                        <select
                                            className="form-select form-select-sm"
                                            value={selectedTermTypeId}
                                            onChange={(e) => setSelectedTermTypeId(e.target.value)}
                                        >
                                            <option value="">No term type</option>
                                            {termTypes.map(tt => (
                                                <option key={getEntryId(tt)} value={getEntryId(tt)}>{tt.name} ({(tt.terms || []).length})</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="col-auto">
                                        {selectedTermTypeId && (
                                            <button className="btn btn-outline-info btn-sm" type="button" onClick={autoAssignTerms} disabled={creating}>
                                                <i className="fas fa-magic me-1" />Auto-assign Terms
                                            </button>
                                        )}
                                    </div>
                                    <div className="col-auto ms-auto d-flex gap-2">
                                        <button className="btn btn-outline-secondary btn-sm" type="button" onClick={toggleAllPages} disabled={creating}>
                                            {pages.every(p => p.selected) ? 'Unselect All' : 'Select All'}
                                        </button>
                                        <button className="btn btn-outline-danger btn-sm" type="button" onClick={clearPdf} disabled={creating}>
                                            <i className="fas fa-times me-1" />Clear
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Page-by-page variant mapping */}
                    {pages.length > 0 && (
                        <div className="card mb-3">
                            <div className="card-header d-flex justify-content-between align-items-center py-2">
                                <h6 className="mb-0">
                                    <i className="fas fa-images me-2" />
                                    Pages ({selectedPages.length} of {pages.length} selected)
                                </h6>
                                <button
                                    className="btn btn-success btn-sm"
                                    type="button"
                                    onClick={handleCreateVariants}
                                    disabled={creating || selectedPages.length === 0}
                                >
                                    {creating
                                        ? <><i className="fas fa-spinner fa-spin me-1" />Creating...</>
                                        : <><i className="fas fa-bolt me-1" />Create All Selected ({selectedPages.length})</>}
                                </button>
                            </div>
                            <div className="card-body p-0">
                                <div className="row g-0">
                                    {pages.map((page, i) => {
                                        const variantName = buildName(page.name);
                                        const statusBadge = page.status === 'created'
                                            ? <span className="badge bg-success"><i className="fas fa-check me-1" />Created</span>
                                            : page.status === 'error'
                                                ? <span className="badge bg-danger"><i className="fas fa-times me-1" />Error</span>
                                                : page.status === 'duplicate'
                                                    ? <span className="badge bg-warning text-dark">Duplicate</span>
                                                    : null;

                                        return (
                                            <div key={page.pageNum} className="col-12 col-md-6 col-xl-4">
                                                <div className={`border m-2 rounded ${page.selected ? '' : 'opacity-50'} ${page.status === 'created' ? 'border-success' : page.status === 'error' ? 'border-danger' : ''}`}>
                                                    {/* Thumbnail + checkbox */}
                                                    <div className="d-flex align-items-start p-2 gap-2">
                                                        <div className="flex-shrink-0">
                                                            <input
                                                                type="checkbox"
                                                                className="form-check-input me-1"
                                                                checked={page.selected}
                                                                onChange={() => togglePage(i)}
                                                                disabled={creating || page.status === 'created'}
                                                            />
                                                        </div>
                                                        <div className="flex-shrink-0" style={{ width: '100px' }}>
                                                            {page.thumbUrl && (
                                                                <img
                                                                    src={page.thumbUrl}
                                                                    alt={`Page ${page.pageNum}`}
                                                                    className="img-fluid border rounded"
                                                                    style={{ maxHeight: '140px', objectFit: 'contain', background: '#f8f9fa' }}
                                                                />
                                                            )}
                                                            <div className="text-center small text-muted mt-1">Page {page.pageNum}</div>
                                                        </div>
                                                        <div className="flex-grow-1">
                                                            <div className="d-flex justify-content-between align-items-center mb-1">
                                                                <span className="small fw-bold text-truncate" style={{ maxWidth: '180px' }}>{variantName}</span>
                                                                {statusBadge}
                                                            </div>
                                                            <div className="mb-1">
                                                                <input
                                                                    className="form-control form-control-sm"
                                                                    value={page.name}
                                                                    onChange={(e) => updatePage(i, 'name', e.target.value)}
                                                                    placeholder="Variant page name"
                                                                    disabled={creating || page.status === 'created'}
                                                                />
                                                            </div>
                                                            <div className="row g-1 mb-1">
                                                                <div className="col-6">
                                                                    <input
                                                                        className="form-control form-control-sm"
                                                                        value={page.sku}
                                                                        onChange={(e) => updatePage(i, 'sku', e.target.value)}
                                                                        placeholder="SKU"
                                                                        disabled={creating || page.status === 'created'}
                                                                    />
                                                                </div>
                                                                <div className="col-6">
                                                                    <input
                                                                        className="form-control form-control-sm"
                                                                        value={page.barcode}
                                                                        onChange={(e) => updatePage(i, 'barcode', e.target.value)}
                                                                        placeholder="Barcode"
                                                                        disabled={creating || page.status === 'created'}
                                                                    />
                                                                </div>
                                                            </div>
                                                            <div className="row g-1 mb-1">
                                                                <div className="col-6">
                                                                    <input
                                                                        type="number"
                                                                        step="0.01"
                                                                        className="form-control form-control-sm"
                                                                        value={page.selling_price}
                                                                        onChange={(e) => updatePage(i, 'selling_price', e.target.value)}
                                                                        placeholder="Selling"
                                                                        disabled={creating || page.status === 'created'}
                                                                    />
                                                                </div>
                                                                <div className="col-6">
                                                                    <input
                                                                        type="number"
                                                                        step="0.01"
                                                                        className="form-control form-control-sm"
                                                                        value={page.offer_price}
                                                                        onChange={(e) => updatePage(i, 'offer_price', e.target.value)}
                                                                        placeholder="Offer"
                                                                        disabled={creating || page.status === 'created'}
                                                                    />
                                                                </div>
                                                            </div>
                                                            <div className="row g-1 align-items-center">
                                                                <div className="col">
                                                                    {availableTerms.length > 0 && (
                                                                        <select
                                                                            className="form-select form-select-sm"
                                                                            value={page.termId}
                                                                            onChange={(e) => updatePage(i, 'termId', e.target.value)}
                                                                            disabled={creating || page.status === 'created'}
                                                                        >
                                                                            <option value="">No term</option>
                                                                            {availableTerms.map(t => (
                                                                                <option key={getEntryId(t)} value={getEntryId(t)}>{t.name}</option>
                                                                            ))}
                                                                        </select>
                                                                    )}
                                                                </div>
                                                                <div className="col-auto">
                                                                    <button
                                                                        className="btn btn-sm btn-primary"
                                                                        type="button"
                                                                        onClick={() => handleCreateSingleVariant(i)}
                                                                        disabled={creating || page.status === 'created'}
                                                                        title="Create this variant"
                                                                    >
                                                                        {page.status === 'created' ? <i className="fas fa-check" /> : <i className="fas fa-plus" />}
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Empty state */}
                    {pages.length === 0 && !parsing && (
                        <div className="card mb-3">
                            <div className="card-body text-center py-5 text-muted">
                                <i className="fas fa-file-pdf fa-3x mb-3 d-block" />
                                <h6>Upload a PDF product catalogue</h6>
                                <p className="small mb-0">
                                    Each page will be extracted as a thumbnail image.<br />
                                    You can then assign names, terms, and details to create product variants with the page image attached as the logo.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Existing Variants summary */}
                    {variants.length > 0 && (
                        <div className="card mb-3">
                            <div className="card-header py-2 d-flex justify-content-between align-items-center">
                                <h6 className="mb-0"><i className="fas fa-layer-group me-2" />Existing Variants ({variants.length})</h6>
                                <Link href={`/${documentId}/product-variants`} className="btn btn-outline-primary btn-sm">
                                    <i className="fas fa-arrow-right me-1" />Manage Variants
                                </Link>
                            </div>
                            <div className="card-body p-0">
                                <div className="table-responsive">
                                    <table className="table table-sm table-hover align-middle mb-0">
                                        <thead className="table-light">
                                            <tr>
                                                <th>Name</th>
                                                <th>Terms</th>
                                                <th>SKU</th>
                                                <th className="text-center">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {variants.map(v => (
                                                <tr key={getEntryId(v)}>
                                                    <td><strong>{v.name}</strong></td>
                                                    <td>
                                                        {(v.terms || []).map(t => (
                                                            <span key={getEntryId(t)} className="badge bg-light text-dark border me-1">{t.name}</span>
                                                        ))}
                                                        {(v.terms || []).length === 0 && <span className="text-muted">—</span>}
                                                    </td>
                                                    <td className="small">{v.sku || '—'}</td>
                                                    <td className="text-center">
                                                        {v.is_active !== false
                                                            ? <span className="badge bg-success">Active</span>
                                                            : <span className="badge bg-warning text-dark">Inactive</span>}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </Layout>
        </ProtectedRoute>
    );
}

export async function getServerSideProps() { return { props: {} }; }
