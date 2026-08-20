#!/usr/bin/env node
'use strict';

/**
 * Contract test for SCIM sync-up (portal task E3, GLOBAL-AUTH.md §5).
 *
 * Every payload this instance would send to central auth is compared against
 * the shared fixture for it in `@rutba/contracts`. Building a membership write
 * that "looks right" is not the same as building the one central accepts, and
 * the SCIM User is `additionalProperties: false` — a stray key is a rejected
 * request, not an ignored one.
 *
 * The other half of what is asserted here is the refusals: an org app that
 * quietly sends an email change gets a `mutability` error it will most likely
 * swallow, and the person who typed the new address never learns their edit
 * went nowhere.
 *
 *   node scripts/smoke-scim.js
 */

const path = require('path');
const Module = require('module');
const { REPO_ROOT: ROOT, openContracts, canonical } = require('./lib/contracts');

const contracts = openContracts();

// ── stubs: this is a payload contract, not a database one ─────────────────
const connPath = require.resolve(path.join(ROOT, 'services/core/src/db/connection.js'));
const connStub = new Module(connPath);
connStub.filename = connPath;
connStub.loaded = true;
connStub.exports = {
  getDb: () => () => { throw new Error('building a SCIM payload must not query'); },
  withTransaction: async (cb) => cb(null),
  closeDb: async () => {},
};
require.cache[connPath] = connStub;

const healthPath = require.resolve(path.join(ROOT, 'services/core/src/platform/health.js'));
const healthStub = new Module(healthPath);
healthStub.filename = healthPath;
healthStub.loaded = true;
healthStub.exports = { instance: () => ({ orgId: 'org_123' }) };
require.cache[healthPath] = healthStub;

const scim = require(path.join(ROOT, 'services/core/src/platform/scim.js'));
const domains = require(path.join(ROOT, 'packages/api-provider/config/domains.json'));

const fail = [];
let count = 0;
const eq = (n, got, want) => {
  count += 1;
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    fail.push(`${n}\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`);
  }
};
const same = (n, got, want) => eq(n, canonical(got), canonical(want));

