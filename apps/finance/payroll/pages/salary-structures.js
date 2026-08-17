import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { PaySalaryStructuresEndpoints } from "@rutba/api-provider/endpoints";

export default function SalaryStructures() {
    const { jwt } = useAuth();
    const [structures, setStructures] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!jwt) return;
        PaySalaryStructuresEndpoints.list()
            .then((res) => setStructures(res.data || []))
            .catch((err) => console.error("Failed to load salary structures", err))
            .finally(() => setLoading(false));
    }, [jwt]);

    return (
        <ProtectedRoute>
            <Layout>
                <h2 className="mb-3">Salary Structures</h2>

                {loading && <p>Loading salary structures...</p>}

                {!loading && structures.length === 0 && (
                    <div className="alert alert-info">No salary structures found.</div>
                )}

                {!loading && structures.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-striped table-hover">
                            <thead className="table-dark">
                                <tr>
                                    <th>Name</th>
                                    <th>Base Salary</th>
                                    <th>Description</th>
                                </tr>
                            </thead>
                            <tbody>
                                {structures.map((s) => (
                                    <tr key={s.id}>
                                        <td>{s.name}</td>
                                        <td>{Number(s.base_salary || 0).toFixed(2)}</td>
                                        <td>{s.description || "—"}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Layout>
        </ProtectedRoute>
    );
}

export async function getServerSideProps() { return { props: {} }; }
