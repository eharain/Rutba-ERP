import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { useEnumValues } from "@rutba/pos-shared/lib/use-enum-values";
import { HelpdeskDesksEndpoints, HelpdeskTicketsEndpoints } from "@rutba/api-provider/endpoints";

function serverError(err) {
    return err?.response?.data?.error || { message: err?.message || "Request failed" };
}

const humanize = (v) =>
    String(v).replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const csvToList = (text) =>
    String(text || "").split(",").map((s) => s.trim()).filter(Boolean);

// The server rejects with prose ("subject is required", `unknown priority "x"`).
// Matching the message against the form's own field names is enough to put the
// error next to the control that caused it, which is what makes a 400 fixable
// instead of merely visible. Unmatched messages still render in the banner.
const FIELD_MATCHERS = [
    ["subject", /subject/i],
    ["body", /\bmessage\b|\bbody\b/i],
    ["priority", /priority/i],
    ["source", /source/i],
    ["requester_kind", /requester_kind|requester kind/i],
    ["desk", /desk/i],
    ["requester", /requester needs|anonymous request needs|email or phone/i],
];

function fieldForMessage(message) {
    const text = String(message || "");
    for (const [field, re] of FIELD_MATCHERS) {
        if (re.test(text)) return field;
    }
    return null;
}

/**
 * A select when /enums answers, a suggestion-backed text box when it does not.
 *
 * /enums/:name/:field is served by rutba-core but its route is registered under
 * `api::product.product`.`find`, and no policy for that pair is seeded for the
 * helpdesk_* roles — so the request 403s from this app today and the field falls
 * back rather than rendering a dead select. `suggest` carries values that came
 * from real data: the desks' own defaults, plus any `allowed` list the server
 * returned when it rejected a save. Adding `helpdesk` to EnumsEndpoints and
 * ProductsEndpoints and reseeding turns these into plain selects with no change
 * here.
 */
function EnumField({ name, field, value, onChange, suggest = [], blank = "—", invalid, ...rest }) {
    const { values, loading, error } = useEnumValues(name, field);
    const known = values && values.length ? values : null;
    const options = [...new Set([...(known || []), ...suggest, ...(value ? [value] : [])].filter(Boolean))];
    const listId = `hd-enum-${name || "local"}-${field}`;

    if (known) {
        return (
            <select
                className={`form-select${invalid ? " is-invalid" : ""}`}
                value={value || ""}
                onChange={(e) => onChange(e.target.value)}
                {...rest}
            >
                <option value="">{blank}</option>
                {options.map((v) => <option key={v} value={v}>{humanize(v)}</option>)}
            </select>
        );
    }

    return (
        <>
            <input
                className={`form-control${invalid ? " is-invalid" : ""}`}
                list={options.length ? listId : undefined}
                value={value || ""}
                onChange={(e) => onChange(e.target.value)}
                disabled={loading}
                {...rest}
            />
            {options.length > 0 && (
                <datalist id={listId}>
                    {options.map((v) => <option key={v} value={v} />)}
                </datalist>
            )}
        </>
    );
}

const EMPTY = {
    desk_id: "",
    subject: "",
    body: "",
    priority: "",
    source: "",
    branch_id: "",
    tags: "",
    requester_name: "",
    requester_email: "",
    requester_phone: "",
    requester_kind: "",
};

