import React, { useRef, useState, useEffect, useCallback } from 'react';
import { storage } from '@rutba/api-provider/lib/storage';
import { StraipImageUrl, isImage, isPDF, isVideo } from "@rutba/api-provider/lib/api";
import { authApi } from "@rutba/api-provider/lib/api";
import { MediaLibraryEndpoints, UploadEndpoints } from "@rutba/api-provider/endpoints";
import StrapiMediaLibrary from './StrapiMediaLibrary';
// Utility functions

// Upload helper using fetch so multipart boundaries are handled by the browser.
// Attaches to the entity if ref/refId/field provided (Strapi upload attachment pattern).
export async function uploadToStrapiFiles(files = [], ref, field, refId, info) {
    return await UploadEndpoints.uploadFiles(files, ref, field, refId, info);
}

// Strapi's pluralisation rules (matches pluralize.js for the simple cases
// this codebase uses). Consumers can override via the `refPlural` prop for
// irregular nouns we don't cover here.
function defaultPluralOf(singular) {
    if (!singular) return null;
    const s = singular.toLowerCase();
    if (/[^aeiou]y$/.test(s)) return s.slice(0, -1) + 'ies';
    if (/(s|x|z|ch|sh)$/.test(s)) return s + 'es';
    return s + 's';
}

// Persist a media-relation change to the entity. The Strapi /upload route
// auto-attaches NEW uploads via ref/refId/field, but Browse-Gallery picks
// and Remove buttons don't go through /upload, so we have to PUT the
// content-type endpoint directly. Without this, those flows update only
// FileView's local state and the relation reverts on page reload.
async function persistMediaRelation({ refName, refPlural, refDocumentId, refDraft, refIsSingleType, field, value }) {
    if (!refName || !field) return;
    // Single types: PUT /api/{singular} — no plural form, no id. Collection
    // types: PUT /api/{plural}/{documentId}.
    let path;
    if (refIsSingleType) {
        path = `/${refName}`;
    } else {
        if (!refDocumentId) return;
        const plural = refPlural || defaultPluralOf(refName);
        if (!plural) return;
        path = `/${plural}/${refDocumentId}`;
    }
    const query = refDraft ? '?status=draft' : '';
    try {
        await authApi.put(`${path}${query}`, { data: { [field]: value } });
    } catch (err) {
        console.error(`Failed to persist ${field} on ${path}`, err);
        throw err;
    }
}

