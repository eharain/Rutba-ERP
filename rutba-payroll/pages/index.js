import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import Link from "next/link";

const CARDS = [
    { href: "/salary-structures", icon: "fa-money-check-dollar", color: "primary", title: "Salary Structures", text: "Define salary grades, base pay and recurring components." },
    { href: "/employee-profiles", icon: "fa-id-card", color: "info", title: "Employee Profiles", text: "Per-employee pay type, bank and statutory setup." },
    { href: "/payroll-runs", icon: "fa-play", color: "success", title: "Payroll Runs", text: "Create a run, preview, process and post to the ledger." },
    { href: "/payslips", icon: "fa-receipt", color: "warning", title: "Payslips", text: "Review payslips, mark paid and print." },
    { href: "/adjustments", icon: "fa-sliders", color: "secondary", title: "Adjustments", text: "Advances, loans, bonuses and penalties." },
];

export default function Home() {
    return (
        <ProtectedRoute>
            <Layout>
                <h2>Welcome to Rutba Payroll 💰</h2>
                <p className="text-muted mb-4">Process payroll across salaried and piece-rate workers, then post it straight to the accounting ledger.</p>

                <div className="row g-3">
                    {CARDS.map((c) => (
                        <div className="col-md-4" key={c.href}>
                            <div className={`card border-${c.color} h-100`}>
                                <div className="card-body">
                                    <h5 className="card-title"><i className={`fas ${c.icon} me-2 text-${c.color}`}></i>{c.title}</h5>
                                    <p className="card-text text-muted">{c.text}</p>
                                    <Link className={`btn btn-outline-${c.color} btn-sm`} href={c.href}>Open</Link>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </Layout>
        </ProtectedRoute>
    );
}

export async function getServerSideProps() { return { props: {} }; }
