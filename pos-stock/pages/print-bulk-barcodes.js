// file: /pos-desk/pages/print-bulk-barcodes.js
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import BulkPrintPreview from '../components/print/BulkPrintPreview';

const PrintBulkBarcodesPage = () => {
    const router = useRouter();
    const [storageKey, setStorageKey] = useState(null);
    const [title, setTitle] = useState('Bulk Barcode Labels');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadPrintData = () => {
            try {
                // Get storage key from URL parameters
                const urlParams = new URLSearchParams(window.location.search);
                const key = urlParams.get('key');
                const titleParam = urlParams.get('title');

                if (key) {
                    setStorageKey(key);
                    setTitle(titleParam ? decodeURIComponent(titleParam) : 'Bulk Barcode Labels');
                } else {
                    setStorageKey(null);
                }
            } catch (error) {
                console.error('Error loading print data:', error);
                setStorageKey(null);
            } finally {
                setLoading(false);
            }
        };

        loadPrintData();
    }, []);

    if (loading) {
        return (
            <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                height: '100vh',
                fontSize: '18px'
            }}>
                Loading print configuration...
            </div>
        );
    }

    if (!storageKey) {
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
                <h2>Invalid print request</h2>
                <p>No valid print data found. Please go back and try again.</p>
                <button
                    onClick={() => window.close()}
                    style={{
                        padding: '10px 20px',
                        background: '#007bff',
                        color: 'grey',
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

    return <BulkPrintPreview storageKey={storageKey} title={title} />;
};

export default PrintBulkBarcodesPage;

export async function getServerSideProps() { return { props: {} }; }
