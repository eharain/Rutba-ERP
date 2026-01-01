import React, { useEffect, useState } from "react";
import { authApi, api } from "../lib/api";
import Layout from "../components/Layout";
import PermissionCheck from "../components/PermissionCheck";
import { useUtil } from "../context/UtilContext"
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
                //const savedBranch = utils.branch//.getItem("branch");
                //const savedDesk = utils.getItem("branch-desk");
                //if (savedBranch) setSelectedBranch(JSON.parse(savedBranch));
                //if (savedDesk) setSelectedDesk(JSON.parse(savedDesk));
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
        <PermissionCheck required="api::branch.branch.find">
            <Layout>
                <div className="p-6">
                    <h1 className="text-xl font-bold mb-4">Settings</h1>

                    <div className="space-y-6">
                        <h2>Please select the Branch and Desk for this POS</h2>
                        {branches.map((ibranch) => (
                            <div key={ibranch.id} className="border rounded-lg p-4">
                                <h3 className="text-lg font-semibold mb-1">{ibranch.name}</h3>
                                <p className="text-sm text-gray-500 mb-3">
                                    Select a desk below to set your default POS branch and desk.
                                </p>
                                <ul className="space-y-2">
                                    {ibranch.desks.map((idesk) => {
                                        const isSelected = desk?.id === idesk.id && branch?.id === ibranch.id;

                                        return (
                                            <li key={idesk.id}>
                                                <button
                                                    className={`flex justify-between items-center px-4 py-2 rounded border w-full text-left transition 
                                                    ${isSelected
                                                            ? "bg-blue-500 text-grey border-blue-600 font-semibold"
                                                            : "bg-grey-100 hover:bg-grey-200 border-grey-300"
                                                        }`}
                                                    onClick={() => handleDeskSelect(ibranch, idesk)}
                                                >
                                                    {isSelected && (
                                                        <span className="ml-2 font-bold">✓</span>
                                                    )}
                                                    <span>{idesk.name}</span>

                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        ))}

                    </div>
                </div>
            </Layout>
        </PermissionCheck>
    );
}
