import { useState } from "react";
import Link from "next/link";

export default function UserAccessCard({
  user,
  apps,
  savingMap,
  isChecked,
  updateAccess,
  bulkUpdateUser,
  bulkBusy,
}) {
  const [expanded, setExpanded] = useState(false);
  const userAccessCount = (user.domain_accesses || []).length;
  const adminAccessCount = (user.admin_domain_accesses || []).length;
  const userRowBusy = Object.keys(savingMap || {}).some(
    (k) => k.startsWith(`${user.id}:`) && savingMap[k],
  );
  const userRemaining = Math.max(0, apps.length - userAccessCount);
  const adminRemaining = Math.max(0, apps.length - adminAccessCount);

  return (
    <div className="card mb-3">
      <div className="card-header bg-light">
        <div className="row align-items-center">
          <div className="col-md-7">
            <div className="fw-bold">
              <Link href={`/users/${user.id}`} className="text-decoration-none">
                {user.displayName || user.username || user.email || "—"}
              </Link>
            </div>
            <div className="small text-muted">
              <span className="me-3">
                <i className="fas fa-user me-1"></i>
                {user.username || "—"}
              </span>
              <span>
                <i className="fas fa-envelope me-1"></i>
                {user.email || "—"}
              </span>
            </div>
          </div>
          <div className="col-md-6 text-md-end mt-2 mt-md-0">
            <span className="badge bg-secondary me-2">
              <i className="fas fa-shield-alt me-1"></i>
              {user.role?.name || "No Role"}
            </span>
            {user.blocked ? (
              <span className="badge bg-danger">
                <i className="fas fa-ban me-1"></i>
                Blocked
              </span>
            ) : user.confirmed ? (
              <span className="badge bg-success">
                <i className="fas fa-check-circle me-1"></i>
                Active
              </span>
            ) : (
              <span className="badge bg-warning text-dark">
                <i className="fas fa-exclamation-circle me-1"></i>
                Unconfirmed
              </span>
            )}
          </div>
          <div className="col-md-2 text-md-end mt-2 mt-md-0">
            <button
              type="button"
              className="btn btn-sm btn-outline-primary"
              onClick={() => setExpanded((prev) => !prev)}
            >
              <i className={`fas ${expanded ? "fa-chevron-up" : "fa-chevron-down"} me-1`}></i>
              Apps ({apps.length})
            </button>
          </div>
        </div>
      </div>
      <div className="card-body">
        {!expanded && (
          <div className="small text-muted">
            <span className="me-3"><strong>User:</strong> {userAccessCount}</span>
            <span><strong>Admin:</strong> {adminAccessCount}</span>
          </div>
        )}

        {expanded && (apps.length === 0 ? (
          <p className="text-muted mb-0">No applications configured</p>
        ) : (
          <>
          {bulkUpdateUser && (
            <div className="d-flex flex-wrap gap-2 mb-2">
              <span className="small text-muted align-self-center me-1">Bulk:</span>
              <button
                type="button"
                className="btn btn-sm btn-outline-success"
                disabled={bulkBusy || userRowBusy || userRemaining === 0}
                onClick={() => bulkUpdateUser(user, "user", "fill")}
                title="Grant user access on every remaining app"
              >
                <i className="fas fa-plus me-1"></i>
                Add Remaining User ({userRemaining})
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline-warning"
                disabled={bulkBusy || userRowBusy || adminRemaining === 0}
                onClick={() => bulkUpdateUser(user, "admin", "fill")}
                title="Grant admin access on every remaining app"
              >
                <i className="fas fa-user-shield me-1"></i>
                Add Remaining Admin ({adminRemaining})
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                disabled={bulkBusy || userRowBusy || (userAccessCount === 0 && adminAccessCount === 0)}
                onClick={() => bulkUpdateUser(user, "user", "clear")}
                title="Revoke all user (and admin) access"
              >
                <i className="fas fa-eraser me-1"></i>
                Remove All User
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline-danger"
                disabled={bulkBusy || userRowBusy || adminAccessCount === 0}
                onClick={() => bulkUpdateUser(user, "admin", "clear")}
                title="Revoke admin access (keep user access)"
              >
                <i className="fas fa-minus me-1"></i>
                Remove All Admin
              </button>
            </div>
          )}
          <div className="table-responsive">
            <table className="table table-sm table-hover align-middle mb-0">
              <thead className="table-light">
                <tr>
                  <th style={{ width: "50%" }}>Application</th>
                  <th className="text-center" style={{ width: "25%" }}>
                    <i className="fas fa-user me-1"></i>
                    User Access
                  </th>
                  <th className="text-center" style={{ width: "25%" }}>
                    <i className="fas fa-user-shield me-1"></i>
                    Admin Access
                  </th>
                </tr>
              </thead>
              <tbody>
                {apps.map((app) => {
                  const userKey = `${user.id}:${app.key}:user`;
                  const adminKey = `${user.id}:${app.key}:admin`;
                  const userChecked = isChecked(user, app.key, "domain_accesses");
                  const adminChecked = isChecked(user, app.key, "admin_domain_accesses");
                  const saving = !!(savingMap[userKey] || savingMap[adminKey]);

                  return (
                    <tr key={app.id}>
                      <td>
                        <div className="fw-semibold">{app.name}</div>
                        {app.description && (
                          <div className="small text-muted">{app.description}</div>
                        )}
                        <div className="small">
                          <code className="text-muted">{app.key}</code>
                        </div>
                      </td>
                      <td className="text-center">
                        <div className="form-check form-switch d-inline-block">
                          <input
                            type="checkbox"
                            className="form-check-input"
                            checked={userChecked}
                            disabled={saving || adminChecked}
                            onChange={(e) =>
                              updateAccess(user, app.key, "user", e.target.checked)
                            }
                            style={{ cursor: saving ? "wait" : "pointer" }}
                          />
                        </div>
                        {userChecked && !adminChecked && (
                          <i className="fas fa-check text-success ms-1"></i>
                        )}
                      </td>
                      <td className="text-center">
                        <div className="form-check form-switch d-inline-block">
                          <input
                            type="checkbox"
                            className="form-check-input"
                            checked={adminChecked}
                            disabled={saving}
                            onChange={(e) =>
                              updateAccess(user, app.key, "admin", e.target.checked)
                            }
                            style={{ cursor: saving ? "wait" : "pointer" }}
                          />
                        </div>
                        {adminChecked && (
                          <i className="fas fa-star text-warning ms-1"></i>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        ))}
      </div>
    </div>
  );
}
