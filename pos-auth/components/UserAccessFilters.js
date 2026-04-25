export default function UserAccessFilters({
  search,
  setSearch,
  roleFilter,
  setRoleFilter,
  statusFilter,
  setStatusFilter,
  roleOptions,
}) {
  return (
    <div className="card mb-3">
      <div className="card-body">
        <div className="row g-2">
          <div className="col-md-5">
            <label className="form-label">Search</label>
            <input
              className="form-control"
              placeholder="Name, username, email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="col-md-4">
            <label className="form-label">User Type</label>
            <select className="form-select" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
              <option value="all">All</option>
              {roleOptions.map((r) => (
                <option key={r.type} value={r.type}>{r.name}</option>
              ))}
            </select>
          </div>
          <div className="col-md-3">
            <label className="form-label">Status</label>
            <select className="form-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="unconfirmed">Unconfirmed</option>
              <option value="blocked">Blocked</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
