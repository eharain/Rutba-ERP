import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import SaleInvoicePrint from '../components/print/SaleInvoicePrint';
import { fetchSaleByIdOrInvoice } from '@rutba/pos-shared/lib/pos';
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
                    saleData = await fetchSaleByIdOrInvoice(saleId);
                    itemsData = saleData.items || [];

                    // Use totals as persisted on the sale record
                    totalsData = {
                        subtotal: Number(saleData.subtotal) || 0,
                        discount: Number(saleData.discount) || 0,
                        tax: Number(saleData.tax) || 0,
                        total: Number(saleData.total) || 0
                    };
                } else if (storageKey) {
                    // Load from localStorage
                    const storedData = JSON.parse(localStorage.getItem(storageKey) || '{}');
                    saleData = storedData.sale || null;
                    itemsData = storedData.items || [];
                    totalsData = storedData.totals || {
                        subtotal: 0,
                        discount: 0,
                        tax: 0,
                        total: 0
                    };

                    // Clean up storage after loading
                    localStorage.removeItem(storageKey);
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
            const urlParams = new URLSearchParams(window.location.search);
            const storageKey = urlParams.get('key');
            if (storageKey) {
                localStorage.removeItem(storageKey);
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



export async function getServerSideProps() { return { props: {} }; }
