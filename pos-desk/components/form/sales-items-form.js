import { useState, useEffect } from 'react';
import { searchStockItems } from '../../lib/pos';
import { useUtil } from '../../context/UtilContext';

export default function SalesItemsForm({ onAddItem, disabled = false }) {
    const [productSearch, setProductSearch] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [showResults, setShowResults] = useState(false);
    const [loading, setLoading] = useState(false);
    const [highlightIndex, setHighlightIndex] = useState(0);

    const { currency } = useUtil();

    function uniqueStockeItemsByProduct(list) {
        return list.reduce((acc, item) => {
            if (!acc.find(i => i.product.id === item.product.id)) {
                acc.push(item);
            }
            return acc;
        }, []);
    }

    /* ---------------- Debounced search ---------------- */
    useEffect(() => {
        const delay = setTimeout(() => {
            if (productSearch.length >= 2) {
                handleProductSearch(productSearch);
            } else {
                setSearchResults([]);
                setShowResults(false);
            }
        }, 300);

        return () => clearTimeout(delay);
    }, [productSearch]);

    /* ---------------- Reset highlight when results change ---------------- */
    useEffect(() => {
        setHighlightIndex(0);
    }, [searchResults]);

    const handleProductSearch = async (searchText) => {
        setLoading(true);
        try {
            const productResult = await searchStockItems(
                searchText,
                0,
                100,
                'InStock'
            );

            const uniqueStockItems = uniqueStockeItemsByProduct(productResult.data || []);
            setSearchResults(uniqueStockItems);
            setShowResults(true);
        } catch (error) {
            console.error('Error searching products:', error);
            setSearchResults([]);
        } finally {
            setLoading(false);
        }
    };

    const handleProductSelect = (product) => {
        onAddItem(product);
        setProductSearch('');
        setSearchResults([]);
        setShowResults(false);
    };

    /* ---------------- Keyboard navigation ---------------- */
    const handleKeyDown = (e) => {
        if (!showResults || searchResults.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightIndex(i =>
                Math.min(i + 1, searchResults.length - 1)
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

        if (e.key === 'Escape') {
            setShowResults(false);
        }
    };

    /* ---------------- Enter / barcode support ---------------- */
    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && searchResults.length > 0) {
            e.preventDefault();
            handleProductSelect(searchResults[highlightIndex]);
        }
    };

    return (
        <div
            style={{
                marginBottom: '20px',
                position: 'relative',
                opacity: disabled ? 0.5 : 1
            }}
        >
            <input
                type="text"
                value={productSearch}
                onChange={(e) => !disabled && setProductSearch(e.target.value)}
                onKeyDown={handleKeyDown}
                onKeyPress={handleKeyPress}
                placeholder={
                    disabled
                        ? 'Sale is completed - cannot add items'
                        : 'Scan barcode or search product...'
                }
                disabled={disabled}
                autoFocus={!disabled}
                style={{
                    width: '100%',
                    padding: '12px',
                    fontSize: '16px',
                    border: '2px solid #007bff',
                    borderRadius: '4px',
                    backgroundColor: disabled ? '#f5f5f5' : 'white',
                    color: disabled ? '#666' : 'black'
                }}
            />

            {loading && (
                <div
                    style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        background: 'grey',
                        border: '1px solid #ccc',
                        padding: '8px',
                        zIndex: 1001
                    }}
                >
                    Searching...
                </div>
            )}

            {showResults && searchResults.length > 0 && (
                <div
                    style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        background: 'black',
                        border: '1px solid #ccc',
                        maxHeight: '200px',
                        overflowY: 'auto',
                        zIndex: 1000
                    }}
                >
                    {searchResults.map((stockItem, index) => (
                        <div
                            key={stockItem.id}
                            onClick={() => !disabled && handleProductSelect(stockItem)}
                            onMouseEnter={() => setHighlightIndex(index)}
                            style={{
                                padding: '12px',
                                cursor: disabled ? 'not-allowed' : 'pointer',
                                borderBottom: '1px solid #eee',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                background:
                                    index === highlightIndex
                                        ? 'grey'
                                        : 'black'
                            }}
                        >
                            <div>
                                <strong>{stockItem.product.name}</strong>
                                {stockItem.barcode && (
                                    <span style={{ color: '#666', marginLeft: '10px' }}>
                                        ({stockItem.barcode})
                                    </span>
                                )}
                            </div>
                            <div style={{ fontWeight: 'bold' }}>
                                {currency}
                                {stockItem.selling_price || 0}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
