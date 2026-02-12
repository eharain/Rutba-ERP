import Link from "next/link";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { getBranch } from "@rutba/pos-shared/lib/utils";
import { useEffect } from "react";

export default function Navigation() {
    const { user, logout } = useAuth();
    const { companName, setCompanyName } = useAuth('Rutba');
    useEffect(() => {
        try {
            setCompanyName(getBranch()?.companyName);
        } catch (e) { }
    }, []);

    return (
        <nav className="navbar navbar-expand-lg navbar-dark bg-dark px-3 text-white">
            <Link className="navbar-brand fw-bold" href="/">Rutba POS</Link>
            <button className="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#mainNav" aria-controls="mainNav" aria-expanded="false" aria-label="Toggle navigation">
                <span className="navbar-toggler-icon"></span>
            </button>
            <div className="collapse navbar-collapse" id="mainNav">
                <ul className="navbar-nav me-auto mb-2 mb-lg-0">
                    <li className="nav-item">
                        <Link className="nav-link" href="/sales">Sales</Link>
                    </li>
                    <li className="nav-item">
                        <Link className="nav-link" href="/sales-returns">Returns</Link>
                    </li>
                    <li className="nav-item">
                        <Link className="nav-link" href="/cash-register">Cash Register</Link>
                    </li>
                    <li className="nav-item">
                        <Link className="nav-link" href="/reports">Reports</Link>
                    </li>
                </ul>

                <div className="d-flex align-items-center">
                    {user ? (
                        <>
                            <span className="me-3">Hello, {user.username || user.email}</span>
                            <button className="btn btn-outline-light btn-sm me-2" onClick={logout}>Logout</button>
                        </>
                    ) : (
                        <Link className="btn btn-outline-light btn-sm me-2" href="/login">Login</Link>
                    )}
                    <Link className="nav-link" href="/settings" title="Settings">
                        <i className="fas fa-cog"></i>
                    </Link>
                </div>
            </div>
        </nav>
    );
}
