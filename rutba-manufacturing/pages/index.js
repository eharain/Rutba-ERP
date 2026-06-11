import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import Link from "next/link";

export default function Home() {
    return (
        <ProtectedRoute>
            <Layout>
                <h2 className="mb-3">Rutba Manufacturing 🏭</h2>
                <p className="text-muted">
                    Run production: receive materials, raise work orders, assign worker tasks,
                    record QC, and meter piece-rate output for payroll.
                </p>
                <div className="row g-3 mt-2">
                    {[
                        { href: "/work-orders", icon: "fa-clipboard-list", title: "Work Orders", text: "Create and drive production job cards." },
                        { href: "/material-lots", icon: "fa-layer-group", title: "Materials", text: "Receive fabric/trims and issue to work orders." },
                        { href: "/workers", icon: "fa-people-group", title: "Workers", text: "Per-worker output, defects and piece-rate earnings." },
                        { href: "/setup", icon: "fa-gear", title: "Setup", text: "Operations, piece-rates, lines, BOMs, defects." },
                    ].map((c) => (
                        <div className="col-12 col-md-6 col-lg-3" key={c.href}>
                            <Link href={c.href} className="text-decoration-none">
                                <div className="card h-100 shadow-sm">
                                    <div className="card-body">
                                        <i className={`fa-solid ${c.icon} fa-2x text-primary mb-2`}></i>
                                        <h5 className="card-title">{c.title}</h5>
                                        <p className="card-text text-muted small">{c.text}</p>
                                    </div>
                                </div>
                            </Link>
                        </div>
                    ))}
                </div>
            </Layout>
        </ProtectedRoute>
    );
}

export async function getServerSideProps() { return { props: {} }; }
