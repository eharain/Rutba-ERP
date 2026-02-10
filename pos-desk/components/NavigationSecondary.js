
import Link from "next/link";

export default function NavigationSecondary() {

	//{/* Secondary Navigation */ }
	return (
		<nav className="navbar navbar-expand navbar-grey bg-light px-3 py-2 border-bottom">
			<ul className="navbar-nav align-items-center gap-2">
				<li className="nav-item fw-semibold text-uppercase small text-muted me-1">Create:</li>
				<li className="nav-item">
					<Link className="btn btn-sm btn-outline-primary" href="/new/product-edit">Product</Link>
				</li>
				<li className="nav-item">
					<Link className="btn btn-sm btn-outline-success" href="/new/sale">Sale</Link>
				</li>
				<li className="nav-item">
					<Link className="btn btn-sm btn-outline-warning" href="/new/return">Return</Link>
				</li>
				<li className="nav-item">
					<Link className="btn btn-sm btn-outline-info" href="/new/purchase">Purchase</Link>
				</li>
			</ul>

		</nav>
	)

}