import { Table, TableHead, TableBody, TableRow, TableCell } from '../Table';
import StrapiImage from '../StrapiImage';
import StatusBadge from './StatusBadge';
import ProgressBar from './ProgressBar';
import { useUtil } from '../../context/UtilContext';
export default function PurchaseItemsList({ items }) {
    if (!items || items.length === 0) {
        return (
            <div style={{ marginBottom: '30px' }}>
                <h2 style={{ marginBottom: '15px', color: '#333' }}>Purchase Items</h2>
                <div style={{
                    padding: '40px',
                    textAlign: 'center',
                    color: '#666',
                    background: '#f8f9fa',
                    borderRadius: '8px',
                    border: '1px solid #dee2e6'
                }}>
                    No items found in this purchase order.
                </div>
            </div>
        );
    }

    return (
        <div style={{ marginBottom: '30px' }}>
            <h2 style={{ marginBottom: '15px', color: '#333' }}>Purchase Items</h2>
            <Table>
                <TableHead>
                    <TableRow>
                        <TableCell>Product</TableCell>
                        <TableCell align="center">Quantity</TableCell>
                        <TableCell align="center">Unit Price</TableCell>
                        <TableCell align="center">Bundle Units</TableCell>
                        <TableCell align="center">Subtotal</TableCell>
                        <TableCell align="center">Status</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {items.map((item, index) => (
                        <PurchaseItemRow key={item.documentId || index} item={item} />
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}

function PurchaseItemRow({ item }) {
    const {currency} = useUtil();
    const itemTotal = (item.quantity || 0) * (item.unit_price || item.price || 0);
    const receivedPercentage = item.quantity > 0
        ? Math.round(((item.received_quantity || 0) / item.quantity) * 100)
        : 0;

    return (
        <TableRow>
            <TableCell>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {item.product?.logo && (
                        <StrapiImage
                            media={item.product.logo}
                            format="thumbnail"
                            maxWidth={40}
                            maxHeight={40}
                        />
                    )}
                    <div>
                        <strong>{item.product?.name || 'N/A'}</strong>
                        {item.product?.barcode && (
                            <div style={{ fontSize: '12px', color: '#666' }}>
                                Barcode: {item.product.barcode}
                            </div>
                        )}
                        {item.product?.sku && (
                            <div style={{ fontSize: '12px', color: '#666' }}>
                                SKU: {item.product.sku}
                            </div>
                        )}
                    </div>
                </div>
            </TableCell>
            <TableCell align="center">
                <div>
                    <strong>{item.quantity || 0}</strong>
                    {item.received_quantity > 0 && (
                        <div style={{ fontSize: '12px', color: '#28a745' }}>
                            Received: {item.received_quantity}
                        </div>
                    )}
                </div>
            </TableCell>
            <TableCell align="center">
                {currency}{(item.unit_price || item.price || 0).toFixed(2)}
            </TableCell>
            <TableCell align="center">
                {item.bundle_units > 1 ? item.bundle_units : '1'}
            </TableCell>
            <TableCell align="center">
                <strong>{currency}{itemTotal.toFixed(2)}</strong>
            </TableCell>
            <TableCell align="center">
                <StatusBadge
                    type="item"
                    status={item.status || 'Pending'}
                    receivedQuantity={item.received_quantity}
                />
                {item.quantity > 0 && (
                    <ProgressBar percentage={receivedPercentage} />
                )}
            </TableCell>
        </TableRow>
    );
}