import React from 'react';
import { useUtil } from '../../context/UtilContext';
import BarcodeDisplay from './BarcodeDisplay';

const SaleInvoice = ({ sale, items, totals }) => {
    const { currency, branch, user } = useUtil();
    
    const companyName = branch?.companyName || branch?.name || 'Company Name';
    const branchName = branch?.name || 'Branch Name';
    const userName = user?.username || user?.email || 'User';
    const invoiceNo = sale?.invoice_no || 'N/A';
    const saleDate = sale?.sale_date ? new Date(sale.sale_date).toLocaleDateString() : new Date().toLocaleDateString();
    const customerName = sale?.customer?.name || 'Walk-in Customer';
    const website = branch?.web ? branch.web.toUpperCase() : '';
    
    const safeTotals = {
        subtotal: Number(totals?.subtotal) || 0,
        discount: Number(totals?.discount) || 0,
        tax: Number(totals?.tax) || 0,
        total: Number(totals?.total) || 0
    };
    
    const paymentStatus = sale?.payment_status || 'Pending';
    const paid = paymentStatus === 'Paid' ? safeTotals.total : (Number(sale?.paid) || 0);
    const remaining = Math.max(0, safeTotals.total - paid);

    return (
        <div className="sale-invoice-container" style={{ fontFamily: "'Courier New', monospace", width: '80mm', margin: '20px auto', padding: '10px', textAlign: 'center' }}>
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
                    {branchName}<br/>
                    {website && <>{website}<br/></>}
                    {saleDate}<br/>
                    User: {userName}
                </div>
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
                        <tr>
                            <td className="text-start">Tax:</td>
                            <td className="text-end">{currency}{safeTotals.tax.toFixed(2)}</td>
                        </tr>
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
                        <tr>
                            <td className="text-start">Change:</td>
                            <td className="text-end">{currency}{Math.abs(remaining).toFixed(2)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div className="invoice-footer mt-3">
                <div className="invoice-number-section">
                    <div className="invoice-number-text small mb-1">Invoice: {invoiceNo}</div>
                    <div className="barcode-container d-flex justify-content-center align-items-center mb-2">
                        <BarcodeDisplay barcode={invoiceNo} />
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