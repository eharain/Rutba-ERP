import { useEffect, useReducer, useState } from 'react';
import { useRouter } from 'next/router';
import { authApi } from '../../lib/api';
import { fetchSaleByIdOrInvoice } from '../../lib/pos';
import ProtectedRoute from '../../components/ProtectedRoute';
import Layout from '../../components/Layout';
import PermissionCheck from '../../components/PermissionCheck';
import SalesItemsForm from '../../components/form/sales-items-form';
import SalesItemsList from '../../components/lists/sales-items-list';
import { useUtil } from '../../context/UtilContext';
import CheckoutModal from '../../components/CheckoutModal';
import CustomerSelect from '../../components/CustomerSelect';

import SaleModel from '../../domain/sale/SaleModel';

export default function SalePage() {
    const router = useRouter();
    const { id } = router.query;
    const { currency } = useUtil();

    const [, forceUpdate] = useReducer(x => x + 1, 0);
    const [saleModel] = useState(() => new SaleModel());
    const [loading, setLoading] = useState(false);
    const [showCheckout, setShowCheckout] = useState(false);

    useEffect(() => {
        if (id) loadSale();
    }, [id]);

    const loadSale = async () => {
        setLoading(true);
        try {
            const sale = await fetchSaleByIdOrInvoice(id);

            saleModel.customer = sale.customer || null;

            sale.items?.forEach(item => {
                saleModel.addNonStockItem({
                    name: item.product_name || item.name,
                    price: item.selling_price,
                    costPrice: item.cost_price || 0
                });
            });

            forceUpdate();
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleCustomerChange = async (customer) => {
        saleModel.customer = customer;
        forceUpdate();

        try {
            await authApi.put(`/sales/${id}`, {
                data: {
                    customer: customer
                        ? { connect: [customer.documentId] }
                        : null
                }
            });
        } catch (e) {
            console.error(e);
        }
    };

    const handleCheckoutComplete = async () => {
        setLoading(true);
        try {
            await authApi.put(`/sales/${id}`, {
                data: saleModel.toPayload()
            });

            setShowCheckout(false);
            alert('Sale completed successfully');
        } catch (e) {
            console.error(e);
            alert('Checkout failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Layout>
            <ProtectedRoute>
                <PermissionCheck required="api::sale.sale.find">
                    <div style={{ padding: 8 }}>
                        <div className="row">
                            <div className="col-md-10">
                                <h3>Sale #{id}</h3>
                            </div>
                            <div className="col-md-2 text-end">
                                <strong>
                                    Total: {currency}{saleModel.total.toFixed(2)}
                                </strong>
                            </div>
                        </div>

                        <div className="mt-5 mb-5">
                            <label>Customer</label>
                            <CustomerSelect
                                value={saleModel.customer}
                                onChange={handleCustomerChange}
                            />
                        </div>

                        <SalesItemsForm
                            disabled={false}
                            onAddItem={(stockItem) => {
                                saleModel.addStockItem(stockItem);
                                forceUpdate();
                            }}
                            onAddNonStock={(data) => {
                                saleModel.addNonStockItem(data);
                                forceUpdate();
                            }}
                        />

                        <SalesItemsList
                            items={saleModel.items}
                            onUpdate={(index, updater) => {
                                saleModel.updateItem(index, updater);
                                forceUpdate();
                            }}
                            onRemove={(index) => {
                                saleModel.removeItem(index);
                                forceUpdate();
                            }}
                        />

                        {saleModel.items.length > 0 && (
                            <div className="mt-4 p-3 bg-dark text-white rounded"
                                style={{ maxWidth: 400, marginLeft: 'auto' }}>
                                <div className="d-flex justify-content-between">
                                    <span>Subtotal</span>
                                    <span>{currency}{saleModel.subtotal.toFixed(2)}</span>
                                </div>
                                <div className="d-flex justify-content-between text-danger">
                                    <span>Discount</span>
                                    <span>-{currency}{saleModel.discountTotal.toFixed(2)}</span>
                                </div>
                                <div className="d-flex justify-content-between">
                                    <span>Tax</span>
                                    <span>{currency}{saleModel.tax.toFixed(2)}</span>
                                </div>
                                <hr />
                                <div className="d-flex justify-content-between fw-bold">
                                    <span>Total</span>
                                    <span>{currency}{saleModel.total.toFixed(2)}</span>
                                </div>
                            </div>
                        )}

                        <CheckoutModal
                            isOpen={showCheckout}
                            onClose={() => setShowCheckout(false)}
                            total={saleModel.total}
                            onComplete={handleCheckoutComplete}
                            loading={loading}
                        />
                    </div>
                </PermissionCheck>
            </ProtectedRoute>
        </Layout>
    );
}
