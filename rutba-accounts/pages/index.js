import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";

export default function Home() {
    return (
        <ProtectedRoute>
            <Layout>
                <h2>Welcome to Rutba Accounts 📊</h2>
                <h3>
                    Manage your chart of accounts, journal entries, invoices, expenses, and financial reports.
                    Use the navigation to browse the accounting modules.
                </h3>
            </Layout>
        </ProtectedRoute>
    );
}

export async function getServerSideProps() { return { props: {} }; }
