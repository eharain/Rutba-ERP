import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";

export default function Home() {
    return (
        <ProtectedRoute>
            <Layout>
                <h2>Welcome to Rutba Payroll 💰</h2>
                <h3>
                    Process payroll, manage salary structures, track deductions, and generate payslips.
                    Use the navigation to browse the payroll modules.
                </h3>
            </Layout>
        </ProtectedRoute>
    );
}

export async function getServerSideProps() { return { props: {} }; }