export default function NewTicketPage() {
    const router = useRouter();
    const { jwt } = useAuth();

    const [form, setForm] = useState(EMPTY);
    const [desks, setDesks] = useState([]);
    const [desksLoading, setDesksLoading] = useState(true);
    const [desksError, setDesksError] = useState(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [touched, setTouched] = useState({});

    // The /new/<entity> shim leaves the query undefined on the first render, so
    // every effect that reads it waits for router.isReady — reading it early has
    // silently produced undefined ids in this codebase before.
    useEffect(() => {
        if (!router.isReady || !jwt) return;
        setDesksLoading(true);
        setDesksError(null);
        HelpdeskDesksEndpoints.list({})
            .then((res) => {
                const rows = res?.data || [];
                setDesks(rows);
                const wanted = router.query.desk;
                if (!wanted) return;
                const match = rows.find((d) => String(d.id) === String(wanted) || d.key === wanted);
                if (match) setForm((f) => (f.desk_id ? f : { ...f, desk_id: String(match.id) }));
            })
            .catch((err) => setDesksError(serverError(err)))
            .finally(() => setDesksLoading(false));
    }, [router.isReady, router.query.desk, jwt]);

    const set = (field) => (value) => setForm((f) => ({ ...f, [field]: value }));
    const setEvent = (field) => (e) => set(field)(e.target.value);
    const markTouched = (field) => () => setTouched((t) => ({ ...t, [field]: true }));

    const selectedDesk = desks.find((d) => String(d.id) === String(form.desk_id)) || null;
    const priorities = [...new Set(desks.map((d) => d.default_priority).filter(Boolean))];

    // The only `details.allowed` the ticket API returns is the priority list, so
    // a rejected save teaches this field its own vocabulary for the rest of the
    // session rather than leaving the agent to guess twice.
    const allowedFromServer = Array.isArray(error?.details?.allowed) ? error.details.allowed : [];

    // Mirrors the server: subject and body are required, everything else has a
    // server-side default. The server is still the gate — this only saves a round
    // trip.
    const subjectMissing = !form.subject.trim();
    const bodyMissing = !form.body.trim();

    // resolveRequester() treats an empty requester block as "the caller is filing
    // their own request". That is almost never what an agent on the phone means,
    // so it is called out rather than left to be discovered on the ticket.
    const requesterEmpty = !form.requester_name.trim()
        && !form.requester_email.trim()
        && !form.requester_phone.trim();

    // A name on its own does NOT make the server treat this as on-behalf-of: it
    // decides from an identity, an email or a phone, and a name-only requester
    // falls through to "the caller is the requester" — the same silent misfiling,
    // one step harder to notice. Refuse it here instead.
    const requesterNameOnly = !requesterEmpty
        && !form.requester_email.trim()
        && !form.requester_phone.trim();

    const errorField = error ? fieldForMessage(error.message) : null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setTouched({ subject: true, body: true, requester: true });
        if (subjectMissing || bodyMissing || requesterNameOnly) return;

        setError(null);
        setSaving(true);
        try {
            const payload = {
                subject: form.subject.trim(),
                body: form.body.trim(),
                ...(form.desk_id ? { desk_id: Number(form.desk_id) } : {}),
                ...(form.priority.trim() ? { priority: form.priority.trim() } : {}),
                ...(form.source.trim() ? { source: form.source.trim() } : {}),
                ...(form.branch_id ? { branch_id: Number(form.branch_id) } : {}),
                ...(csvToList(form.tags).length ? { tags: csvToList(form.tags) } : {}),
                ...(requesterEmpty ? {} : {
                    requester: {
                        name: form.requester_name.trim() || null,
                        email: form.requester_email.trim() || null,
                        phone: form.requester_phone.trim() || null,
                        ...(form.requester_kind.trim() ? { requester_kind: form.requester_kind.trim() } : {}),
                    },
                }),
            };

            const res = await HelpdeskTicketsEndpoints.create(payload);
            const ticket = res?.data;
            if (ticket?.documentId) {
                router.push(`/tickets/${ticket.documentId}`);
                return;
            }
            // A 2xx with no documentId means the ticket exists but this screen
            // cannot address it — send the agent to the queue rather than leaving
            // the form looking unsaved.
            router.push("/tickets");
        } catch (err) {
            setError(serverError(err));
            setSaving(false);
        }
    };

    return (
        <ProtectedRoute>
            <Layout>
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <div>
                        <h2 className="mb-0">New ticket</h2>
                        <span className="text-muted small">
                            Log a request taken by phone or in person, on behalf of the person who made it.
                        </span>
                    </div>
                    <Link className="btn btn-outline-secondary" href="/tickets">
                        <i className="fas fa-arrow-left me-1"></i>Back to queue
                    </Link>
                </div>

                {error && (
                    <div className="alert alert-danger">
                        <div className="fw-semibold">
                            <i className="fas fa-triangle-exclamation me-2"></i>
                            {error.message || "The ticket could not be created."}
                        </div>
                        {error.details && (
                            <pre className="mb-0 mt-2 small text-break" style={{ whiteSpace: "pre-wrap" }}>
                                {JSON.stringify(error.details, null, 2)}
                            </pre>
                        )}
                    </div>
                )}

                {desksError && (
                    <div className="alert alert-warning">
                        <i className="fas fa-triangle-exclamation me-2"></i>
                        The desk list could not be loaded ({desksError.message}). You can still file the
                        ticket — the server resolves the desk itself when none is chosen.
                    </div>
                )}

                <form onSubmit={handleSubmit} noValidate>
                    <div className="card mb-4">
                        <div className="card-header"><strong>Requester</strong></div>
                        <div className="card-body">
                            <p className="text-muted small">
                                Who the ticket is for, which is not the same as who is filing it. There is no
                                person search on this screen yet, so contact details are how the requester is
                                identified — the server needs at least an email or a phone number.
                            </p>

                            {requesterEmpty && (
                                <div className="alert alert-warning py-2 small">
                                    <i className="fas fa-circle-info me-1"></i>
                                    With every field below empty this ticket is filed as <strong>your own</strong>
                                    {" "}request, not somebody else&apos;s.
                                </div>
                            )}

                            {requesterNameOnly && touched.requester && (
                                <div className="alert alert-danger py-2 small">
                                    <i className="fas fa-triangle-exclamation me-1"></i>
                                    A name alone does not identify a requester — add an email or a phone
                                    number, or the ticket is filed as your own request and nobody can be
                                    replied to.
                                </div>
                            )}

                            <div className="row g-3">
                                <div className="col-md-4">
                                    <label className="form-label" htmlFor="requester-name">Name</label>
                                    <input
                                        id="requester-name"
                                        className="form-control"
                                        value={form.requester_name}
                                        onChange={setEvent("requester_name")}
                                    />
                                </div>
                                <div className="col-md-4">
                                    <label className="form-label" htmlFor="requester-email">Email</label>
                                    <input
                                        id="requester-email"
                                        type="email"
                                        className={`form-control${errorField === "requester" || (requesterNameOnly && touched.requester) ? " is-invalid" : ""}`}
                                        value={form.requester_email}
                                        onChange={setEvent("requester_email")}
                                    />
                                </div>
                                <div className="col-md-4">
                                    <label className="form-label" htmlFor="requester-phone">Phone</label>
                                    <input
                                        id="requester-phone"
                                        className={`form-control${errorField === "requester" || (requesterNameOnly && touched.requester) ? " is-invalid" : ""}`}
                                        value={form.requester_phone}
                                        onChange={setEvent("requester_phone")}
                                    />
                                    {errorField === "requester" && (
                                        <div className="invalid-feedback d-block">{error.message}</div>
                                    )}
                                </div>
                                <div className="col-md-4">
                                    <label className="form-label" htmlFor="requester-kind">Requester kind</label>
                                    <EnumField
                                        id="requester-kind"
                                        name="contact-ticket"
                                        field="requester_kind"
                                        value={form.requester_kind}
                                        onChange={set("requester_kind")}
                                        invalid={errorField === "requester_kind"}
                                        blank="Inferred from the identity"
                                    />
                                    {errorField === "requester_kind" && (
                                        <div className="invalid-feedback d-block">{error.message}</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="card mb-4">
                        <div className="card-header"><strong>Request</strong></div>
                        <div className="card-body">
                            <div className="row g-3">
                                <div className="col-md-6">
                                    <label className="form-label" htmlFor="ticket-desk">Desk</label>
                                    <select
                                        id="ticket-desk"
                                        className={`form-select${errorField === "desk" ? " is-invalid" : ""}`}
                                        value={form.desk_id}
                                        onChange={setEvent("desk_id")}
                                        disabled={desksLoading}
                                    >
                                        <option value="">
                                            {desksLoading ? "Loading desks…" : "Let the server resolve it"}
                                        </option>
                                        {desks.map((d) => (
                                            <option key={d.id} value={d.id}>{d.name} ({d.key})</option>
                                        ))}
                                    </select>
                                    {errorField === "desk" && (
                                        <div className="invalid-feedback d-block">{error.message}</div>
                                    )}
                                    {selectedDesk && (
                                        <div className="form-text">
                                            Default priority {humanize(selectedDesk.default_priority || "—")}
                                            {selectedDesk.reopen_window_days !== null && selectedDesk.reopen_window_days !== undefined
                                                ? ` · reopen window ${selectedDesk.reopen_window_days} day(s)`
                                                : ""}
                                        </div>
                                    )}
                                </div>

                                <div className="col-md-3">
                                    <label className="form-label" htmlFor="ticket-priority">Priority</label>
                                    <EnumField
                                        id="ticket-priority"
                                        name="contact-ticket"
                                        field="priority"
                                        value={form.priority}
                                        onChange={set("priority")}
                                        suggest={[...priorities, ...allowedFromServer]}
                                        invalid={errorField === "priority"}
                                        blank={selectedDesk?.default_priority
                                            ? `Desk default (${humanize(selectedDesk.default_priority)})`
                                            : "Desk default"}
                                    />
                                    {errorField === "priority" && (
                                        <div className="invalid-feedback d-block">{error.message}</div>
                                    )}
                                </div>

                                <div className="col-md-3">
                                    <label className="form-label" htmlFor="ticket-source">Source</label>
                                    <EnumField
                                        id="ticket-source"
                                        name="contact-ticket"
                                        field="source"
                                        value={form.source}
                                        onChange={set("source")}
                                        invalid={errorField === "source"}
                                        blank="Server default"
                                    />
                                    {errorField === "source" && (
                                        <div className="invalid-feedback d-block">{error.message}</div>
                                    )}
                                    <div className="form-text">The channel the request actually arrived on.</div>
                                </div>

                                <div className="col-12">
                                    <label className="form-label" htmlFor="ticket-subject">Subject *</label>
                                    <input
                                        id="ticket-subject"
                                        className={`form-control${(touched.subject && subjectMissing) || errorField === "subject" ? " is-invalid" : ""}`}
                                        value={form.subject}
                                        onChange={setEvent("subject")}
                                        onBlur={markTouched("subject")}
                                        maxLength={200}
                                        required
                                    />
                                    {touched.subject && subjectMissing && (
                                        <div className="invalid-feedback d-block">A subject is required.</div>
                                    )}
                                    {errorField === "subject" && !subjectMissing && (
                                        <div className="invalid-feedback d-block">{error.message}</div>
                                    )}
                                </div>

                                <div className="col-12">
                                    <label className="form-label" htmlFor="ticket-body">What did they ask for? *</label>
                                    <textarea
                                        id="ticket-body"
                                        className={`form-control${(touched.body && bodyMissing) || errorField === "body" ? " is-invalid" : ""}`}
                                        rows={6}
                                        value={form.body}
                                        onChange={setEvent("body")}
                                        onBlur={markTouched("body")}
                                        required
                                    />
                                    {touched.body && bodyMissing && (
                                        <div className="invalid-feedback d-block">The opening message is required.</div>
                                    )}
                                    {errorField === "body" && !bodyMissing && (
                                        <div className="invalid-feedback d-block">{error.message}</div>
                                    )}
                                    <div className="form-text">
                                        This becomes the first message on the thread and cannot be edited later —
                                        corrections are new messages.
                                    </div>
                                </div>

                                <div className="col-md-4">
                                    <label className="form-label" htmlFor="ticket-branch">Branch id</label>
                                    <input
                                        id="ticket-branch"
                                        type="number"
                                        min="1"
                                        className="form-control"
                                        value={form.branch_id}
                                        onChange={setEvent("branch_id")}
                                    />
                                    <div className="form-text">
                                        There is no branch picker on this app yet — the numeric id from Settings.
                                    </div>
                                </div>

                                <div className="col-md-8">
                                    <label className="form-label" htmlFor="ticket-tags">Tags</label>
                                    <input
                                        id="ticket-tags"
                                        className="form-control"
                                        value={form.tags}
                                        onChange={setEvent("tags")}
                                        placeholder="refund, damaged"
                                    />
                                    <div className="form-text">Comma separated.</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="d-flex justify-content-end gap-2">
                        <Link className="btn btn-outline-secondary" href="/tickets">Cancel</Link>
                        <button className="btn btn-primary" disabled={saving}>
                            {saving && <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>}
                            Create ticket
                        </button>
                    </div>
                </form>
            </Layout>
        </ProtectedRoute>
    );
}
