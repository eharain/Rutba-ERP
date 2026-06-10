import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { CrmContactsEndpoints } from "@rutba/api-provider/endpoints";
import Link from "next/link";
import ContactForm from "../components/form/ContactForm";

const PAGE_SIZE = 20;

export default function Contacts() {
    const { jwt } = useAuth();
    const [contacts, setContacts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [search, setSearch] = useState("");
    const [query, setQuery] = useState("");
    const [page, setPage] = useState(1);
    const [pagination, setPagination] = useState(null);

    const loadContacts = () => {
        if (!jwt) return;
        setLoading(true);
        CrmContactsEndpoints.list({
            page,
            pageSize: PAGE_SIZE,
            sort: ["createdAt:desc"],
            ...(query
                ? {
                    filters: {
                        $or: [
                            { name: { $containsi: query } },
                            { email: { $containsi: query } },
                            { phone: { $containsi: query } },
                            { company: { $containsi: query } },
                        ],
                    },
                }
                : {}),
        })
            .then((res) => {
                setContacts(res.data || []);
                setPagination(res.meta?.pagination || null);
            })
            .catch((err) => console.error("Failed to load contacts", err))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        loadContacts();
    }, [jwt, page, query]);

    const handleSearch = (e) => {
        e.preventDefault();
        setPage(1);
        setQuery(search.trim());
    };

    const handleDelete = async (contact) => {
        if (!window.confirm(`Delete contact "${contact.name}"? Linked leads and activities keep existing but lose this contact.`)) return;
        try {
            await CrmContactsEndpoints.del(contact.documentId);
            loadContacts();
        } catch (err) {
            console.error("Failed to delete contact", err);
            alert("Failed to delete contact.");
        }
    };

    const pageCount = pagination?.pageCount || 1;

    return (
        <ProtectedRoute>
            <Layout>
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <h2 className="mb-0">Contacts</h2>
                    <button className="btn btn-primary" onClick={() => setShowForm(true)}>
                        <i className="fas fa-plus me-1"></i>Add Contact
                    </button>
                </div>

                {showForm && (
                    <div className="card mb-4">
                        <div className="card-header d-flex justify-content-between align-items-center">
                            <strong>New Contact</strong>
                            <button className="btn-close" onClick={() => setShowForm(false)}></button>
                        </div>
                        <div className="card-body">
                            <ContactForm
                                onSaved={() => {
                                    setShowForm(false);
                                    loadContacts();
                                }}
                                onCancel={() => setShowForm(false)}
                            />
                        </div>
                    </div>
                )}

                <form className="row g-2 mb-3" onSubmit={handleSearch}>
                    <div className="col-md-5">
                        <input
                            className="form-control"
                            placeholder="Search by name, email, phone or company"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <div className="col-auto">
                        <button className="btn btn-outline-primary" type="submit">
                            <i className="fas fa-search me-1"></i>Search
                        </button>
                    </div>
                    {query && (
                        <div className="col-auto">
                            <button
                                className="btn btn-outline-secondary"
                                type="button"
                                onClick={() => { setSearch(""); setQuery(""); setPage(1); }}
                            >
                                Clear
                            </button>
                        </div>
                    )}
                </form>

                {loading && <p>Loading contacts...</p>}

                {!loading && contacts.length === 0 && (
                    <div className="alert alert-info">
                        {query ? "No contacts match your search." : "No contacts found."}
                    </div>
                )}

                {!loading && contacts.length > 0 && (
                    <>
                        <div className="table-responsive">
                            <table className="table table-striped table-hover">
                                <thead className="table-dark">
                                    <tr>
                                        <th>Name</th>
                                        <th>Email</th>
                                        <th>Phone</th>
                                        <th>Company</th>
                                        <th className="text-end"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {contacts.map((c) => (
                                        <tr key={c.documentId || c.id}>
                                            <td>{c.name}</td>
                                            <td>{c.email || "—"}</td>
                                            <td>{c.phone || "—"}</td>
                                            <td>{c.company || "—"}</td>
                                            <td className="text-end">
                                                <Link className="btn btn-sm btn-outline-primary me-1" href={`/${c.documentId || c.id}/contact`}>
                                                    View
                                                </Link>
                                                <button
                                                    className="btn btn-sm btn-outline-danger"
                                                    onClick={() => handleDelete(c)}
                                                >
                                                    <i className="fas fa-trash"></i>
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {pageCount > 1 && (
                            <nav className="d-flex justify-content-between align-items-center">
                                <span className="text-muted small">
                                    Page {pagination.page} of {pageCount} ({pagination.total} contacts)
                                </span>
                                <div className="btn-group">
                                    <button
                                        className="btn btn-sm btn-outline-secondary"
                                        disabled={page <= 1}
                                        onClick={() => setPage(page - 1)}
                                    >
                                        <i className="fas fa-chevron-left"></i> Prev
                                    </button>
                                    <button
                                        className="btn btn-sm btn-outline-secondary"
                                        disabled={page >= pageCount}
                                        onClick={() => setPage(page + 1)}
                                    >
                                        Next <i className="fas fa-chevron-right"></i>
                                    </button>
                                </div>
                            </nav>
                        )}
                    </>
                )}
            </Layout>
        </ProtectedRoute>
    );
}
