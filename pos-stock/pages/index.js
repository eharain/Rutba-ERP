import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";

export default function Home() {
    return (
        <ProtectedRoute>
            <Layout>
                <h2>Welcome to Rutba Stock Management 📦</h2>
                <h3>
                    Manage products, inventory, purchases, and suppliers.
                    Use the navigation to browse stock items, create purchases, and organize your catalog.
                </h3>
            </Layout>
        </ProtectedRoute>
    );
}


export async function getServerSideProps() { return { props: {} }; }
