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

                // Get document IDs from storage
                const storedData = JSON.parse(localStorage.getItem(storageKey) || '{}');
                const documentIds = storedData.documentIds || [];

                if (documentIds.length === 0) {
                    setError('No items found to print');
                    setLoading(false);
                    return;
                }

                console.log(`Loading ${documentIds.length} items for printing...`);

                // Load items in batches to avoid overwhelming the API
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

                    // Small delay between batches to avoid rate limiting
                    if (i + batchSize < documentIds.length) {
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                }

                setItems(itemsData);

                // Clean up storage after successful load
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

    // Group items into sheets
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
            <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                height: '200px',
                fontSize: '16px',
                color: '#dc3545',
                flexDirection: 'column',
                gap: '10px'
            }}>
                <div>❌ {error}</div>
                <button
                    onClick={() => window.close()}
                    style={{
                        padding: '8px 16px',
                        background: '#6c757d',
                        color: 'lightgrey',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                    }}
                >
                    Close
                </button>
            </div>
        );
    }

    if (loading) {
        return (
            <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                height: '200px',
                fontSize: '16px',
                flexDirection: 'column',
                gap: '10px'
            }}>
                <div>🔄 Loading items for printing...</div>
                <div style={{ fontSize: '12px', color: '#666' }}>
                    Loading {items.length > 0 ? `${items.length} items` : 'items'}...
                </div>
            </div>
        );
    }

    if (items.length === 0) {
        return (
            <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                height: '200px',
                fontSize: '16px',
                color: '#666'
            }}>
                No items found to print.
            </div>
        );
    }

    return (
        <div className="bulk-barcode-print">
            <style jsx>{`
                .bulk-barcode-print {
                    font-family: Arial, sans-serif;
                    margin: 0;
                    padding: 0;
                }
                
                @media screen {
                    .bulk-barcode-print {
                        background: lightgrey;
                        padding: 20px;
                    }
                }
            `}</style>

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