import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/shared/components/ProtectedRoute";
import { useAuth } from "@rutba/shared/context/AuthContext";
import {
    HrCompaniesEndpoints,
    HrDivisionsEndpoints,
    HrBusinessUnitsEndpoints,
    HrCostCentersEndpoints,
    HrJobGradesEndpoints,
    HrDesignationsEndpoints,
    HrPositionsEndpoints,
} from "@rutba/api-provider/endpoints";

const SECTIONS = [
    {
        key: "companies",
        title: "Companies",
        load: () => HrCompaniesEndpoints.list(),
        columns: [
            { header: "Name", render: (r) => r.name },
            { header: "Code", render: (r) => r.code },
            { header: "Active", render: (r) => (r.is_active ? "Yes" : "No") },
        ],
    },
    {
        key: "divisions",
        title: "Divisions",
        load: () => HrDivisionsEndpoints.list(),
        columns: [
            { header: "Name", render: (r) => r.name },
            { header: "Code", render: (r) => r.code },
            { header: "Company", render: (r) => r.company?.name },
            { header: "Parent", render: (r) => r.parent?.name },
        ],
    },
    {
        key: "business-units",
        title: "Business Units",
        load: () => HrBusinessUnitsEndpoints.list(),
        columns: [
            { header: "Name", render: (r) => r.name },
            { header: "Code", render: (r) => r.code },
            { header: "Division", render: (r) => r.division?.name },
            { header: "Parent", render: (r) => r.parent?.name },
        ],
    },
    {
        key: "cost-centers",
        title: "Cost Centers",
        load: () => HrCostCentersEndpoints.list(),
        columns: [
            { header: "Name", render: (r) => r.name },
            { header: "Code", render: (r) => r.code },
            { header: "Business Unit", render: (r) => r.business_unit?.name },
            { header: "Parent", render: (r) => r.parent?.name },
        ],
    },
    {
        key: "job-grades",
        title: "Job Grades",
        load: () => HrJobGradesEndpoints.list(),
        columns: [
            { header: "Name", render: (r) => r.name },
            { header: "Code", render: (r) => r.code },
            { header: "Level", render: (r) => r.level },
        ],
    },
    {
        key: "designations",
        title: "Designations",
        load: () => HrDesignationsEndpoints.list(),
        columns: [
            { header: "Name", render: (r) => r.name },
            { header: "Job Grade", render: (r) => r.job_grade?.name },
        ],
    },
    {
        key: "positions",
        title: "Positions",
        load: () => HrPositionsEndpoints.list(),
        columns: [
            { header: "Title", render: (r) => r.title },
            { header: "Designation", render: (r) => r.designation?.name },
            { header: "Department", render: (r) => r.department?.name },
            { header: "Reports To", render: (r) => r.reports_to_position?.title },
            { header: "Active", render: (r) => (r.is_active ? "Yes" : "No") },
        ],
    },
];

export default function OrgStructure() {
    const { jwt } = useAuth();
    const [active, setActive] = useState(SECTIONS[0].key);
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!jwt) return;
        const section = SECTIONS.find((s) => s.key === active);
        setLoading(true);
        section
            .load()
            .then((res) => setRows(res.data || []))
            .catch((err) => {
                console.error(`Failed to load ${active}`, err);
                setRows([]);
            })
            .finally(() => setLoading(false));
    }, [jwt, active]);

    const section = SECTIONS.find((s) => s.key === active);

    return (
        <ProtectedRoute>
            <Layout>
                <h2 className="mb-3">Org Structure</h2>
                <p className="text-muted small">
                    Manage records via the Strapi admin content manager; this page is a
                    read-only operational view.
                </p>

                <ul className="nav nav-tabs mb-3">
                    {SECTIONS.map((s) => (
                        <li className="nav-item" key={s.key}>
                            <button
                                className={`nav-link ${active === s.key ? "active" : ""}`}
                                onClick={() => setActive(s.key)}
                            >
                                {s.title}
                            </button>
                        </li>
                    ))}
                </ul>

                {loading && <p>Loading...</p>}
                {!loading && rows.length === 0 && (
                    <div className="alert alert-info">No {section.title.toLowerCase()} found.</div>
                )}
                {!loading && rows.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-striped table-hover">
                            <thead className="table-dark">
                                <tr>
                                    {section.columns.map((c) => (
                                        <th key={c.header}>{c.header}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((r) => (
                                    <tr key={r.id}>
                                        {section.columns.map((c) => (
                                            <td key={c.header}>{c.render(r) ?? "—"}</td>
                                        ))}
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
