import React, { useEffect } from 'react';
import { useUtil } from '@rutba/pos-shared/context/UtilContext';
import { QRCodeSVG } from 'qrcode.react';
import { marked } from '@rutba/pos-shared/lib/marked.esm.js';

const SaleReturnReceipt = ({ saleReturn, onClose }) => {
    const { currency, branch, user, invoicePrintSettings } = useUtil();

    const companyName = branch?.companyName || branch?.name || 'Company Name';
    const userName = user?.displayName || user?.username || user?.email || 'User';
    const returnNo = saleReturn?.return_no || 'N/A';
    const returnDate = saleReturn?.return_date ? new Date(saleReturn.return_date).toLocaleDateString() : new Date().toLocaleDateString();
    const saleInvoice = saleReturn?.sale?.invoice_no || 'N/A';
    const customerName = saleReturn?.sale?.customer?.name || saleReturn?.sale?.customer?.email || 'Walk-in Customer';
    const totalRefund = Number(saleReturn?.total_refund || 0);
    const items = saleReturn?.items || [];

    const paperWidth = invoicePrintSettings?.paperWidth || '80mm';
    const fontSize = invoicePrintSettings?.fontSize || 11;
    const showBranch = invoicePrintSettings?.showBranch ?? true;
    const branchFields = invoicePrintSettings?.branchFields ?? ['name', 'companyName', 'web'];
    const socialFields = invoicePrintSettings?.socialFields ?? [];
    const socialQRFields = invoicePrintSettings?.socialQRFields ?? [];
    const showTerms = invoicePrintSettings?.showTerms ?? false;

    useEffect(() => {
        const timer = setTimeout(() => {
            window.print();
        }, 500);
        return () => clearTimeout(timer);
    }, []);

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
        <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
            <button
                type="button"
                className="d-print-none btn btn-sm btn-success position-fixed"
                aria-label="Quick print"
                onClick={() => window.print()}
                style={{ top: '20px', right: '70px', zIndex: 1100, borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
                🖨
            </button>
            <button
                type="button"
                className="d-print-none btn btn-sm btn-secondary position-fixed"
                aria-label="Close"
                onClick={onClose}
                style={{ top: '20px', right: '20px', zIndex: 1100, borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
                ✕
            </button>

            <div className="sale-invoice-container" style={{ fontFamily: "'Courier New', monospace", width: paperWidth, margin: '20px auto', padding: '10px', textAlign: 'center', fontSize: `${fontSize}px` }}>
                <style jsx global>{`
                    @media print {
                        body * { visibility: hidden; }
                        .sale-invoice-container, .sale-invoice-container * { visibility: visible; }
                        .sale-invoice-container {
                            position: absolute;
                            left: 0; top: 0;
                            width: 100%;
                            margin: 0; padding: 0;
                            background: white !important;
                        }
                        @page { margin: 0; size: auto; }
                    }
                `}</style>

                {/* Header */}
                <div className="mb-2 pb-1" style={{ borderBottom: '1px dashed #555' }}>
                    <div className="fs-5 fw-bold text-uppercase">{companyName}</div>
                    <div className="small mt-1" style={{ lineHeight: 1.4 }}>
                        {showBranch && renderBranchFields()}
                        {returnDate}<br />
                        User: {userName}
                    </div>
                    <div className="text-uppercase fw-bold text-danger mt-1" style={{ fontSize: '14px' }}>
                        RETURN RECEIPT
                    </div>
                </div>

                {/* Return info */}
                <div className="text-start small mb-2" style={{ lineHeight: 1.4 }}>
                    <div><strong>Return #:</strong> {returnNo}</div>
                    <div><strong>Original Invoice:</strong> {saleInvoice}</div>
                    <div><strong>Customer:</strong> {customerName}</div>
                    <div><strong>Type:</strong> {saleReturn?.type || 'Return'}</div>
                    <div><strong>Refund Via:</strong> {saleReturn?.refund_method || 'Cash'}</div>
                </div>

                {/* Items */}
                <table className="w-100 table-borderless" style={{ fontSize: '10px', marginBottom: '10px' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px dashed #999' }}>
                            <th className="text-center" style={{ width: '15%' }}>Qty</th>
                            <th className="text-start" style={{ width: '55%' }}>Item</th>
                            <th className="text-end" style={{ width: '30%' }}>Amt</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((item, index) => (
                            <tr key={index}>
                                <td className="text-center">{item.quantity || 0}</td>
                                <td className="text-start">{item.product?.name || 'Item'}</td>
                                <td className="text-end">{currency}{Number(item.total || 0).toFixed(2)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {/* Totals */}
                <div style={{ borderTop: '1px dashed #555', paddingTop: '5px', fontSize: '11px' }}>
                    <table className="w-100" style={{ borderCollapse: 'collapse', fontSize: '11px' }}>
                        <tbody>
                            <tr className="fw-bold" style={{ fontSize: '14px', borderTop: '1px solid #555', paddingTop: '5px' }}>
                                <td className="text-start">Total Refund:</td>
                                <td className="text-end">{currency}{totalRefund.toFixed(2)}</td>
                            </tr>
                            <tr>
                                <td className="text-start">Refund Method:</td>
                                <td className="text-end">{saleReturn?.refund_method || 'Cash'}</td>
                            </tr>
                            <tr>
                                <td className="text-start">Status:</td>
                                <td className="text-end">{saleReturn?.refund_status || 'Refunded'}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                {/* Footer */}
                <div className="mt-3" style={{ borderTop: '1px dashed #555', paddingTop: '5px' }}>
                    <div className="small">{returnNo}</div>
                    <div className="small mt-2 text-muted">Thank you</div>
                </div>

                {showTerms && branch?.invoiceTerms && (
                    <div className="invoice-terms mt-2" style={{ borderTop: '1px dashed #555', paddingTop: '4px', fontSize: `${fontSize - 2}px`, lineHeight: 1.4 }}>
                        <div dangerouslySetInnerHTML={{ __html: marked(branch.invoiceTerms) }} />
                    </div>
                )}

                {(socialFields.length > 0 || socialQRFields.length > 0) && branch && (() => {
                    const SOCIAL_ITEMS = [
                        { key: 'email',     icon: <i className="fas fa-envelope" />, label: 'Email',     value: branch.email },
                        { key: 'phone',     icon: <i className="fas fa-phone" />, label: 'Phone',     value: branch.phone },
                        { key: 'watsapp',   icon: <i className="fab fa-whatsapp" />, label: 'WhatsApp',  value: branch.watsapp,   qr: true },
                        { key: 'youtube',   icon: <i className="fab fa-youtube" />, label: 'YouTube',   value: branch.youtube,   qr: true },
                        { key: 'tiktok',    icon: <i className="fab fa-tiktok" />, label: 'TikTok',    value: branch.tiktok,    qr: true },
                        { key: 'instagram', icon: <i className="fab fa-instagram" />, label: 'Instagram', value: branch.instagram, qr: true },
                        { key: 'twitter',   icon: <i className="fab fa-x-twitter" />, label: 'Twitter',   value: branch.twitter,   qr: true },
                    ];
                    const visible = SOCIAL_ITEMS.filter(s => s.value && (socialFields.includes(s.key) || socialQRFields.includes(s.key)));
                    if (!visible.length) return null;
                    const hasQR = visible.some(s => s.qr && socialQRFields.includes(s.key));
                    const colWidth = paperWidth === '210mm' ? '33.33%' : '50%';
                    return (
                        <div className="social-links mt-1" style={{ borderTop: '1px dashed #555', paddingTop: '4px' }}>
                            <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: `${fontSize - 1}px`, marginBottom: '4px' }}>Follow Us</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center' }}>
                                {visible.map(s => {
                                    const showLink = socialFields.includes(s.key);
                                    const showQR = s.qr && socialQRFields.includes(s.key);
                                    return (
                                        <div key={s.key} style={{
                                            width: hasQR ? colWidth : colWidth,
                                            boxSizing: 'border-box',
                                            padding: '3px 2px',
                                            textAlign: 'center',
                                            fontSize: `${fontSize - 1}px`,
                                            lineHeight: 1.3
                                        }}>
                                            {showQR && (
                                                <QRCodeSVG value={s.value} size={44} level="L" />
                                            )}
                                            {showQR && !showLink && (
                                                <div style={{ marginTop: '2px', fontWeight: 'bold' }}>{s.icon}</div>
                                            )}
                                            {showLink && (
                                                <div style={showQR ? { marginTop: '2px' } : undefined}>{s.icon} {s.value}</div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })()}
            </div>
        </div>
    );
};

export default SaleReturnReceipt;
