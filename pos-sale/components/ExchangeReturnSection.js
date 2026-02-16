import { useEffect, useRef, useState } from 'react';
import { useUtil } from '@rutba/pos-shared/context/UtilContext';
import { fetchSaleByIdOrInvoice } from '@rutba/pos-shared/lib/pos';

const RETURN_STATUSES = ['Returned', 'ReturnedDamaged', 'Damaged', 'InStock'];

function getEntryId(entry) {
    return entry?.documentId || entry?.id;
}

export default function ExchangeReturnSection({ saleModel, onUpdate, disabled = false }) {
    const { currency } = useUtil();
    const scanInputRef = useRef(null);

    const [scanValue, setScanValue] = useState('');
    const [originalSale, setOriginalSale] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [returnItems, setReturnItems] = useState([]);

    // Sync returnItems to saleModel
    useEffect(() => {
        if (originalSale && returnItems.length > 0) {
            saleModel.setExchangeReturn(originalSale, returnItems);
        } else {
            saleModel.clearExchangeReturn();
        }
        onUpdate();
    }, [returnItems, originalSale]);

    async function handleScan(e) {
        if (e.key !== 'Enter') return;
        const value = scanValue.trim();
        if (!value) return;
        setError('');
        setOriginalSale(null);
        setReturnItems([]);
        setLoading(true);
        try {
            const saleData = await fetchSaleByIdOrInvoice(value);
            if (!saleData) {
                setError(`No sale found for "${value}"`);
                return;
            }
            setOriginalSale(saleData);
        } catch (err) {
            console.error('Failed to load sale', err);
            setError('Failed to load sale.');
        } finally {
            setLoading(false);
            setScanValue('');
        }
    }

    function toggleStockItem(saleItem, stockItem) {
        const product = saleItem.product;
        if (product && product.is_exchangeable === false) return;

        const stockDocId = getEntryId(stockItem);
        setReturnItems(prev => {
            const exists = prev.find(r => r.stockItemDocId === stockDocId);
            if (exists) return prev.filter(r => r.stockItemDocId !== stockDocId);
            return [...prev, {
                saleItemDocId: getEntryId(saleItem),
                saleItemId: saleItem.id,
                stockItemDocId: stockDocId,
                stockItemId: stockItem.id,
                productDocId: getEntryId(saleItem.product),
                productName: saleItem.product?.name || stockItem.name || 'N/A',
                sku: stockItem.sku || saleItem.product?.sku || '',
                barcode: stockItem.barcode || '',
                price: Number(saleItem.price) || Number(stockItem.selling_price) || 0,
                status: 'Returned'
            }];
        });
    }

    function selectAllFromSaleItem(saleItem) {
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
                    .map(si => ({
                        saleItemDocId: getEntryId(saleItem),
                        saleItemId: saleItem.id,
                        stockItemDocId: getEntryId(si),
                        stockItemId: si.id,
                        productDocId: getEntryId(saleItem.product),
                        productName: saleItem.product?.name || si.name || 'N/A',
                        sku: si.sku || saleItem.product?.sku || '',
                        barcode: si.barcode || '',
                        price: Number(saleItem.price) || Number(si.selling_price) || 0,
                        status: 'Returned'
                    }));
                return [...prev, ...newEntries];
            });
        }
    }

    function setItemReturnStatus(stockDocId, status) {
        setReturnItems(prev =>
            prev.map(r => r.stockItemDocId === stockDocId ? { ...r, status } : r)
        );
    }

    function clearAll() {
        setOriginalSale(null);
        setReturnItems([]);
        setError('');
        setScanValue('');
    }

    const returnTotal = returnItems.reduce((sum, r) => sum + r.price, 0);
    const saleItems = originalSale?.items || [];

    // For paid/disabled sales, show read-only summary of saved exchange return
    if (disabled) {
        const saved = saleModel.exchangeReturn;
        if (!saved || !saved.returnItems?.length) return null;
        const savedTotal = saved.totalRefund ?? saved.returnItems.reduce((s, r) => s + (r.price || 0), 0);
        return (
            <div className="border rounded">
                <div className="px-3 py-2 bg-light border-bottom">
                    <span className="small text-muted"><i className="fas fa-exchange-alt me-1"></i>Exchange Return Applied</span>
                </div>
                <div className="p-2">
                    <div className="small text-muted mb-2">
                        {saved.returnNo && <>Return <strong>#{saved.returnNo}</strong> — </>}
                        From Invoice <strong>#{saved.sale?.invoice_no || '?'}</strong>
                    </div>
                    <table className="table table-sm small mb-2">
                        <thead><tr><th>Product</th><th className="text-end">Qty</th><th className="text-end">Price</th></tr></thead>
                        <tbody>
                            {saved.returnItems.map((ri, i) => (
                                <tr key={i}>
                                    <td>{ri.productName || ri.product?.name || 'N/A'}</td>
                                    <td className="text-end">{ri.quantity || 1}</td>
                                    <td className="text-end">{currency}{Number(ri.price || 0).toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div className="alert alert-success py-2 mb-0 d-flex justify-content-between align-items-center">
                        <span><i className="fas fa-undo me-1"></i>{saved.returnItems.length} item(s) returned</span>
                        <span className="fw-bold">Credit: {currency}{savedTotal.toFixed(2)}</span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="border rounded">
            <div className="px-3 py-2 bg-light d-flex justify-content-between align-items-center border-bottom">
                <span className="small text-muted"><i className="fas fa-exchange-alt me-1"></i>Exchange / Return Credit</span>
                {originalSale && (
                    <button className="btn btn-sm btn-outline-secondary py-0 px-1" onClick={clearAll}>
                        <i className="fas fa-times"></i>
                    </button>
                )}
            </div>
            <div className="p-2">
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

                {/* Original sale items */}
                {originalSale && (
                    <>
                        <div className="small text-muted mb-2">
                            Invoice <strong>#{originalSale.invoice_no}</strong> —
                            Select items the customer is returning:
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
                                                    onClick={() => selectAllFromSaleItem(saleItem)}
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
                                                        <input type="checkbox" checked={!!selected} onChange={() => toggleStockItem(saleItem, si)} />
                                                    ) : (
                                                        <span className="text-muted">—</span>
                                                    )}
                                                    <code>{si.sku || si.barcode || '-'}</code>
                                                    <span className={`badge ${isSold ? 'bg-secondary' : 'bg-info'}`}>{si.status}</span>
                                                    {selected && (
                                                        <select
                                                            className="form-select form-select-sm ms-auto"
                                                            value={selected.status}
                                                            onChange={e => setItemReturnStatus(siDocId, e.target.value)}
                                                            style={{ width: 140 }}
                                                        >
                                                            {RETURN_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                                                        </select>
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

                        {/* Return total summary */}
                        {returnItems.length > 0 && (
                            <div className="alert alert-success py-2 mb-0 d-flex justify-content-between align-items-center">
                                <span>
                                    <i className="fas fa-undo me-1"></i>
                                    {returnItems.length} item(s) selected for return
                                </span>
                                <span className="fw-bold">Credit: {currency}{returnTotal.toFixed(2)}</span>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
