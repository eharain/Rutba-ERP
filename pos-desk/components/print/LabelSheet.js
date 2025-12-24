// file: /pos-desk/components/print/LabelSheet.js
import React from 'react';
import BarcodeLabel from './BarcodeLabel';

const LabelSheet = ({ items, sheetIndex, totalSheets, title, totalItems }) => {
    const labelsPerSheet = 1;
    const emptySlots = Math.max(0, labelsPerSheet - items.length);

    return (
        <div className="label-sheet">
            <style jsx>{`
                .label-sheet {
                    page-break-after: always;
                    padding: 0.5in;
                    height: 100%;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                }
                
                .sheet-header {
                    text-align: center;
                    margin-bottom: 20px;
                    padding-bottom: 10px;
                    border-bottom: 2px solid #333;
                }
                
                .labels-grid {
                    display: grid;
                    grid-template-columns: repeat(1, 1fr);
                    grid-template-rows: repeat(1, 1fr);
                    gap: 0.2in;
                    flex: 1;
                }
                
                @media print {
                    @page {
                        margin: 0.5in;
                        size: 30mm 60mm portrait;
                    }
                    
                    .label-sheet {
                        margin: 0;
                        padding: 0.5in;
                        height: 30mm;
                        min-height: 30mm;
                        border: none !important;
                        page-break-after: always;
                    }
                    
                    .labels-grid {
                        grid-template-columns: repeat(1, 1fr);
                        grid-template-rows: repeat(1, 1fr);
                        gap: 0.15in;
                        page-break-after: always;
                    }
                    .sheet-header {
                        display: none !important;
                    }
                }
                
                @media screen {
                    .label-sheet {
                        border: 1px solid #ccc;
                        margin-bottom: 20px;
                        background: grey;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                    }
                }
            `}</style>

            <div className="sheet-header">
                <h2>{title} - Sheet {sheetIndex + 1} of {totalSheets}</h2>
                <p>Total Items: {totalItems} | Printed: {new Date().toLocaleDateString()}</p>
            </div>

            <div className="labels-grid">
                {items.map((item, index) => (
                    <BarcodeLabel
                        key={item.documentId || item.id || index}
                        item={item}
                    />
                ))}

                {/* Fill empty slots to maintain grid layout */}
                {Array.from({ length: emptySlots }).map((_, index) => (
                    <BarcodeLabel
                        key={`empty-${index}`}
                        isEmpty={true}
                    />
                ))}
            </div>
        </div>
    );
};

export default LabelSheet;