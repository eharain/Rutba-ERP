import { useEffect, useState } from 'react';
import SaleInvoicePrint from '../components/print/SaleInvoicePrint';
import { fetchSaleByIdOrInvoice } from '@rutba/pos-shared/lib/pos';
import SaleModel from '@rutba/pos-shared/domain/sale/SaleModel';

const PrintCombinedInvoicePage = () => {
    const [sale, setSale] = useState(null);
    const [items, setItems] = useState([]);
    const [totals, setTotals] = useState({ subtotal: 0, discount: 0, tax: 0, total: 0 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const loadCombinedData = async () => {
            try {
                const urlParams = new URLSearchParams(window.location.search);
                const saleIdsParam = urlParams.get('saleIds');

                if (!saleIdsParam) {
                    setError('No sale IDs provided');
                    setLoading(false);
                    return;
                }

                const saleIds = saleIdsParam.split(',').map(id => id.trim()).filter(Boolean);
                if (saleIds.length < 2) {
                    setError('At least 2 sale IDs are required for a combined receipt');
                    setLoading(false);
                    return;
                }

                // Fetch all sales in parallel
                const rawSales = await Promise.all(saleIds.map(id => fetchSaleByIdOrInvoice(id)));
                const validSales = rawSales.filter(Boolean);

                if (validSales.length === 0) {
                    setError('No sales found');
                    setLoading(false);
                    return;
                }

                // Merge items from all sales
                const mergedItems = [];
                for (const raw of validSales) {
                    const saleItems = raw.items || [];
                    for (const item of saleItems) {
                        mergedItems.push(item);
                    }
                }

                // Aggregate totals
                const mergedTotals = validSales.reduce((acc, raw) => ({
                    subtotal: acc.subtotal + (Number(raw.subtotal) || 0),
                    discount: acc.discount + (Number(raw.discount) || 0),
                    tax: acc.tax + (Number(raw.tax) || 0),
                    total: acc.total + (Number(raw.total) || 0),
                }), { subtotal: 0, discount: 0, tax: 0, total: 0 });

                // Merge payments from all sales
                const mergedPayments = validSales.flatMap(raw =>
                    Array.isArray(raw.payments) ? raw.payments : []
                );

                // Merge exchange returns from all sales
                const allExchangeReturns = [];
                for (const raw of validSales) {
                    const model = SaleModel.fromApi(raw);
                    if (model.exchangeReturns?.length > 0) {
                        allExchangeReturns.push(...model.exchangeReturns);
                    }
                }

                // Build invoice numbers list
                const invoiceNos = validSales
                    .map(s => s.invoice_no)
                    .filter(Boolean);

                // Use the first sale's customer and date as representative
                const primarySale = validSales[0];

                const combinedSale = {
                    ...primarySale,
                    invoice_no: invoiceNos.join(' + '),
                    payments: mergedPayments,
                    payment_status: validSales.every(s => s.payment_status === 'Paid') ? 'Paid' : 'Partial',
                    exchangeReturns: allExchangeReturns,
                };

                setSale(combinedSale);
                setItems(mergedItems);
                setTotals(mergedTotals);
            } catch (err) {
                console.error('Error loading combined invoice data:', err);
                setError('Failed to load combined invoice data');
            } finally {
                setLoading(false);
            }
        };

        loadCombinedData();
    }, []);

    const handleClose = () => {
        if (window.opener) {
            window.close();
        } else {
            window.history.back();
        }
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontSize: '18px' }}>
                Loading combined invoice...
            </div>
        );
    }

    if (error || !sale) {
        return (
            <div className="d-flex flex-column justify-content-center align-items-center vh-100 p-4 text-center">
                <h2>{error || 'Invoice not found'}</h2>
                <p>Unable to load combined invoice data. Please go back and try again.</p>
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

export default PrintCombinedInvoicePage;

export async function getServerSideProps() { return { props: {} }; }