(async () => {
  // ── the payloads are the contract's, byte for byte ──────────────────────
  same('a membership create matches the shared fixture',
    scim.userCreateRequest({
      orgId: 'org_123',
      userName: 'sara@acme.com',
      externalId: 'EMP-0042',
      givenName: 'Sara',
      familyName: 'Ahmed',
      email: 'sara@acme.com',
      roles: ['hr:admin', 'stock:viewer'],
      employeeId: 'EMP-0042',
      department: 'People',
      syncedAt: '2026-08-20T12:00:00Z',
    }),
    contracts.fixture('scim/user-create-request.json'));

  same('a role change matches the shared fixture',
    scim.patchRoles(['hr:admin', 'payroll:admin']),
    contracts.fixture('scim/patch-roles.json'));

  same('a deactivation matches the shared fixture',
    scim.patchDeactivate(),
    contracts.fixture('scim/patch-deactivate.json'));

  // employeeId and department sit INSIDE apps.<app>, which the prose gets
  // wrong and the schema does not.
  const created = scim.userCreateRequest({
    orgId: 'org_123', userName: 'sara@acme.com', roles: [], employeeId: 'E1', department: 'D',
  });
  eq('employee id and department live beside the roles they describe',
     Object.keys(created[scim.SCHEMA_MEMBERSHIP].apps.erp).sort(),
     ['department', 'employeeId', 'roles']);

  // The User is additionalProperties:false — anything invented here is a 400.
  const userSchema = contracts.schema('scim/user.schema.json');
  const allowed = new Set(Object.keys(userSchema.properties));
  eq('no key is emitted that the schema does not define',
     Object.keys(created).filter((k) => !allowed.has(k)), []);

  // ── what an org may not write ───────────────────────────────────────────
  const refused = (path_) => {
    try { scim.patch([{ op: 'replace', path: path_, value: 'x' }]); return null; }
    catch (e) { return e.scimType || e.name; }
  };
  eq('userName is central\'s', refused('userName'), 'mutability');
  eq('so is the name', refused('name.givenName'), 'mutability');
  eq('so is the email', refused('emails[0].value'), 'mutability');
  eq('so are credentials', refused('password'), 'mutability');
  eq('membership state is ours to write', refused('active'), null);
  eq('and so are our own roles', refused(scim.membershipPath('roles')), null);

  // The refusal we would get back if one slipped through, recognised.
  eq('a mutability refusal from central is recognised',
     scim.isMutabilityRefusal(contracts.fixture('scim/error-mutability.json')), true);
  eq('an ordinary SCIM error is not mistaken for one',
     scim.isMutabilityRefusal({ schemas: [scim.SCHEMA_ERROR], status: '404' }), false);

  // ── roles cross the wire in the portal's dialect ────────────────────────
  const rolePattern = new RegExp(contracts.schema('common.schema.json').$defs.role.pattern);
  eq('local keys become claims', scim.rolesFromAppRoleKeys(['hr_admin', 'accounts_viewer_admin', 'ap_staff']),
     ['accounts-viewer:admin', 'ap:staff', 'hr:admin']);

  // The check that matters: every real grant in this repo must be expressible.
  const allKeys = Object.values(domains).flatMap((d) => d.roles || []);
  const portable = scim.rolesFromAppRoleKeys(allKeys);
  const stranded = scim.nonPortableRoleKeys(allKeys);
  eq(`all ${allKeys.length} real role keys survive the crossing`, stranded, []);
  eq('and every one matches the contract\'s role pattern',
     portable.filter((r) => !rolePattern.test(r)), []);

  // A key with an unrecognised level is left behind rather than sent — an
  // underscore fails the pattern and would take the whole write with it.
  eq('an unsyncable grant is reported, not smuggled',
     [scim.rolesFromAppRoleKeys(['hr_wizard', 'hr_admin']), scim.nonPortableRoleKeys(['hr_wizard', 'hr_admin'])],
     [['hr:admin'], ['hr_wizard']]);

  // ── the client ──────────────────────────────────────────────────────────
  let sent = null;
  const fetchImpl = async (url, init) => {
    sent = { url, ...init };
    return { ok: true, status: 200, text: async () => JSON.stringify(contracts.fixture('scim/user-response.json')) };
  };
  const client = scim.createScimClient({ baseUrl: 'https://auth.rutba.io/', token: 'tok', fetchImpl });
  const body = scim.patchRoles(['hr:admin']);
  await client.patchUser('usr_8f3a2c', body);
  eq('a membership patch goes to the user it names',
     [sent.method, sent.url], ['PATCH', 'https://auth.rutba.io/scim/v2/Users/usr_8f3a2c']);
  eq('with SCIM content type and the org\'s own credentials',
     [sent.headers['content-type'], sent.headers.authorization],
     ['application/scim+json', 'Bearer tok']);
  eq('and the body is the payload, unchanged', JSON.parse(sent.body), body);

  // A refusal surfaces as a refusal, not as a generic 400 nobody reads.
  const refusing = scim.createScimClient({
    baseUrl: 'https://auth.rutba.io', token: 'tok',
    fetchImpl: async () => ({
      ok: false, status: 400,
      text: async () => JSON.stringify(contracts.fixture('scim/error-mutability.json')),
    }),
  });
  let caught = null;
  try { await refusing.createUser({}); } catch (e) { caught = e; }
  eq('a mutability refusal from the wire is labelled as one',
     [caught && caught.name, caught && caught.mutability], ['ScimRequestFailed', true]);

  // ── the door ────────────────────────────────────────────────────────────
  let unwired = null;
  try { await scim.createScimClient({ baseUrl: '', token: '' }).createUser({}); }
  catch (e) { unwired = e.name; }
  eq('an instance with no SCIM credentials refuses rather than queues',
     unwired, 'ScimNotWired');
  eq('and says so before it is asked to send anything',
     scim.createScimClient({ baseUrl: '', token: '' }).enabled(), false);

  console.log(fail.length
    ? `FAIL ${fail.length}/${count}:\n  - ` + fail.join('\n  - ')
    : `PASS all ${count} SCIM contract checks (fixtures: ${contracts.dir})`);
  process.exit(fail.length ? 1 : 0);
})().catch((e) => { console.error('THREW:', e.stack); process.exit(1); });
