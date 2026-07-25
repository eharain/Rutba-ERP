import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import LowStockAlertsPanel from "@rutba/pos-shared/components/LowStockAlertsPanel";

// Persisted low-stock alert queue (daily cron + reorder engine). Acknowledge /
// dismiss / run-now. Shared panel.
export default function AlertsPage() {
    return (
        <ProtectedRoute>
            <Layout>
                <LowStockAlertsPanel />
            </Layout>
        </ProtectedRoute>
    );
}
