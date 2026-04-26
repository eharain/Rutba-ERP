export default function UserAccessCard({
  user,
  apps,
  savingMap,
  isChecked,
  updateAccess,
}) {
  return (
    <div className="card mb-3">
      <div className="card-header bg-light">
        <div className="row align-items-center">
          <div className="col-md-6">
            <div className="fw-bold">{user.displayName || "—"}</div>
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
        </div>
      </div>
      <div className="card-body">
        {apps.length === 0 ? (
          <p className="text-muted mb-0">No applications configured</p>
        ) : (
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
                  const userKey = `${user.id}:${app.id}:user`;
                  const adminKey = `${user.id}:${app.id}:admin`;
                  const userChecked = isChecked(user, app.id, "app_accesses");
                  const adminChecked = isChecked(user, app.id, "admin_app_accesses");
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
                              updateAccess(user, app.id, "user", e.target.checked)
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
                              updateAccess(user, app.id, "admin", e.target.checked)
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
        )}
      </div>
    </div>
  );
}
