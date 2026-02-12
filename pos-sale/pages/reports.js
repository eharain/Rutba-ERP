import { useEffect, useMemo, useState } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import PermissionCheck from "@rutba/pos-shared/components/PermissionCheck";
import { fetchSales, fetchReturns } from "@rutba/pos-shared/lib/pos";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";

export default function Reports() {
  const { jwt, permissions } = useAuth();
  const [sales, setSales] = useState([]);
  const [returns, setReturns] = useState([]);

  useEffect(() => {
    (async () => {
      if (permissions.includes("api::sale.sale.find")) {
        const s = await fetchSales(jwt);
        setSales(s.data || []);
      }
      if (permissions.includes("api::sale-return.sale-return.find")) {
        const r = await fetchReturns(jwt);
        setReturns(r.data || []);
      }
    })();
    
  }, [jwt, permissions]);

  const totals = useMemo(() => {
    const salesTotal = sales.reduce((sum, s) => sum + (+s.attributes?.total || 0), 0);
    const returnTotal = returns.reduce((sum, r) => sum + (+r.attributes?.total_refund || 0), 0);
    return { salesTotal, returnTotal };
  }, [sales, returns]);

  return (
    <ProtectedRoute>
      <Layout>
        <h1>Reports</h1>
        <PermissionCheck required="api::sale.sale.find">
          <h3>Sales</h3>
          <div>Count: {sales.length}</div>
          <div>Total: ${totals.salesTotal.toFixed(2)}</div>
        </PermissionCheck>

        <PermissionCheck required="api::sale-return.sale-return.find">
          <h3 style={{ marginTop: 16 }}>Returns</h3>
          <div>Count: {returns.length}</div>
          <div>Total Refund: ${totals.returnTotal.toFixed(2)}</div>
        </PermissionCheck>
      </Layout>
    </ProtectedRoute>
  );
}


export async function getServerSideProps() { return { props: {} }; }
