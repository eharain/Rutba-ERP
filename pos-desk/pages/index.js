import Layout from "../components/Layout";
import ProtectedRoute from "../components/ProtectedRoute";

export default function Home() {
    return (
        <ProtectedRoute>
            <Layout>
               
<h2>Welcome to Rutba POS 👋</h2>

<h3>
    Manage your daily operations with ease. Use the main navigation to handle products, inventory, sales, returns, customers, and reports — all from one place.
</h3>

<h3>
    Use the secondary navigation for quick actions like creating new sales, processing product returns, and managing purchases, so your checkout and stock updates stay fast and smooth.
</h3>
            </Layout>
        </ProtectedRoute>
    );
}
