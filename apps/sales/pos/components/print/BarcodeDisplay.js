import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import Barcode from 'react-barcode';

/**
 * Footer barcode block for the sale receipt. Renders both:
 *   • a 1D Code128 strip — what counter scanners read fastest
 *   • a QR code — what customers can scan with a phone
 *
 * The 1D strip is sized to fit thermal paper (no inner margin, value
 * hidden because the receipt already shows the invoice number below).
 * The QR is medium-sized — big enough to scan reliably from a phone
 * camera at arm's length, small enough not to waste paper.
 */
const BarcodeDisplay = ({ barcode, sku, fontSize = 11, showBarcode = true, showQR = true }) => {
    const displayValue = barcode || sku;
    if (!displayValue) return null;

    const qrSize = 40 + fontSize * 2;

    return (
        <div className="label-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            {showBarcode && (
                <div style={{ width: '90%', display: 'flex', justifyContent: 'center' }}>
                    <Barcode
                        value={String(displayValue)}
                        format="CODE128"
                        lineColor="#000"
                        width={1.4}
                        height={36}
                        displayValue={false}
                        margin={0}
                        background="#fff"
                    />
                </div>
            )}
            {showQR && (
                <QRCodeSVG
                    value={String(displayValue)}
                    size={qrSize}
                    level="M"
                    fgColor="#000"
                    bgColor="#fff"
                />
            )}
        </div>
    );
};

export default BarcodeDisplay;