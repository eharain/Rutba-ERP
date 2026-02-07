// /pos-desk/pages/[id]/purchase-receive.js
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout';
import ProtectedRoute from '../../components/ProtectedRoute';
import PurchaseReceiveList from '../../components/lists/purchase-receive-list';
import { fetchPurchaseByIdDocumentIdOrPO } from '../../lib/pos';

export default function PurchaseReceivePage() {
    const router = useRouter();
    const { id } = router.query;
    const [purchase, setPurchase] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (id) {
            loadPurchase();
        }
    }, [id]);

    const loadPurchase = async () => {
        try {
            const purchaseData = await fetchPurchaseByIdDocumentIdOrPO(id);
            setPurchase(purchaseData);
        } catch (error) {
            console.error('Error loading purchase:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleComplete = () => {
        router.push('/purchases');
    };

    if (loading) return <div>Loading...</div>;
    if (!purchase) return <div>Purchase not found</div>;

    return (
        <ProtectedRoute>
            <Layout>
                <PurchaseReceiveList
                    purchase={purchase}
                    onComplete={handleComplete}
                />
            </Layout>
        </ProtectedRoute>
    );
}
