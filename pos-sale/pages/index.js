import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";

export default function Home() {
    return (
        <ProtectedRoute>
            <Layout>
                <h2>Welcome to Rutba Point of Sale 🛒</h2>
                <h3>
                    Create sales, process returns, manage cash registers, and view reports.
                    Use the secondary navigation for quick actions.
                </h3>
            </Layout>
        </ProtectedRoute>
    );
}


export async function getServerSideProps() { return { props: {} }; }
