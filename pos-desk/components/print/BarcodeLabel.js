// file: /pos-desk/components/print/BarcodeLabel.js
import React from 'react';
import ProductInfo from './ProductInfo';
import SkuDisplay from './SkuDisplay';
import BarcodeDisplay from './BarcodeDisplay';

const BarcodeLabel = ({ item, isEmpty = false }) => {
    if (isEmpty) {
        return (
            <div className="barcode-label empty">
                <style jsx>{`
                    .barcode-label.empty {
                        border: 1px dashed #ccc;
                        background: #f9f9f9;
                        width: 2.4in;
                        height: 1.5in;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                    }
                `}</style>
                <div style={{ color: '#999', fontSize: '8px' }}>EMPTY SLOT</div>
            </div>
        );
    }

    return (
        <div className="barcode-label">
            <style jsx>{`
                .barcode-label {
                    /* Exact dimensions for your paper */
                    width: 2.4in;
                    height: 1.5in;
                    
                    /* Change to Row for side-by-side layout */
                    display: flex;
                    flex-direction: row;
                    align-items: center;
                    justify-content: space-between;
                    
                    padding-right: 25px;
                    box-sizing: border-box;
                    background: grey; /* Changed from grey to white for thermal printing */
                    page-break-inside: avoid;
                }

                .left-content {
                    flex: 1; /* Takes up remaining space */
                    display: flex;
                    flex-direction: column;
                    align-items: flex-start; /* Align text to left */
                    text-align: left;
                    overflow: hidden;
                }

                .right-content {
                    width: 60px; /* Fixed width for the QR code column */
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    margin-left: 5px;
                }
                
                @media print {
                    .barcode-label {
                        border: none !important;
                        background: white !important;
                        -webkit-print-color-adjust: exact;
                    }
                }
                
                @media screen {
                    .barcode-label {
                        border: 1px solid #ccc;
                        margin-bottom: 10px;
                    }
                }
            `}</style>

            {/* LEFT SIDE: Name, Price, and SKU Text */}
            <div className="left-content">
                <ProductInfo
                    product={item.product}
                    status={item.status}
                    costPrice={item.selling_price}
                />
                <SkuDisplay sku={item.sku} />
            </div>

            {/* RIGHT SIDE: The QR Code */}
            <div className="right-content">
                <BarcodeDisplay
                    barcode={item.barcode}
                    sku={item.sku}
                />
            </div>
        </div>
    );
};

export default BarcodeLabel;