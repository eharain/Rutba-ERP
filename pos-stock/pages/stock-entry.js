import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';
import ProtectedRoute from '@rutba/pos-shared/components/ProtectedRoute';
import { authApi } from '@rutba/pos-shared/lib/api';
import StockEntryForm from '../components/stock-entry/StockEntryForm';
import StockEntryHeader from '../components/stock-entry/StockEntryHeader';
import StockEntryAlerts from '../components/stock-entry/StockEntryAlerts';

export default function StockEntry() {
    const router = useRouter();
    const [purchases, setPurchases] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    useEffect(() => {
        loadInitialData();
    }, []);

    const loadInitialData = async () => {
        try {
            setLoading(true);
            const purchasesRes = await authApi.get('/purchases', {
                populate: ['suppliers'],
                sort: ['createdAt:desc'],
                pagination: { pageSize: 50 }
            });
            setPurchases(purchasesRes.data || []);
        } catch (err) {
            console.error('Error loading initial data:', err);
            setError('Failed to load purchase orders');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmitSuccess = (message) => {
        setSuccess(message);
        setError('');
    };

    const handleSubmitError = (errorMessage) => {
        setError(errorMessage);
        setSuccess('');
    };

    const clearAlerts = () => {
        setError('');
        setSuccess('');
    };

    return (
        <ProtectedRoute>
        <Layout>
        <div className="container-fluid mt-4">
        <div className="row justify-content-center" >
            <div className="col-md-10 col-lg-8" >
                <div className="card" >
                    <StockEntryHeader />
                    < div className = "card-body" >
                        <StockEntryAlerts 
                        error={ error }
    success = { success }
    onClear = { clearAlerts }
        />

        <StockEntryForm
                                        purchases={ purchases }
    loading = { loading }
    onSubmitSuccess = { handleSubmitSuccess }
    onSubmitError = { handleSubmitError }
        />
        </div>
        </div>
        </div>
        </div>
        </div>
        </Layout>
        </ProtectedRoute>
    );
} 

export async function getServerSideProps() { return { props: {} }; }
