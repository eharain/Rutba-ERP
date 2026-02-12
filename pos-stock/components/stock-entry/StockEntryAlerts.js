import React from 'react';

// TODO: To be implemented soon
const StockEntryAlerts = ({ error, success, onClear }) => {
    return (
        <div style={{ marginBottom: '15px' }}>
            {error && (
                <div className="alert alert-danger" role="alert" style={{ padding: '10px', marginBottom: '10px' }}>
                    {error}
                    {onClear && (
                        <button 
                            onClick={onClear}
                            style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer' }}
                        >
                            ×
                        </button>
                    )}
                </div>
            )}
            {success && (
                <div className="alert alert-success" role="alert" style={{ padding: '10px', marginBottom: '10px' }}>
                    {success}
                    {onClear && (
                        <button 
                            onClick={onClear}
                            style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer' }}
                        >
                            ×
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

export default StockEntryAlerts;

