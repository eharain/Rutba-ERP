import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import SaleOrderShell from "../../components/sale-order/SaleOrderShell";

export default function SaleOrderDetailPage() {
  return (
    <ProtectedRoute>
      <Layout>
        <SaleOrderShell />
      </Layout>
    </ProtectedRoute>
  );
}
