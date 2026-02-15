import Link from "next/link";

export default function NavigationSecondary() {
    return (
        <nav className="navbar navbar-expand navbar-grey bg-light px-3 py-2 border-bottom">
            <ul className="navbar-nav align-items-center gap-2">
                <li className="nav-item fw-semibold text-uppercase small text-muted me-1">Create:</li>
                <li className="nav-item">
                    <Link className="btn btn-sm btn-outline-success" href="/new/sale"><i className="fas fa-plus me-1"></i>Sale</Link>
                </li>
                <li className="nav-item">
                    <Link className="btn btn-sm btn-outline-warning" href="/new/return"><i className="fas fa-undo me-1"></i>Return</Link>
                </li>
                <li className="nav-item">
                    <Link className="btn btn-sm btn-outline-info" href="/new/sale"><i className="fas fa-exchange-alt me-1"></i>Exchange</Link>
                </li>
            </ul>
        </nav>
    );
}
