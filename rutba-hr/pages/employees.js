import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi } from "@rutba/pos-shared/lib/api";
import Link from "next/link";

export default function Employees() {
    const { jwt } = useAuth();
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!jwt) return;
        authApi.get("/hr-employees?sort=name:asc&populate=department", {}, jwt)
            .then((res) => setEmployees(res.data || []))
            .catch((err) => console.error("Failed to load employees", err))
            .finally(() => setLoading(false));
    }, [jwt]);

    return (
        <ProtectedRoute>
            <Layout>
                <h2 className="mb-3">Employees</h2>

                {loading && <p>Loading employees...</p>}

                {!loading && employees.length === 0 && (
                    <div className="alert alert-info">No employees found.</div>
                )}

                {!loading && employees.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-striped table-hover">
                            <thead className="table-dark">
                                <tr>
                                    <th>Name</th>
                                    <th>Email</th>
                                    <th>Phone</th>
                                    <th>Department</th>
                                    <th>Designation</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {employees.map((e) => (
                                    <tr key={e.id}>
                                        <td>{e.name}</td>
                                        <td>{e.email || "—"}</td>
                                        <td>{e.phone || "—"}</td>
                                        <td>{e.department?.name || "—"}</td>
                                        <td>{e.designation || "—"}</td>
                                        <td>
                                            <Link className="btn btn-sm btn-outline-primary" href={`/${e.documentId || e.id}/employee`}>
                                                View
                                            </Link>
                                        </td>
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
