import Link from "next/link";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { getCrossAppLinks, canAccessApp, APP_URLS } from "@rutba/pos-shared/lib/roles";

export default function Navigation() {
    const { user, appAccess, logout } = useAuth();
    const crossLinks = getCrossAppLinks(appAccess, 'auth');
    const hasAuthAccess = canAccessApp(appAccess, 'auth');

    return (
        <nav className="navbar navbar-expand-lg navbar-dark bg-dark px-3 text-white">
            <Link className="navbar-brand fw-bold" href="/">Rutba Auth</Link>
            <button className="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#authNav">
                <span className="navbar-toggler-icon"></span>
            </button>
            <div className="collapse navbar-collapse" id="authNav">
                <ul className="navbar-nav me-auto mb-2 mb-lg-0">
                    {hasAuthAccess && (
                        <>
                            <li className="nav-item">
                                <Link className="nav-link" href="/users">Users</Link>
                            </li>
                            <li className="nav-item">
                                <Link className="nav-link" href="/app-access">App Access</Link>
                            </li>
                        </>
                    )}
                    {crossLinks.length > 0 && (
                        <li className="nav-item dropdown">
                            <a className="nav-link dropdown-toggle" href="#" id="crossAppMenu" role="button" data-bs-toggle="dropdown">
                                Switch App
                            </a>
                            <ul className="dropdown-menu" aria-labelledby="crossAppMenu">
                                {crossLinks.map(link => (
                                    <li key={link.key}><a className="dropdown-item" href={link.href}>{link.label}</a></li>
                                ))}
                            </ul>
                        </li>
                    )}
                </ul>
                <div className="d-flex align-items-center">
                    {user ? (
                        <>
                            <span className="me-3">Hello, {user.username || user.email}</span>
                            <button className="btn btn-outline-light btn-sm" onClick={() => { window.location.href = '/logout'; }}>
                                Logout
                            </button>
                        </>
                    ) : (
                        <Link className="btn btn-outline-light btn-sm" href="/login">Login</Link>
                    )}
                </div>
            </div>
        </nav>
    );
}
