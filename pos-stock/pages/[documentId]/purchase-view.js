import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { fetchPurchaseByIdDocumentIdOrPO } from '@rutba/pos-shared/lib/pos';
import ProtectedRoute from '@rutba/pos-shared/components/ProtectedRoute';
import Layout from '../../components/Layout';
import PermissionCheck from '@rutba/pos-shared/components/PermissionCheck';
import PurchaseHeader from '../../components/purchase-view/PurchaseHeader';
import PurchaseItemsList from '../../components/purchase-view/PurchaseItemsList';
import PurchaseDocuments from '../../components/purchase-view/PurchaseDocuments';
import PurchaseSummary from '../../components/purchase-view/PurchaseSummary';
import { useUtil } from '@rutba/pos-shared/context/UtilContext';

export default function PurchaseViewPage() {
    const router = useRouter();
    const { documentId } = router.query;

    const [purchase, setPurchase] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const {currency} = useUtil();
    useEffect(() => {
        if (documentId) loadPurchaseData();
    }, [documentId]);

    const loadPurchaseData = async () => {
        setLoading(true);
        try {
            const purchaseData = await fetchPurchaseByIdDocumentIdOrPO(documentId);
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
        router.push(`/${documentId}/purchase`);
    };

    const handleReceive = () => {
        router.push(`/${documentId}/receive`);
    };

    const handleBack = () => {
        router.push('/purchases');
    };

    if (loading) {
        return (
            <ProtectedRoute>
                <Layout>
                    <div className="state-message">Loading purchase details...</div>
                </Layout>
            </ProtectedRoute>
        );
    }

    if (error || !purchase) {
        return (
            <ProtectedRoute>
                <Layout>
                    <div className="state-message">
                        <div className="state-message--error mb-3">
                            {error || 'Purchase not found'}
                        </div>
                        <button onClick={handleBack} className="btn btn-primary">
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
                    <div className="page-content">
                        {/* Header Actions */}
                        <div className="action-row">
                            <button onClick={handleBack} className="btn btn-outline-primary me-2">
                                ← Back to Purchases
                            </button>

                            {purchase.status !== 'Received' && purchase.status !== 'Cancelled' && (
                                <button onClick={handleReceive} className="btn btn-success">
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

export async function getServerSideProps() { return { props: {} }; }
