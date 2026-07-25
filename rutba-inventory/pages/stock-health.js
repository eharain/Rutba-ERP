import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import StockHealthPanel from "@rutba/pos-shared/components/StockHealthPanel";

// Cohort stock-% analysis — what % of each product's created-in-range stock is
// still on hand vs sold, with filter-by-%. Shared panel (also mounted in pos-stock).
export default function StockHealthPage() {
    return (
        <ProtectedRoute>
            <Layout>
                <StockHealthPanel />
            </Layout>
        </ProtectedRoute>
    );
}
