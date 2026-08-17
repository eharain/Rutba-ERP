import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import {
    HrEmployeesEndpoints,
    HrEmergencyContactsEndpoints,
    HrBankAccountsEndpoints,
    HrFamilyMembersEndpoints,
    HrEducationsEndpoints,
    HrWorkExperiencesEndpoints,
    HrCertificationsEndpoints,
    HrSkillsEndpoints,
    HrEmployeeDocumentsEndpoints,
    UploadEndpoints,
} from "@rutba/api-provider/endpoints";

const GENDERS = ["Male", "Female", "Other"];
const MARITAL_STATUSES = ["Single", "Married", "Divorced", "Widowed"];
const BLOOD_GROUPS = ["A_Positive", "A_Negative", "B_Positive", "B_Negative", "AB_Positive", "AB_Negative", "O_Positive", "O_Negative"];

export default function Profile() {
    const { jwt } = useAuth();
    const [profile, setProfile] = useState(null);
    const [form, setForm] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => { if (jwt) load(); /* eslint-disable-next-line */ }, [jwt]);

    async function load() {
        setLoading(true);
        try {
            const res = await HrEmployeesEndpoints.getMyProfile();
            setProfile(res?.data || null);
            setForm(res?.data || {});
        } catch (err) {
            console.error("Failed to load profile", err);
        } finally {
            setLoading(false);
        }
    }

    async function save(e) {
        e.preventDefault();
        setSaving(true);
        try {
            await HrEmployeesEndpoints.updateMyProfile({
                phone: form.phone || null,
                address: form.address || null,
                cnic: form.cnic || null,
                passport_number: form.passport_number || null,
                nationality: form.nationality || null,
                religion: form.religion || null,
                gender: form.gender || null,
                date_of_birth: form.date_of_birth || null,
                marital_status: form.marital_status || null,
                blood_group: form.blood_group || null,
            });
            await load();
        } catch (err) {
            console.error("Failed to save profile", err);
            alert("Failed to save profile.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <ProtectedRoute>
            <Layout>
                <h2 className="mb-3">My Profile</h2>

                {loading && <p>Loading…</p>}
                {!loading && !profile && (
                    <div className="alert alert-info">No employee record is linked to your account yet.</div>
                )}
                {!loading && profile && (
                    <>
                        <div className="card mb-4">
                            <div className="card-header bg-light fw-semibold">Personal &amp; Contact</div>
                            <div className="card-body">
                                <div className="row mb-2">
                                    <div className="col-md-3 text-muted small">Name</div>
                                    <div className="col-md-9">{profile.name || "—"}</div>
                                </div>
                                <div className="row mb-3">
                                    <div className="col-md-3 text-muted small">Email</div>
                                    <div className="col-md-9">{profile.email || "—"}</div>
                                </div>
                                <div className="row mb-3">
                                    <div className="col-md-3 text-muted small">Designation / Department</div>
                                    <div className="col-md-9">{profile.designation || "—"} / {profile.department?.name || "—"}</div>
                                </div>

                                <form onSubmit={save}>
                                    <div className="row g-3">
                                        <TextField col={4} label="Phone" value={form.phone} onChange={(v) => setForm((p) => ({ ...p, phone: v }))} />
                                        <TextField col={8} label="Address" value={form.address} onChange={(v) => setForm((p) => ({ ...p, address: v }))} />
                                        <TextField col={4} label="CNIC" value={form.cnic} onChange={(v) => setForm((p) => ({ ...p, cnic: v }))} />
                                        <TextField col={4} label="Passport Number" value={form.passport_number} onChange={(v) => setForm((p) => ({ ...p, passport_number: v }))} />
                                        <TextField col={4} label="Nationality" value={form.nationality} onChange={(v) => setForm((p) => ({ ...p, nationality: v }))} />
                                        <TextField col={4} label="Religion" value={form.religion} onChange={(v) => setForm((p) => ({ ...p, religion: v }))} />
                                        <SelectField col={4} label="Gender" value={form.gender} options={GENDERS} onChange={(v) => setForm((p) => ({ ...p, gender: v }))} />
                                        <TextField col={4} type="date" label="Date of Birth" value={form.date_of_birth} onChange={(v) => setForm((p) => ({ ...p, date_of_birth: v }))} />
                                        <SelectField col={4} label="Marital Status" value={form.marital_status} options={MARITAL_STATUSES} onChange={(v) => setForm((p) => ({ ...p, marital_status: v }))} />
                                        <SelectField col={4} label="Blood Group" value={form.blood_group} options={BLOOD_GROUPS} onChange={(v) => setForm((p) => ({ ...p, blood_group: v }))} />
                                    </div>
                                    <button className="btn btn-primary btn-sm mt-3" type="submit" disabled={saving}>
                                        {saving ? "Saving..." : "Save Changes"}
                                    </button>
                                </form>
                            </div>
                        </div>

                        <RepeaterSection
                            title="Emergency Contacts"
                            endpoints={HrEmergencyContactsEndpoints}
                            fields={[
                                { name: "name", label: "Name" },
                                { name: "relationship", label: "Relationship" },
                                { name: "phone", label: "Phone" },
                            ]}
                            renderRow={(r) => `${r.name} (${r.relationship || "—"}) — ${r.phone || "—"}`}
                        />

                        <RepeaterSection
                            title="Bank Accounts"
                            endpoints={HrBankAccountsEndpoints}
                            fields={[
                                { name: "bank_name", label: "Bank Name" },
                                { name: "account_title", label: "Account Title" },
                                { name: "account_number", label: "Account Number" },
                                { name: "iban", label: "IBAN" },
                            ]}
                            renderRow={(r) => `${r.bank_name} — ${r.account_number || r.iban || "—"}`}
                        />

                        <RepeaterSection
                            title="Family Members"
                            endpoints={HrFamilyMembersEndpoints}
                            fields={[
                                { name: "name", label: "Name" },
                                { name: "relationship", label: "Relationship", type: "select", options: ["Spouse", "Son", "Daughter", "Father", "Mother", "Other"] },
                                { name: "date_of_birth", label: "Date of Birth", type: "date" },
                            ]}
                            renderRow={(r) => `${r.name} (${r.relationship || "—"})`}
                        />

                        <RepeaterSection
                            title="Education"
                            endpoints={HrEducationsEndpoints}
                            fields={[
                                { name: "degree_title", label: "Degree" },
                                { name: "institution", label: "Institution" },
                                { name: "end_year", label: "Year", type: "number" },
                            ]}
                            renderRow={(r) => `${r.degree_title} — ${r.institution || "—"} (${r.end_year || "—"})`}
                        />

                        <RepeaterSection
                            title="Work Experience"
                            endpoints={HrWorkExperiencesEndpoints}
                            fields={[
                                { name: "company_name", label: "Company" },
                                { name: "job_title", label: "Job Title" },
                                { name: "start_date", label: "From", type: "date" },
                                { name: "end_date", label: "To", type: "date" },
                            ]}
                            renderRow={(r) => `${r.job_title || "—"} at ${r.company_name}`}
                        />

                        <RepeaterSection
                            title="Certifications"
                            endpoints={HrCertificationsEndpoints}
                            fields={[
                                { name: "name", label: "Name" },
                                { name: "issuing_organization", label: "Issuing Org" },
                                { name: "issue_date", label: "Issue Date", type: "date" },
                            ]}
                            renderRow={(r) => `${r.name} — ${r.issuing_organization || "—"}`}
                        />

                        <RepeaterSection
                            title="Skills &amp; Languages"
                            endpoints={HrSkillsEndpoints}
                            fields={[
                                { name: "name", label: "Name" },
                                { name: "category", label: "Category", type: "select", options: ["Skill", "Language"] },
                                { name: "proficiency", label: "Proficiency", type: "select", options: ["Beginner", "Intermediate", "Advanced", "Expert"] },
                            ]}
                            renderRow={(r) => `${r.name} (${r.category}) — ${r.proficiency || "—"}`}
                        />

                        <DocumentsSection />
                    </>
                )}
            </Layout>
        </ProtectedRoute>
    );
}

function TextField({ label, value, onChange, col = 4, type = "text" }) {
    return (
        <div className={`col-md-${col}`}>
            <label className="form-label small">{label}</label>
            <input type={type} className="form-control form-control-sm" value={value || ""} onChange={(e) => onChange(e.target.value)} />
        </div>
    );
}

function SelectField({ label, value, options, onChange, col = 4 }) {
    return (
        <div className={`col-md-${col}`}>
            <label className="form-label small">{label}</label>
            <select className="form-select form-select-sm" value={value || ""} onChange={(e) => onChange(e.target.value)}>
                <option value="">—</option>
                {options.map((o) => <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}
            </select>
        </div>
    );
}

function RepeaterSection({ title, endpoints, fields, renderRow }) {
    const [rows, setRows] = useState([]);
    const [form, setForm] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

    async function load() {
        setLoading(true);
        try {
            const res = await endpoints.listMine();
            setRows(res?.data || []);
        } catch (err) {
            console.error(`Failed to load ${title}`, err);
        } finally {
            setLoading(false);
        }
    }

    async function add(e) {
        e.preventDefault();
        setSaving(true);
        try {
            await endpoints.createMine(form);
            setForm({});
            await load();
        } catch (err) {
            console.error(`Failed to add ${title}`, err);
            alert("Failed to add record.");
        } finally {
            setSaving(false);
        }
    }

    async function remove(documentId) {
        if (!confirm("Remove this record?")) return;
        try {
            await endpoints.deleteMine(documentId);
            await load();
        } catch (err) {
            console.error(`Failed to remove ${title}`, err);
        }
    }

    return (
        <div className="card mb-4">
            <div className="card-header bg-light fw-semibold">{title}</div>
            <div className="card-body">
                <form onSubmit={add} className="row g-2 align-items-end mb-3">
                    {fields.map((f) => (
                        <div className="col-md-3" key={f.name}>
                            <label className="form-label small">{f.label}</label>
                            {f.type === "select" ? (
                                <select
                                    className="form-select form-select-sm"
                                    value={form[f.name] || ""}
                                    onChange={(e) => setForm((p) => ({ ...p, [f.name]: e.target.value }))}
                                >
                                    <option value="">—</option>
                                    {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                                </select>
                            ) : (
                                <input
                                    type={f.type || "text"}
                                    className="form-control form-control-sm"
                                    value={form[f.name] || ""}
                                    onChange={(e) => setForm((p) => ({ ...p, [f.name]: e.target.value }))}
                                />
                            )}
                        </div>
                    ))}
                    <div className="col-md-2 d-grid">
                        <button className="btn btn-sm btn-primary" type="submit" disabled={saving}>Add</button>
                    </div>
                </form>

                {loading && <p className="small text-muted mb-0">Loading…</p>}
                {!loading && rows.length === 0 && <p className="small text-muted mb-0">None added yet.</p>}
                {!loading && rows.length > 0 && (
                    <table className="table table-sm mb-0">
                        <tbody>
                            {rows.map((r) => (
                                <tr key={r.id}>
                                    <td>{renderRow(r)}</td>
                                    <td className="text-end" style={{ width: 100 }}>
                                        <button className="btn btn-sm btn-outline-danger" onClick={() => remove(r.documentId)}>Remove</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}

const DOCUMENT_TYPES = ["Resume", "CNIC", "Passport", "DrivingLicense", "Certificate", "Other"];

function DocumentsSection() {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [docType, setDocType] = useState("Resume");
    const [file, setFile] = useState(null);
    const [uploading, setUploading] = useState(false);

    useEffect(() => { load(); }, []);

    async function load() {
        setLoading(true);
        try {
            const res = await HrEmployeeDocumentsEndpoints.listMine();
            setRows(res?.data || []);
        } catch (err) {
            console.error("Failed to load documents", err);
        } finally {
            setLoading(false);
        }
    }

    async function upload(e) {
        e.preventDefault();
        if (!file) return;
        setUploading(true);
        try {
            const created = await HrEmployeeDocumentsEndpoints.createMine({ document_type: docType, title: file.name });
            const row = created?.data;
            if (row?.id) {
                await UploadEndpoints.uploadFiles(file, "hr-employee-document", "file", row.id);
            }
            setFile(null);
            await load();
        } catch (err) {
            console.error("Failed to upload document", err);
            alert("Failed to upload document.");
        } finally {
            setUploading(false);
        }
    }

    async function remove(documentId) {
        if (!confirm("Remove this document?")) return;
        try {
            await HrEmployeeDocumentsEndpoints.deleteMine(documentId);
            await load();
        } catch (err) {
            console.error("Failed to remove document", err);
        }
    }

    return (
        <div className="card mb-4">
            <div className="card-header bg-light fw-semibold">Documents</div>
            <div className="card-body">
                <form onSubmit={upload} className="row g-2 align-items-end mb-3">
                    <div className="col-md-3">
                        <label className="form-label small">Type</label>
                        <select className="form-select form-select-sm" value={docType} onChange={(e) => setDocType(e.target.value)}>
                            {DOCUMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                    <div className="col-md-6">
                        <label className="form-label small">File</label>
                        <input type="file" className="form-control form-control-sm" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                    </div>
                    <div className="col-md-3 d-grid">
                        <button className="btn btn-sm btn-primary" type="submit" disabled={uploading || !file}>
                            {uploading ? "Uploading..." : "Upload"}
                        </button>
                    </div>
                </form>

                {loading && <p className="small text-muted mb-0">Loading…</p>}
                {!loading && rows.length === 0 && <p className="small text-muted mb-0">No documents uploaded yet.</p>}
                {!loading && rows.length > 0 && (
                    <table className="table table-sm mb-0">
                        <tbody>
                            {rows.map((r) => (
                                <tr key={r.id}>
                                    <td>{r.document_type}{r.title ? ` — ${r.title}` : ""}</td>
                                    <td>
                                        {r.file?.url && (
                                            <a href={r.file.url} target="_blank" rel="noreferrer">View</a>
                                        )}
                                    </td>
                                    <td className="text-end" style={{ width: 100 }}>
                                        <button className="btn btn-sm btn-outline-danger" onClick={() => remove(r.documentId)}>Remove</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
