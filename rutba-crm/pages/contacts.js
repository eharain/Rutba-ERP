import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi } from "@rutba/pos-shared/lib/api";
import Link from "next/link";

export default function Contacts() {
    const { jwt } = useAuth();
    const [contacts, setContacts] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!jwt) return;
        authApi.get("/crm-contacts?sort=createdAt:desc", {}, jwt)
            .then((res) => setContacts(res.data || []))
            .catch((err) => console.error("Failed to load contacts", err))
            .finally(() => setLoading(false));
    }, [jwt]);

    return (
        <ProtectedRoute>
            <Layout>
                <h2 className="mb-3">Contacts</h2>

                {loading && <p>Loading contacts...</p>}

                {!loading && contacts.length === 0 && (
                    <div className="alert alert-info">No contacts found.</div>
                )}

                {!loading && contacts.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-striped table-hover">
                            <thead className="table-dark">
                                <tr>
                                    <th>Name</th>
                                    <th>Email</th>
                                    <th>Phone</th>
                                    <th>Company</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {contacts.map((c) => (
                                    <tr key={c.id}>
                                        <td>{c.name}</td>
                                        <td>{c.email || "—"}</td>
                                        <td>{c.phone || "—"}</td>
                                        <td>{c.company || "—"}</td>
                                        <td>
                                            <Link className="btn btn-sm btn-outline-primary" href={`/${c.documentId || c.id}/contact`}>
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
