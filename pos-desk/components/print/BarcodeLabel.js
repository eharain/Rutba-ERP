// file: /pos-desk/components/print/BarcodeLabel.js
import React, { useState, useEffect } from 'react';
import ProductInfo from './ProductInfo';
import SkuDisplay from './SkuDisplay';
import BarcodeDisplay from './BarcodeDisplay';

const BarcodeLabel = ({ item, isEmpty = false }) => {
    const [dpi, setDpi] = useState(96); // Default DPI
    
    useEffect(() => {
        // Detect screen resolution and DPI for print normalization
        if (typeof window !== 'undefined') {
            // Get device pixel ratio (handles high-DPI displays)
            const devicePixelRatio = window.devicePixelRatio || 1;
            // Standard DPI calculation
            const screenDPI = 96 * devicePixelRatio;
            setDpi(screenDPI);
        }
    }, []);
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
                    /* Force fixed dimensions for print regardless of screen resolution */
                    @page {
                        margin: 0;
                        size: 2.4in 1.5in;
                    }
                    
                    .barcode-label {
                        width: 2.4in !important;
                        height: 1.5in !important;
                        max-width: 2.4in !important;
                        max-height: 1.5in !important;
                        min-width: 2.4in !important;
                        min-height: 1.5in !important;
                        border: none !important;
                        background: white !important;
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                        page-break-inside: avoid;
                        break-inside: avoid;
                        overflow: hidden;
                        box-sizing: border-box;
                        padding: 0.1in 0.15in;
                        margin: 0;
                    }
                    
                    .left-content {
                        max-width: calc(2.4in - 0.75in);
                        overflow: hidden;
                    }
                    
                    .right-content {
                        width: 0.6in !important;
                        min-width: 0.6in !important;
                        max-width: 0.6in !important;
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
                <SkuDisplay sku={item.barcode || item.sku} />
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