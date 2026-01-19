import { useState, useEffect } from 'react';
import { searchStockItems } from '../../lib/pos';
import { useUtil } from '../../context/UtilContext';
export default function SalesItemsForm({ onAddItem, disabled = false }) {
    const [productSearch, setProductSearch] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [showResults, setShowResults] = useState(false);
    const [loading, setLoading] = useState(false);
    const { currency } = useUtil();

    function uniqueStockeItemsByProduct(list){
        return list.reduce((acc, item) => {
            if (!acc.find(i => i.product.id === item.product.id)) {
                acc.push(item);
            }
            return acc;
        }, []);
    }

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
            
            const uniqueStockItems = uniqueStockeItemsByProduct(productResult.data);
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
        <div style={{ marginBottom: '20px', position: 'relative', opacity: disabled ? 0.5 : 1 }}>
            <input
                type="text"
                value={productSearch}
                onChange={(e) => !disabled && setProductSearch(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={disabled ? "Sale is completed - cannot add items" : "Scan barcode or search product..."}
                disabled={disabled}
                style={{
                    width: '100%',
                    padding: '12px',
                    fontSize: '16px',
                    border: '2px solid #007bff',
                    borderRadius: '4px',
                    backgroundColor: disabled ? '#f5f5f5' : 'white',
                    color: disabled ? '#666' : 'black',
                    cursor: disabled ? 'not-allowed' : 'text'
                }}
                autoFocus={!disabled}
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
                    {searchResults.map(stockItem => (
                        <div
                            key={stockItem.id}
                            onClick={() => !disabled && handleProductSelect(stockItem)}
                            style={{
                                padding: '12px',
                                cursor: disabled ? 'not-allowed' : 'pointer',
                                borderBottom: '1px solid #eee',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                            }}
                            onMouseEnter={(e) => !disabled && (e.target.style.background = '#f5f5f5')}
                            onMouseLeave={(e) => !disabled && (e.target.style.background = 'black')}
                        >
                            <div>
                                <strong>{stockItem.product.name}</strong>
                                {stockItem.barcode && (
                                    <span style={{ color: '#666', marginLeft: '10px' }}>
                                        ({stockItem.barcode})
                                    </span>
                                )}
                            </div>
                            <div style={{ fontWeight: 'bold', color: disabled ? '#666' : 'black' }}>
                                {currency}{stockItem.selling_price || 0}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}