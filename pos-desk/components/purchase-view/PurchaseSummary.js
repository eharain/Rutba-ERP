import { useUtil } from '../../context/UtilContext';
export default function PurchaseSummary({ purchase, totals }) {
    const { currency } = useUtil();
    return (
        <div style={{
            background: 'grey',
            padding: '20px',
            borderRadius: '8px',
            border: '1px solid #dee2e6'
        }}>
            <h3 style={{ marginBottom: '15px', color: '#333' }}>Purchase Summary</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '15px' }}>
                <div>
                    <strong>Total Items:</strong> {totals.itemCount}
                </div>
                <div>
                    <strong>Total Value:</strong> {currency}{totals.total.toFixed(2)}
                </div>
                <div>
                    <strong>Created:</strong> {purchase.createdAt ? new Date(purchase.createdAt).toLocaleString() : 'N/A'}
                </div>
                <div>
                    <strong>Last Updated:</strong> {purchase.updatedAt ? new Date(purchase.updatedAt).toLocaleString() : 'N/A'}
                </div>
            </div>
        </div>
    );
}