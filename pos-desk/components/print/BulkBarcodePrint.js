// file: /pos-desk/components/print/BulkBarcodePrint.js
import React, { useEffect, useState } from 'react';
import { authApi } from '../../lib/api';
import LabelSheet from './LabelSheet';

const BulkBarcodePrint = ({ storageKey, title = "Bulk Barcode Labels" }) => {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const loadItems = async () => {
            if (!storageKey) {
                setError('No storage key provided');
                setLoading(false);
                return;
            }

            try {
                setLoading(true);
                setError(null);

                const storedData = JSON.parse(localStorage.getItem(storageKey) || '{}');
                const documentIds = storedData.documentIds || [];

                if (documentIds.length === 0) {
                    setError('No items found to print');
                    setLoading(false);
                    return;
                }

                console.log(`Loading ${documentIds.length} items for printing...`);

                const batchSize = documentIds.length > 20 ? 20 : documentIds.length;
                const itemsData = [];

                for (let i = 0; i < documentIds.length; i += batchSize) {
                    const batch = documentIds.slice(i, i + batchSize);
                    const batchPromises = batch.map(async (docId) => {
                        try {
                            const response = await authApi.get(`/stock-items/${docId}`, {
                                populate: ['product']
                            });
                            return response.data;
                        } catch (error) {
                            console.error(`Error loading item ${docId}:`, error);
                            return null;
                        }
                    });

                    const batchResults = await Promise.all(batchPromises);
                    itemsData.push(...batchResults.filter(item => item !== null));

                    if (i + batchSize < documentIds.length) {
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                }

                setItems(itemsData);
                localStorage.removeItem(storageKey);

            } catch (error) {
                console.error('Error loading items for print:', error);
                setError('Failed to load items for printing');
            } finally {
                setLoading(false);
            }
        };

        loadItems();
    }, [storageKey]);

    const generateLabelSheets = () => {
        if (loading || items.length === 0) return [];

        const labelsPerSheet = 1;
        const sheets = [];

        for (let i = 0; i < items.length; i += labelsPerSheet) {
            sheets.push(items.slice(i, i + labelsPerSheet));
        }

        return sheets;
    };

    const sheets = generateLabelSheets();

    if (error) {
        return (
            <div className="d-flex flex-column justify-content-center align-items-center" style={{ height: '200px', fontSize: '16px', color: '#dc3545' }}>
                <div>❌ {error}</div>
                <button
                    onClick={() => window.close()}
                    className="btn btn-secondary mt-2"
                >
                    Close
                </button>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="d-flex flex-column justify-content-center align-items-center" style={{ height: '200px', fontSize: '16px' }}>
                <div>🔄 Loading items for printing...</div>
                <div style={{ fontSize: '12px', color: '#666' }}>
                    Loading {items.length > 0 ? `${items.length} items` : 'items'}...
                </div>
            </div>
        );
    }

    if (items.length === 0) {
        return (
            <div className="d-flex justify-content-center align-items-center" style={{ height: '200px', fontSize: '16px', color: '#666' }}>
                No items found to print.
            </div>
        );
    }

    return (
        <div className="bulk-barcode-print container-fluid p-0">
            {sheets.map((sheet, sheetIndex) => (
                <LabelSheet
                    key={sheetIndex}
                    items={sheet}
                    sheetIndex={sheetIndex}
                    totalSheets={sheets.length}
                    title={title}
                    totalItems={items.length}
                />
            ))}
        </div>
    );
};

export default BulkBarcodePrint;