function FileView({
    onFileChange = function (field, files, multiple) { },
    single = null, gallery = [], multiple = false,
    refName = null, refId = null, refDocumentId = null, refPlural = null, refDraft = false, refIsSingleType = false,
    field = null, autoUpload = true, name = null, accept = null, buttonLabel = null,
}) {
    const [singleFile, setSingleFile] = useState(single);
    const [galleryFiles, setGalleryFiles] = useState(gallery);
    // Sync internal state when the parent's prop CONTENT changes — not on
    // every render. Callers commonly write `gallery={x.gallery || []}` which
    // creates a fresh `[]` each render; depending on the array reference
    // would re-fire the effect, call setState, re-render, and loop.
    // Depending on id-derived primitive keys gates the sync to real changes.
    const singleKey = single?.id ?? null;
    const galleryKey = Array.isArray(gallery) ? gallery.map(f => f?.id ?? '').join(',') : '';
    useEffect(() => {
        if ((singleFile?.id ?? null) !== singleKey) setSingleFile(single);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [singleKey]);
    useEffect(() => {
        const stateKey = galleryFiles.map(f => f?.id ?? '').join(',');
        if (stateKey !== galleryKey) setGalleryFiles(Array.isArray(gallery) ? gallery : []);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [galleryKey]);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState(null);
    const [showMediaLibrary, setShowMediaLibrary] = useState(false);
    const [pasteIdValue, setPasteIdValue] = useState('');
    const [pasteIdLoading, setPasteIdLoading] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    const [playingVideo, setPlayingVideo] = useState(null);
    const inputRef = useRef();
    const containerRef = useRef();

    const handleChange = async (e) => {
        setUploadError(null);
        const selected = Array.from(e.target.files || []);
        if (selected.length === 0) return;

        if (multiple) {
            const current = (galleryFiles ?? []).map((f) => ({ ...f }));

            if (autoUpload && refName && refId && field) {
                setUploading(true);
                try {
                    const uploaded = await uploadToStrapiFiles(selected, refName, field, refId, { name, alt: name, caption: name });
                    const newFiles = Array.isArray(uploaded) ? uploaded : [uploaded];
                    const all = [...current, ...newFiles].filter(f => f);
                    setGalleryFiles(all);
                    onFileChange(field, all, multiple);
                } catch (err) {
                    console.error('Upload error', err);
                    setUploadError(err.message || 'Upload failed');
                } finally {
                    setUploading(false);
                }
            } else {
                // keep local previews only (build simple local file objects for preview)
                const previews = selected.map((f, i) => ({
                    name: f.name,
                    url: URL.createObjectURL(f),
                    mime: f.type
                }));
                setGalleryFiles(previews);
                onFileChange(field, previews, multiple);
                setUploading(false);
            }
        } else {

            if (autoUpload && refName && refId && field) {
                setUploading(true);
                try {
                    const uploaded = await uploadToStrapiFiles([selected[0]], refName, field, refId, { name, alt: name, caption: name });
                    setSingleFile(uploaded[0]);
                    onFileChange(field, uploaded[0], multiple);

                } catch (err) {
                    console.error('Upload error', err);
                    setUploadError(err.message || 'Upload failed');
                } finally {
                    setUploading(false);
                }
            } else {
                // local preview for single
                const preview = { name: selected[0].name, url: URL.createObjectURL(selected[0]), mime: selected[0].type };
                setSingleFile(preview);
                onFileChange(field, preview, multiple);
            }
        }

        // reset input so same file can be selected again if needed
        e.target.value = '';
    };

    const handleRemove = async (index) => {
        const updated = galleryFiles.filter((_, i) => i !== index);
        setGalleryFiles(updated);
        onFileChange(field, updated, multiple);
        if (autoUpload && refName && field && (refDocumentId || refIsSingleType)) {
            try {
                await persistMediaRelation({
                    refName, refPlural, refDocumentId, refDraft, refIsSingleType, field,
                    value: updated.map(f => f?.id).filter(Boolean),
                });
            } catch (err) {
                setUploadError(err?.message || 'Failed to update');
            }
        }
    };

    const handleRemoveSingle = async () => {
        if (!singleFile) return;
        setSingleFile(null);
        onFileChange(field, null, multiple);
        if (autoUpload && refName && field && (refDocumentId || refIsSingleType)) {
            try {
                await persistMediaRelation({
                    refName, refPlural, refDocumentId, refDraft, refIsSingleType, field, value: null,
                });
            } catch (err) {
                setUploadError(err?.message || 'Failed to update');
            }
        }
    };

    const handleMediaLibrarySelect = async (selectedFiles) => {
        if (!selectedFiles || selectedFiles.length === 0) return;

        let value;
        if (multiple) {
            const current = (galleryFiles ?? []).map(f => ({ ...f }));
            const existingIds = new Set(current.map(f => f.id));
            const newFiles = selectedFiles.filter(f => !existingIds.has(f.id));
            const all = [...current, ...newFiles];
            setGalleryFiles(all);
            onFileChange(field, all, multiple);
            value = all.map(f => f?.id).filter(Boolean);
        } else {
            const picked = selectedFiles[0];
            setSingleFile(picked);
            onFileChange(field, picked, multiple);
            value = picked?.id ?? null;
        }

        // Persist the media-relation change. Browse-Gallery doesn't go
        // through Strapi's /upload route, so the relation has to be written
        // explicitly or the pick is forgotten on reload.
        if (autoUpload && refName && field && (refDocumentId || refIsSingleType)) {
            try {
                await persistMediaRelation({ refName, refPlural, refDocumentId, refDraft, field, value });
            } catch (err) {
                setUploadError(err?.message || 'Failed to save selection');
            }
        }
    };

    const handlePasteId = async () => {
        const id = parseInt(pasteIdValue.trim(), 10);
        if (!id || isNaN(id)) return;
        setPasteIdLoading(true);
        try {
            const res = await MediaLibraryEndpoints.file(id);
            const file = res.data;
            if (!file) return;
            handleMediaLibrarySelect([file]);
            setPasteIdValue('');
        } catch (err) {
            console.error('Failed to fetch file by ID', err);
        } finally {
            setPasteIdLoading(false);
        }
    };

    const copyFileId = (file) => {
        if (!file || !file.id) return;
        navigator.clipboard.writeText(String(file.id)).catch(function() {});
    };

    const handlePasteUpload = useCallback(async (e) => {
        if (!isFocused) return;
        const items = e.clipboardData?.items;
        if (!items) return;
        const imageFiles = [];
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.startsWith('image/')) {
                const file = items[i].getAsFile();
                if (file) imageFiles.push(file);
            }
        }
        if (imageFiles.length === 0) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        setUploadError(null);
        const filesToUpload = multiple ? imageFiles : [imageFiles[0]];
        if (autoUpload && refName && refId && field) {
            setUploading(true);
            try {
                const uploaded = await uploadToStrapiFiles(filesToUpload, refName, field, refId, { name, alt: name, caption: name });
                const newFiles = Array.isArray(uploaded) ? uploaded : [uploaded];
                if (multiple) {
                    const current = (galleryFiles ?? []).map(f => ({ ...f }));
                    const all = [...current, ...newFiles].filter(f => f);
                    setGalleryFiles(all);
                    onFileChange(field, all, multiple);
                } else {
                    setSingleFile(newFiles[0]);
                    onFileChange(field, newFiles[0], multiple);
                }
            } catch (err) {
                console.error('Paste upload error', err);
                setUploadError(err.message || 'Paste upload failed');
            } finally {
                setUploading(false);
            }
        } else {
            if (multiple) {
                const previews = filesToUpload.map(f => ({
                    name: f.name || 'pasted-image',
                    url: URL.createObjectURL(f),
                    mime: f.type
                }));
                const current = (galleryFiles ?? []).map(f => ({ ...f }));
                const all = [...current, ...previews];
                setGalleryFiles(all);
                onFileChange(field, all, multiple);
            } else {
                const f = filesToUpload[0];
                const preview = { name: f.name || 'pasted-image', url: URL.createObjectURL(f), mime: f.type };
                setSingleFile(preview);
                onFileChange(field, preview, multiple);
            }
        }
    }, [isFocused, multiple, autoUpload, refName, refId, field, name, galleryFiles, onFileChange]);

    useEffect(() => {
        document.addEventListener('paste', handlePasteUpload);
        return () => document.removeEventListener('paste', handlePasteUpload);
    }, [handlePasteUpload]);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const onFocusIn = () => setIsFocused(true);
        const onFocusOut = (e) => {
            if (!el.contains(e.relatedTarget)) setIsFocused(false);
        };
        el.addEventListener('focusin', onFocusIn);
        el.addEventListener('focusout', onFocusOut);
        return () => {
            el.removeEventListener('focusin', onFocusIn);
            el.removeEventListener('focusout', onFocusOut);
        };
    }, []);

    return (
        <div ref={containerRef} tabIndex={-1} style={{ outline: 'none' }}>
            <input
                ref={inputRef}
                type="file"
                accept={accept || "image/*,application/pdf"}
                multiple={multiple}
                className="d-none"
                onChange={handleChange}
            />
            <div className="d-flex flex-wrap gap-2 mb-3 align-items-center">
                <button
                    type="button"
                    onClick={() => inputRef.current.click()}
                    className="btn btn-primary"
                    disabled={uploading}
                >
                    {buttonLabel || (multiple ? 'Upload Images/PDFs' : 'Upload Image/PDF')}
                </button>
                <button
                    type="button"
                    onClick={() => setShowMediaLibrary(true)}
                    className="btn btn-outline-secondary"
                    disabled={uploading}
                >
                    <i className="fas fa-photo-video me-1" />
                    Browse Gallery
                </button>
                <div className="input-group input-group-sm" style={{ width: 'auto', maxWidth: 170 }}>
                    <input type="text" className="form-control" placeholder="Paste file ID"
                        value={pasteIdValue} onChange={e => setPasteIdValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handlePasteId(); }} />
                    <button className="btn btn-outline-primary" onClick={handlePasteId}
                        disabled={pasteIdLoading || !pasteIdValue.trim()} title="Attach file by ID">
                        <i className={pasteIdLoading ? 'fas fa-spinner fa-spin' : 'fas fa-paste'} />
                    </button>
                </div>

                {uploading && <div className="spinner-border spinner-border-sm text-primary" role="status" aria-hidden="true" />}
                {uploadError && <div className="text-danger small align-self-center ms-2">{uploadError}</div>}
            </div>

            <StrapiMediaLibrary
                show={showMediaLibrary}
                onClose={() => setShowMediaLibrary(false)}
                onSelect={handleMediaLibrarySelect}
                multiple={multiple}
                accept={accept === 'video/*' ? 'all' : accept === 'image/*' ? 'image' : 'all'}
            />

            {/* Single file preview */}
            {!multiple && singleFile && (
                <div className="card mx-auto mb-3" style={{ maxWidth: '100%', position: 'relative', overflow: 'hidden' }}>
                    <button
                        type="button"
                        onClick={handleRemoveSingle}
                        className="btn-close position-absolute top-0 end-0 m-2"
                        title="Remove"
                        aria-label="Remove"
                        style={{ zIndex: 2 }}
                    />
                    <div style={{ width: '100%', maxHeight: '300px', overflow: 'hidden' }}>
                        {isImage(singleFile) ? (
                                <img
                                    src={StraipImageUrl(singleFile)}
                                    alt={singleFile.name}
                                    className="img-fluid"
                                    style={{ width: '100%', height: 'auto', objectFit: 'cover', maxHeight: '300px' }}
                                />
                            ) : isVideo(singleFile) ? (
                                <video
                                    src={StraipImageUrl(singleFile)}
                                    controls
                                    preload="none"
                                    style={{ width: '100%', maxHeight: '300px' }}
                                />
                            ) : isPDF(singleFile) ? (
                                <embed
                                    src={StraipImageUrl(singleFile)}
                                    type="application/pdf"
                                    width="100%"
                                    height="300px"
                                    style={{ border: 'none' }}
                                />
                            ) : (
                                <span>Unsupported file</span>
                            )}
                    </div>
                    <div className="card-footer text-center p-2 d-flex align-items-center justify-content-center gap-1" style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <span className="text-truncate">{singleFile.name}</span>
                        {isVideo(singleFile) && <a href={StraipImageUrl(singleFile)} download={singleFile.name} className="btn btn-sm btn-outline-secondary p-0 px-1" title="Download video" style={{ fontSize: '0.65rem', lineHeight: 1 }}><i className="fas fa-download" /></a>}
                        {singleFile.id && <button type="button" className="btn btn-sm btn-outline-secondary p-0 px-1" title={'Copy ID: ' + singleFile.id} onClick={() => copyFileId(singleFile)} style={{ fontSize: '0.65rem', lineHeight: 1 }}><i className="fas fa-hashtag" /></button>}
                    </div>
                </div>
            )}

            {/* Gallery view for multiple files */}
            {multiple && galleryFiles?.length > 0 && (
                <div className="row g-3">
                    {galleryFiles.map((fileObj, idx) => (
                        <div key={fileObj.id ?? fileObj.url ?? idx} className="col-6 col-sm-4 col-md-3">
                            <div className="card position-relative" style={{ overflow: 'hidden' }}>
                                <button
                                    type="button"
                                    onClick={() => handleRemove(idx)}
                                    className="btn-close position-absolute top-0 end-0 m-2"
                                    title="Remove"
                                    aria-label="Remove"
                                    style={{ zIndex: 2 }}
                                />
                                <div style={{ width: '100%', height: '140px', overflow: 'hidden' }}>
                                    {isImage(fileObj) ? (
                                        <img
                                            src={StraipImageUrl(fileObj)}
                                            alt={fileObj.name}
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                        />
                                    ) : isVideo(fileObj) ? (
                                        <div
                                            onClick={() => setPlayingVideo(fileObj)}
                                            style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1a1a2e', color: '#fff', position: 'relative', cursor: 'pointer' }}
                                            title="Click to play"
                                        >
                                            <i className="fas fa-play-circle" style={{ fontSize: '2.5rem', opacity: 0.85 }} />
                                            <span style={{ position: 'absolute', bottom: 4, left: 0, right: 0, textAlign: 'center', fontSize: 10, opacity: 0.7 }}>{fileObj.name}</span>
                                        </div>
                                    ) : isPDF(fileObj) ? (
                                        <embed
                                            src={StraipImageUrl(fileObj)}
                                            type="application/pdf"
                                            width="100%"
                                            height="100%"
                                            style={{ border: 'none' }}
                                        />
                                    ) : (
                                        <span>Unsupported file</span>
                                    )}
                                </div>
                                <div className="card-footer text-center p-2 d-flex align-items-center justify-content-center gap-1" style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    <span className="text-truncate">{fileObj.name}</span>
                                    {isVideo(fileObj) && <a href={StraipImageUrl(fileObj)} download={fileObj.name} onClick={e => e.stopPropagation()} className="btn btn-sm btn-outline-secondary p-0 px-1" title="Download video" style={{ fontSize: '0.65rem', lineHeight: 1 }}><i className="fas fa-download" /></a>}
                                    {fileObj.id && <button type="button" className="btn btn-sm btn-outline-secondary p-0 px-1" title={'Copy ID: ' + fileObj.id} onClick={(e) => { e.stopPropagation(); copyFileId(fileObj); }} style={{ fontSize: '0.65rem', lineHeight: 1 }}><i className="fas fa-hashtag" /></button>}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Video player overlay */}
            {playingVideo && (
                <div
                    onClick={() => setPlayingVideo(null)}
                    style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                    <div onClick={e => e.stopPropagation()} style={{ position: 'relative', width: '90%', maxWidth: 900 }}>
                        <button
                            type="button"
                            className="btn-close btn-close-white position-absolute"
                            onClick={() => setPlayingVideo(null)}
                            aria-label="Close"
                            style={{ top: -36, right: 0, zIndex: 2 }}
                        />
                        <video
                            src={StraipImageUrl(playingVideo)}
                            controls
                            autoPlay
                            preload="auto"
                            style={{ width: '100%', maxHeight: '80vh', background: '#000', borderRadius: 8 }}
                        />
                        <div className="text-white text-center mt-2" style={{ fontSize: 13, opacity: 0.8 }}>{playingVideo.name}</div>
                    </div>
                </div>
            )}
        </div>
    );
}
export default FileView;