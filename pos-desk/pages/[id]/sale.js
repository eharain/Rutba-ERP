import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { authApi } from '../../lib/api';
import { fetchSaleByIdOrInvoice, saveSaleItems } from '../../lib/pos';
import ProtectedRoute from '../../components/ProtectedRoute';
import Layout from '../../components/Layout';
import PermissionCheck from '../../components/PermissionCheck';
import SalesItemsForm from '../../components/form/sales-items-form';
import SalesItemsList from '../../components/lists/sales-items-list';
import { useUtil } from '../../context/UtilContext';
import CheckoutModal from '../../components/CheckoutModal';
import { calculateTax } from '../../lib/utils';
import CustomerSelect from '../../components/CustomerSelect';

export default function SalePage() {
    const router = useRouter();
    const { id } = router.query;
    const { currency } = useUtil();
    const [sale, setSale] = useState(null);
    const [customer, setCustomer] = useState(null);
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [totals, setTotals] = useState({
        subtotal: 0,
        discount: 0,
        tax: 0,
        total: 0
    });
    const [showCheckout, setShowCheckout] = useState(false);

    useEffect(() => {
        if (id) loadSaleData();
    }, [id]);

    useEffect(() => {
        calculateTotals();
    }, [items]);

    const loadSaleData = async () => {
        setLoading(true);
        try {
            const saleData = await fetchSaleByIdOrInvoice(id);
            setSale(saleData);
            setCustomer(saleData.customer || null);
            // Initialize items with discount if present
            const initialItems = saleData.items?.map(item => ({
                ...item,
                discount: item.discount || 0,
                total: calculateItemTotal(item)
            })) || [];
            setItems(initialItems);
        } catch (error) {
            console.error('Error loading sale:', error);
        } finally {
            setLoading(false);
        }
    };

    const calculateItemTotal = (item) => {
        const subtotal = item.price * item.quantity;
        const discountAmount = subtotal * ((item.discount || 0) / 100);
        const taxableAmount = subtotal - discountAmount;
        const taxAmount = calculateTax(taxableAmount); // 10% tax
        return taxableAmount + taxAmount;
    };

    const calculateTotals = () => {
        const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const totalDiscount = items.reduce((sum, item) => {
            const itemSubtotal = item.price * item.quantity;
            return sum + (itemSubtotal * ((item.discount || 0) / 100));
        }, 0);
        const taxableAmount = subtotal - totalDiscount;
        const tax = calculateTax(taxableAmount); // 10% tax
        const total = taxableAmount + tax;

        setTotals({
            subtotal,
            discount: totalDiscount,
            tax,
            total
        });
    };

    const addItem = (product) => {
        const newItem = {
            id: product.id,
            documentId: product.documentId,
            product: product.product,
            quantity: 1,
            price: product.selling_price || 0,
            discount: 0, // Default 0% discount
            tax: calculateTax(product.selling_price || 0),
            total: product.selling_price || 0,
            offer_price: product.offer_price || 0,
            selling_price: product.selling_price || 0,
            cost_price: product.cost_price || 0
        };
        if (items.find(item => item.id === newItem.id)) {
            updateItem(items.findIndex(item => item.id === newItem.id), {
                quantity: items.find(item => item.id === newItem.id).quantity + 1
            });
        } else {
            setItems(prev => [...prev, newItem]);
        }
    };

    const updateItem = (index, updates) => {
        setItems(prev => prev.map((item, i) => {
            if (i === index) {
                const updatedItem = { ...item, ...updates };
                // Recalculate total when price, quantity, or discount changes
                if (updates.price !== undefined || updates.quantity !== undefined || updates.discount !== undefined || updates.offer_price !== undefined) {
                    updatedItem.total = calculateItemTotal(updatedItem);
                }
                return updatedItem;
            }
            return item;
        }));
    };

    const removeItem = (index) => {
        setItems(prev => prev.filter((_, i) => i !== index));
    };

    const handleCheckoutComplete = async () => {
        setLoading(true);
        try {
            await saveSaleItems(sale.documentId || sale.id, items);
            let updatedCustomer = customer ? {
                customer: { connect: customer.documentId || customer.id }
            } : {};
            // Update sale status to completed
            await authApi.put(`/sales/${sale.documentId || sale.id}`, {
                data: {
                    payment_status: 'Paid',
                    total: totals.total,
                    subtotal: totals.subtotal,
                    discount: totals.discount,
                    tax: totals.tax,
                    ...updatedCustomer
                }
            });

            // Reload sale data to update payment status
            await loadSaleData();

            alert('Sale completed successfully!');
            setShowCheckout(false);
        } catch (error) {
            console.error('Error completing sale:', error);
            alert('Error completing sale');
        } finally {
            setLoading(false);
        }
    };

    const handlePrint = () => {
        if (!sale || items.length === 0) {
            alert('No sale data to print');
            return;
        }

        // Store sale data in localStorage
        const storageKey = `print_invoice_${Date.now()}`;
        localStorage.setItem(storageKey, JSON.stringify({
            sale: sale,
            items: items,
            totals: totals,
            timestamp: Date.now()
        }));

        // Open print window
        const saleId = sale.documentId || sale.id || sale.invoice_no;
        window.open(`/print-invoice?key=${storageKey}&saleId=${saleId}`, '_blank', 'width=1000,height=800');
    };
    const handleCustomerChange = async (ncustomer) => {
        setSale(prev => ({
            ...prev,
            ncustomer
        }));
        setCustomer(ncustomer);

        if (!sale) return;

        try {
            await authApi.put(`/sales/${sale.documentId || sale.id}`, {
                data: {
                    customer: ncustomer
                        ? { connect: [ncustomer.documentId || ncustomer.id] }
                        : null
                }
            });
        } catch (err) {
            console.error('Failed to update sale customer', err);
            await loadSaleData();
        }
    };


    if (loading && !sale) return <div>Loading...</div>;

    return (
        <Layout>
            <ProtectedRoute>
                <PermissionCheck required='api::sale.sale.find,api::sale-item.sale-item.find,api::stock-item.stock-item.find'>
                    <div className="m-4" style={{ padding: '4px' }}>
                        {/* Header */}
                        <div >
                            <div className="row ">
                                <div className="col-md-8">
                                    <h3>Sale #{sale?.invoice_no || id}</h3>
                                </div>
                                <div className="col-md-2">
                                    <p>Date: {sale?.sale_date ? new Date(sale.sale_date).toLocaleDateString() : 'N/A'}</p>
                                </div>
                                <div className="col-md-2" style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '10px' }}>
                                    Total: {currency}{totals.total.toFixed(2)}
                                </div>
                            </div>
                            <div className="row">
                                {/* Customer control replaced here */}
                                <div className="col-md-4">
                                    <label className="mb-6" >Customer: <span className="w-60 text-wrap"> {customer ? `${customer.name || ''} ${customer.email ? `· ${customer.email}` : ''} ${customer.phone ? `· ${customer.phone}` : ''}` : 'Walk-in Customer'}</span></label>
                                </div>
                                <div className="col-md-7">
                                    <CustomerSelect
                                        value={customer ?? null}
                                        onChange={handleCustomerChange}
                                        disabled={sale?.payment_status === 'Paid'}
                                    />
                                </div>

                                <div className="col-md-1" style={{ textAlign: 'right' }}>

                                    <div >
                                        {sale?.payment_status === 'Paid' && (
                                            <button
                                                onClick={handlePrint}
                                                disabled={loading || items.length === 0}
                                                className="btn btn-success"
                                                style={{
                                                    cursor: items.length === 0 ? 'not-allowed' : 'pointer',
                                                    opacity: items.length === 0 ? 0.6 : 1
                                                }}
                                            >
                                                Print
                                            </button>
                                        )}
                                        {sale?.payment_status !== 'Paid' && (
                                            <button
                                                className="btn btn-info"
                                                onClick={() => setShowCheckout(true)}
                                                disabled={loading || items.length === 0}
                                            
                                                style={{
                                                    cursor: items.length === 0 ? 'not-allowed' : 'pointer',
                                                    opacity: items.length === 0 ? 0.6 : 1
                                                }}
                                            >
                                                Checkout
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Product Search Form */}
                        <SalesItemsForm
                            onAddItem={addItem}
                            disabled={sale?.payment_status === 'Paid'}
                        />

                        {/* Items List */}
                        <SalesItemsList
                            items={items}
                            onUpdateItem={updateItem}
                            onRemoveItem={removeItem}
                            disabled={sale?.payment_status === 'Paid'}
                        />

                        {/* Totals Summary */}
                        {items.length > 0 && (
                            <div style={{
                                marginTop: '20px',
                                padding: '20px',
                                background: 'black',
                                borderRadius: '4px',
                                maxWidth: '400px',
                                marginLeft: 'auto'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                    <span>Subtotal:</span>
                                    <span>{currency}{totals.subtotal.toFixed(2)}</span>
                                </div>
                                {totals.discount > 0 && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', color: '#dc3545' }}>
                                        <span>Discount:</span>
                                        <span>-{currency}{totals.discount.toFixed(2)}</span>
                                    </div>
                                )}
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                    <span>Taxable Amount:</span>
                                    <span>{currency}{(totals.subtotal - totals.discount).toFixed(2)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                    <span>Tax (10%):</span>
                                    <span>{currency}{totals.tax.toFixed(2)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '18px', borderTop: '1px solid #ccc', paddingTop: '8px' }}>
                                    <span>Total:</span>
                                    <span>{currency}{totals.total.toFixed(2)}</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Checkout Modal */}
                    <CheckoutModal
                        isOpen={showCheckout}
                        onClose={() => setShowCheckout(false)}
                        total={totals.total}
                        onComplete={handleCheckoutComplete}
                        loading={loading}
                    />
                </PermissionCheck>
            </ProtectedRoute>
        </Layout>
    );
}