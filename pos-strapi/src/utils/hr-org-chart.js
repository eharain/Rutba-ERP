'use strict';

/**
 * Org chart construction, in two views over one node shape.
 *
 *   view=reporting → edges follow hr-employee.reports_to / direct_reports
 *   view=team      → edges follow hr-team.team_manager / members
 *
 * Both return the identical `{documentId, name, ..., children[]}` node, so the
 * frontend renders one component and the toggle only changes which edge the
 * server walked.
 *
 * Everything is built from ONE flat read of the employees in scope rather than
 * a query per node — a 500-person org would otherwise be 500 round-trips. Depth
 * is bounded and cycle-guarded: `reports_to` is HR-editable and nothing stops
 * A→B→A, which must not hang the request.
 */

const EMP_UID = 'api::hr-employee.hr-employee';
const TEAM_UID = 'api::hr-team.hr-team';

const DEFAULT_DEPTH = 4;
const MAX_DEPTH = 10;
const MAX_NODES = 2000;

function nodeOf(e, secondaryByEmployee) {
  const node = {
    documentId: e.documentId,
    name: e.name,
    email: e.email || null,
    // `designation` is a plain string on hr-employee; the richer job title lives
    // on the `position` relation. Prefer the position, fall back to the string.
    designation: e.position?.title || e.designation || null,
    department: e.department?.name || null,
    status: e.status || null,
    is_org_root: e.is_org_root === true,
    children: [],
  };
  // Secondary (matrix) managers hang off the node rather than becoming a second
  // parent edge. A person with two managers is not a tree, and duplicating them
  // under both would inflate every headcount read off the chart.
  const secondary = secondaryByEmployee?.get(e.documentId);
  if (secondary?.length) node.secondary_managers = secondary;
  return node;
}

/** One flat read of every active employee + the relations both views need. */
async function loadEmployees(strapi) {
  return strapi.documents(EMP_UID).findMany({
    filters: { status: { $ne: 'Inactive' } },
    fields: ['documentId', 'name', 'email', 'status', 'designation', 'is_org_root'],
    populate: {
      department: { fields: ['name'] },
      position: { fields: ['title'] },
      reports_to: { fields: ['documentId'] },
    },
    pagination: { pageSize: MAX_NODES },
  });
}

/**
 * Reporting-line tree. Roots are the employees in scope with no manager (or
 * whose manager is outside the loaded set), unless an explicit root is given.
 */
function buildReportingTree(employees, { rootDocId, depth, secondaryByEmployee } = {}) {
  const byId = new Map(employees.map((e) => [e.documentId, e]));
  const childrenOf = new Map();
  for (const e of employees) {
    const parent = e.reports_to?.documentId;
    if (!parent || !byId.has(parent) || parent === e.documentId) continue;
    if (!childrenOf.has(parent)) childrenOf.set(parent, []);
    childrenOf.get(parent).push(e);
  }

  const visited = new Set();
  const expand = (emp, level) => {
    const node = nodeOf(emp, secondaryByEmployee);
    if (level >= depth) {
      // Report what is being withheld so the UI can offer "expand" instead of
      // silently presenting a truncated tree as if it were complete.
      const kids = childrenOf.get(emp.documentId) || [];
      node.has_more = kids.length > 0;
      node.descendant_count = kids.length;
      return node;
    }
    for (const child of childrenOf.get(emp.documentId) || []) {
      if (visited.has(child.documentId)) continue; // cycle guard
      visited.add(child.documentId);
      node.children.push(expand(child, level + 1));
    }
    return node;
  };

  if (rootDocId) {
    const root = byId.get(rootDocId);
    if (!root) return [];
    visited.add(root.documentId);
    return [expand(root, 0)];
  }

  const roots = employees.filter((e) => {
    const p = e.reports_to?.documentId;
    return !p || !byId.has(p) || p === e.documentId;
  });
  return roots.map((r) => { visited.add(r.documentId); return expand(r, 0); });
}

/**
 * Team tree. Nodes are teams (carrying their manager) with member employees as
 * leaves, so the same component can render it — a team node borrows the node
 * shape with `is_team: true`.
 */
async function buildTeamTree(strapi, { rootDocId, depth }) {
  const teams = await strapi.documents(TEAM_UID).findMany({
    fields: ['documentId', 'name'],
    populate: {
      team_manager: { fields: ['documentId', 'name'] },
      members: { fields: ['documentId', 'name'] },
      parent_team: { fields: ['documentId'] },
    },
    pagination: { pageSize: 1000 },
  });

  const byId = new Map(teams.map((t) => [t.documentId, t]));
  const childrenOf = new Map();
  for (const t of teams) {
    const parent = t.parent_team?.documentId;
    if (!parent || !byId.has(parent) || parent === t.documentId) continue;
    if (!childrenOf.has(parent)) childrenOf.set(parent, []);
    childrenOf.get(parent).push(t);
  }

  const visited = new Set();
  const expand = (team, level) => {
    const node = {
      documentId: team.documentId,
      name: team.name,
      is_team: true,
      manager: team.team_manager ? { documentId: team.team_manager.documentId, name: team.team_manager.name } : null,
      children: [],
    };
    if (level >= depth) {
      const kids = childrenOf.get(team.documentId) || [];
      node.has_more = kids.length > 0 || (team.members || []).length > 0;
      return node;
    }
    for (const child of childrenOf.get(team.documentId) || []) {
      if (visited.has(child.documentId)) continue;
      visited.add(child.documentId);
      node.children.push(expand(child, level + 1));
    }
    for (const m of team.members || []) {
      node.children.push({ documentId: m.documentId, name: m.name, is_team: false, children: [] });
    }
    return node;
  };

  if (rootDocId) {
    const root = byId.get(rootDocId);
    if (!root) return [];
    visited.add(root.documentId);
    return [expand(root, 0)];
  }
  const roots = teams.filter((t) => {
    const p = t.parent_team?.documentId;
    return !p || !byId.has(p) || p === t.documentId;
  });
  return roots.map((r) => { visited.add(r.documentId); return expand(r, 0); });
}

/** The caller's own chain upward, nearest manager first. */
function buildChainUpward(employees, employeeDocId, secondaryByEmployee) {
  const byId = new Map(employees.map((e) => [e.documentId, e]));
  const chain = [];
  const seen = new Set([employeeDocId]);
  let cur = byId.get(employeeDocId);
  while (cur?.reports_to?.documentId && chain.length < MAX_DEPTH) {
    const next = byId.get(cur.reports_to.documentId);
    if (!next || seen.has(next.documentId)) break; // cycle guard
    seen.add(next.documentId);
    chain.push(nodeOf(next, secondaryByEmployee));
    cur = next;
  }
  return chain;
}

function clampDepth(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_DEPTH;
  return Math.min(Math.floor(n), MAX_DEPTH);
}

module.exports = {
  loadEmployees,
  buildReportingTree,
  buildTeamTree,
  buildChainUpward,
  clampDepth,
  DEFAULT_DEPTH,
  MAX_DEPTH,
};
