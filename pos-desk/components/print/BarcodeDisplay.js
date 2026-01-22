import React from 'react';
import { QRCodeSVG } from 'qrcode.react';

const BarcodeDisplay = ({ barcode, sku, width = '100%', height = '1.5in' }) => {
    const displayValue = barcode || sku;

    if (!displayValue) return null;

    return (
        <div className="label-container">
            {/* QR CODE + SKU */}
            <div className="d-flex justify-content-center align-items-center mt-1">
                <QRCodeSVG
                    value={displayValue}
                    size={40}            /* Adjusted size to fit 1.5in height with text */
                    level="M"            /* Medium Error Correction */
                    fgColor="#000000"    /* Force Black Bars */
                    bgColor="#FFFFFF"    /* Force White Background */
                    includeMargin={false}
                />
            </div>
        </div>
    );
};

export default BarcodeDisplay;