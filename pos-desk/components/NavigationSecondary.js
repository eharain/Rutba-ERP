
import Link from "next/link";

export default function NavigationSecondary() {

	//{/* Secondary Navigation */ }
	return (
		<nav className="navbar navbar-expand navbar-grey bg-light px-3 py-1 border-bottom">
			<ul className="navbar-nav ">
				<li className="nav-item nav-link">Create:</li>
				<li className="nav-item">
					<Link className="nav-link" href="/new/product">Product</Link>
				</li>
				<li className="nav-item">
					<Link className="nav-link" href="/new/sale">Sale</Link>
				</li>
				<li className="nav-item">
					<Link className="nav-link" href="/new/return">Return</Link>
				</li>
				<li className="nav-item">
					<Link className="nav-link" href="/new/purchase">Purchase</Link>
				</li>
			</ul>

		</nav>
	)

}