import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi } from "@rutba/pos-shared/lib/api";
import Link from "next/link";
import { useToast } from "../../components/Toast";
import PagePickerTabs from "../../components/PagePickerTabs";

const DEFAULT_HOURS = [
    { day: "Monday", hours: "11am - 9pm" },
    { day: "Tuesday", hours: "11am - 9pm" },
    { day: "Wednesday", hours: "11am - 9pm" },
    { day: "Thursday", hours: "11am - 9pm" },
    { day: "Friday", hours: "Closed" },
    { day: "Saturday", hours: "11am - 9pm" },
    { day: "Sunday", hours: "11am - 9pm" },
];

const DEFAULT_SOCIALS = [
    { platform: "Facebook", url: "" },
    { platform: "Instagram", url: "" },
    { platform: "TikTok", url: "" },
    { platform: "Youtube", url: "" },
];

export default function CmsFooterDetail() {
    const router = useRouter();
    const { documentId } = router.query;
    const { jwt } = useAuth();
    const isNew = documentId === "new";

    const [footer, setFooter] = useState(null);
    const [isPublished, setIsPublished] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const { toast, ToastContainer } = useToast();

    const [name, setName] = useState("");
    const [slug, setSlug] = useState("");
    const [phone, setPhone] = useState("");
    const [email, setEmail] = useState("");
    const [address, setAddress] = useState("");
    const [copyrightText, setCopyrightText] = useState("");
    const [openingHours, setOpeningHours] = useState(DEFAULT_HOURS);
    const [socialLinks, setSocialLinks] = useState(DEFAULT_SOCIALS);
    const [selectedPageIds, setSelectedPageIds] = useState([]);
    const [allPages, setAllPages] = useState([]);
    const [assignedPageIds, setAssignedPageIds] = useState([]);
    const [savingAssignment, setSavingAssignment] = useState(false);

    useEffect(() => {
        if (!jwt || !documentId || isNew) { setLoading(false); return; }
        Promise.all([
            authApi.get(`/cms-footers/${documentId}`, { status: 'draft', populate: ["pinned_pages", "cms_pages"] }),
            authApi.get(`/cms-footers/${documentId}`, { status: 'published', fields: ["documentId"] }).catch(() => ({ data: null })),
        ])
            .then(([draftRes, pubRes]) => {
                const f = draftRes.data || draftRes;
                setFooter(f);
                setIsPublished(!!pubRes.data);
                setName(f.name || "");
                setSlug(f.slug || "");
                setPhone(f.phone || "");
                setEmail(f.email || "");
                setAddress(f.address || "");
                setCopyrightText(f.copyright_text || "");
                setOpeningHours(f.opening_hours || DEFAULT_HOURS);
                setSocialLinks(f.social_links || DEFAULT_SOCIALS);
                setSelectedPageIds((f.pinned_pages || []).map(p => p.documentId));
                setAssignedPageIds((f.cms_pages || []).map(p => p.documentId));
            })
            .catch(err => console.error("Failed to load footer", err))
            .finally(() => setLoading(false));
    }, [jwt, documentId, isNew]);

    const loadPages = useCallback(async () => {
        if (!jwt) return;
        try {
            const res = await authApi.get("/cms-pages", { status: 'draft', pagination: { pageSize: 100 }, sort: ["title:asc"], populate: ["footer"] });
            setAllPages(res.data || []);
        } catch (err) {
            console.error("Failed to load pages", err);
        }
    }, [jwt]);

    useEffect(() => { loadPages(); }, [loadPages]);

    const updateHour = (index, field, value) => {
        setOpeningHours(prev => prev.map((h, i) => i === index ? { ...h, [field]: value } : h));
    };

    const updateSocial = (index, field, value) => {
        setSocialLinks(prev => prev.map((s, i) => i === index ? { ...s, [field]: value } : s));
    };

    const addSocial = () => {
        setSocialLinks(prev => [...prev, { platform: "", url: "" }]);
    };

    const removeSocial = (index) => {
        setSocialLinks(prev => prev.filter((_, i) => i !== index));
    };

    const togglePage = (docId) => {
        setSelectedPageIds(prev =>
            prev.includes(docId) ? prev.filter(id => id !== docId) : [...prev, docId]
        );
    };

    const removeAllPinnedPages = () => setSelectedPageIds([]);

    const toggleAssignedPage = async (pageDocId) => {
        const isAssigned = assignedPageIds.includes(pageDocId);
        setSavingAssignment(true);
        try {
            await authApi.put(`/cms-pages/${pageDocId}?status=draft`, {
                data: { footer: isAssigned ? null : { set: [documentId] } },
            });
            setAssignedPageIds(prev =>
                isAssigned ? prev.filter(id => id !== pageDocId) : [...prev, pageDocId]
            );
            toast(isAssigned ? "Page unassigned from footer." : "Page assigned to footer.", "success");
        } catch (err) {
            console.error("Failed to update page footer", err);
            toast("Failed to update page assignment.", "danger");
        } finally {
            setSavingAssignment(false);
        }
    };

    const removeAllAssignedPages = async () => {
        if (!confirm(`Remove this footer from all ${assignedPageIds.length} assigned pages?`)) return;
        setSavingAssignment(true);
        try {
            await Promise.all(assignedPageIds.map(pid =>
                authApi.put(`/cms-pages/${pid}?status=draft`, { data: { footer: null } })
            ));
            setAssignedPageIds([]);
            toast("All pages unassigned.", "success");
        } catch (err) {
            console.error("Failed to remove all assignments", err);
            toast("Failed to remove some assignments.", "danger");
        } finally {
            setSavingAssignment(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const payload = {
                data: {
                    name,
                    phone,
                    email,
                    address,
                    copyright_text: copyrightText,
                    opening_hours: openingHours,
                    social_links: socialLinks.filter(s => s.platform && s.url),
                    pinned_pages: { set: selectedPageIds },
                },
            };
            if (isNew) {
                payload.data.slug = slug || name.toLowerCase().replace(/\s+/g, "-");
                const res = await authApi.post("/cms-footers", payload);
                const created = res.data || res;
                router.push(`/${created.documentId}/cms-footer`);
            } else {
                await authApi.put(`/cms-footers/${documentId}?status=draft`, payload);
                toast("Draft saved!", "success");
            }
        } catch (err) {
            console.error("Failed to save footer", err);
            toast("Failed to save.", "danger");
        } finally {
            setSaving(false);
        }
    };

    const handlePublish = async () => {
        setSaving(true);
        try {
            const payload = {
                data: {
                    name,
                    phone,
                    email,
                    address,
                    copyright_text: copyrightText,
                    opening_hours: openingHours,
                    social_links: socialLinks.filter(s => s.platform && s.url),
                    pinned_pages: { set: selectedPageIds },
                },
            };
            await authApi.put(`/cms-footers/${documentId}?status=draft`, payload);
            await authApi.post(`/cms-footers/${documentId}/publish`, {});
            setIsPublished(true);
            toast("Footer saved & published!", "success");
        } catch (err) {
            console.error("Failed to publish footer", err);
            toast("Failed to publish.", "danger");
        } finally {
            setSaving(false);
        }
    };

    const handleUnpublish = async () => {
        setSaving(true);
        try {
            await authApi.post(`/cms-footers/${documentId}/unpublish`, {});
            setIsPublished(false);
            toast("Footer unpublished.", "success");
        } catch (err) {
            console.error("Failed to unpublish footer", err);
            toast("Failed to unpublish.", "danger");
        } finally {
            setSaving(false);
        }
    };

    const handleDiscardDraft = async () => {
        if (!confirm("Save current draft and load the published version into the editor?")) return;
        setSaving(true);
        try {
            await authApi.put(`/cms-footers/${documentId}?status=draft`, {
                data: {
                    name, phone, email, address,
                    copyright_text: copyrightText,
                    opening_hours: openingHours,
                    social_links: socialLinks.filter(s => s.platform && s.url),
                    pinned_pages: { set: selectedPageIds },
                },
            });
            const res = await authApi.get(`/cms-footers/${documentId}`, { status: 'published', populate: ["pinned_pages", "cms_pages"] });
            const f = res.data || res;
            if (!f) { toast("No published version found.", "warning"); return; }
            setName(f.name || "");
            setSlug(f.slug || "");
            setPhone(f.phone || "");
            setEmail(f.email || "");
            setAddress(f.address || "");
            setCopyrightText(f.copyright_text || "");
            setOpeningHours(f.opening_hours || DEFAULT_HOURS);
            setSocialLinks(f.social_links || DEFAULT_SOCIALS);
            setSelectedPageIds((f.pinned_pages || []).map(p => p.documentId));
            setAssignedPageIds((f.cms_pages || []).map(p => p.documentId));
            toast("Draft saved. Showing published version — click Save Draft to overwrite.", "success");
        } catch (err) {
            console.error("Failed to load published version", err);
            toast("Failed to load published version.", "danger");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!confirm("Are you sure you want to delete this footer?")) return;
        try {
            await authApi.del(`/cms-footers/${documentId}`);
            router.push("/footers");
        } catch (err) {
            console.error("Failed to delete footer", err);
            toast("Failed to delete.", "danger");
        }
    };

    return (
        <ProtectedRoute>
            <Layout>
                <ToastContainer />
                <div className="d-flex align-items-center mb-3">
                    <Link className="btn btn-sm btn-outline-secondary me-3" href="/footers">
                        <i className="fas fa-arrow-left"></i> Back
                    </Link>
                    <h2 className="mb-0">{isNew ? "New Footer" : "Edit Footer"}</h2>
                    {!isNew && isPublished && <span className="badge bg-success ms-2 align-self-center">Published</span>}
                    {!isNew && footer && !isPublished && <span className="badge bg-secondary ms-2 align-self-center">Draft</span>}
                    <div className="ms-auto d-flex gap-2">
                        {!isNew && (
                            <button className="btn btn-sm btn-outline-danger" onClick={handleDelete}>
                                <i className="fas fa-trash me-1"></i>Delete
                            </button>
                        )}
                        {!isNew && isPublished && (
                            <button className="btn btn-sm btn-outline-secondary" onClick={handleUnpublish} disabled={saving}>
                                <i className="fas fa-eye-slash me-1"></i>Unpublish
                            </button>
                        )}
                        {!isNew && isPublished && (
                            <button className="btn btn-sm btn-outline-warning" onClick={handleDiscardDraft} disabled={saving}>
                                <i className="fas fa-undo me-1"></i>Load Published
                            </button>
                        )}
                        <button className="btn btn-sm btn-primary" onClick={handleSave} disabled={saving}>
                            {saving ? "Saving…" : isNew ? "Create Footer" : "Save Draft"}
                        </button>
                        {!isNew && (
                            <button className="btn btn-sm btn-success" onClick={handlePublish} disabled={saving}>
                                <i className="fas fa-upload me-1"></i>{saving ? "Publishing…" : "Save & Publish"}
                            </button>
                        )}
                    </div>
                </div>

                {loading && <p>Loading...</p>}
                {!loading && !isNew && !footer && <div className="alert alert-warning">Footer not found.</div>}

                {!loading && (isNew || footer) && (
                    <div className="row">
                        <div className="col-md-8">
                            {/* Basic Info */}
                            <div className="card mb-3">
                                <div className="card-header"><strong>Basic Info</strong></div>
                                <div className="card-body">
                                    <div className="mb-3">
                                        <label className="form-label">Name</label>
                                        <input type="text" className="form-control" value={name} onChange={e => setName(e.target.value)} />
                                    </div>
                                    {isNew && (
                                        <div className="mb-3">
                                            <label className="form-label">Slug</label>
                                            <input type="text" className="form-control" value={slug} onChange={e => setSlug(e.target.value)} placeholder="auto-generated from name" />
                                        </div>
                                    )}
                                    <div className="mb-3">
                                        <label className="form-label">Copyright Text</label>
                                        <input type="text" className="form-control" value={copyrightText} onChange={e => setCopyrightText(e.target.value)} placeholder="© 2026. Rutba.pk" />
                                    </div>
                                </div>
                            </div>

                            {/* Contact */}
                            <div className="card mb-3">
                                <div className="card-header"><i className="fas fa-phone me-2"></i><strong>Contact Info</strong></div>
                                <div className="card-body">
                                    <div className="mb-3">
                                        <label className="form-label">Phone</label>
                                        <input type="text" className="form-control" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+923245303530" />
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label">Email</label>
                                        <input type="email" className="form-control" value={email} onChange={e => setEmail(e.target.value)} />
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label">Address</label>
                                        <textarea className="form-control" rows={2} value={address} onChange={e => setAddress(e.target.value)} />
                                    </div>
                                </div>
                            </div>

                            {/* Opening Hours */}
                            <div className="card mb-3">
                                <div className="card-header"><i className="fas fa-clock me-2"></i><strong>Opening Hours</strong></div>
                                <div className="card-body">
                                    {openingHours.map((h, i) => (
                                        <div key={i} className="row g-2 mb-2">
                                            <div className="col-4">
                                                <input type="text" className="form-control form-control-sm" value={h.day} onChange={e => updateHour(i, "day", e.target.value)} />
                                            </div>
                                            <div className="col-8">
                                                <input type="text" className="form-control form-control-sm" value={h.hours} onChange={e => updateHour(i, "hours", e.target.value)} placeholder="e.g. 11am - 9pm or Closed" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Social Links */}
                            <div className="card mb-3">
                                <div className="card-header d-flex align-items-center">
                                    <i className="fas fa-share-alt me-2"></i>
                                    <strong>Social Links</strong>
                                </div>
                                <div className="card-body">
                                    {socialLinks.map((s, i) => (
                                        <div key={i} className="row g-2 mb-2">
                                            <div className="col-3">
                                                <input type="text" className="form-control form-control-sm" value={s.platform} onChange={e => updateSocial(i, "platform", e.target.value)} placeholder="Platform" />
                                            </div>
                                            <div className="col-8">
                                                <input type="url" className="form-control form-control-sm" value={s.url} onChange={e => updateSocial(i, "url", e.target.value)} placeholder="https://..." />
                                            </div>
                                            <div className="col-1">
                                                <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => removeSocial(i)}>
                                                    <i className="fas fa-times"></i>
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                    <button type="button" className="btn btn-sm btn-outline-primary mt-1" onClick={addSocial}>
                                        <i className="fas fa-plus me-1"></i>Add Social Link
                                    </button>
                                </div>
                            </div>

                            {/* Pinned Pages */}
                            <PagePickerTabs
                                allPages={allPages}
                                selectedPageIds={selectedPageIds}
                                onToggle={togglePage}
                                onRemoveAll={removeAllPinnedPages}
                                title="Pinned Pages"
                                icon="fas fa-thumbtack"
                                description="Select pages to show as links in the footer."
                            />

                            {/* Assigned Pages — pages using this footer */}
                            {!isNew && (
                                <PagePickerTabs
                                    allPages={allPages}
                                    selectedPageIds={assignedPageIds}
                                    onToggle={toggleAssignedPage}
                                    onRemoveAll={removeAllAssignedPages}
                                    title="Assigned Pages"
                                    icon="fas fa-file-alt"
                                    description="Pages that use this footer. Toggle to assign/unassign this footer from pages."
                                />
                            )}
                        </div>

                        <div className="col-md-4">
                            <div className="card mb-3">
                                <div className="card-header">Info</div>
                                <div className="card-body">
                                    {!isNew && footer?.slug && (
                                        <div className="mb-3">
                                            <label className="form-label">Slug</label>
                                            <code className="d-block">{footer.slug}</code>
                                        </div>
                                    )}
                                    {!isNew && isPublished && <span className="badge bg-success">Published</span>}
                                    {!isNew && footer && !isPublished && <span className="badge bg-secondary">Draft</span>}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </Layout>
        </ProtectedRoute>
    );
}

export async function getServerSideProps() {
    return { props: {} };
}
