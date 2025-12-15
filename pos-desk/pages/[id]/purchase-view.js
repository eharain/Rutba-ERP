import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { fetchPurchaseByIdDocumentIdOrPO } from '../../lib/pos';
import ProtectedRoute from '../../components/ProtectedRoute';
import Layout from '../../components/Layout';
import PermissionCheck from '../../components/PermissionCheck';
import PurchaseHeader from '../../components/purchase-view/PurchaseHeader';
import PurchaseItemsList from '../../components/purchase-view/PurchaseItemsList';
import PurchaseDocuments from '../../components/purchase-view/PurchaseDocuments';
import PurchaseSummary from '../../components/purchase-view/PurchaseSummary';
import { useUtil } from '../../context/UtilContext';

export default function PurchaseViewPage() {
    const router = useRouter();
    const { id } = router.query;

    const [purchase, setPurchase] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const {currency} = useUtil();
    useEffect(() => {
        if (id) loadPurchaseData();
    }, [id]);

    const loadPurchaseData = async () => {
        setLoading(true);
        try {
            const purchaseData = await fetchPurchaseByIdDocumentIdOrPO(id);
            if (!purchaseData) {
                setError('Purchase not found');
            } else {
                setPurchase(purchaseData);
            }
        } catch (err) {
            setError(err.message);
            console.error('Error loading purchase:', err);
        } finally {
            setLoading(false);
        }
    };

    const calculatePurchaseTotals = () => {
        if (!purchase?.items) return { total: 0, itemCount: 0 };

        const total = purchase.items.reduce((sum, item) => {
            const itemTotal = (item.quantity || 0) * (item.unit_price || item.price || 0);
            return sum + itemTotal;
        }, 0);

        return {
            total,
            itemCount: purchase.items.length
        };
    };

    const handleEdit = () => {
        router.push(`/${id}/purchase`);
    };

    const handleReceive = () => {
        router.push(`/${id}/receive`);
    };

    const handleBack = () => {
        router.push('/purchases');
    };

    if (loading) {
        return (
            <ProtectedRoute>
                <Layout>
                    <div style={{ padding: '40px', textAlign: 'center' }}>
                        <div>Loading purchase details...</div>
                    </div>
                </Layout>
            </ProtectedRoute>
        );
    }

    if (error || !purchase) {
        return (
            <ProtectedRoute>
                <Layout>
                    <div style={{ padding: '40px', textAlign: 'center' }}>
                        <div style={{ color: 'red', marginBottom: '20px' }}>
                            {error || 'Purchase not found'}
                        </div>
                        <button
                            onClick={handleBack}
                            style={{
                                padding: '10px 20px',
                                background: '#007bff',
                                color: 'grey',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer'
                            }}
                        >
                            Back to Purchases
                        </button>
                    </div>
                </Layout>
            </ProtectedRoute>
        );
    }

    const totals = calculatePurchaseTotals();

    return (
        <ProtectedRoute>
            <Layout>
                <PermissionCheck required="api::purchase.purchase.find">
                    <div style={{ padding: '20px' }}>
                        {/* Header Actions */}
                        <div style={{ marginBottom: '20px' }}>
                            <button
                                onClick={handleBack}
                                style={{
                                    padding: '8px 16px',
                                    background: 'transparent',
                                    color: '#007bff',
                                    border: '1px solid #007bff',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    marginRight: '10px'
                                }}
                            >
                                ← Back to Purchases
                            </button>

                            <button
                                onClick={handleEdit}
                                style={{
                                    padding: '8px 16px',
                                    background: '#007bff',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    marginRight: '10px'
                                }}
                            >
                                Edit Purchase
                            </button>

                            {purchase.status !== 'Received' && purchase.status !== 'Cancelled' && (
                                <button
                                    onClick={handleReceive}
                                    style={{
                                        padding: '8px 16px',
                                        background: '#28a745',
                                        color: 'grey',
                                        border: 'none',
                                        borderRadius: '4px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Receive Items
                                </button>
                            )}
                        </div>

                        {/* Purchase Header */}
                        <PurchaseHeader
                            purchase={purchase}
                            totals={totals}
                        />

                        {/* Purchase Items */}
                        <PurchaseItemsList
                            items={purchase.items}
                        />

                        {/* Receipts and Documents */}
                        <PurchaseDocuments
                            receipts={purchase.receipts}
                            gallery={purchase.gallery}
                        />

                        {/* Summary */}
                        <PurchaseSummary
                            purchase={purchase}
                            totals={totals}
                        />
                    </div>
                </PermissionCheck>
            </Layout>
        </ProtectedRoute>
    );
}