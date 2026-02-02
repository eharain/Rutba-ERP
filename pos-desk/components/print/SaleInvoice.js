import React from 'react';
import { useUtil } from '../../context/UtilContext';
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
    // total paid is derived from payments when available, otherwise fall back to sale.paid or status
    const paid = payments.length > 0
        ? payments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
        : (Number(sale?.paid) || (sale?.payment_status === 'Paid' ? safeTotals.total : 0));

    // change given: prefer sum of payment.change when payments are present, otherwise compute overpayment
    const changeGiven = payments.length > 0
        ? payments.reduce((s, p) => s + (Number(p.change) || 0), 0)
        : Math.max(0, paid - safeTotals.total);

    const remaining = Math.max(0, safeTotals.total - paid);

    // Apply invoice print settings
    const paperWidth = invoicePrintSettings?.paperWidth || '80mm';
    const fontSize = invoicePrintSettings?.fontSize || 11;
    const showTax = invoicePrintSettings?.showTax ?? true;
    const showBranch = invoicePrintSettings?.showBranch ?? true;
    const showCustomer = invoicePrintSettings?.showCustomer ?? true;
    const branchFields = invoicePrintSettings?.branchFields ?? ['name', 'companyName', 'web'];

    // helper to render selected branch fields
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
        <div className="sale-invoice-container" style={{ fontFamily: "'Courier New', monospace", width: paperWidth, margin: '20px auto', padding: '10px', textAlign: 'center', fontSize: `${fontSize}px` }}>
            <style jsx global>{`
                /* keep essential print isolation behavior */
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
                        padding: 0;
                        background: white !important;
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

                {showCustomer && (
                    <div className="customer-contact small mt-2" style={{ lineHeight: 1.2 }}>
                        <strong>Customer: </strong>{customerName}
                        {sale?.customer?.email && <div>{sale.customer.email}</div>}
                        {sale?.customer?.phone && <div>{sale.customer.phone}</div>}
                    </div>
                )}
            </div>

            <table className="items-table w-100 table-borderless" style={{ fontSize: '10px', marginBottom: '10px' }}>
                <thead>
                    <tr>
                        <th className="col-qty text-center" style={{ width: '15%' }}>Qty</th>
                        <th className="col-item text-start" style={{ width: '60%' }}>Item</th>
                        <th className="col-price text-end" style={{ width: '25%' }}>Amt</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map((item, index) => (
                        <tr key={index}>
                            <td className="col-qty text-center">{item.quantity}</td>
                            <td className="col-item text-start">
                                {item.product?.name || 'Item'}
                            </td>
                            <td className="col-price text-end">
                                {Math.round((item.price * item.quantity))}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <div className="totals-section" style={{ borderTop: '1px dashed #555', paddingTop: '5px', fontSize: '11px' }}>
                <table className="totals-table w-100" style={{ borderCollapse: 'collapse', fontSize: '11px' }}>
                    <tbody>
                        <tr>
                            <td className="text-start" style={{ width: '50%' }}>Subtotal:</td>
                            <td className="text-end" style={{ width: '50%' }}>{currency}{safeTotals.subtotal.toFixed(2)}</td>
                        </tr>
                        {showTax && (
                            <tr>
                                <td className="text-start">Tax:</td>
                                <td className="text-end">{currency}{safeTotals.tax.toFixed(2)}</td>
                            </tr>
                        )}
                        {safeTotals.discount > 0 && (
                            <tr>
                                <td className="text-start">Disc:</td>
                                <td className="text-end">-{currency}{safeTotals.discount.toFixed(2)}</td>
                            </tr>
                        )}
                        <tr className="total-row fw-bold" style={{ fontSize: '14px', borderTop: '1px solid #555', paddingTop: '5px', marginTop: '5px' }}>
                            <td className="text-start">Total:</td>
                            <td className="text-end">{currency}{safeTotals.total.toFixed(2)}</td>
                        </tr>
                        <tr>
                            <td className="text-start">Paid:</td>
                            <td className="text-end">{currency}{paid.toFixed(2)}</td>
                        </tr>
                        {payments.length > 0 && (
                            <tr>
                                <td className="text-start">Payments:</td>
                                <td className="text-end small">
                                    {payments.map((p, i) => (
                                        <div key={i} style={{ textAlign: 'right' }}>
                                            {p.payment_method || 'Payment'} {p.transaction_no ? `(${p.transaction_no})` : ''}: {currency}{Number(p.amount || 0).toFixed(2)}{p.change ? ` (Change: ${currency}${Number(p.change).toFixed(2)})` : ''}
                                        </div>
                                    ))}
                                </td>
                            </tr>
                        )}
                        <tr>
                            <td className="text-start">Change:</td>
                            <td className="text-end">{currency}{changeGiven.toFixed(2)}</td>
                        </tr>
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