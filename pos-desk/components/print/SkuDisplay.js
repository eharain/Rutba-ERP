// file: /pos-desk/components/print/SkuDisplay.js
import React from 'react';

const SkuDisplay = ({ sku, label = "SKU" }) => {
    if (!sku) {
        return (
            <div className="sku-display">
                <style jsx>{`
                    .sku-display {
                        margin: 4px 0;
                        padding: 3px;
                        background: #f8f9fa;
                        border-radius: 3px;
                        text-align: center;
                        border: 1px solid #e9ecef;
                        min-height: 20px;
                        display: flex;
                        flex-direction: column;
                        justify-content: center;
                    }
                    
                    .sku-label {
                        font-size: 6px;
                        color: #666;
                        margin-bottom: 1px;
                        font-weight: bold;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                    }
                    
                    .sku-value {
                        font-family: 'Courier New', monospace;
                        font-size: 7px;
                        color: #999;
                        font-style: italic;
                    }

                `}</style>

                <div className="sku-label">{label}</div>
                <div className="sku-value">No SKU</div>
            </div>
        );
    }

    return (
        <div className="sku-display">
            <style jsx>{`
                .sku-display {
                    margin: 4px 0;
                    padding: 3px;
                    background: grey;
                    border-radius: 3px;
                    text-align: center;
                    border: none;
                    margin-left: 25px;
                }
                
                .sku-label {
                    font-size: 6px;
                    color: black;
                    margin-bottom: 1px;
                    font-weight: bold;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }
                
                .sku-value {
                    font-family: 'Courier New', monospace;
                    font-size: 8px;
                    font-weight: bold;
                    color: black;
                    letter-spacing: 0.5px;
                    word-break: break-all;
                    line-height: 1.1;
                }
                
                @media print {
                    .sku-display {
                        background: grey;
                        border: none !important;
                    }
                }
            `}</style>

            <div className="sku-label">{label}</div>
            <div className="sku-value">{sku}</div>
        </div>
    );
};

export default SkuDisplay;