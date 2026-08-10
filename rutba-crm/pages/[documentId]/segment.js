import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { CrmSegmentsEndpoints } from "@rutba/api-provider/endpoints";
import SegmentBuilder from "../../components/segment/SegmentBuilder";

const PAGE_SIZE = 25;
// The server caps a page at 200; pull in the largest legal chunks.
const EXPORT_PAGE_SIZE = 200;
// A guard against an accidental "everyone" segment turning into a browser
// tab that never comes back. If it trips, the user is told — a silently
// truncated export is worse than a refused one.
const EXPORT_MAX_ROWS = 20000;

function csvCell(v) {
    if (v === null || v === undefined) return "";
    const s = String(v);
    // Quote when the value could otherwise break the row/column structure.
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(filename, rows) {
    // A BOM so Excel reads it as UTF-8 — without it, non-Latin names (Urdu,
    // Arabic) open as mojibake, which is most of this dataset.
    const blob = new Blob(["﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n")], {
        type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export default function SegmentDetail() {
    const router = useRouter();
    const { jwt } = useAuth();
    // router.query is empty on the first render — gate every effect on
    // isReady or documentId arrives undefined and the load 404s.
    const documentId = router.isReady ? router.query.documentId : null;

    const [segment, setSegment] = useState(null);
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [folder, setFolder] = useState("");
    const [entity, setEntity] = useState("person");
    const [definition, setDefinition] = useState({ match: "all", rules: [], groups: [] });
    const [columns, setColumns] = useState([]);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [dirty, setDirty] = useState(false);

    const [preview, setPreview] = useState(null);
    const [previewing, setPreviewing] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [page, setPage] = useState(1);
    const [reach, setReach] = useState(null);

    useEffect(() => {
        if (!jwt || !documentId) return;
        setLoading(true);
        CrmSegmentsEndpoints.byId(documentId)
            .then((res) => {
                const s = res.data || res;
                setSegment(s);
                setName(s.name || "");
                setDescription(s.description || "");
                setFolder(s.folder || "");
                setEntity(s.entity || "person");
                setDefinition(s.definition || { match: "all", rules: [], groups: [] });
                setColumns(Array.isArray(s.columns) ? s.columns : []);
            })
            .catch((err) => { console.error("Failed to load segment", err); setError("Could not load this segment."); })
            .finally(() => setLoading(false));
    }, [jwt, documentId]);

    // Reach is computed from the SAVED definition, so it lags unsaved edits —
    // that's deliberate: it answers "if I sent this now, who gets it", and
    // only a saved segment can be sent.
    const loadReach = useCallback(async () => {
        if (!jwt || !documentId) return;
        try {
            const res = await CrmSegmentsEndpoints.listAudience(documentId, { pageSize: 1 });
            setReach(res?.meta || null);
        } catch (err) {
            console.warn("Could not compute audience reach", err);
            setReach(null);
        }
    }, [jwt, documentId]);

    useEffect(() => { if (segment) loadReach(); }, [segment, loadReach]);

    // Preview runs the definition WITHOUT saving, through the same engine the
    // saved run uses — what you see here is what the segment will return.
    const runPreview = async (toPage = 1) => {
        setPreviewing(true);
        setError(null);
        try {
            const res = await CrmSegmentsEndpoints.resolve({
                entity, definition, columns, page: toPage, pageSize: PAGE_SIZE,
            });
            setPreview(res);
            setPage(toPage);
        } catch (err) {
            console.error("Preview failed", err);
            // The engine rejects unknown fields/operators with a 400 and a
            // readable message — surface it rather than a generic failure.
            setError(err?.message || "The segment rules aren't valid.");
            setPreview(null);
        } finally {
            setPreviewing(false);
        }
    };

    // Export every matching row, not just the page on screen — a report you
    // can only read 25 rows of isn't a report. Goes through `resolve`, the
    // same engine path the preview uses, so the file matches what's shown.
    const exportCsv = async () => {
        setExporting(true);
        setError(null);
        try {
            const all = [];
            let cols = [];
            let pageNo = 1;
            let pageCount = 1;
            let total = 0;

            do {
                const res = await CrmSegmentsEndpoints.resolve({
                    entity, definition, columns, page: pageNo, pageSize: EXPORT_PAGE_SIZE,
                });
                cols = res?.meta?.columns || cols;
                pageCount = res?.meta?.pagination?.pageCount || 1;
                total = res?.meta?.pagination?.total || 0;
                all.push(...(res?.data || []));
                pageNo += 1;
            } while (pageNo <= pageCount && all.length < EXPORT_MAX_ROWS);

            if (all.length === 0) {
                setError("Nothing to export — no rows match these rules.");
                return;
            }

            const header = [...cols, "person", "person_email", "person_phone"];
            const body = all.map((row) => [
                ...cols.map((c) => row.values[c]),
                row.person?.name ?? "",
                row.person?.email ?? "",
                row.person?.phone ?? "",
            ]);
            const slug = (name || "segment").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
            downloadCsv(`${slug || "segment"}.csv`, [header, ...body]);

            if (all.length < total) {
                setError(`Exported the first ${all.length} of ${total} rows (export is capped at ${EXPORT_MAX_ROWS}). Narrow the segment to get the rest.`);
            }
        } catch (err) {
            console.error("Export failed", err);
            setError(err?.message || "Could not export this segment.");
        } finally {
            setExporting(false);
        }
    };

    const save = async () => {
        if (!documentId) return;
        setSaving(true);
        setError(null);
        try {
            await CrmSegmentsEndpoints.update(documentId, {
                name, description: description || null, folder: folder || null, entity, definition, columns,
            });
            const res = await CrmSegmentsEndpoints.recomputeCount(documentId);
            setSegment(res?.data || segment);
            setDirty(false);
            loadReach();
        } catch (err) {
            console.error("Save failed", err);
            setError(err?.message || "Failed to save the segment.");
        } finally {
            setSaving(false);
        }
    };

    // Header keys come from the run that produced these rows, not from the
    // current selection — editing the picker must not reshuffle a stale grid.
    const previewColumns = preview?.meta?.columns || [];
    const pagination = preview?.meta?.pagination;

    return (
        <ProtectedRoute>
            <Layout>
                <div className="d-flex align-items-center mb-3">
                    <Link className="btn btn-sm btn-outline-secondary me-3" href="/segments">
                        <i className="fas fa-arrow-left"></i> Back
                    </Link>
                    <h2 className="mb-0">{loading ? "Segment" : name || "Segment"}</h2>
                    <div className="ms-auto d-flex gap-2">
                        <button className="btn btn-outline-secondary" disabled={previewing} onClick={() => runPreview(1)}>
                            <i className="fas fa-play me-1"></i>{previewing ? "Running…" : "Preview"}
                        </button>
                        <button className="btn btn-outline-secondary" disabled={exporting || loading} onClick={exportCsv}>
                            <i className="fas fa-file-csv me-1"></i>{exporting ? "Exporting…" : "Export CSV"}
                        </button>
                        <button className="btn btn-primary" disabled={saving || loading || !name.trim()} onClick={save}>
                            <i className="fas fa-save me-1"></i>{saving ? "Saving…" : "Save"}
                        </button>
                    </div>
                </div>

                {error && <div className="alert alert-danger">{error}</div>}
                {loading && <p>Loading…</p>}

                {!loading && (
                    <>
                        <div className="card mb-3">
                            <div className="card-body">
                                <div className="row g-3">
                                    <div className="col-md-5">
                                        <label className="form-label">Name *</label>
                                        <input
                                            className="form-control"
                                            value={name}
                                            onChange={(e) => { setName(e.target.value); setDirty(true); }}
                                        />
                                    </div>
                                    <div className="col-md-3">
                                        <label className="form-label">Folder</label>
                                        <input
                                            className="form-control"
                                            placeholder="e.g. Campaigns"
                                            value={folder}
                                            onChange={(e) => { setFolder(e.target.value); setDirty(true); }}
                                        />
                                    </div>
                                    <div className="col-md-4">
                                        <label className="form-label">Description</label>
                                        <input
                                            className="form-control"
                                            value={description}
                                            onChange={(e) => { setDescription(e.target.value); setDirty(true); }}
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="card-footer bg-white d-flex justify-content-between align-items-center flex-wrap gap-2">
                                <small className="text-muted">
                                    Saved count: <strong>{segment?.member_count ?? 0}</strong>
                                    {segment?.last_run_at && ` · last run ${new Date(segment.last_run_at).toLocaleString()}`}
                                </small>
                                {/* Rows ≠ people ≠ reachable people. A campaign
                                    sends to the last number, so show all three
                                    rather than letting the row count read as
                                    the audience size. */}
                                {reach && (
                                    <small className="text-muted">
                                        <span className="badge bg-success me-1">{reach.reachable}</span>
                                        emailable {reach.people !== reach.reachable && (
                                            <span className="text-warning">
                                                · {reach.unreachable} of {reach.people} {reach.people === 1 ? "person has" : "people have"} no email
                                            </span>
                                        )}
                                    </small>
                                )}
                                {dirty && <small className="text-warning">Unsaved changes</small>}
                            </div>
                        </div>

                        <div className="card mb-3">
                            <div className="card-header"><strong>Rules</strong></div>
                            <div className="card-body">
                                <SegmentBuilder
                                    entity={entity}
                                    definition={definition}
                                    columns={columns}
                                    onEntityChange={(e) => { setEntity(e); setDirty(true); setPreview(null); }}
                                    onDefinitionChange={(d) => { setDefinition(d); setDirty(true); }}
                                    onColumnsChange={(c) => { setColumns(c); setDirty(true); }}
                                />
                            </div>
                        </div>

                        {preview && (
                            <div className="card">
                                <div className="card-header d-flex justify-content-between align-items-center">
                                    <strong>Preview</strong>
                                    <span className="badge bg-primary">{pagination?.total ?? 0} members</span>
                                </div>

                                {preview.data.length === 0 ? (
                                    <div className="card-body text-muted">No rows match these rules.</div>
                                ) : (
                                    <div className="table-responsive">
                                        <table className="table table-striped table-hover mb-0">
                                            <thead className="table-dark">
                                                <tr>
                                                    {previewColumns.map((c) => <th key={c}>{c.replace(/_/g, " ")}</th>)}
                                                    <th>Person</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {preview.data.map((row) => (
                                                    <tr key={row.documentId}>
                                                        {previewColumns.map((c) => (
                                                            <td key={c}>
                                                                {row.values[c] === null || row.values[c] === undefined
                                                                    ? "—"
                                                                    : String(row.values[c])}
                                                            </td>
                                                        ))}
                                                        <td>
                                                            {/* No person means this row can't be reached by a
                                                                campaign — worth showing, not hiding. */}
                                                            {row.person ? (
                                                                <>
                                                                    {row.person.name}
                                                                    <div><small className="text-muted">{row.person.email || row.person.phone || "no contact detail"}</small></div>
                                                                </>
                                                            ) : (
                                                                <span className="badge bg-warning text-dark">unlinked</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                {pagination && pagination.pageCount > 1 && (
                                    <div className="card-footer d-flex justify-content-between align-items-center">
                                        <small className="text-muted">
                                            Page {pagination.page} of {pagination.pageCount}
                                        </small>
                                        <div className="btn-group">
                                            <button
                                                className="btn btn-sm btn-outline-secondary"
                                                disabled={previewing || page <= 1}
                                                onClick={() => runPreview(page - 1)}
                                            >
                                                <i className="fas fa-chevron-left"></i> Prev
                                            </button>
                                            <button
                                                className="btn btn-sm btn-outline-secondary"
                                                disabled={previewing || page >= pagination.pageCount}
                                                onClick={() => runPreview(page + 1)}
                                            >
                                                Next <i className="fas fa-chevron-right"></i>
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
            </Layout>
        </ProtectedRoute>
    );
}
