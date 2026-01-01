import React from 'react';

// TODO: To be implemented soon
const StockEntryForm = ({ purchases, loading, onSubmitSuccess, onSubmitError }) => {
    return (
        <div style={{ padding: '20px' }}>
            <p>Stock Entry Form - To be implemented soon</p>
            <p>Purchases loaded: {purchases?.length || 0}</p>
            {loading && <p>Loading...</p>}
        </div>
    );
};

export default StockEntryForm;

