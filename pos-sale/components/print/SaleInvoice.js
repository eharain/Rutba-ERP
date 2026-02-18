import React from 'react';
import { useUtil } from '@rutba/pos-shared/context/UtilContext';
import BarcodeDisplay from './BarcodeDisplay';

const SaleInvoice = ({ sale, items, totals}) => { 
    const { currency, branch, user, invoicePrintSettings } = useUtil();

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
    const exchangeReturn = sale?.exchangeReturn || null;
    const exchangeReturnTotal = exchangeReturn?.totalRefund
        ?? (exchangeReturn?.returnItems?.length
            ? exchangeReturn.returnItems.reduce((s, r) => s + Number(r.total ?? r.price ?? 0), 0)
            : 0);
    const paid = payments.length > 0
        ? payments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
        : (Number(sale?.paid) || (sale?.payment_status === 'Paid' ? safeTotals.total : 0));

    const isPaid = sale?.payment_status === 'Paid' || (safeTotals.total > 0 && paid >= safeTotals.total);
    const statusLabel = isPaid ? null : 'DRAFT / ESTIMATE';

    const changeGiven = payments.length > 0
        ? payments.reduce((s, p) => s + (Number(p.change) || 0), 0)
        : Math.max(0, paid - safeTotals.total);

    const remaining = Math.max(0, safeTotals.total - paid);

    const paperWidth = invoicePrintSettings?.paperWidth || '80mm';
    const fontSize = invoicePrintSettings?.fontSize || 11;
    const itemsFontSize = invoicePrintSettings?.itemsFontSize ?? fontSize;
    const fontFamily = invoicePrintSettings?.fontFamily || 'sans-serif';
    const showTax = invoicePrintSettings?.showTax ?? true;
    const showBranch = invoicePrintSettings?.showBranch ?? true;
    const showCustomer = invoicePrintSettings?.showCustomer ?? true;
    const branchFields = invoicePrintSettings?.branchFields ?? ['name', 'companyName', 'web'];

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
        <div className="sale-invoice-container" style={{ fontFamily: fontFamily, width: paperWidth, margin: '20px auto', padding: '10px', textAlign: 'center', fontSize: `${fontSize}px`, lineHeight: 1.3, WebkitFontSmoothing: 'none', color: '#000' }}>
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

            {/* Returned Items (Exchange) */}
            {exchangeReturn?.returnItems?.length > 0 && (
                <div style={{ borderTop: '1px dashed #555', paddingTop: '4px', marginBottom: '4px' }}>
                    <div className="fw-bold text-start mb-1" style={{ fontSize: `${itemsFontSize}px` }}>Returned Items (from #{exchangeReturn.sale?.invoice_no || 'N/A'}):</div>
                    <table className="w-100" style={{ fontSize: `${itemsFontSize}px`, borderCollapse: 'collapse' }}>
                        <tbody>
                            {exchangeReturn.returnItems.map((ri, idx) => (
                                <tr key={idx}>
                                    <td className="text-start" style={{ padding: '1px 0' }}>{ri.productName || 'Item'}</td>
                                    <td className="text-end" style={{ padding: '1px 0', whiteSpace: 'nowrap' }}>-{currency}{Number(ri.price || 0).toFixed(2)}</td>
                                </tr>
                            ))}
                            <tr className="fw-bold" style={{ borderTop: '1px dotted #999' }}>
                                <td className="text-start" style={{ padding: '2px 0' }}>Return Credit:</td>
                                <td className="text-end" style={{ padding: '2px 0', whiteSpace: 'nowrap' }}>-{currency}{exchangeReturnTotal.toFixed(2)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            )}

            <div className="totals-section" style={{ borderTop: '1px dashed #555', paddingTop: '4px', fontSize: `${fontSize}px` }}>
                <table className="totals-table w-100" style={{ borderCollapse: 'collapse', fontSize: `${fontSize}px` }}>
                    <tbody>
                        <tr>
                            <td className="text-start" style={{ width: '50%', padding: '1px 0' }}>Subtotal:</td>
                            <td className="text-end" style={{ width: '50%', padding: '1px 0' }}>{currency}{safeTotals.subtotal.toFixed(2)}</td>
                        </tr>
                        {showTax && (
                            <tr>
                                <td className="text-start" style={{ padding: '1px 0' }}>Tax:</td>
                                <td className="text-end" style={{ padding: '1px 0' }}>{currency}{safeTotals.tax.toFixed(2)}</td>
                            </tr>
                        )}
                        {safeTotals.discount > 0 && (
                            <tr>
                                <td className="text-start" style={{ padding: '1px 0' }}>Disc:</td>
                                <td className="text-end" style={{ padding: '1px 0' }}>-{currency}{safeTotals.discount.toFixed(2)}</td>
                            </tr>
                        )}
                        <tr className="fw-bold" style={{ fontSize: `${fontSize + 3}px`, borderTop: '1px solid #555' }}>
                            <td className="text-start" style={{ padding: '3px 0' }}>Total:</td>
                            <td className="text-end" style={{ padding: '3px 0' }}>{currency}{safeTotals.total.toFixed(2)}</td>
                        </tr>
                        {payments.length > 0 && (
                            <>
                                <tr>
                                    <td colSpan="2" className="text-start fw-bold" style={{ borderTop: '1px dotted #999', padding: '2px 0 1px' }}>Payments:</td>
                                </tr>
                                {payments.map((p, i) => (
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
                            </>
                        )}
                        {isPaid && (
                            <>
                                <tr>
                                    <td className="text-start" style={{ padding: '1px 0' }}>Paid:</td>
                                    <td className="text-end" style={{ padding: '1px 0' }}>{currency}{paid.toFixed(2)}</td>
                                </tr>
                                {changeGiven > 0 && (
                                    <tr>
                                        <td className="text-start" style={{ padding: '1px 0' }}>Change:</td>
                                        <td className="text-end" style={{ padding: '1px 0' }}>{currency}{changeGiven.toFixed(2)}</td>
                                    </tr>
                                )}
                            </>
                        )}
                    </tbody>
                </table>
            </div>

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
        </div>
    );
};

export default SaleInvoice;