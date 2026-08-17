import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { PermissionCheck } from "@rutba/pos-shared/components/PermissionCheck";
import StockHealthPanel from "@rutba/pos-shared/components/StockHealthPanel";

// Cohort stock-% analysis in the stock app — % of created-in-range stock still on
// hand vs sold, with filter-by-%. Same shared panel as rutba-inventory.
export default function StockHealthPage() {
    return (
        <ProtectedRoute>
            <Layout>
                <PermissionCheck required="stock">
                    <StockHealthPanel />
                </PermissionCheck>
            </Layout>
        </ProtectedRoute>
    );
}
