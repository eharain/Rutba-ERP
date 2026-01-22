// file: /pos-desk/components/print/SkuDisplay.js
import React from 'react';

const SkuDisplay = ({ sku, label = "SKU" }) => {
    if (!sku) {
        return (
            <div className="d-flex flex-column align-items-center justify-content-center bg-light border rounded text-center" style={{ margin: '4px 0', padding: '3px', minHeight: '20px' }}>
                <div className="small text-muted fw-bold text-uppercase" style={{ marginBottom: '1px', letterSpacing: '0.5px' }}>{label}</div>
                <div className="font-monospace small text-muted fst-italic">No SKU</div>
            </div>
        );
    }

    return (
        <div className="d-flex flex-column align-items-center justify-content-center rounded text-center bg-secondary text-white" style={{ margin: '4px 0', padding: '3px', marginLeft: '25px' }}>
            <div className="small fw-bold text-uppercase" style={{ marginBottom: '1px', letterSpacing: '0.5px' }}>{label}</div>
            <div className="font-monospace fw-bold" style={{ fontSize: '0.9rem', letterSpacing: '0.5px', wordBreak: 'break-all', lineHeight: 1.1 }}>{sku}</div>
        </div>
    );
};

export default SkuDisplay;