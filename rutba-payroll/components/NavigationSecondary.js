import Link from "next/link";

export default function NavigationSecondary() {
    return (
        <nav className="navbar navbar-expand navbar-grey bg-light px-3 py-2 border-bottom">
            <ul className="navbar-nav align-items-center gap-2">
                <li className="nav-item fw-semibold text-uppercase small text-muted me-1">Quick:</li>
                <li className="nav-item">
                    <Link className="btn btn-sm btn-outline-primary" href="/salary-structures">Structures</Link>
                </li>
                <li className="nav-item">
                    <Link className="btn btn-sm btn-outline-info" href="/payroll-runs">Payroll Runs</Link>
                </li>
                <li className="nav-item">
                    <Link className="btn btn-sm btn-outline-success" href="/payslips">Payslips</Link>
                </li>
            </ul>
        </nav>
    );
}
