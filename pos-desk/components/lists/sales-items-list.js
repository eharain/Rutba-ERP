import { Table, TableHead, TableBody, TableRow, TableCell } from '../Table';
import { useUtil } from '../../context/UtilContext';
import { calculateTax } from '../../lib/utils';

export default function SalesItemsList({ items, onUpdateItem, onRemoveItem, disabled = false }) {
    const { currency } = useUtil();
    const calculateItemDetails = (item) => {
        const subtotal = item.price * item.quantity;
        const discountAmount = subtotal * ((item.discount || 0) / 100);
        const taxableAmount = subtotal - discountAmount;
        const taxAmount = calculateTax(taxableAmount); // 10% tax
        const total = taxableAmount + taxAmount;

        return {
            subtotal,
            discountAmount,
            taxableAmount,
            taxAmount,
            total
        };
    };

    const handleQuantityChange = (index, quantity) => {
        const newQuantity = Math.max(1, quantity);
        onUpdateItem(index, {
            quantity: newQuantity
        });
    };

    const handlePriceChange = (index, price) => {
        const newPrice = Math.max(0, price);
        onUpdateItem(index, {
            price: newPrice
        });
    };

    const handleDiscountChange = (index, discount) => {
        const item = items[index];
        const newDiscount = Math.max(0, Math.min(100, discount)); // Limit between 0-100%
        if (item.price - (item.price * (newDiscount / 100)) < item.cost_price) {
            return;
        }
        onUpdateItem(index, {
            discount: newDiscount
        });
    };

    const handleQuantityQuickUpdate = (index, change) => {
        const item = items[index];
        const newQuantity = Math.max(1, item.quantity + change);
        onUpdateItem(index, {
            quantity: newQuantity
        });
    };

    const handleDiscountQuickUpdate = (index, change) => {
        const item = items[index];
        const newDiscount = Math.max(0, Math.min(100, (item.discount || 0) + change));
        if (item.price - (item.price * (newDiscount / 100)) < item.cost_price) {
            return;
        }
        onUpdateItem(index, {
            discount: newDiscount
        });
    };

    const handleUseOfferPrice = (index) => {
        const item = items[index];
        onUpdateItem(index, {
            price: item.offer_price
        });
    };

    const handleUseSellingPrice = (index) => {
        const item = items[index];
        onUpdateItem(index, {
            price: item.selling_price
        });
    };

    return (
        <div style={{ opacity: disabled ? 0.5 : 1, pointerEvents: disabled ? 'none' : 'auto' }}>
            <Table>
                <TableHead>
                    <TableRow>
                        <TableCell>Product</TableCell>
                        <TableCell align="center">Quantity</TableCell>
                        <TableCell align="center">Price</TableCell>
                        <TableCell align="center">Discount %</TableCell>
                        <TableCell align="center">Total</TableCell>
                        <TableCell align="center">Actions</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {items.map((item, index) => {
                        const details = calculateItemDetails(item);

                        return (
                            <TableRow key={index}>
                                <TableCell>
                                    <strong>{item.product?.name}</strong>
                                    {item.product.product?.barcode && (
                                        <div style={{ fontSize: '12px', color: '#666' }}>
                                            SKU: {item.product.product.sku}
                                        </div>
                                    )}
                                    {item.product?.bundle_units > 1 && (
                                        <div style={{ fontSize: '11px', color: '#888' }}>
                                            Bundle: {item.product.bundle_units}
                                        </div>
                                    )}
                                </TableCell>

                                {/* Quantity Column */}
                                <TableCell align="center">
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                        <button
                                            onClick={() => !disabled && handleQuantityQuickUpdate(index, -1)}
                                            disabled={disabled}
                                            style={{
                                                padding: '4px 8px',
                                                background: disabled ? '#ccc' : '#dc3545',
                                                color: 'lightgrey',
                                                border: 'none',
                                                borderRadius: '4px',
                                                cursor: disabled ? 'not-allowed' : 'pointer',
                                                fontSize: '12px',
                                                opacity: disabled ? 0.6 : 1
                                            }}
                                        >
                                            -
                                        </button>
                                        <input
                                            type="number"
                                            min="1"
                                            value={item.quantity}
                                            onChange={(e) => !disabled && handleQuantityChange(index, parseInt(e.target.value) || 1)}
                                            disabled={disabled}
                                            style={{
                                                width: '60px',
                                                padding: '6px',
                                                border: '1px solid #ccc',
                                                borderRadius: '4px',
                                                textAlign: 'center',
                                                fontSize: '14px',
                                                cursor: disabled ? 'not-allowed' : 'text'
                                            }}
                                        />
                                        <button
                                            onClick={() => !disabled && handleQuantityQuickUpdate(index, 1)}
                                            disabled={disabled}
                                            style={{
                                                padding: '4px 8px',
                                                background: disabled ? '#ccc' : '#28a745',
                                                color: 'lightgrey',
                                                border: 'none',
                                                borderRadius: '4px',
                                                cursor: disabled ? 'not-allowed' : 'pointer',
                                                fontSize: '12px',
                                                opacity: disabled ? 0.6 : 1
                                            }}
                                        >
                                            +
                                        </button>
                                    </div>
                                </TableCell>

                                {/* Price Column */}
                                <TableCell align="center">
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={item.price}
                                        onChange={(e) => !disabled && handlePriceChange(index, parseFloat(e.target.value) || 0)}
                                        disabled={disabled}
                                        style={{
                                            width: '80px',
                                            padding: '6px',
                                            border: '1px solid #ccc',
                                            borderRadius: '4px',
                                            textAlign: 'center',
                                            fontSize: '14px',
                                            cursor: disabled ? 'not-allowed' : 'text'
                                        }}
                                    />
                                </TableCell>

                                {/* Discount Column */}
                                <TableCell align="center">
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                        <button
                                            onClick={() => !disabled && handleDiscountQuickUpdate(index, -5)}
                                            disabled={disabled}
                                            style={{
                                                padding: '4px 8px',
                                                color: 'lightgrey',
                                                border: 'none',
                                                borderRadius: '4px',
                                                cursor: disabled ? 'not-allowed' : 'pointer',
                                                fontSize: '12px',
                                                opacity: disabled ? 0.6 : 1
                                            }}
                                        >
                                            -5%
                                        </button>
                                        <input
                                            type="number"
                                            min="0"
                                            max="100"
                                            step="1"
                                            value={item.discount || 0}
                                            onChange={(e) => !disabled && handleDiscountChange(index, parseFloat(e.target.value) || 0)}
                                            disabled={disabled}
                                            style={{
                                                width: '60px',
                                                padding: '6px',
                                                border: '1px solid #ccc',
                                                borderRadius: '4px',
                                                textAlign: 'center',
                                                fontSize: '14px',
                                                cursor: disabled ? 'not-allowed' : 'text'
                                            }}
                                        />
                                        <button
                                            onClick={() => !disabled && handleDiscountQuickUpdate(index, 5)}
                                            disabled={disabled}
                                            style={{
                                                padding: '4px 8px',
                                                color: 'lightgrey',
                                                border: 'none',
                                                borderRadius: '4px',
                                                cursor: disabled ? 'not-allowed' : 'pointer',
                                                fontSize: '12px',
                                                opacity: disabled ? 0.6 : 1
                                            }}
                                        >
                                            +5%
                                        </button>
                                    </div>
                                    {item.discount > 0 && (
                                        <div style={{ fontSize: '11px', color: '#dc3545', marginTop: '4px' }}>
                                            Save: {currency} {details.discountAmount.toFixed(2)}
                                        </div>
                                    )}
                                </TableCell>

                                {/* Total Column */}
                                <TableCell align="center">
                                    <div>
                                        <strong>{currency} {details.total.toFixed(2)}</strong>
                                        {item.discount > 0 && (
                                            <div style={{ fontSize: '11px', color: '#666', textDecoration: 'line-through' }}>
                                                {currency} {details.subtotal.toFixed(2)}
                                            </div>
                                        )}
                                    </div>
                                </TableCell>

                                {/* Actions Column */}
                                <TableCell align="center">
                                    <button
                                        onClick={() => !disabled && onRemoveItem(index)}
                                        disabled={disabled}
                                        style={{
                                            padding: '6px 12px',
                                            background: disabled ? '#ccc' : '#dc3545',
                                            color: 'lightgrey',
                                            border: 'none',
                                            borderRadius: '4px',
                                            cursor: disabled ? 'not-allowed' : 'pointer',
                                            fontSize: '12px',
                                            opacity: disabled ? 0.6 : 1
                                        }}
                                    >
                                        Remove
                                    </button>
                                    <button onClick={() => !disabled && handleUseOfferPrice(index)} disabled={disabled} hidden={item.price === item.offer_price} title="Use offer price" style={{ marginLeft: '4px', padding: '6px 12px', background: disabled ? '#ccc' : '#007bff', color: 'lightgrey', border: 'none', borderRadius: '4px', cursor: disabled ? 'not-allowed' : 'pointer', fontSize: '12px', opacity: disabled ? 0.6 : 1 }}><i className="fas fa-arrow-down"></i></button>
                                    <button onClick={() => !disabled && handleUseSellingPrice(index)} disabled={disabled} hidden={item.price === item.selling_price} title="Use selling price" style={{ marginLeft: '4px', padding: '6px 12px', background: disabled ? '#ccc' : '#007bff', color: 'lightgrey', border: 'none', borderRadius: '4px', cursor: disabled ? 'not-allowed' : 'pointer', fontSize: '12px', opacity: disabled ? 0.6 : 1 }}><i className="fas fa-arrow-up"></i></button>
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>

            {items.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
                    <p>No items added to sale. Search for products above to add items.</p>
                </div>
            )}
        </div>
    );
}