import { useState, useEffect, useRef } from 'react';

import { useUtil } from '@rutba/pos-shared/context/UtilContext';
import SaleApi from '@rutba/pos-shared/lib/saleApi';

export default function SalesItemsForm({
    onAddItem,
    onAddNonStock,
    currentItems = [],
    disabled = false
}) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [showResults, setShowResults] = useState(false);
    const [highlightIndex, setHighlightIndex] = useState(0);
    const { currency } = useUtil();
    const latestSearchRef = useRef('');

    // Collect stock-item documentIds already added to the sale
    const usedStockIds = new Set();
    for (const saleItem of currentItems) {
        if (!Array.isArray(saleItem.items)) continue;
        for (const si of saleItem.items) {
            if (si?.documentId) usedStockIds.add(si.documentId);
        }
    }

    /* ---------------- Search with debounce ---------------- */
    useEffect(() => {
        const t = setTimeout(() => {
            if (query.length > 1) {
                search(query);
            } else {
                setResults([]);
                setShowResults(false);
            }
        }, 300);

        return () => clearTimeout(t);
    }, [query]);

    const search = async (text) => {
        latestSearchRef.current = text;
        try {
            const aggregated = await SaleApi.searchStockItemsByNameOrBarcode(text);
            if (latestSearchRef.current !== text) return;
            setResults(aggregated);
            setShowResults(true);
            setHighlightIndex(0);
        } catch (e) {
            if (latestSearchRef.current !== text) return;
            console.error('Product search failed', e);
            setResults([]);
            setShowResults(false);
        }
    };

    const selectStockItem = (item) => {
        onAddItem(item);
        setQuery('');
        setShowResults(false);
    };

    const addNonStockItem = () => {
        if (!query.trim()) return;

        onAddNonStock(query);

        setQuery('');
        setShowResults(false);
    };

    /* ---------------- Keyboard navigation ---------------- */
    const handleKeyDown = (e) => {
        if (!showResults) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightIndex(i =>
                Math.min(i + 1, filteredResults.length - 1)
            );
            return;
        }

        if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightIndex(i =>
                Math.max(i - 1, 0)
            );
            return;
        }

        if (e.key === 'Enter') {
            e.preventDefault();
            filteredResults.length
                ? selectStockItem(filteredResults[highlightIndex])
                : addNonStockItem();
            return;
        }

        if (e.key === 'Escape') {
            setShowResults(false);
        }
    };

    // Filter out products where all stock items are already in the sale
    const filteredResults = results.filter(item => {
        const allIds = [item.documentId, ...(item.more || []).map(m => m.documentId)].filter(Boolean);
        const available = allIds.filter(id => !usedStockIds.has(id));
        return available.length > 0;
    });

    // Compute available stock count per result for display
    const availableCount = (item) => {
        const allIds = [item.documentId, ...(item.more || []).map(m => m.documentId)].filter(Boolean);
        return allIds.filter(id => !usedStockIds.has(id)).length;
    };

    return (
        <div style={{ position: 'relative', marginBottom: 20 }}>
            <input
                type="text"
                className="form-control"
                value={query}
                disabled={disabled}
                placeholder="Scan barcode / search / add custom item"
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                autoFocus={!disabled}
            />

            {showResults && (
                <div className="dropdown-menu show w-100">
                    {filteredResults.map((item, index) => {
                        const remaining = availableCount(item);
                        return (
                            <div
                                key={(item.id ?? item.product?.id ?? item.name) + '_' + index}
                                className={`dropdown-item ${index === highlightIndex ? 'active' : ''}`}
                                onMouseEnter={() => setHighlightIndex(index)}
                                onClick={() => selectStockItem(item)}
                            >
                                <div className="d-flex justify-content-between">
                                    <span>
                                        {item.product?.name ?? item.name}
                                        <small className="text-muted ms-2">({remaining} available)</small>
                                    </span>
                                    <strong>
                                        {currency}
                                        {item.selling_price || 0}
                                    </strong>
                                </div>
                            </div>
                        );
                    })}

                    {filteredResults.length === 0 && (
                        <div className="dropdown-item text-muted">
                            {results.length > 0
                                ? 'All matching stock items are already in this sale'
                                : 'Type item (name \u2192 price \u2192 quantity \u2192 discount%) to add a non stock item'
                            }
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
