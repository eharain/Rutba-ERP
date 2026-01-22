// file: /pos-desk/components/print/BarcodeLabel.js
import React, { useState, useEffect } from 'react';
import ProductInfo from './ProductInfo';
import SkuDisplay from './SkuDisplay';
import BarcodeDisplay from './BarcodeDisplay';

const BarcodeLabel = ({ item, isEmpty = false }) => {
    const [dpi, setDpi] = useState(96); // Default DPI
    
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const devicePixelRatio = window.devicePixelRatio || 1;
            const screenDPI = 96 * devicePixelRatio;
            setDpi(screenDPI);
        }
    }, []);
    if (isEmpty) {
        return (
            <div
                className="d-flex justify-content-center align-items-center bg-light"
                style={{
                    border: '1px dashed #ccc',
                    width: '2.4in',
                    height: '1.5in',
                    boxSizing: 'border-box'
                }}
            >
                <div style={{ color: '#999', fontSize: '8px' }}>EMPTY SLOT</div>
            </div>
        );
    }

    return (
        <div
            className="d-flex align-items-center justify-content-between"
            style={{
                width: '2.4in',
                height: '1.5in',
                paddingRight: '25px',
                boxSizing: 'border-box',
                background: 'white',
                pageBreakInside: 'avoid',
            }}
        >
            {/* LEFT SIDE: Name, Price, and SKU Text */}
            <div className="d-flex flex-column align-items-start text-start flex-grow-1" style={{ overflow: 'hidden' }}>
                <ProductInfo
                    product={item.product}
                    status={item.status}
                    costPrice={item.selling_price}
                />
                <SkuDisplay sku={item.barcode || item.sku} />
            </div>

            {/* RIGHT SIDE: The QR Code */}
            <div className="d-flex justify-content-center align-items-center" style={{ width: '60px', marginLeft: '5px' }}>
                <BarcodeDisplay
                    barcode={item.barcode}
                    sku={item.sku}
                />
            </div>
        </div>
    );
};

export default BarcodeLabel;