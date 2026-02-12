// /pos-desk/pages/new/purchase.js
import { useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout';
import ProtectedRoute from '@rutba/pos-shared/components/ProtectedRoute';
import PurchaseForm from '../../components/form/purchase-form';

export default function NewPurchase() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);

    const handleSubmit = () => {
        router.push('/purchases');
    };

    const handleCancel = () => {
        router.back();
    };

    return (
        <ProtectedRoute>
            <Layout>
                <PurchaseForm
                    onSubmit={handleSubmit}
                    onCancel={handleCancel}
                />
            </Layout>
        </ProtectedRoute>
    );
}

export async function getServerSideProps() { return { props: {} }; }
