import { useState, useEffect } from 'react';
import { searchStockItems } from '../../lib/pos';
import { useUtil } from '../../context/UtilContext';
export default function SalesItemsForm({ onAddItem }) {
    const [productSearch, setProductSearch] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [showResults, setShowResults] = useState(false);
    const [loading, setLoading] = useState(false);
    const { currency } = useUtil();
    // Product search with debounce
    useEffect(() => {
        const delayDebounceFn = setTimeout(() => {
            if (productSearch.length > 2) {
                handleProductSearch(productSearch);
            } else {
                setSearchResults([]);
                setShowResults(false);
            }
        }, 300);

        return () => clearTimeout(delayDebounceFn);
    }, [productSearch]);

    const handleProductSearch = async (searchText) => {
        setLoading(true);
        try {
            const productResult = await searchStockItems(searchText, 0, 100, 'InStock');
            console.log(productResult);
            setSearchResults(productResult.data);
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
        setShowResults(false);
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            // Auto-select first result on Enter if there are results
            if (searchResults.length > 0) {
                handleProductSelect(searchResults[0]);
            }
        }
    };

    return (
        <div style={{ marginBottom: '20px', position: 'relative' }}>
            <input
                type="text"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Scan barcode or search product..."
                style={{
                    width: '100%',
                    padding: '12px',
                    fontSize: '16px',
                    border: '2px solid #007bff',
                    borderRadius: '4px'
                }}
                autoFocus
            />

            {loading && (
                <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    background: 'grey',
                    border: '1px solid #ccc',
                    padding: '8px',
                    zIndex: 1001
                }}>
                    Searching...
                </div>
            )}

            {showResults && searchResults.length > 0 && (
                <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    background: 'black',
                    border: '1px solid #ccc',
                    maxHeight: '200px',
                    overflowY: 'auto',
                    zIndex: 1000,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                }}>
                    {searchResults.map(product => (
                        <div
                            key={product.id}
                            onClick={() => handleProductSelect(product)}
                            style={{
                                padding: '12px',
                                cursor: 'pointer',
                                borderBottom: '1px solid #eee',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                            }}
                            onMouseEnter={(e) => e.target.style.background = '#f5f5f5'}
                            onMouseLeave={(e) => e.target.style.background = 'grey'}
                        >
                            <div>
                                <strong>{product.product.name}</strong>
                                {product.barcode && (
                                    <span style={{ color: '#666', marginLeft: '10px' }}>
                                        ({product.barcode})
                                    </span>
                                )}
                            </div>
                            <div style={{ fontWeight: 'bold', color: 'black' }}>
                                {currency}{product.selling_price || 0}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}