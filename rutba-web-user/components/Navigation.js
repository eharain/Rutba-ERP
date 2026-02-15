import Link from "next/link";
import { useRouter } from "next/router";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { getCrossAppLinks, APP_URLS } from "@rutba/pos-shared/lib/roles";

export default function Navigation() {
    const { user, appAccess } = useAuth();
    const router = useRouter();

    const crossLinks = getCrossAppLinks(appAccess, 'web-user');

    return (
        <nav className="navbar navbar-expand-lg navbar-dark bg-dark px-3 text-white">
            <Link className="navbar-brand fw-bold" href="/">Rutba Orders</Link>
            <button className="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#mainNav" aria-controls="mainNav" aria-expanded="false" aria-label="Toggle navigation">
                <span className="navbar-toggler-icon"></span>
            </button>
            <div className="collapse navbar-collapse" id="mainNav">
                <ul className="navbar-nav me-auto mb-2 mb-lg-0">
                    <li className="nav-item">
                        <Link className="nav-link" href="/orders">My Orders</Link>
                    </li>
                    <li className="nav-item">
                        <Link className="nav-link" href="/returns">Returns</Link>
                    </li>
                    {crossLinks.length > 0 && (
                        <li className="nav-item dropdown">
                            <a className="nav-link dropdown-toggle" href="#" id="crossAppMenu" role="button" data-bs-toggle="dropdown" aria-expanded="false">
                                Switch App
                            </a>
                            <ul className="dropdown-menu" aria-labelledby="crossAppMenu">
                                {crossLinks.map(link => (
                                    <li key={link.key}>
                                        {link.disabled
                                            ? <span className="dropdown-item disabled text-muted">{link.label}</span>
                                            : <a className="dropdown-item" href={link.href}>{link.label}</a>
                                        }
                                    </li>
                                ))}
                            </ul>
                        </li>
                    )}
                </ul>

                <div className="d-flex align-items-center">
                    {user ? (
                        <>
                            <span className="me-3">Hello, {user.username || user.email}</span>
                            <button className="btn btn-outline-light btn-sm" onClick={() => {
                                localStorage.clear();
                                window.location.href = APP_URLS.auth + '/logout';
                            }}>Logout</button>
                        </>
                    ) : (
                        <a
                            className="btn btn-outline-light btn-sm"
                            href={`${APP_URLS.auth}/authorize?redirect_uri=${encodeURIComponent(`${APP_URLS['web-user']}/auth/callback`)}&state=${encodeURIComponent(router.asPath || "/")}`}
                        >
                            Login
                        </a>
                    )}
                </div>
            </div>
        </nav>
    );
}
