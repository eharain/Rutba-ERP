import { useState, useEffect } from 'react';
import { CrmActivitiesEndpoints } from '@rutba/api-provider/endpoints';
import EnumSelect from '@rutba/shared/components/EnumSelect';
import FileView from '@rutba/shared/components/FileView';
import ContactPicker from './ContactPicker';

// datetime-local needs "YYYY-MM-DDTHH:mm" in local time.
function toLocalInputValue(date) {
    const d = new Date(date);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Outcome and duration only make sense for a conversation. Notes and site
// visits don't have either.
const CONVERSATIONAL = new Set(['Call', 'Meeting', 'WhatsApp']);

export default function ActivityForm({ activity, contact: presetContact, lead: presetLead, onSaved, onCancel }) {
    const [subject, setSubject] = useState('');
    const [type, setType] = useState('Note');
    const [direction, setDirection] = useState('Internal');
    const [outcome, setOutcome] = useState('');
    const [durationMinutes, setDurationMinutes] = useState('');
    const [date, setDate] = useState(() => toLocalInputValue(new Date()));
    const [description, setDescription] = useState('');
    const [followupAt, setFollowupAt] = useState('');
    const [followupNote, setFollowupNote] = useState('');
    const [contact, setContact] = useState(presetContact || null);
    const [attachments, setAttachments] = useState([]);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!activity) return;
        setSubject(activity.subject || '');
        setType(activity.type || 'Note');
        setDirection(activity.direction || 'Internal');
        setOutcome(activity.outcome || '');
        setDurationMinutes(activity.duration_minutes ?? '');
        if (activity.date) setDate(toLocalInputValue(activity.date));
        setDescription(activity.description || '');
        setFollowupAt(activity.followup_at ? toLocalInputValue(activity.followup_at) : '');
        setFollowupNote(activity.followup_note || '');
        setContact(activity.contact || presetContact || null);
        setAttachments(Array.isArray(activity.attachments) ? activity.attachments : []);
    }, [activity]);

    const showOutcome = CONVERSATIONAL.has(type);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!subject || !date) return;

        setSaving(true);
        setError(null);
        try {
            const data = {
                subject,
                type,
                direction,
                date: new Date(date).toISOString(),
                description: description || undefined,
                outcome: showOutcome && outcome ? outcome : null,
                duration_minutes: showOutcome && durationMinutes !== '' ? Number(durationMinutes) : null,
                followup_at: followupAt ? new Date(followupAt).toISOString() : null,
                followup_note: followupAt && followupNote ? followupNote : null,
                contact: contact?.documentId ? { connect: [contact.documentId] } : undefined,
                lead: presetLead?.documentId ? { connect: [presetLead.documentId] } : undefined,
                // Files are already in the media library by now (FileView
                // uploads on pick); the activity just claims them by id.
                attachments: attachments.map((f) => f?.id).filter(Boolean),
            };

            const result = activity?.documentId
                ? await CrmActivitiesEndpoints.update(activity.documentId, data)
                : await CrmActivitiesEndpoints.create(data);

            if (onSaved) onSaved(result.data || result);
        } catch (err) {
            console.error('Activity save failed', err);
            setError('Failed to save activity. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={handleSubmit}>
            {error && <div className="alert alert-danger py-2">{error}</div>}

            <div className="row g-3">
                <div className="col-md-6">
                    <label className="form-label">Subject *</label>
                    <input
                        autoFocus
                        className="form-control"
                        placeholder="e.g. Follow-up call about quote"
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        required
                    />
                </div>
                <div className="col-md-3">
                    <label className="form-label">Type</label>
                    {/* Enum values come from the schema via /enums/:name/:field —
                        never a hardcoded copy in the frontend. */}
                    <EnumSelect
                        name="crm-activity"
                        field="type"
                        value={type}
                        onChange={(e) => setType(e.target.value)}
                    />
                </div>
                <div className="col-md-3">
                    <label className="form-label">Direction</label>
                    <EnumSelect
                        name="crm-activity"
                        field="direction"
                        value={direction}
                        onChange={(e) => setDirection(e.target.value)}
                    />
                </div>
                <div className="col-md-3">
                    <label className="form-label">Date *</label>
                    <input
                        className="form-control"
                        type="datetime-local"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        required
                    />
                </div>

                {showOutcome && (
                    <>
                        <div className="col-md-4">
                            <label className="form-label">Outcome</label>
                            <EnumSelect
                                name="crm-activity"
                                field="outcome"
                                value={outcome}
                                onChange={(e) => setOutcome(e.target.value)}
                                includeBlank="— none —"
                            />
                        </div>
                        <div className="col-md-2">
                            <label className="form-label">Minutes</label>
                            <input
                                className="form-control"
                                type="number"
                                min="0"
                                value={durationMinutes}
                                onChange={(e) => setDurationMinutes(e.target.value)}
                            />
                        </div>
                    </>
                )}

                {!presetContact && (
                    <div className="col-md-6">
                        <label className="form-label">Contact</label>
                        <ContactPicker value={contact} onChange={setContact} />
                    </div>
                )}

                <div className="col-12">
                    <label className="form-label">Description</label>
                    <textarea
                        className="form-control"
                        rows={3}
                        placeholder="What happened / what was agreed"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                    />
                </div>

                <div className="col-12">
                    <label className="form-label">Attachments</label>
                    {/* uploadWithoutRef: a new activity has no row to attach to
                        yet, so files upload to the library unattached and the
                        relation is set by id when the form saves. */}
                    <FileView
                        multiple
                        gallery={attachments}
                        field="attachments"
                        name={subject || 'CRM activity'}
                        uploadWithoutRef
                        buttonLabel="Add attachment"
                        onFileChange={(f, files) => setAttachments(files || [])}
                    />
                    <div className="form-text">Quotes, signed docs, photos from a site visit.</div>
                </div>

                <div className="col-12">
                    <div className="border rounded p-3 bg-light">
                        <div className="row g-3 align-items-end">
                            <div className="col-md-4">
                                <label className="form-label mb-1">
                                    <i className="fas fa-bell me-1 text-muted"></i>Remind me on
                                </label>
                                <input
                                    className="form-control"
                                    type="datetime-local"
                                    value={followupAt}
                                    onChange={(e) => setFollowupAt(e.target.value)}
                                />
                            </div>
                            <div className="col-md-8">
                                <label className="form-label mb-1">Follow-up note</label>
                                <input
                                    className="form-control"
                                    placeholder="What needs doing next"
                                    value={followupNote}
                                    onChange={(e) => setFollowupNote(e.target.value)}
                                    disabled={!followupAt}
                                />
                            </div>
                        </div>
                        <small className="text-muted">
                            Open follow-ups appear in the Follow-ups queue until they're closed.
                        </small>
                    </div>
                </div>
            </div>

            <div className="d-flex justify-content-end gap-2 mt-4">
                {onCancel && (
                    <button type="button" className="btn btn-outline-secondary" onClick={onCancel}>
                        Cancel
                    </button>
                )}
                <button className="btn btn-primary" disabled={saving || !subject}>
                    {saving ? 'Saving…' : activity?.documentId ? 'Update Activity' : 'Log Activity'}
                </button>
            </div>
        </form>
    );
}
