import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi } from "@rutba/pos-shared/lib/api";
import Link from "next/link";

export default function EmployeeDetail() {
    const router = useRouter();
    const { documentId } = router.query;
    const { jwt } = useAuth();
    const [employee, setEmployee] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!jwt || !documentId) return;
        authApi.get(`/hr-employees/${documentId}?populate=*`, {}, jwt)
            .then((res) => setEmployee(res.data || res))
            .catch((err) => console.error("Failed to load employee", err))
            .finally(() => setLoading(false));
    }, [jwt, documentId]);

    return (
        <ProtectedRoute>
            <Layout>
                <div className="d-flex align-items-center mb-3">
                    <Link className="btn btn-sm btn-outline-secondary me-3" href="/employees">
                        <i className="fas fa-arrow-left"></i> Back
                    </Link>
                    <h2 className="mb-0">Employee Details</h2>
                </div>

                {loading && <p>Loading...</p>}

                {!loading && !employee && (
                    <div className="alert alert-warning">Employee not found.</div>
                )}

                {!loading && employee && (
                    <div className="row">
                        <div className="col-md-6">
                            <div className="card">
                                <div className="card-header"><strong>{employee.name}</strong></div>
                                <div className="card-body">
                                    <p><strong>Email:</strong> {employee.email || "—"}</p>
                                    <p><strong>Phone:</strong> {employee.phone || "—"}</p>
                                    <p><strong>Department:</strong> {employee.department?.name || "—"}</p>
                                    <p><strong>Designation:</strong> {employee.designation || "—"}</p>
                                    <p><strong>Date of Joining:</strong> {employee.date_of_joining ? new Date(employee.date_of_joining).toLocaleDateString() : "—"}</p>
                                    <p><strong>Status:</strong>{" "}
                                        <span className={`badge bg-${employee.status === "Active" ? "success" : "secondary"}`}>
                                            {employee.status || "—"}
                                        </span>
                                    </p>
                                    <p><strong>Address:</strong> {employee.address || "—"}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </Layout>
        </ProtectedRoute>
    );
}

export async function getServerSideProps() { return { props: {} }; }
