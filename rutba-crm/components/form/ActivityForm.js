import { useState, useEffect } from 'react';
import { CrmActivitiesEndpoints } from '@rutba/api-provider/endpoints';
import ContactPicker from './ContactPicker';

const TYPES = ['Call', 'Email', 'Meeting', 'Note', 'Follow-up'];

// datetime-local needs "YYYY-MM-DDTHH:mm" in local time.
function toLocalInputValue(date) {
    const d = new Date(date);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ActivityForm({ activity, contact: presetContact, onSaved, onCancel }) {
    const [subject, setSubject] = useState('');
    const [type, setType] = useState('Note');
    const [date, setDate] = useState(() => toLocalInputValue(new Date()));
    const [description, setDescription] = useState('');
    const [contact, setContact] = useState(presetContact || null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (activity) {
            setSubject(activity.subject || '');
            setType(activity.type || 'Note');
            if (activity.date) setDate(toLocalInputValue(activity.date));
            setDescription(activity.description || '');
            setContact(activity.contact || presetContact || null);
        }
    }, [activity]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!subject || !date) return;

        setSaving(true);
        setError(null);
        try {
            const data = {
                subject,
                type,
                date: new Date(date).toISOString(),
                description: description || undefined,
                contact: contact?.documentId ? { connect: [contact.documentId] } : undefined,
            };

            let result;
            if (activity?.documentId) {
                result = await CrmActivitiesEndpoints.update(activity.documentId, data);
            } else {
                result = await CrmActivitiesEndpoints.create(data);
            }

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
                    <select className="form-select" value={type} onChange={(e) => setType(e.target.value)}>
                        {TYPES.map((t) => (
                            <option key={t} value={t}>{t}</option>
                        ))}
                    </select>
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
