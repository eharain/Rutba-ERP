import Link from "next/link";

export default function NavigationSecondary() {
    return (
        <nav className="navbar navbar-expand navbar-grey bg-light px-3 py-2 border-bottom">
            <ul className="navbar-nav align-items-center gap-2">
                <li className="nav-item fw-semibold text-uppercase small text-muted me-1">Quick:</li>
                <li className="nav-item">
                    <Link className="btn btn-sm btn-outline-primary" href="/sale-orders">Orders</Link>
                </li>
                <li className="nav-item">
                    <Link className="btn btn-sm btn-outline-info" href="/riders">Riders</Link>
                </li>
                <li className="nav-item">
                    <Link className="btn btn-sm btn-outline-secondary" href="/delivery-methods">Methods</Link>
                </li>
                <li className="nav-item">
                    <Link className="btn btn-sm btn-outline-success" href="/delivery-zones">Zones</Link>
                </li>
                <li className="nav-item">
                    <Link className="btn btn-sm btn-outline-warning" href="/notification-templates">Templates</Link>
                </li>
            </ul>
        </nav>
    );
}
