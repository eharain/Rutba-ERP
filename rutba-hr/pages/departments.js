import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi } from "@rutba/pos-shared/lib/api";

export default function Departments() {
    const { jwt } = useAuth();
    const [departments, setDepartments] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!jwt) return;
        authApi.get("/hr-departments?sort=name:asc", {}, jwt)
            .then((res) => setDepartments(res.data || []))
            .catch((err) => console.error("Failed to load departments", err))
            .finally(() => setLoading(false));
    }, [jwt]);

    return (
        <ProtectedRoute>
            <Layout>
                <h2 className="mb-3">Departments</h2>

                {loading && <p>Loading departments...</p>}

                {!loading && departments.length === 0 && (
                    <div className="alert alert-info">No departments found.</div>
                )}

                {!loading && departments.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-striped table-hover">
                            <thead className="table-dark">
                                <tr>
                                    <th>Name</th>
                                    <th>Head</th>
                                    <th>Description</th>
                                </tr>
                            </thead>
                            <tbody>
                                {departments.map((d) => (
                                    <tr key={d.id}>
                                        <td>{d.name}</td>
                                        <td>{d.head || "—"}</td>
                                        <td>{d.description || "—"}</td>
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
