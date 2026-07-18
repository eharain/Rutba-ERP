import React from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import BranchDeskManager from "@rutba/pos-shared/components/BranchDeskManager";

// Branch = the single stock-holding location (warehouse merged into branch).
// This screen manages branches, their sales desks, and their bin hierarchy.
export default function BranchesPage() {
    return (
        <ProtectedRoute>
            <Layout>
                <BranchDeskManager title="Branches, Desks & Locations" />
            </Layout>
        </ProtectedRoute>
    );
}
