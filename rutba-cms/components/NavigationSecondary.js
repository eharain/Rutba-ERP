import Link from "next/link";

export default function NavigationSecondary() {
    return (
        <nav className="navbar navbar-expand navbar-grey bg-light px-3 py-2 border-bottom">
            <ul className="navbar-nav align-items-center gap-2">
                <li className="nav-item fw-semibold text-uppercase small text-muted me-1">Quick:</li>
                <li className="nav-item">
                    <Link className="btn btn-sm btn-outline-primary" href="/products">Products</Link>
                </li>
                <li className="nav-item">
                    <Link className="btn btn-sm btn-outline-info" href="/categories">Categories</Link>
                </li>
                <li className="nav-item">
                    <Link className="btn btn-sm btn-outline-secondary" href="/brands">Brands</Link>
                </li>
                <li className="nav-item">
                    <Link className="btn btn-sm btn-outline-success" href="/product-groups">Groups</Link>
                </li>
                <li className="nav-item">
                    <Link className="btn btn-sm btn-outline-warning" href="/pages">Pages</Link>
                </li>
            </ul>
        </nav>
    );
}
