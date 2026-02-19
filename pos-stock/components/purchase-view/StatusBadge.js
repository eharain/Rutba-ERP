export default function StatusBadge({ type, status, receivedQuantity }) {
    const getStatusColor = () => {
        switch (type) {
            case 'status':
                switch (status) {
                    case 'Draft': return '#6c757d';
                    case 'Pending': return '#ffc107';
                    case 'Submitted': return '#17a2b8';
                    case 'Partially Received': return '#fd7e14';
                    case 'Received': return '#28a745';
                    case 'Closed': return '#20c997';
                    case 'Cancelled': return '#dc3545';
                    default: return '#6c757d';
                }

            case 'approval':
                switch (status) {
                    case 'Draft': return '#6c757d';
                    case 'Pending Approval': return '#ffc107';
                    case 'Not Required': return '#17a2b8';
                    case 'Approved': return '#28a745';
                    case 'Rejected': return '#dc3545';
                    case 'Revised': return '#fd7e14';
                    default: return '#6c757d';
                }

            case 'item':
                switch (status) {
                    case 'Received': return '#28a745';
                    default:
                        return receivedQuantity > 0 ? '#fd7e14' : '#6c757d';
                }

            default:
                return '#6c757d';
        }
    };

    return (
        <span style={{
            padding: '6px 12px',
            borderRadius: '20px',
            backgroundColor: getStatusColor(),
            color: 'white',
            fontSize: '14px',
            fontWeight: 'bold',
            display: 'inline-block'
        }}>
            {status}
        </span>
    );
}