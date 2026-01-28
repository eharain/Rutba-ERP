import { useState, useEffect } from 'react';
import { searchStockItems } from '../../lib/pos';
import { useUtil } from '../../context/UtilContext';

export default function SalesItemsForm({
    onAddItem,
    onAddNonStock,
    disabled = false
}) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [showResults, setShowResults] = useState(false);
    const [highlightIndex, setHighlightIndex] = useState(0);
    const { currency } = useUtil();

    /* ---------------- Search with debounce ---------------- */
    useEffect(() => {
        const t = setTimeout(() => {
            if (query.length > 2) {
                search(query);
            } else {
                setResults([]);
                setShowResults(false);
            }
        }, 300);

        return () => clearTimeout(t);
    }, [query]);

    const search = async (text) => {
        try {
            const res = await searchStockItems(text, 0, 50, 'InStock');
            setResults(res.data || []);
            setShowResults(true);
            setHighlightIndex(0);
        } catch (e) {
            console.error('Product search failed', e);
            setResults([]);
        }
    };

    const selectStockItem = (item) => {
        onAddItem(item);
        setQuery('');
        setShowResults(false);
    };

    const addNonStockItem = () => {
        if (!query.trim()) return;

        onAddNonStock({
            name: query,
            price: 0,
            costPrice: 0
        });

        setQuery('');
        setShowResults(false);
    };

    /* ---------------- Keyboard navigation ---------------- */
    const handleKeyDown = (e) => {
        if (!showResults) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightIndex(i =>
                Math.min(i + 1, results.length - 1)
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
            results.length
                ? selectStockItem(results[highlightIndex])
                : addNonStockItem();
            return;
        }

        if (e.key === 'Escape') {
            setShowResults(false);
        }
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
                    {results.map((item, index) => (
                        <div
                            key={item.id}
                            className={`dropdown-item ${index === highlightIndex ? 'active' : ''
                                }`}
                            onMouseEnter={() => setHighlightIndex(index)}
                            onClick={() => selectStockItem(item)}
                        >
                            {item.product.name} — {currency}{item.selling_price}
                        </div>
                    ))}

                    {results.length === 0 && (
                        <div className="dropdown-item text-muted">
                            Press Enter to add as non-stock item
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
