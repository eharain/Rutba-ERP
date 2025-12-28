import React from 'react';
import { useUtil } from '../../context/UtilContext';
import BarcodeDisplay from './BarcodeDisplay';

const SaleInvoice = ({ sale, items, totals }) => {
    const { currency, branch, user } = useUtil();
    
    // --- Safe Data Handling ---
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
        <div className="sale-invoice-container">
            <style jsx global>{`
                /* --- PRINTING STRATEGY --- */
                @media print {
                    /* 1. Hide everything on the page */
                    body * {
                        visibility: hidden;
                    }

                    /* 2. Make only the invoice container visible */
                    .sale-invoice-container, .sale-invoice-container * {
                        visibility: visible;
                    }

                    /* 3. Position the invoice at the very top left of the paper */
                    .sale-invoice-container {
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 100%;
                        margin: 0;
                        padding: 0;
                        background: white !important; /* Ensure background is white */
                    }

                    /* 4. Remove default browser margins */
                    @page {
                        margin: 0;
                        size: auto;
                    }
                }
            `}</style>

            <style jsx>{`
                /* --- SCREEN STYLES (Black Receipt) --- */
                .sale-invoice-container {
                    font-family: 'Courier New', monospace;
                    font-weight: bold !important;
                    background: black;
                    color: white;
                    width: 80mm; /* Screen width */
                    margin: 20px auto;
                    padding: 10px;
                    text-align: center;
                    box-shadow: 0 0 10px rgba(0,0,0,0.5);
                }

                /* --- SPECIFIC PRINT STYLES (Overrides Screen) --- */
                @media print {
                    .sale-invoice-container {
                        width: 72mm !important; /* Thermal Paper Width */
                        background: white !important;
                        color: black !important;
                        box-shadow: none !important;
                        border: none !important;
                        overflow: visible !important;
                    }
                    
                    /* Force all text to be black for thermal printing */
                    div, span, p, td, th, h1, h2, h3 {
                        color: black !important;
                        text-shadow: none !important;
                    }

                    /* Add borders for clarity on paper */
                    .invoice-header, .totals-section, .items-table th {
                        border-bottom: 1px solid black !important;
                    }
                }

                /* --- GENERAL LAYOUT --- */
                .invoice-header {
                    margin-bottom: 10px;
                    padding-bottom: 5px;
                    border-bottom: 1px dashed #555;
                }

                .company-name { font-size: 16px; font-weight: bold; text-transform: uppercase; }
                .invoice-meta { font-size: 10px; margin-top: 5px; line-height: 1.4; }

                /* TABLE */
                .items-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 10px;
                    margin-bottom: 10px;
                }
                
                .items-table th { text-align: left; padding: 2px 0; }
                .items-table td { padding: 2px 0; vertical-align: top; }
                
                /* Column Widths */
                .col-qty { width: 15%; text-align: center; }
                .col-item { width: 60%; text-align: left; }
                .col-price { width: 25%; text-align: right; }

                /* TOTALS */
                .totals-section {
                    border-top: 1px dashed #555;
                    padding-top: 5px;
                    font-size: 11px;
                }

                .totals-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 11px;
                }
                
                .totals-table td {
                    padding: 2px 0;
                    vertical-align: top;
                }
                
                .totals-table td:first-child {
                    text-align: left;
                    width: 50%;
                }
                
                .totals-table td:last-child {
                    text-align: right;
                    width: 50%;
                }
                
                .total-row {
                    font-weight: bold;
                    font-size: 14px;
                    border-top: 1px solid #555;
                    padding-top: 5px;
                    margin-top: 5px;
                }

                .invoice-footer {
                    margin-top: 15px;
                    font-size: 10px;
                    text-align: center;
                }
                
                .invoice-number-section {
                    margin-bottom: 10px;
                    text-align: center;
                }
                
                .invoice-number-text {
                    font-size: 10px;
                    margin-bottom: 5px;
                }
                
                .barcode-container {
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    margin: 5px 0;
                }
                
                .barcode-container :global(svg) {
                    width: 80px !important;
                    height: 80px !important;
                }
                
                @media print {
                    .barcode-container :global(svg) {
                        width: 80px !important;
                        height: 80px !important;
                    }
                }

                .footer {
                    margin-top: 10px;
                    font-size: 10px;
                    text-align: center;
                }
            `}</style>

            {/* --- INVOICE CONTENT --- */}
            <div className="invoice-header">
                <div className="company-name">{companyName}</div>
                <div className="invoice-meta">
                    {branchName}<br/>
                    {website && <>{website}<br/></>}
                    {saleDate}<br/>
                    User: {userName}
                </div>
            </div>

            <table className="items-table">
                <thead>
                    <tr>
                        <th className="col-qty">Qty</th>
                        <th className="col-item">Item</th>
                        <th className="col-price">Amt</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map((item, index) => (
                        <tr key={index}>
                            <td className="col-qty">{item.quantity}</td>
                            <td className="col-item">
                                {item.product?.name || 'Item'}
                            </td>
                            <td className="col-price">
                                {Math.round((item.price * item.quantity))}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <div className="totals-section">
                <table className="totals-table">
                    <tbody>
                        <tr>
                            <td>Subtotal:</td>
                            <td>{currency}{safeTotals.subtotal.toFixed(2)}</td>
                        </tr>
                        {safeTotals.discount > 0 && (
                            <tr>
                                <td>Disc:</td>
                                <td>-{currency}{safeTotals.discount.toFixed(2)}</td>
                            </tr>
                        )}
                        <tr className="total-row">
                            <td>Total:</td>
                            <td>{currency}{safeTotals.total.toFixed(2)}</td>
                        </tr>
                        <tr style={{marginTop: '5px'}}>
                            <td>Paid:</td>
                            <td>{currency}{paid.toFixed(2)}</td>
                        </tr>
                        <tr>
                            <td>Change:</td>
                            <td>{currency}{Math.abs(remaining).toFixed(2)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div className="invoice-footer">
                <div className="invoice-number-section">
                    <div className="invoice-number-text">Invoice: {invoiceNo}</div>
                    <div className="barcode-container">
                        <BarcodeDisplay barcode={invoiceNo} />
                    </div>
                </div>
            </div>

            <div className="footer">
                Thank You!
            </div>
        </div>
    );
};

export default SaleInvoice;