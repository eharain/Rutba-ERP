import React, { useState, useEffect, useCallback, useMemo } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { MarketplaceAccountsEndpoints, MarketplaceMappingsEndpoints } from "@rutba/api-provider/endpoints";
import { useToast } from "../components/Toast";
import { appGet, appPost } from "../components/appClient";

// our marketplace-mapping.kind → Strapi content-type uid (stamped on the row)
const UID_FOR = {
    category: "api::category.category",
    brand: "api::brand.brand",
    term_type: "api::term-type.term-type",
    term: "api::term.term",
};

const tag = (name, id) => `${name} ⟨${id}⟩`;
const parseId = (v) => { const m = /⟨([^⟩]+)⟩\s*$/.exec(String(v || "")); return m ? m[1] : null; };

export default function MappingPage() {
    const { jwt } = useAuth();
    const { toast, ToastContainer } = useToast();

    const [accounts, setAccounts] = useState([]);
    const [accountId, setAccountId] = useState("");
    const [spec, setSpec] = useState(null);
    const [activeKey, setActiveKey] = useState("");

    // per-dimension caches keyed by dimension.key
    const [entities, setEntities] = useState({});   // our entities
    const [externals, setExternals] = useState({});  // pulled marketplace options
    const [mapRows, setMapRows] = useState({});       // mapping rows (internal_document_id → row)
    const [loading, setLoading] = useState(false);
    const [pulling, setPulling] = useState(false);

    const account = useMemo(() => accounts.find((a) => a.documentId === accountId), [accounts, accountId]);
    const dim = useMemo(() => (spec?.dimensions || []).find((d) => d.key === activeKey), [spec, activeKey]);

    // load accounts
    useEffect(() => {
        if (!jwt) return;
        MarketplaceAccountsEndpoints.list({ sort: ["createdAt:desc"] })
            .then((res) => {
                const list = res.data || [];
                setAccounts(list);
                if (list[0]) setAccountId(list[0].documentId);
            })
            .catch(() => toast("Failed to load accounts.", "danger"));
    }, [jwt]);

    // load the provider spec when the account changes
    useEffect(() => {
        if (!jwt || !account) { setSpec(null); return; }
        setSpec(null); setEntities({}); setExternals({}); setMapRows({});
        appGet(`/api/providers/${account.platform}/catalog-spec`, jwt)
            .then((s) => {
                setSpec(s);
                setActiveKey(s?.dimensions?.[0]?.key || "");
            })
            .catch((e) => toast(`Failed to load ${account.platform} spec: ${e.message}`, "danger"));
    }, [jwt, account]);

    // load our entities + existing mappings for the active dimension
    const loadDimension = useCallback(async () => {
        if (!jwt || !account || !dim) return;
        setLoading(true);
        try {
            const [ent, maps] = await Promise.all([
                appGet(`/api/internal/entities?kind=${dim.internalKind}`, jwt),
                MarketplaceMappingsEndpoints.list({
                    filters: { kind: { $eq: dim.internalKind }, marketplace_account: { documentId: { $eq: account.documentId } } },
                    pageSize: 1000,
                }),
            ]);
            setEntities((p) => ({ ...p, [dim.key]: ent.items || p[dim.key] || [] }));
            const byInternal = {};
            for (const r of maps.data || []) byInternal[r.internal_document_id] = r;
            setMapRows((p) => ({ ...p, [dim.key]: byInternal }));
        } catch (e) {
            toast(`Failed to load ${dim.label}: ${e.message}`, "danger");
        } finally {
            setLoading(false);
        }
    }, [jwt, account, dim]);

    useEffect(() => { loadDimension(); }, [loadDimension]);

    const pullExternals = async () => {
        if (!account || !dim?.taxonomyKind) { toast("This dimension has no marketplace list to pull.", "info"); return; }
        setPulling(true);
        try {
            const res = await appPost(`/api/accounts/${account.documentId}/taxonomy?kind=${dim.taxonomyKind}`, jwt);
            let items = res.items || [];
            if (dim.external?.type === "tree" && dim.external?.leafOnly) items = items.filter((i) => i.leaf);
            setExternals((p) => ({ ...p, [dim.key]: items }));
            toast(`Pulled ${items.length} ${dim.label.toLowerCase()} from ${account.platform}.`, "success");
        } catch (e) {
            toast(`Pull failed: ${e.message}`, "danger");
        } finally {
            setPulling(false);
        }
    };

    const upsertMapping = async (entity, externalId, externalName) => {
        const rows = mapRows[dim.key] || {};
        const existing = rows[entity.documentId];
        try {
            if (!externalId) {
                if (existing) {
                    await MarketplaceMappingsEndpoints.del(existing.documentId);
                    setMapRows((p) => { const n = { ...(p[dim.key] || {}) }; delete n[entity.documentId]; return { ...p, [dim.key]: n }; });
                }
                return;
            }
            const data = {
                platform: account.platform,
                kind: dim.internalKind,
                internal_uid: UID_FOR[dim.internalKind] || null,
                internal_document_id: entity.documentId,
                internal_name: entity.name,
                external_id: String(externalId),
                external_name: externalName || String(externalId),
                marketplace_account: account.documentId,
            };
            const res = existing
                ? await MarketplaceMappingsEndpoints.update(existing.documentId, { data })
                : await MarketplaceMappingsEndpoints.create({ data });
            const row = res?.data || { ...data, documentId: existing?.documentId };
            setMapRows((p) => ({ ...p, [dim.key]: { ...(p[dim.key] || {}), [entity.documentId]: row } }));
            toast(`Mapped ${entity.name} → ${data.external_name}`, "success");
        } catch (e) {
            toast(`Save failed: ${e.message}`, "danger");
        }
    };

    const ourEntities = entities[dim?.key] || [];
    const options = externals[dim?.key] || [];
    const rows = mapRows[dim?.key] || {};
    const datalistId = `ext-${dim?.key}`;

    const onCommit = (entity, value) => {
        const v = String(value || "").trim();
        if (dim.external?.type === "attributes") {
            upsertMapping(entity, v || null, v || null); // free-text attribute name
            return;
        }
        if (!v) { upsertMapping(entity, null); return; }
        const id = parseId(v);
        const opt = id ? options.find((o) => String(o.external_id) === id) : options.find((o) => o.name === v);
        if (!opt) { toast("Pick a value from the list.", "warning"); return; }
        upsertMapping(entity, opt.external_id, opt.name);
    };

    return (
        <ProtectedRoute>
            <Layout fullWidth>
                <ToastContainer />
                <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
                    <h3 className="mb-0"><i className="fas fa-diagram-project me-2"></i>Catalog Mapping</h3>
                    <div className="d-flex align-items-center gap-2">
                        <label className="small text-muted mb-0">Account</label>
                        <select className="form-select form-select-sm" style={{ width: 260 }} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                            {accounts.length === 0 && <option value="">No accounts</option>}
                            {accounts.map((a) => <option key={a.documentId} value={a.documentId}>{a.account_name} ({a.platform})</option>)}
                        </select>
                    </div>
                </div>

                {!account ? (
                    <div className="alert alert-info">Add a marketplace account first, then map your catalog to it.</div>
                ) : !spec ? (
                    <div className="text-center py-5"><div className="spinner-border"></div></div>
                ) : (
                    <>
                        <ul className="nav nav-tabs mb-3">
                            {(spec.dimensions || []).map((d) => (
                                <li className="nav-item" key={d.key}>
                                    <button className={`nav-link ${d.key === activeKey ? "active" : ""}`} onClick={() => setActiveKey(d.key)}>{d.label}</button>
                                </li>
                            ))}
                        </ul>

                        {dim && (
                            <>
                                <div className="d-flex justify-content-between align-items-start mb-2 flex-wrap gap-2">
                                    <p className="text-muted small mb-0" style={{ maxWidth: 720 }}>{dim.help}</p>
                                    {dim.taxonomyKind && (
                                        <button className="btn btn-sm btn-outline-secondary" onClick={pullExternals} disabled={pulling}>
                                            {pulling ? <span className="spinner-border spinner-border-sm me-1"></span> : <i className="fas fa-cloud-arrow-down me-1"></i>}
                                            Pull {dim.label} from {account.platform} {options.length ? `(${options.length})` : ""}
                                        </button>
                                    )}
                                </div>

                                {dim.external?.type !== "attributes" && (
                                    <datalist id={datalistId}>
                                        {options.map((o) => <option key={o.external_id} value={tag(o.name, o.external_id)} />)}
                                    </datalist>
                                )}

                                {loading ? (
                                    <div className="text-center py-4"><div className="spinner-border"></div></div>
                                ) : ourEntities.length === 0 ? (
                                    <div className="alert alert-warning">No {dim.internalLabel.toLowerCase()}s found in the catalog.</div>
                                ) : (
                                    <div className="table-responsive">
                                        <table className="table table-sm align-middle">
                                            <thead>
                                                <tr>
                                                    <th style={{ width: "35%" }}>Your {dim.internalLabel}</th>
                                                    <th>{account.platform} {dim.label.replace(/s$/, "")}</th>
                                                    <th style={{ width: 90 }}>Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {ourEntities.map((ent) => {
                                                    const row = rows[ent.documentId];
                                                    const defaultVal = row
                                                        ? (dim.external?.type === "attributes" ? row.external_name : tag(row.external_name, row.external_id))
                                                        : "";
                                                    return (
                                                        <tr key={ent.documentId}>
                                                            <td>{ent.name}</td>
                                                            <td>
                                                                {dim.external?.type === "attributes" ? (
                                                                    <input className="form-control form-control-sm" defaultValue={defaultVal}
                                                                        placeholder="Daraz attribute name (e.g. color_family)"
                                                                        onBlur={(e) => onCommit(ent, e.target.value)} />
                                                                ) : (
                                                                    <input className="form-control form-control-sm" list={datalistId} defaultValue={defaultVal}
                                                                        placeholder={options.length ? `Search ${dim.label.toLowerCase()}…` : `Pull ${dim.label.toLowerCase()} first`}
                                                                        onBlur={(e) => onCommit(ent, e.target.value)} />
                                                                )}
                                                            </td>
                                                            <td>
                                                                {row
                                                                    ? <span className="badge bg-success"><i className="fas fa-check me-1"></i>Mapped</span>
                                                                    : <span className="badge bg-light text-dark border">Unmapped</span>}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </>
                        )}
                    </>
                )}
            </Layout>
        </ProtectedRoute>
    );
}
