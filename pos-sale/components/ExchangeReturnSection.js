import { useEffect, useRef, useState } from 'react';
import { useUtil } from '@rutba/pos-shared/context/UtilContext';
import { fetchSaleByIdOrInvoice } from '@rutba/pos-shared/lib/pos';

const RETURN_STATUSES = ['Returned', 'ReturnedDamaged', 'Damaged', 'InStock'];
const DAMAGED_STATUSES = ['Damaged', 'ReturnedDamaged'];

function getEntryId(entry) {
    return entry?.documentId || entry?.id;
}

function getEffectiveUnitPrice(saleItem, stockItem) {
    if (saleItem.total && saleItem.quantity) {
        return Number(saleItem.total) / Number(saleItem.quantity);
    }
    return Number(saleItem.price) || Number(stockItem?.selling_price) || 0;
}

export default function ExchangeReturnSection({ saleModel, onUpdate, disabled = false }) {
    const { currency } = useUtil();
    const scanInputRef = useRef(null);

    const [scanValue, setScanValue] = useState('');
    const [originalSales, setOriginalSales] = useState(() => {
        return saleModel.exchangeReturns
            ?.filter(er => er.sale)
            .map(er => er.sale) || [];
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [returnItems, setReturnItems] = useState(() => {
        return saleModel.exchangeReturns?.flatMap(er => er.returnItems || []) || [];
    });
    const initialized = useRef(false);
    const prevModelRef = useRef(saleModel);

    // Re-sync local state when saleModel is replaced (e.g. after reload)
    useEffect(() => {
        if (prevModelRef.current === saleModel) return;
        prevModelRef.current = saleModel;
        const ers = saleModel.exchangeReturns || [];
        setOriginalSales(ers.filter(er => er.sale).map(er => er.sale));
        setReturnItems(ers.flatMap(er => er.returnItems || []));
        initialized.current = true; // already in sync, skip next sync effect
    }, [saleModel]);

    // Sync returnItems to saleModel (skip the initial mount to preserve hydrated data)
    useEffect(() => {
        if (!initialized.current) {
            initialized.current = true;
            return;
        }
        if (disabled) return;

        // Preserve already-persisted exchange returns (those with a returnNo)
        const persisted = (saleModel.exchangeReturns || []).filter(er => er.returnNo);

        // Build new (unpersisted) entries from the local returnItems state
        const newEntries = [];
        if (originalSales.length > 0 && returnItems.length > 0) {
            for (const sale of originalSales) {
                const saleDocId = getEntryId(sale);
                // Skip sales whose returns are already persisted
                if (persisted.some(er => getEntryId(er.sale) === saleDocId)) continue;
                const saleReturnItems = returnItems.filter(r => r.sourceSaleDocId === saleDocId);
                if (saleReturnItems.length > 0) {
                    newEntries.push({ sale, returnItems: saleReturnItems });
                }
            }
        }

        // Replace model state: persisted + new
        saleModel.exchangeReturns = [...persisted];
        for (const entry of newEntries) {
            saleModel.setExchangeReturn(entry.sale, entry.returnItems);
        }

        onUpdate();
    }, [returnItems, originalSales]);

    async function handleScan(e) {
        if (e.key !== 'Enter') return;
        const value = scanValue.trim();
        if (!value) return;
        setError('');
        setLoading(true);
        try {
            const saleData = await fetchSaleByIdOrInvoice(value);
            if (!saleData) {
                setError(`No sale found for "${value}"`);
                return;
            }
            const saleDocId = getEntryId(saleData);
            // Check if this sale is already scanned
            if (originalSales.some(s => getEntryId(s) === saleDocId)) {
                setError(`Invoice "${saleData.invoice_no}" is already added.`);
                return;
            }
            setOriginalSales(prev => [...prev, saleData]);
        } catch (err) {
            console.error('Failed to load sale', err);
            setError('Failed to load sale.');
        } finally {
            setLoading(false);
            setScanValue('');
        }
    }

    function removeSale(saleDocId) {
        setOriginalSales(prev => prev.filter(s => getEntryId(s) !== saleDocId));
        setReturnItems(prev => prev.filter(r => r.sourceSaleDocId !== saleDocId));
    }

    function toggleStockItem(saleItem, stockItem, sourceSale) {
        const product = saleItem.product;
        if (product && product.is_exchangeable === false) return;

        const stockDocId = getEntryId(stockItem);
        setReturnItems(prev => {
            const exists = prev.find(r => r.stockItemDocId === stockDocId);
            if (exists) return prev.filter(r => r.stockItemDocId !== stockDocId);
            const unitPrice = getEffectiveUnitPrice(saleItem, stockItem);
            return [...prev, {
                sourceSaleDocId: getEntryId(sourceSale),
                saleItemDocId: getEntryId(saleItem),
                saleItemId: saleItem.id,
                stockItemDocId: stockDocId,
                stockItemId: stockItem.id,
                productDocId: getEntryId(saleItem.product),
                productName: saleItem.product?.name || stockItem.name || 'N/A',
                sku: stockItem.sku || saleItem.product?.sku || '',
                barcode: stockItem.barcode || '',
                price: unitPrice,
                refundPrice: unitPrice,
                status: 'Returned'
            }];
        });
    }

    function selectAllFromSaleItem(saleItem, sourceSale) {
        const product = saleItem.product;
        if (product && product.is_exchangeable === false) return;
        const stockItems = saleItem.items || [];
        const eligibleItems = stockItems.filter(si => si.status === 'Sold');
        const allSelected = eligibleItems.every(si =>
            returnItems.some(r => r.stockItemDocId === getEntryId(si))
        );

        if (allSelected) {
            const stockDocIds = new Set(eligibleItems.map(si => getEntryId(si)));
            setReturnItems(prev => prev.filter(r => !stockDocIds.has(r.stockItemDocId)));
        } else {
            setReturnItems(prev => {
                const existing = new Set(prev.map(r => r.stockItemDocId));
                const newEntries = eligibleItems
                    .filter(si => !existing.has(getEntryId(si)))
                    .map(si => {
                        const unitPrice = getEffectiveUnitPrice(saleItem, si);
                        return {
                            sourceSaleDocId: getEntryId(sourceSale),
                            saleItemDocId: getEntryId(saleItem),
                            saleItemId: saleItem.id,
                            stockItemDocId: getEntryId(si),
                            stockItemId: si.id,
                            productDocId: getEntryId(saleItem.product),
                            productName: saleItem.product?.name || si.name || 'N/A',
                            sku: si.sku || saleItem.product?.sku || '',
                            barcode: si.barcode || '',
                            price: unitPrice,
                            refundPrice: unitPrice,
                            status: 'Returned'
                        };
                    });
                return [...prev, ...newEntries];
            });
        }
    }

    function setItemReturnStatus(stockDocId, status) {
        setReturnItems(prev =>
            prev.map(r => {
                if (r.stockItemDocId !== stockDocId) return r;
                const refundPrice = DAMAGED_STATUSES.includes(status) ? r.refundPrice : r.price;
                return { ...r, status, refundPrice };
            })
        );
    }

    function setItemRefundPrice(stockDocId, value) {
        const num = value === '' ? 0 : Number(value);
        if (isNaN(num) || num < 0) return;
        setReturnItems(prev =>
            prev.map(r => r.stockItemDocId === stockDocId ? { ...r, refundPrice: num } : r)
        );
    }

    function clearAll() {
        setOriginalSales([]);
        setReturnItems([]);
        setError('');
        setScanValue('');
    }

    const returnTotal = returnItems.reduce((sum, r) => sum + (r.refundPrice ?? r.price), 0);

    // Already-persisted exchange returns (read-only summary)
    const savedReturns = (saleModel.exchangeReturns || []).filter(er => er.returnNo);

    const savedSummary = savedReturns.length > 0 ? (() => {
        const allSavedItems = savedReturns.flatMap(er => er.returnItems || []);
        const savedTotal = savedReturns.reduce((s, er) => s + Number(er.totalRefund || (er.returnItems || []).reduce((rs, r) => rs + Number(r.total ?? r.price ?? 0), 0)), 0);
        return (
            <div className="mb-2">
                {savedReturns.map((saved, sIdx) => (
                    <div key={sIdx} className={sIdx > 0 ? 'mt-2 pt-2 border-top' : ''}>
                        <div className="small text-muted mb-2">
                            {saved.returnNo && <>Return <strong>#{saved.returnNo}</strong> — </>}
                            From Invoice{' '}
                            <a href={`/${saved.sale?.documentId || saved.sale?.id}/sale`} className="text-primary fw-bold">
                                #{saved.sale?.invoice_no || '?'}
                            </a>
                        </div>
                        <table className="table table-sm small mb-2">
                            <thead><tr><th>Product</th><th className="text-end">Qty</th><th className="text-end">Price</th></tr></thead>
                            <tbody>
                                {(saved.returnItems || []).map((ri, i) => (
                                    <tr key={i}>
                                        <td>{ri.productName || ri.product?.name || 'N/A'}</td>
                                        <td className="text-end">{ri.quantity || 1}</td>
                                        <td className="text-end">{currency}{Number(ri.price || 0).toFixed(2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ))}
                <div className="alert alert-success py-2 mb-0 d-flex justify-content-between align-items-center">
                    <span><i className="fas fa-undo me-1"></i>{allSavedItems.length} item(s) returned from {savedReturns.length} invoice(s)</span>
                    <span className="fw-bold">Credit: {currency}{savedTotal.toFixed(2)}</span>
                </div>
            </div>
        );
    })() : null;

    // For paid/disabled sales, show only the read-only summary
    if (disabled) {
        if (!savedSummary) return null;
        return (
            <div className="border rounded">
                <div className="px-3 py-2 bg-light border-bottom">
                    <span className="small text-muted"><i className="fas fa-exchange-alt me-1"></i>Exchange Returns Applied</span>
                </div>
                <div className="p-2">
                    {savedSummary}
                </div>
            </div>
        );
    }

    return (
        <div className="border rounded">
            <div className="px-3 py-2 bg-light d-flex justify-content-between align-items-center border-bottom">
                <span className="small text-muted"><i className="fas fa-exchange-alt me-1"></i>Exchange / Return Credit</span>
                {originalSales.length > 0 && (
                    <button className="btn btn-sm btn-outline-secondary py-0 px-1" onClick={clearAll} title="Clear all">
                        <i className="fas fa-times"></i>
                    </button>
                )}
            </div>
            <div className="p-2">
                {/* Read-only summary of already-persisted exchange returns */}
                {savedSummary}

                {/* Scan input */}
                <div className="row g-2 align-items-end mb-2">
                    <div className="col">
                        <input
                            ref={scanInputRef}
                            className="form-control form-control-sm"
                            placeholder="Scan previous invoice barcode or type invoice number, then press Enter..."
                            value={scanValue}
                            onChange={e => setScanValue(e.target.value)}
                            onKeyDown={handleScan}
                            disabled={loading}
                        />
                    </div>
                    <div className="col-auto">
                        <button
                            className="btn btn-sm btn-outline-primary"
                            onClick={() => handleScan({ key: 'Enter' })}
                            disabled={loading || !scanValue.trim()}
                        >
                            {loading
                                ? <><span className="spinner-border spinner-border-sm me-1"></span>Loading...</>
                                : <><i className="fas fa-search me-1"></i>Lookup</>}
                        </button>
                    </div>
                </div>

                {error && <div className="alert alert-danger py-1 small mb-2">{error}</div>}

                {/* Scanned sales - render each sale's items */}
                {originalSales.map(originalSale => {
                    const saleDocId = getEntryId(originalSale);
                    const saleItems = originalSale?.items || [];

                    return (
                        <div key={saleDocId} className="mb-3">
                            <div className="d-flex justify-content-between align-items-center mb-2">
                                <div className="small text-muted">
                                    Invoice <strong>#{originalSale.invoice_no}</strong> —
                                    Select items the customer is returning:
                                </div>
                                <button
                                    className="btn btn-sm btn-outline-danger py-0 px-1"
                                    onClick={() => removeSale(saleDocId)}
                                    title={`Remove invoice #${originalSale.invoice_no}`}
                                >
                                    <i className="fas fa-times"></i>
                                </button>
                            </div>

                            {saleItems.length === 0 ? (
                                <div className="text-muted small">No items found on this sale.</div>
                            ) : (
                                saleItems.map(saleItem => {
                                    const stockItems = saleItem.items || [];
                                    const product = saleItem.product;
                                    const isExchangeable = product?.is_exchangeable !== false;
                                    const isReturnable = product?.is_returnable !== false;
                                    const canExchange = isExchangeable && isReturnable;
                                    const soldStockItems = stockItems.filter(si => si.status === 'Sold');
                                    const selectedCount = canExchange ? soldStockItems.filter(si =>
                                        returnItems.some(r => r.stockItemDocId === getEntryId(si))
                                    ).length : 0;

                                    return (
                                        <div key={getEntryId(saleItem)} className="border rounded p-2 mb-2">
                                            <div className="d-flex justify-content-between align-items-center mb-1">
                                                <div>
                                                    <strong className="small">{product?.name || 'N/A'}</strong>
                                                    <span className="text-muted ms-2 small">
                                                        {saleItem.quantity} × {currency}{Number(saleItem.price || 0).toFixed(2)}
                                                    </span>
                                                    {!canExchange && (
                                                        <span className="badge bg-danger ms-2 small">
                                                            <i className="fas fa-ban me-1"></i>{!isReturnable ? 'Non-Returnable' : 'Non-Exchangeable'}
                                                        </span>
                                                    )}
                                                </div>
                                                {canExchange && soldStockItems.length > 0 && (
                                                    <button
                                                        className={`btn btn-sm ${selectedCount === soldStockItems.length ? 'btn-outline-secondary' : 'btn-outline-primary'}`}
                                                        onClick={() => selectAllFromSaleItem(saleItem, originalSale)}
                                                    >
                                                        {selectedCount === soldStockItems.length ? 'Deselect' : 'Select All'}
                                                    </button>
                                                )}
                                            </div>

                                            {stockItems.map(si => {
                                                const siDocId = getEntryId(si);
                                                const isSold = si.status === 'Sold';
                                                const canSelect = isSold && canExchange;
                                                const selected = returnItems.find(r => r.stockItemDocId === siDocId);
                                                return (
                                                    <div key={siDocId} className={`d-flex align-items-center gap-2 small px-1 py-1 ${selected ? 'bg-warning bg-opacity-25 rounded' : ''}`}>
                                                        {canSelect ? (
                                                            <input type="checkbox" checked={!!selected} onChange={() => toggleStockItem(saleItem, si, originalSale)} />
                                                        ) : (
                                                            <span className="text-muted">—</span>
                                                        )}
                                                        <code>{si.sku || si.barcode || '-'}</code>
                                                        <span className={`badge ${isSold ? 'bg-secondary' : 'bg-info'}`}>{si.status}</span>
                                                        {selected && (
                                                            <>
                                                                <select
                                                                    className="form-select form-select-sm ms-auto"
                                                                    value={selected.status}
                                                                    onChange={e => setItemReturnStatus(siDocId, e.target.value)}
                                                                    style={{ width: 140 }}
                                                                >
                                                                    {RETURN_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                                                                </select>
                                                                {DAMAGED_STATUSES.includes(selected.status) ? (
                                                                    <div className="d-flex align-items-center gap-1" style={{ minWidth: 100 }}>
                                                                        <span className="text-muted small text-decoration-line-through">{currency}{selected.price.toFixed(2)}</span>
                                                                        <input
                                                                            type="number"
                                                                            className="form-control form-control-sm text-end"
                                                                            style={{ width: 80 }}
                                                                            value={selected.refundPrice}
                                                                            min="0"
                                                                            step="0.01"
                                                                            onChange={e => setItemRefundPrice(siDocId, e.target.value)}
                                                                            title="Negotiated refund price"
                                                                        />
                                                                    </div>
                                                                ) : (
                                                                    <span className="small text-muted" style={{ minWidth: 60 }}>{currency}{selected.price.toFixed(2)}</span>
                                                                )}
                                                            </>
                                                        )}
                                                    </div>
                                                );
                                            })}

                                            {!canExchange && (
                                                <div className="text-danger small mt-1">
                                                    <i className="fas fa-ban me-1"></i>
                                                    {!isReturnable ? 'This product cannot be returned.' : 'This product cannot be exchanged.'}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    );
                })}

                {/* Return total summary */}
                {returnItems.length > 0 && (
                    <div className="alert alert-success py-2 mb-0 d-flex justify-content-between align-items-center">
                        <span>
                            <i className="fas fa-undo me-1"></i>
                            {returnItems.length} item(s) selected for return
                            {originalSales.length > 1 && <> from {originalSales.length} invoices</>}
                        </span>
                        <span className="fw-bold">Credit: {currency}{returnTotal.toFixed(2)}</span>
                    </div>
                )}
            </div>
        </div>
    );
}
