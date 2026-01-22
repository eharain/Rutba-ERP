// file: /pos-desk/components/print/LabelSheet.js
import React from 'react';
import BarcodeLabel from './BarcodeLabel';

const LabelSheet = ({ items, sheetIndex, totalSheets, title, totalItems }) => {
    const labelsPerSheet = 1;
    const emptySlots = Math.max(0, labelsPerSheet - items.length);

    return (
        <div
            className="label-sheet"
            style={{
                pageBreakAfter: 'always',
                padding: '0.5in',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                width: '2.4in',
                maxWidth: '2.4in',
                height: '1.5in',
                boxSizing: 'border-box'
            }}
        >
            <div className="sheet-header text-center" style={{ marginBottom: '20px', paddingBottom: '10px', borderBottom: '2px solid #333' }}>
                <h2 className="h6 m-0">{title} - Sheet {sheetIndex + 1} of {totalSheets}</h2>
                <p className="m-0">Total Items: {totalItems} | Printed: {new Date().toLocaleDateString()}</p>
            </div>

            <div className="labels-grid w-100 h-100 d-grid" style={{ gridTemplateColumns: '1fr', gridTemplateRows: '1fr', gap: '0.2in', flex: 1 }}>
                {items.map((item, index) => (
                    <BarcodeLabel
                        key={item.documentId || item.id || index}
                        item={item}
                    />
                ))}

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