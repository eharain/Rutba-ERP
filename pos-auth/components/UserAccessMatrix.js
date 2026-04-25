import { Fragment } from "react";

export default function UserAccessMatrix({
  apps,
  filteredUsers,
  savingMap,
  isChecked,
  updateAccess,
}) {
  return (
    <div className="table-responsive">
      <table className="table table-bordered table-sm align-middle">
        <thead className="table-dark">
          <tr>
            <th rowSpan={2} style={{ minWidth: 200 }}>User</th>
            <th rowSpan={2} style={{ minWidth: 180 }}>Type</th>
            <th rowSpan={2} style={{ minWidth: 120 }}>Status</th>
            {apps.map((app) => (
              <th key={`h-${app.id}`} colSpan={2} className="text-center" style={{ minWidth: 160 }}>
                {app.name || app.key}
              </th>
            ))}
          </tr>
          <tr>
            {apps.map((app) => (
              <Fragment key={`sub-${app.id}`}>
                <th className="text-center">User</th>
                <th className="text-center">Admin</th>
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {filteredUsers.length === 0 && (
            <tr>
              <td colSpan={3 + apps.length * 2} className="text-center text-muted py-4">
                No users found.
              </td>
            </tr>
          )}
          {filteredUsers.map((user) => (
            <tr key={user.id}>
              <td>
                <div className="fw-semibold">{user.displayName || "—"}</div>
                <div className="small text-muted">{user.username || "—"} • {user.email || "—"}</div>
              </td>
              <td>{user.role?.name || "No Role"}</td>
              <td>
                {user.blocked
                  ? <span className="badge bg-danger">Blocked</span>
                  : user.confirmed
                    ? <span className="badge bg-success">Active</span>
                    : <span className="badge bg-warning text-dark">Unconfirmed</span>}
              </td>
              {apps.map((app) => {
                const userKey = `${user.id}:${app.id}:user`;
                const adminKey = `${user.id}:${app.id}:admin`;
                const userChecked = isChecked(user, app.id, "app_accesses");
                const adminChecked = isChecked(user, app.id, "admin_app_accesses");
                const saving = !!(savingMap[userKey] || savingMap[adminKey]);

                return (
                  <Fragment key={`cells-${user.id}-${app.id}`}>
                    <td className="text-center">
                      <input
                        type="checkbox"
                        className="form-check-input"
                        checked={userChecked}
                        disabled={saving || adminChecked}
                        onChange={(e) => updateAccess(user, app.id, "user", e.target.checked)}
                      />
                    </td>
                    <td className="text-center">
                      <input
                        type="checkbox"
                        className="form-check-input"
                        checked={adminChecked}
                        disabled={saving}
                        onChange={(e) => updateAccess(user, app.id, "admin", e.target.checked)}
                      />
                    </td>
                  </Fragment>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
