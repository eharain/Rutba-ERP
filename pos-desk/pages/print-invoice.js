import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import SaleInvoicePrint from '../components/print/SaleInvoicePrint';
import { fetchSaleByIdOrInvoice } from '../lib/pos';
import { calculateTax } from '../domain/sale/pricing'
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

                    // Calculate totals from items
                    const subtotal = itemsData.reduce((sum, item) => {
                        const price = Number(item.price) || 0;
                        const qty = Number(item.quantity) || 0;
                        return sum + (price * qty);
                    }, 0);

                    const totalDiscount = itemsData.reduce((sum, item) => {
                        const price = Number(item.price) || 0;
                        const qty = Number(item.quantity) || 0;
                        const discount = Number(item.discount) || 0;
                        const itemSubtotal = price * qty;
                        return sum + (itemSubtotal * (discount / 100));
                    }, 0);

                    const taxableAmount = subtotal - totalDiscount;
                    const tax = calculateTax(taxableAmount);
                    const total = taxableAmount + tax;

                    // Use sale totals if available, otherwise use calculated
                    totalsData = {
                        subtotal: Number(saleData.subtotal) || subtotal,
                        discount: Number(saleData.discount) || totalDiscount,
                        tax: Number(saleData.tax) || tax,
                        total: Number(saleData.total) || total
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
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                height: '100vh',
                padding: '20px',
                textAlign: 'center'
            }}>
                <h2>{error || 'Invoice not found'}</h2>
                <p>Unable to load invoice data. Please go back and try again.</p>
                <button
                    onClick={handleClose}
                    style={{
                        padding: '10px 20px',
                        background: '#007bff',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        marginTop: '20px'
                    }}
                >
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

