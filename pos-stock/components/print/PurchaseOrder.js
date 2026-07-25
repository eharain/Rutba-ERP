import React from 'react';
import { useUtil } from '@rutba/pos-shared/context/UtilContext';

/**
 * PurchaseOrder — printable A4 purchase-order document. Buyer (our company /
 * branch) at the top, supplier (the seller) below, then PO meta + line items +
 * totals. Screen-only chrome uses `.d-print-none`; `@media print` isolates this
 * container. Data comes from fetchPurchaseByIdDocumentIdOrPO (see print-purchase page).
 */
const PurchaseOrder = ({ purchase, printerSettings }) => {
    const { currency, branch, user, getBranchPrintSettings } = useUtil();

    const bp = (() => { try { return getBranchPrintSettings?.() || {}; } catch (_) { return {}; } })();
    const paperWidth = printerSettings?.paperWidth || '210mm';

    const companyName = branch?.companyName || branch?.name || 'Company Name';
    const buyerLines = [
        branch?.companyName && branch?.name && branch.companyName !== branch.name ? branch.name : null,
        branch?.address,
        [branch?.phone, branch?.email].filter(Boolean).join(' · ') || null,
        branch?.web ? String(branch.web).toUpperCase() : null,
    ].filter(Boolean);

    const suppliers = Array.isArray(purchase?.suppliers) ? purchase.suppliers : [];
    const supplier = suppliers[0] || null;
    const supplierLines = supplier ? [
        supplier.address,
        [supplier.phone, supplier.email].filter(Boolean).join(' · ') || null,
    ].filter(Boolean) : [];

    const items = Array.isArray(purchase?.items) ? purchase.items : [];
    const lineTotal = (it) => (Number(it.quantity) || 0) * (Number(it.unit_price ?? it.price) || 0);
    const grandTotal = items.reduce((s, it) => s + lineTotal(it), 0);
    const totalQty = items.reduce((s, it) => s + (Number(it.quantity) || 0), 0);

    const orderDate = purchase?.order_date ? new Date(purchase.order_date).toLocaleDateString() : '—';
    const preparedBy = user?.displayName || user?.username || user?.email || '';

    const money = (n) => `${currency || ''}${(Number(n) || 0).toFixed(2)}`;

    return (
        <div className="purchase-order-print" style={{ width: paperWidth, maxWidth: '100%', margin: '0 auto', padding: '18px 22px', color: '#000', fontFamily: bp.fontFamily || 'sans-serif', fontSize: '13px', lineHeight: 1.4 }}>
            <style jsx global>{`
                @media print {
                    body * { visibility: hidden; }
                    .purchase-order-print, .purchase-order-print * { visibility: visible; }
                    .purchase-order-print {
                        position: absolute; left: 0; top: 0; width: 100%;
                        margin: 0; padding: 10mm 12mm;
                        background: white !important; color: #000 !important;
                        -webkit-print-color-adjust: exact; print-color-adjust: exact;
                    }
                    @page { margin: 8mm; size: A4; }
                }
                .purchase-order-print table { border-collapse: collapse; width: 100%; }
                .purchase-order-print .po-items th, .purchase-order-print .po-items td { border: 1px solid #999; padding: 6px 8px; }
                .purchase-order-print .po-items thead th { background: #f0f0f0; }
            `}</style>

            {/* Header: title + company */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #000', paddingBottom: '10px', marginBottom: '14px' }}>
                <div>
                    <div style={{ fontSize: '22px', fontWeight: 'bold', letterSpacing: 0.5 }}>PURCHASE ORDER</div>
                    <div style={{ marginTop: '4px', fontFamily: 'monospace', fontSize: '15px' }}>{purchase?.orderId || '—'}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '18px', fontWeight: 'bold', textTransform: 'uppercase' }}>{companyName}</div>
                    {buyerLines.map((l, i) => <div key={i} style={{ fontSize: '12px', color: '#333' }}>{l}</div>)}
                </div>
            </div>

            {/* Supplier + meta */}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '20px', marginBottom: '16px' }}>
                <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 'bold', textTransform: 'uppercase', fontSize: '11px', color: '#666', marginBottom: '4px' }}>Supplier</div>
                    <div style={{ fontWeight: 'bold', fontSize: '15px' }}>{supplier?.name || 'No supplier assigned'}</div>
                    {supplierLines.map((l, i) => <div key={i} style={{ fontSize: '12px', color: '#333' }}>{l}</div>)}
                </div>
                <div style={{ minWidth: '230px' }}>
                    <table>
                        <tbody>
                            <tr><td style={{ padding: '2px 6px', color: '#555' }}>Order date</td><td style={{ padding: '2px 6px', textAlign: 'right', fontWeight: 'bold' }}>{orderDate}</td></tr>
                            <tr><td style={{ padding: '2px 6px', color: '#555' }}>Status</td><td style={{ padding: '2px 6px', textAlign: 'right' }}>{purchase?.status || 'Draft'}</td></tr>
                            <tr><td style={{ padding: '2px 6px', color: '#555' }}>Approval</td><td style={{ padding: '2px 6px', textAlign: 'right' }}>{purchase?.approval_status || 'Draft'}</td></tr>
                            {preparedBy && <tr><td style={{ padding: '2px 6px', color: '#555' }}>Prepared by</td><td style={{ padding: '2px 6px', textAlign: 'right' }}>{preparedBy}</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Line items */}
            <table className="po-items" style={{ marginBottom: '14px' }}>
                <thead>
                    <tr>
                        <th style={{ width: '38px', textAlign: 'center' }}>#</th>
                        <th style={{ textAlign: 'left' }}>Product</th>
                        <th style={{ textAlign: 'left', width: '120px' }}>SKU / Barcode</th>
                        <th style={{ textAlign: 'right', width: '70px' }}>Qty</th>
                        <th style={{ textAlign: 'right', width: '90px' }}>Unit price</th>
                        <th style={{ textAlign: 'right', width: '70px' }}>Bundle</th>
                        <th style={{ textAlign: 'right', width: '100px' }}>Subtotal</th>
                    </tr>
                </thead>
                <tbody>
                    {items.length === 0 ? (
                        <tr><td colSpan={7} style={{ textAlign: 'center', color: '#777', padding: '18px' }}>No items on this purchase order.</td></tr>
                    ) : items.map((it, idx) => (
                        <tr key={it.documentId || idx}>
                            <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                            <td>{it.product?.name || 'N/A'}</td>
                            <td style={{ fontSize: '11px', color: '#444' }}>{it.product?.sku || it.product?.barcode || '—'}</td>
                            <td style={{ textAlign: 'right' }}>{Number(it.quantity) || 0}</td>
                            <td style={{ textAlign: 'right' }}>{money(it.unit_price ?? it.price)}</td>
                            <td style={{ textAlign: 'right' }}>{Number(it.bundle_units) > 1 ? it.bundle_units : '1'}</td>
                            <td style={{ textAlign: 'right', fontWeight: 'bold' }}>{money(lineTotal(it))}</td>
                        </tr>
                    ))}
                </tbody>
                <tfoot>
                    <tr>
                        <td colSpan={3} style={{ textAlign: 'right', fontWeight: 'bold' }}>Totals</td>
                        <td style={{ textAlign: 'right', fontWeight: 'bold' }}>{totalQty}</td>
                        <td colSpan={2}></td>
                        <td style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '15px' }}>{money(grandTotal)}</td>
                    </tr>
                </tfoot>
            </table>

            {/* Signatures */}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '40px', marginTop: '48px' }}>
                <div style={{ flex: 1, borderTop: '1px solid #000', paddingTop: '4px', fontSize: '12px', color: '#555' }}>Authorised by</div>
                <div style={{ flex: 1, borderTop: '1px solid #000', paddingTop: '4px', fontSize: '12px', color: '#555' }}>Received by</div>
            </div>

            <div style={{ marginTop: '18px', textAlign: 'center', fontSize: '11px', color: '#888' }}>
                {companyName} — Purchase Order {purchase?.orderId || ''}
            </div>
        </div>
    );
};

export default PurchaseOrder;
