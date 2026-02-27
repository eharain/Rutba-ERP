import React, { useEffect, useState } from "react";
import { api } from "../lib/api";

export default function BranchDeskModal({ isOpen, onSelect, currentBranch, currentDesk }) {
    const [branches, setBranches] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (isOpen) {
            fetchBranches();
        }
    }, [isOpen]);

    const fetchBranches = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await api.get("/branches?populate[0]=desks&populate[1]=currency");
            setBranches(response.data || []);
        } catch (err) {
            console.error("Failed to fetch branches:", err);
            setError("Failed to load branches. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    const handleDeskSelect = (branch, desk) => {
        // Persist directly to localStorage so it survives all sessions
        try {
            localStorage.setItem("branch", JSON.stringify(branch));
            localStorage.setItem("branch-desk", JSON.stringify(desk));
            const currencySymbol = desk.currency?.symbol ?? branch.currency?.symbol ?? "Rs";
            localStorage.setItem("currency", JSON.stringify(currencySymbol));
        } catch (err) {
            console.error("Failed to persist branch/desk to localStorage", err);
        }
        onSelect(branch, desk);
    };

    if (!isOpen) return null;

    return (
        <>
            <div className="modal-backdrop fade show" style={{ zIndex: 1055 }}></div>
            <div className="modal fade show d-block" tabIndex={-1} style={{ zIndex: 1060 }}>
                <div className="modal-dialog modal-dialog-centered modal-lg">
                    <div className="modal-content">
                        <div className="modal-header bg-primary text-white">
                            <h5 className="modal-title">
                                <i className="fas fa-store me-2"></i>
                                Select Branch &amp; Desk
                            </h5>
                        </div>
                        <div className="modal-body">
                            <p className="text-muted mb-3">
                                Please select the branch and desk for this POS terminal. This setting will be remembered on this device.
                            </p>

                            {error && <div className="alert alert-danger py-2">{error}</div>}

                            {loading && (
                                <div className="text-center py-4">
                                    <span className="spinner-border me-2"></span>Loading branches...
                                </div>
                            )}

                            {!loading && branches.length === 0 && !error && (
                                <div className="alert alert-warning">No branches found. Please contact your administrator.</div>
                            )}

                            {!loading && branches.map((branch) => (
                                <div key={branch.id} className="card mb-3">
                                    <div className="card-header py-2">
                                        <strong>{branch.name}</strong>
                                    </div>
                                    <div className="card-body py-2">
                                        {(!branch.desks || branch.desks.length === 0) ? (
                                            <div className="text-muted small">No desks configured for this branch.</div>
                                        ) : (
                                            <div className="row g-2">
                                                {branch.desks.map((desk) => {
                                                    const isSelected = currentDesk?.id === desk.id && currentBranch?.id === branch.id;
                                                    return (
                                                        <div key={desk.id} className="col-sm-6 col-md-4">
                                                            <button
                                                                className={`btn w-100 text-start ${isSelected ? 'btn-primary' : 'btn-outline-secondary'}`}
                                                                onClick={() => handleDeskSelect(branch, desk)}
                                                            >
                                                                <i className={`fas fa-desktop me-2 ${isSelected ? '' : 'text-muted'}`}></i>
                                                                {desk.name}
                                                                {desk.has_cash_register !== false && (
                                                                    <span className={`badge ms-2 ${isSelected ? 'bg-light text-primary' : 'bg-success'}`}>
                                                                        <i className="fas fa-cash-register me-1"></i>Register
                                                                    </span>
                                                                )}
                                                                {desk.has_sale_returns && (
                                                                    <span className={`badge ms-2 ${isSelected ? 'bg-light text-primary' : 'bg-info'}`}>
                                                                        <i className="fas fa-undo me-1"></i>Returns
                                                                    </span>
                                                                )}
                                                                {isSelected && (
                                                                    <i className="fas fa-check-circle ms-2"></i>
                                                                )}
                                                            </button>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
