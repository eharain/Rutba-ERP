import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/shared/components/ProtectedRoute";
import { PermissionCheck } from "@rutba/shared/components/PermissionCheck";
import StockHealthPanel from "@rutba/shared/components/StockHealthPanel";

// Cohort stock-% analysis in the stock app — % of created-in-range stock still on
// hand vs sold, with filter-by-%. Same shared panel as apps/inventory/control.
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
