import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";

export default function Home() {
    return (
        <ProtectedRoute>
            <Layout>
                <h2>Welcome to Rutba CRM 🤝</h2>
                <h3>
                    Manage customer relationships, track leads, and monitor interactions.
                    Use the navigation to browse contacts, leads, and activities.
                </h3>
            </Layout>
        </ProtectedRoute>
    );
}

export async function getServerSideProps() { return { props: {} }; }
