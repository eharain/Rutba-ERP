// /pos-desk/components/form/sales-item-form.js
import React, { useState } from 'react';
import { searchProduct } from '../../lib/pos';
import { Table, TableHead, TableBody, TableRow, TableCell } from '../Table';
import { useUtil } from '../../context/UtilContext';

const SalesItemForm = ({ items, onAddItem, onUpdateItem, onRemoveItem }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [showResults, setShowResults] = useState(false);
    const { currency } = useUtil();
    const handleSearch = async (term) => {
        if (term.length > 2) {
            const results = await searchProduct(term);
            setSearchResults(results);
            setShowResults(true);
        } else {
            setShowResults(false);
        }
    };

    const handleQuantityChange = (index, quantity) => {
        const item = items[index];
        onUpdateItem(index, {
            quantity: Math.max(1, quantity),
            total: item.price * quantity
        });
    };

    const handlePriceChange = (index, price) => {
        const item = items[index];
        onUpdateItem(index, {
            price: Math.max(0, price),
            total: price * item.quantity
        });
    };

    return (
        <div>
            <h3>Sale Items</h3>

            {/* Product Search */}
            <div style={{ marginBottom: '20px', position: 'relative' }}>
                <input
                    type="text"
                    placeholder="Search products by name or barcode..."
                    value={searchTerm}
                    onChange={(e) => {
                        setSearchTerm(e.target.value);
                        handleSearch(e.target.value);
                    }}
                    style={{ width: '100%', padding: '10px' }}
                />

                {showResults && searchResults.length > 0 && (
                    <div style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        background: 'lightgrey',
                        border: '1px solid #ccc',
                        maxHeight: '200px',
                        overflowY: 'auto',
                        zIndex: 1000
                    }}>
                        {searchResults.map(product => (
                            <div
                                key={product.id}
                                onClick={() => {
                                    onAddItem(product);
                                    setSearchTerm('');
                                    setShowResults(false);
                                }}
                                style={{
                                    padding: '10px',
                                    cursor: 'pointer',
                                    borderBottom: '1px solid #eee'
                                }}
                            >
                                {product.name} - {currency}{product.selling_price}
                                {product.barcode && (
                                    <span style={{ color: '#666', marginLeft: '10px' }}>
                                        (Barcode: {product.barcode})
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Items Table */}
            <Table>
                <TableHead>
                    <TableRow>
                        <TableCell>Product</TableCell>
                        <TableCell>Quantity</TableCell>
                        <TableCell>Price</TableCell>
                        <TableCell>Total</TableCell>
                        <TableCell>Actions</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {items.map((item, index) => (
                        <TableRow key={index}>
                            <TableCell>
                                <strong>{item.product?.name}</strong>
                                {item.product?.barcode && (
                                    <div style={{ fontSize: '12px', color: '#666' }}>
                                        SKU: {item.product.sku}
                                    </div>
                                )}
                            </TableCell>
                            <TableCell>
                                <input
                                    type="number"
                                    min="1"
                                    value={item.quantity}
                                    onChange={(e) => handleQuantityChange(index, parseInt(e.target.value))}
                                    style={{ width: '80px', padding: '5px' }}
                                />
                            </TableCell>
                            <TableCell>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={item.price}
                                    onChange={(e) => handlePriceChange(index, parseFloat(e.target.value))}
                                    style={{ width: '100px', padding: '5px' }}
                                />
                            </TableCell>
                            <TableCell>{currency} {item.total.toFixed(2)}</TableCell>
                            <TableCell>
                                <button
                                    onClick={() => onRemoveItem(index)}
                                    style={{
                                        padding: '5px 10px',
                                        background: '#dc3545',
                                        color: 'lightgrey',
                                        border: 'none',
                                        borderRadius: '4px'
                                    }}
                                >
                                    Remove
                                </button>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>

            {items.length === 0 && (
                <p style={{ textAlign: 'center', color: '#666', padding: '20px' }}>
                    No items added to the sale. Search for products above to add items.
                </p>
            )}
        </div>
    );
};

export default SalesItemForm;