import { useEffect, useState } from 'react';
import PurchaseOrderPrint from '../components/print/PurchaseOrderPrint';
import { fetchPurchaseByIdDocumentIdOrPO } from '@rutba/api-provider/pos';

/**
 * /print-purchase?documentId=<id|documentId|PO>  (or ?key=<localStorage key>)
 * Standalone print route (no Layout) — opened in a new window from the purchase
 * list / view. Fetches the purchase and renders the printable PO document.
 */
const PrintPurchasePage = () => {
    const [purchase, setPurchase] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const load = async () => {
            try {
                const params = new URLSearchParams(window.location.search);
                const documentId = params.get('documentId') || params.get('id') || params.get('po');
                const storageKey = params.get('key');

                if (documentId) {
                    const data = await fetchPurchaseByIdDocumentIdOrPO(documentId);
                    if (!data) { setError('Purchase not found'); setLoading(false); return; }
                    setPurchase(data);
                } else if (storageKey) {
                    const stored = JSON.parse(localStorage.getItem(storageKey) || '{}');
                    localStorage.removeItem(storageKey);
                    setPurchase(stored.purchase || stored || null);
                } else {
                    setError('No purchase id or storage key provided');
                }
            } catch (e) {
                console.error('Error loading purchase for print:', e);
                setError('Failed to load purchase');
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    const handleClose = () => {
        if (window.opener) window.close();
        else window.history.back();
    };

    if (loading) {
        return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontSize: '18px' }}>Loading purchase order…</div>;
    }

    if (error || !purchase) {
        return (
            <div className="d-flex flex-column justify-content-center align-items-center vh-100 p-4 text-center">
                <h2>{error || 'Purchase not found'}</h2>
                <button onClick={handleClose} className="btn btn-primary mt-3">Close Window</button>
            </div>
        );
    }

    return <PurchaseOrderPrint purchase={purchase} onClose={handleClose} />;
};

export default PrintPurchasePage;
