import Link from "next/link";
import { useRouter } from "next/router";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { APP_URLS } from "@rutba/pos-shared/lib/roles";
import NavAppSwitcher from "@rutba/pos-shared/components/NavAppSwitcher";

export default function Navigation() {
  const { user } = useAuth();
  const router = useRouter();

  return (
    <nav className="navbar navbar-expand-lg navbar-dark bg-dark px-3 text-white">
      <Link className="navbar-brand fw-bold" href="/offers">Rutba Rider</Link>
      <button className="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#mainNav" aria-controls="mainNav" aria-expanded="false" aria-label="Toggle navigation">
        <span className="navbar-toggler-icon"></span>
      </button>
      <div className="collapse navbar-collapse" id="mainNav">
        <ul className="navbar-nav me-auto mb-2 mb-lg-0">
          <li className="nav-item"><Link className="nav-link" href="/offers">Offers</Link></li>
          <li className="nav-item"><Link className="nav-link" href="/deliveries">Deliveries</Link></li>
          <li className="nav-item"><Link className="nav-link" href="/history">History</Link></li>
          <li className="nav-item"><Link className="nav-link" href="/profile">Profile</Link></li>
        </ul>

        <div className="d-flex align-items-center">
          <NavAppSwitcher currentApp="rider" />
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
              href={`${APP_URLS.auth}/authorize?redirect_uri=${encodeURIComponent(`${APP_URLS.rider || 'http://localhost:4012'}/auth/callback`)}&state=${encodeURIComponent(router.asPath || "/")}`}
            >
              Login
            </a>
          )}
        </div>
      </div>
    </nav>
  );
}
