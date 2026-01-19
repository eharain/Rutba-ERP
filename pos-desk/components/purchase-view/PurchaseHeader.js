import StatusBadge from './StatusBadge';
import { useUtil } from '../../context/UtilContext';
export default function PurchaseHeader({ purchase, totals }) {
    const { currency } = useUtil();
    return (
        <div style={{
            background: 'grey',
            padding: '20px',
            borderRadius: '8px',
            marginBottom: '20px',
            border: '1px solid #dee2e6'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h1 style={{ margin: '0 0 10px 0', color: '#333' }}>
                        Purchase Order: {purchase.orderId}
                    </h1>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
                        <div>
                            <strong>Order Date:</strong><br />
                            {purchase.order_date ? new Date(purchase.order_date).toLocaleDateString() : 'N/A'}
                        </div>
                        <div>
                            <strong>Received Date:</strong><br />
                            {purchase.order_recieved_date ? new Date(purchase.order_recieved_date).toLocaleDateString() : 'Not received'}
                        </div>
                        <div>
                            <strong>Suppliers:</strong><br />
                            {purchase.suppliers?.length > 0
                                ? purchase.suppliers.map(s => s.name).join(', ')
                                : 'No suppliers'
                            }
                        </div>
                        <div>
                            <strong>Total Items:</strong><br />
                            {totals.itemCount} items
                        </div>
                    </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                    <div style={{ marginBottom: '10px' }}>
                        <StatusBadge
                            type="status"
                            status={purchase.status}
                        />
                    </div>
                    <div style={{ marginBottom: '10px' }}>
                        <StatusBadge
                            type="approval"
                            status={purchase.approval_status || 'Draft'}
                        />
                    </div>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: 'white' }}>
                        {currency}{totals.total.toFixed(2)}
                    </div>
                </div>
            </div>
        </div>
    );
}