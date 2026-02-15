import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi } from "@rutba/pos-shared/lib/api";
import Link from "next/link";

export default function ContactDetail() {
    const router = useRouter();
    const { documentId } = router.query;
    const { jwt } = useAuth();
    const [contact, setContact] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!jwt || !documentId) return;
        authApi.get(`/crm-contacts/${documentId}?populate=*`, {}, jwt)
            .then((res) => setContact(res.data || res))
            .catch((err) => console.error("Failed to load contact", err))
            .finally(() => setLoading(false));
    }, [jwt, documentId]);

    return (
        <ProtectedRoute>
            <Layout>
                <div className="d-flex align-items-center mb-3">
                    <Link className="btn btn-sm btn-outline-secondary me-3" href="/contacts">
                        <i className="fas fa-arrow-left"></i> Back
                    </Link>
                    <h2 className="mb-0">Contact Details</h2>
                </div>

                {loading && <p>Loading...</p>}

                {!loading && !contact && (
                    <div className="alert alert-warning">Contact not found.</div>
                )}

                {!loading && contact && (
                    <div className="row">
                        <div className="col-md-6">
                            <div className="card">
                                <div className="card-header"><strong>{contact.name}</strong></div>
                                <div className="card-body">
                                    <p><strong>Email:</strong> {contact.email || "—"}</p>
                                    <p><strong>Phone:</strong> {contact.phone || "—"}</p>
                                    <p><strong>Company:</strong> {contact.company || "—"}</p>
                                    <p><strong>Address:</strong> {contact.address || "—"}</p>
                                    {contact.notes && (
                                        <p><strong>Notes:</strong> {contact.notes}</p>
                                    )}
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
