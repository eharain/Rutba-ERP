import React, { useEffect, useState } from "react";
import { authApi, api } from "@rutba/pos-shared/lib/api";
import Layout from "../components/Layout";
import { useUtil } from "@rutba/pos-shared/context/UtilContext"
export default function SettingsPage() {
    const [branches, setBranches] = useState([]);
    const [selectedBranch, setSelectedBranch] = useState(null);
    const [selectedDesk, setSelectedDesk] = useState(null);
    const { branch, desk, setBranchDesk, setBranch, setCurrency, currency } = useUtil();
    useEffect(() => {
        const fetchData = async () => {
            try {
                const response = await api.get("/branches?populate[0]=desks&populate[1]=currency");
                setBranches(response.data || []);
                setSelectedBranch(branch);
                setSelectedDesk(desk)
                setCurrency(currency);
            } catch (error) {
                console.error("Failed to fetch branches:", error);
            }
        };
        fetchData();
    }, [desk, branch]);

    const handleDeskSelect = (branch, desk) => {
        setSelectedBranch(branch);
        setSelectedDesk(desk);
        setBranch(branch);
        setBranchDesk(desk);
        setCurrency(desk.currency?.symbol ?? 'Rs');
    };

    return (
            <Layout>
                <div className="p-3">
                    <h4 className="mb-3"><i className="fas fa-cog me-2"></i>Settings</h4>

                    <p className="text-muted">Select the branch and desk for this POS terminal.</p>
                    {branches.map((ibranch) => (
                        <div key={ibranch.id} className="card mb-3">
                            <div className="card-header py-2">
                                <strong>{ibranch.name}</strong>
                            </div>
                            <div className="card-body py-2">
                                <div className="row g-2">
                                    {ibranch.desks.map((idesk) => {
                                            const isSelected = desk?.id === idesk.id && branch?.id === ibranch.id;

                                            return (
                                                <div key={idesk.id} className="col-sm-6 col-md-4">
                                                    <button
                                                        className={`btn w-100 text-start ${isSelected ? 'btn-primary' : 'btn-outline-secondary'}`}
                                                        onClick={() => handleDeskSelect(ibranch, idesk)}
                                                    >
                                                        <i className={`fas fa-desktop me-2 ${isSelected ? '' : 'text-muted'}`}></i>
                                                        {idesk.name}
                                                        {idesk.has_cash_register !== false && (
                                                            <span className={`badge ms-2 ${isSelected ? 'bg-light text-primary' : 'bg-success'}`}>
                                                                <i className="fas fa-cash-register me-1"></i>Register
                                                            </span>
                                                        )}
                                                        {idesk.has_sale_returns && (
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
                            </div>
                        </div>
                    ))}
                </div>
            </Layout>
    );
}


