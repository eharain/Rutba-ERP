import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import SaleInvoicePrint from '../components/print/SaleInvoicePrint';
import { fetchSaleByIdOrInvoice } from '@rutba/api-provider/pos';
import SaleModel from '@rutba/shared/context/domain/sale/SaleModel.js';
const PrintInvoicePage = () => {
    const router = useRouter();
    const [sale, setSale] = useState(null);
    const [items, setItems] = useState([]);
    const [totals, setTotals] = useState({
        subtotal: 0,
        discount: 0,
        tax: 0,
        total: 0
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const loadInvoiceData = async () => {
            try {
                // Get sale ID from URL parameters or localStorage
                const urlParams = new URLSearchParams(window.location.search);
                const saleId = urlParams.get('saleId');
                const storageKey = urlParams.get('key');

                // The snapshot is single-use: the opener writes it immediately
                // before opening this window and nothing reads it again. Take it
                // and delete it NOW, unconditionally — the cleanup used to sit
                // inside the `else if (storageKey)` branch below, so whenever a
                // ?saleId was also present (i.e. every saved sale) the branch
                // never ran and the entry stayed forever. That leak filled the
                // localStorage quota on till browsers until every setItem on the
                // origin threw "Failed to execute 'setItem' on 'Storage'".
                let stored = null;
                if (storageKey) {
                    try {
                        stored = localStorage.getItem(storageKey);
                        localStorage.removeItem(storageKey);
                    } catch {
                        // Storage unavailable — fall through to the API path.
                    }
                }

                let saleData = null;
                let itemsData = [];
                let totalsData = {
                    subtotal: 0,
                    discount: 0,
                    tax: 0,
                    total: 0
                };

                if (saleId) {
                    // Load from API using sale ID
                    const rawSale = await fetchSaleByIdOrInvoice(saleId);
                    // Hydrate via SaleModel so exchangeReturns are populated
                    const model = SaleModel.fromApi(rawSale);
                    saleData = {
                        ...rawSale,
                        exchangeReturns: model.exchangeReturns
                    };
                    itemsData = rawSale.items || [];

                    // Use totals as persisted on the sale record
                    totalsData = {
                        subtotal: Number(rawSale.subtotal) || 0,
                        discount: Number(rawSale.discount) || 0,
                        tax: Number(rawSale.tax) || 0,
                        total: Number(rawSale.total) || 0
                    };
                } else if (storageKey) {
                    // Load from the snapshot read (and deleted) above.
                    const storedData = JSON.parse(stored || '{}');
                    saleData = storedData.sale || null;
                    itemsData = storedData.items || [];
                    totalsData = storedData.totals || saleData?.totals || {
                        subtotal: 0,
                        discount: 0,
                        tax: 0,
                        total: 0
                    };
                } else {
                    setError('No sale ID or storage key provided');
                    setLoading(false);
                    return;
                }

                if (!saleData) {
                    setError('Sale not found');
                    setLoading(false);
                    return;
                }

                setSale(saleData);
                setItems(itemsData);
                setTotals(totalsData);
            } catch (error) {
                console.error('Error loading invoice data:', error);
                setError('Failed to load invoice data');
            } finally {
                setLoading(false);
            }
        };

        loadInvoiceData();
    }, []);

    const handleClose = () => {
        const urlParams = new URLSearchParams(window.location.search);
        const storageKey = urlParams.get('key');
        if (storageKey) {
            localStorage.removeItem(storageKey);
        }
        if (window.opener) {
            window.close();
        } else {
            window.history.back();
        }
    };

    if (loading) {
        return (
            <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                height: '100vh',
                fontSize: '18px'
            }}>
                Loading invoice...
            </div>
        );
    }

    if (error || !sale) {
        return (
            <div className="d-flex flex-column justify-content-center align-items-center vh-100 p-4 text-center">
                <h2>{error || 'Invoice not found'}</h2>
                <p>Unable to load invoice data. Please go back and try again.</p>
                <button onClick={handleClose} className="btn btn-primary mt-3">
                    Close Window
                </button>
            </div>
        );
    }

    return (
        <SaleInvoicePrint
            sale={sale}
            items={items}
            totals={totals}
            onClose={handleClose}
        />
    );
};

export default PrintInvoicePage;



