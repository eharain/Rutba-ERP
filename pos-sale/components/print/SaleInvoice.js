import React from 'react';
import { useUtil } from '@rutba/pos-shared/context/UtilContext';
import BarcodeDisplay from './BarcodeDisplay';

const SaleInvoice = ({ sale, items, totals, printerSettings, branchPrintOverrides }) => { 
    const { currency, branch, user, invoicePrintSettings, getBranchPrintSettings } = useUtil();

    const companyName = branch?.companyName || branch?.name || 'Company Name';
    const branchName = branch?.name || 'Branch Name';
    const userName = user?.displayName || user?.username || user?.email || 'User';
    const invoiceNo = sale?.invoice_no || 'N/A';
    const saleDate = sale?.sale_date ? new Date(sale.sale_date).toLocaleDateString() : new Date().toLocaleDateString();
    const customerName = sale?.customer?.name || sale?.customer?.email || sale?.customer?.phone || 'Walk-in Customer';
    const website = branch?.web ? branch.web.toUpperCase() : '';

    const safeTotals = {
        subtotal: Number(totals?.subtotal) || 0,
        discount: Number(totals?.discount) || 0,
        tax: Number(totals?.tax) || 0,
        total: Number(totals?.total) || 0
    };

    const payments = Array.isArray(sale?.payments) ? sale.payments : [];
    const exchangeReturns = Array.isArray(sale?.exchangeReturns) ? sale.exchangeReturns
        : (sale?.exchangeReturn ? [sale.exchangeReturn] : []);
    const exchangeReturnTotal = exchangeReturns.reduce((s, er) => {
        const erTotal = er.totalRefund
            ?? (er.returnItems?.length
                ? er.returnItems.reduce((rs, r) => rs + Number(r.total ?? r.price ?? 0), 0)
                : 0);
        return s + erTotal;
    }, 0);
    const paid = payments.length > 0
        ? payments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
        : (Number(sale?.paid) || (sale?.payment_status === 'Paid' ? safeTotals.total : 0));

    const isPaid = sale?.payment_status === 'Paid' || (safeTotals.total > 0 && paid >= safeTotals.total);
    const statusLabel = isPaid ? null : 'DRAFT / ESTIMATE';

    const changeGiven = payments.length > 0
        ? payments.reduce((s, p) => s + (Number(p.change) || 0), 0)
        : Math.max(0, paid - safeTotals.total);

    const remaining = Math.max(0, safeTotals.total - paid);

    // Separate actual cash/card/bank payments from exchange-return bookkeeping entries
    const actualPayments = payments.filter(p => p.payment_method !== 'Exchange Return');
    const actualPaid = actualPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const actualChange = actualPayments.reduce((s, p) => s + (Number(p.change) || 0), 0);

    // Use override props when provided (live editing), otherwise fall back to context.
    const effectivePrinter = printerSettings || invoicePrintSettings;
    const paperWidth = effectivePrinter?.paperWidth || '80mm';

    const branchPrint = branchPrintOverrides || getBranchPrintSettings();
    const fontSize = branchPrint.fontSize || 11;
    const itemsFontSize = branchPrint.itemsFontSize ?? fontSize;
    const fontFamily = branchPrint.fontFamily || 'sans-serif';
    const showTax = branchPrint.showTax ?? true;
    const showBranch = branchPrint.showBranch ?? true;
    const showCustomer = branchPrint.showCustomer ?? true;
    const branchFields = branchPrint.branchFields ?? ['name', 'companyName', 'web'];
    const socialFields = branchPrint.socialFields ?? [];

    const renderBranchFields = () => {
        if (!showBranch || !branch) return null;
        const pieces = [];
        if (branchFields.includes('companyName') && (branch.companyName || branch.name)) {
            pieces.push(branch.companyName || branch.name);
        }
        if (branchFields.includes('name') && branch.name && branch.companyName) {
            pieces.push(branch.name);
        }
        if (branchFields.includes('web') && branch.web) {
            pieces.push(branch.web.toUpperCase());
        }
        if (pieces.length === 0 && branch.name) pieces.push(branch.name);
        return pieces.map((p, i) => <div key={i}>{p}</div>);
    };

    return (
        <div className="sale-invoice-container" style={{ fontFamily: fontFamily, width: paperWidth, margin: '10px auto', padding: '5px', textAlign: 'center', fontSize: `${fontSize}px`, lineHeight: 1.3, WebkitFontSmoothing: 'none', color: '#000' }}>
            <style jsx global>{`
                @media print {
                    body * {
                        visibility: hidden;
                    }

                    .sale-invoice-container, .sale-invoice-container * {
                        visibility: visible;
                    }

                    .sale-invoice-container {
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 100%;
                        margin: 0;
                        padding: 2px;
                        background: white !important;
                        color: #000 !important;
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                    }

                    .sale-invoice-container table {
                        border-collapse: collapse;
                    }

                    .sale-invoice-container td,
                    .sale-invoice-container th {
                        padding: 1px 0;
                    }

                    @page {
                        margin: 0;
                        size: auto;
                    }
                }
            `}</style>

            <div className="invoice-header mb-2 pb-1" style={{ borderBottom: '1px dashed #555' }}>
                <div className="company-name fs-5 fw-bold text-uppercase">{companyName}</div>
                <div className="invoice-meta small mt-1" style={{ lineHeight: 1.4 }}>
                    {showBranch && renderBranchFields()}
                    {saleDate}<br />
                    User: {userName}
                </div>
                {statusLabel && (
                    <div className="text-uppercase fw-bold text-danger small mt-1">
                        {statusLabel}
                    </div>
                )}

                {showCustomer && (
                    <div className="customer-contact small mt-2" style={{ lineHeight: 1.2 }}>
                        <strong>Customer: </strong>{customerName}
                        {sale?.customer?.email && <div>{sale.customer.email}</div>}
                        {sale?.customer?.phone && <div>{sale.customer.phone}</div>}
                    </div>
                )}
            </div>

            {/* ── Section 1: Sale Items ── */}
            <table className="items-table w-100" style={{ fontSize: `${itemsFontSize}px`, marginBottom: '6px', borderCollapse: 'collapse' }}>
                <thead>
                    <tr style={{ borderBottom: '1px solid #000' }}>
                        <th className="text-center" style={{ width: '12%', padding: '2px 0', fontWeight: 'bold' }}>Qty</th>
                        <th className="text-start" style={{ width: '58%', padding: '2px 0', fontWeight: 'bold' }}>Item</th>
                        <th className="text-end" style={{ width: '30%', padding: '2px 0', fontWeight: 'bold' }}>Amt</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map((item, index) => {
                        const rowSubtotal = Number(item.subtotal) || 0;
                        const rowDiscount = Number(item.discount) || 0;
                        const rowTotal = rowSubtotal - rowDiscount;
                        return (
                            <tr key={index} style={{ borderBottom: '1px dotted #ccc' }}>
                                <td className="text-center" style={{ padding: '2px 0', verticalAlign: 'top' }}>{item.quantity}</td>
                                <td className="text-start" style={{ padding: '2px 2px', verticalAlign: 'top', wordBreak: 'break-word', maxWidth: 0 }}>
                                    {item?.items?.[0]?.name || item.product?.name || 'Item'}
                                </td>
                                <td className="text-end" style={{ padding: '2px 0', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                                    {Math.round(rowTotal)}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>

            {/* ── Section 2: Exchange Returns ── */}
            {exchangeReturns.length > 0 && exchangeReturns.some(er => er.returnItems?.length > 0) && (
                <div style={{ borderTop: '1px dashed #555', paddingTop: '4px', marginBottom: '4px' }}>
                    <div className="fw-bold text-center" style={{ fontSize: `${itemsFontSize}px`, marginBottom: '3px' }}>Exchange Returns</div>
                    {exchangeReturns.map((er, erIdx) => {
                        if (!er.returnItems?.length) return null;
                        return (
                            <div key={erIdx} style={erIdx > 0 ? { borderTop: '1px dotted #ccc', paddingTop: '2px', marginTop: '2px' } : undefined}>
                                <div className="text-start" style={{ fontSize: `${Math.max(itemsFontSize - 1, 8)}px`, marginBottom: '2px', color: '#555' }}>
                                    From Invoice #{er.sale?.invoice_no || 'N/A'}
                                    {er.returnNo ? ` (${er.returnNo})` : ''}
                                </div>
                                <table className="w-100" style={{ fontSize: `${itemsFontSize}px`, borderCollapse: 'collapse' }}>
                                    <tbody>
                                        {er.returnItems.map((ri, idx) => (
                                            <tr key={idx} style={{ borderBottom: '1px dotted #eee' }}>
                                                <td className="text-center" style={{ width: '12%', padding: '1px 0' }}>{ri.quantity || 1}</td>
                                                <td className="text-start" style={{ width: '58%', padding: '1px 2px' }}>{ri.productName || 'Item'}</td>
                                                <td className="text-end" style={{ width: '30%', padding: '1px 0', whiteSpace: 'nowrap' }}>-{currency}{Number(ri.price || 0).toFixed(2)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        );
                    })}
                    <table className="w-100" style={{ fontSize: `${itemsFontSize}px`, borderCollapse: 'collapse' }}>
                        <tbody>
                            <tr className="fw-bold" style={{ borderTop: '1px dotted #999' }}>
                                <td className="text-start" style={{ padding: '2px 0' }}>Return Credit:</td>
                                <td className="text-end" style={{ padding: '2px 0', whiteSpace: 'nowrap' }}>-{currency}{exchangeReturnTotal.toFixed(2)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            )}

            {/* ── Section 3: Totals ── */}
            <div className="totals-section" style={{ borderTop: '1px dashed #555', paddingTop: '4px', fontSize: `${fontSize}px` }}>
                <table className="totals-table w-100" style={{ borderCollapse: 'collapse', fontSize: `${fontSize}px` }}>
                    <tbody>
                        <tr>
                            <td className="text-start" style={{ width: '50%', padding: '1px 0' }}>Subtotal:</td>
                            <td className="text-end" style={{ width: '50%', padding: '1px 0' }}>{currency}{safeTotals.subtotal.toFixed(2)}</td>
                        </tr>
                        {showTax && safeTotals.tax > 0 && (
                            <tr>
                                <td className="text-start" style={{ padding: '1px 0' }}>Tax:</td>
                                <td className="text-end" style={{ padding: '1px 0' }}>{currency}{safeTotals.tax.toFixed(2)}</td>
                            </tr>
                        )}
                        {safeTotals.discount > 0 && (
                            <tr>
                                <td className="text-start" style={{ padding: '1px 0' }}>Discount:</td>
                                <td className="text-end" style={{ padding: '1px 0' }}>-{currency}{safeTotals.discount.toFixed(2)}</td>
                            </tr>
                        )}
                        {exchangeReturnTotal > 0 && (
                            <tr>
                                <td className="text-start" style={{ padding: '1px 0' }}>Exchange Credit:</td>
                                <td className="text-end" style={{ padding: '1px 0' }}>-{currency}{exchangeReturnTotal.toFixed(2)}</td>
                            </tr>
                        )}
                        <tr className="fw-bold" style={{ fontSize: `${fontSize + 3}px`, borderTop: '1px solid #555' }}>
                            <td className="text-start" style={{ padding: '3px 0' }}>Total:</td>
                            <td className="text-end" style={{ padding: '3px 0' }}>{currency}{Math.max(0, safeTotals.total - exchangeReturnTotal).toFixed(2)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {/* ── Section 4: Payments ── */}
            {actualPayments.length > 0 && (
                <div style={{ borderTop: '1px dashed #555', paddingTop: '4px', fontSize: `${fontSize}px` }}>
                    <table className="w-100" style={{ borderCollapse: 'collapse', fontSize: `${fontSize}px` }}>
                        <tbody>
                            <tr>
                                <td colSpan="2" className="text-start fw-bold" style={{ padding: '2px 0 1px' }}>Payments:</td>
                            </tr>
                            {actualPayments.map((p, i) => (
                                <tr key={i}>
                                    <td className="text-start" style={{ padding: '1px 0 1px 4px', fontSize: `${fontSize - 1}px` }}>
                                        {p.payment_method || 'Payment'}
                                        {p.transaction_no ? ` (${p.transaction_no})` : ''}
                                    </td>
                                    <td className="text-end" style={{ padding: '1px 0', fontSize: `${fontSize - 1}px` }}>
                                        {currency}{Number(p.amount || 0).toFixed(2)}
                                        {p.change > 0 ? ` (Chg: ${currency}${Number(p.change).toFixed(2)})` : ''}
                                    </td>
                                </tr>
                            ))}
                            {isPaid && (
                                <>
                                    <tr style={{ borderTop: '1px dotted #999' }}>
                                        <td className="text-start fw-bold" style={{ padding: '1px 0' }}>Paid:</td>
                                        <td className="text-end fw-bold" style={{ padding: '1px 0' }}>{currency}{actualPaid.toFixed(2)}</td>
                                    </tr>
                                    {actualChange > 0 && (
                                        <tr>
                                            <td className="text-start" style={{ padding: '1px 0' }}>Change:</td>
                                            <td className="text-end" style={{ padding: '1px 0' }}>{currency}{actualChange.toFixed(2)}</td>
                                        </tr>
                                    )}
                                </>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            <div className="invoice-footer mt-3">
                <div className="invoice-number-section">
                    <div className="barcode-container">
                        <BarcodeDisplay barcode={invoiceNo} fontSize={fontSize} />
                        {invoiceNo}
                    </div>
                </div>
            </div>

            <div className="footer mt-2">
                Thank You!
            </div>

            {socialFields.length > 0 && branch && (
                <div className="social-links mt-1" style={{ fontSize: `${fontSize - 1}px`, lineHeight: 1.4, borderTop: '1px dashed #555', paddingTop: '4px' }}>
                    {socialFields.includes('email') && branch.email && <div>✉ {branch.email}</div>}
                    {socialFields.includes('phone') && branch.phone && <div>☎ {branch.phone}</div>}
                    {socialFields.includes('watsapp') && branch.watsapp && <div>💬 {branch.watsapp}</div>}
                    {socialFields.includes('youtube') && branch.youtube && <div>▶ {branch.youtube}</div>}
                    {socialFields.includes('tiktok') && branch.tiktok && <div>♪ {branch.tiktok}</div>}
                    {socialFields.includes('instagram') && branch.instagram && <div>📷 {branch.instagram}</div>}
                    {socialFields.includes('twitter') && branch.twitter && <div>𝕏 {branch.twitter}</div>}
                </div>
            )}
        </div>
    );
};

export default SaleInvoice;