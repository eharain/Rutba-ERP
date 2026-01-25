import React, { useRef, useState } from 'react';
import { storage } from '../lib/storage';
import { authApi, uploadFile } from '../lib/api';
// Utility functions
const isImage = (file) => (file?.type ?? '').startsWith('image/');
const isPDF = (file) => (file?.type ?? '') === 'application/pdf';

// Upload helper using fetch so multipart boundaries are handled by the browser.
// Attaches to the entity if ref/refId/field provided (Strapi upload attachment pattern).
export async function uploadToStrapiFiles(files = [], ref, field, refId, info) {
    return await authApi.uploadFile(files, ref, field, refId, info);
}

function FileView({ multiple = false, ref: refName = null, refId = null, field = null, autoUpload = true,name=null }) {
    const [singleFile, setSingleFile] = useState(null);
    const [galleryFiles, setGalleryFiles] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState(null);
    const inputRef = useRef();

    const handleChange = async (e) => {
        setUploadError(null);
        const selected = Array.from(e.target.files || []);
        if (selected.length === 0) return;

        if (multiple) {
            // show local previews immediately
            
            setGalleryFiles([]);

            if (autoUpload && refName && refId && field) {
                setUploading(true);
                try {
                    const uploaded = await uploadToStrapiFiles(selected, refName, field, refId, {name,alt: name,caption:name });
                  
                    setGalleryFiles(uploaded);
                } catch (err) {
                    console.error('Upload error', err);
                    setUploadError(err.message || 'Upload failed');
                } finally {
                    setUploading(false);
                }
            } else {
                // keep local previews only
                setUploading(false);
            }
        } else {
    
            if (autoUpload && refName && refId && field) {
                setUploading(true);
                try {
                    const uploaded = await uploadToStrapiFiles([selected[0]], refName, field, refId, { name, alt: name, caption: name });
                    setSingleFile(uploaded[0]);
                } catch (err) {
                    console.error('Upload error', err);
                    setUploadError(err.message || 'Upload failed');
                } finally {
                    setUploading(false);
                }
            }
        }

        // reset input so same file can be selected again if needed
        e.target.value = '';
    };

    const handleRemove = async (index) => {
        const target = galleryFiles[index];
        // If uploaded and has id, attempt to detach/delete from Strapi
        if (target?.id) {
            try {
                authApi.deleteFile(target.id);
            } catch (err) {
                console.warn('Failed to delete remote file', err);
            }
        }
        setGalleryFiles((prev) => prev.filter((_, i) => i !== index));
    };

    const handleRemoveSingle = async () => {
        const target = singleFile;
        if (!target) return;
        if (target?.id) {
            const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:1337';
            const jwt = storage.getItem('jwt');
            try {
                authApi.deleteFile(target.id);
            } catch (err) {
                console.warn('Failed to delete remote file', err);
            }
        }
        setSingleFile(null);
    };

    return (
        <div>
            <input
                ref={inputRef}
                type="file"
                accept="image/*,application/pdf"
                multiple={multiple}
                className="d-none"
                onChange={handleChange}
            />
            <div className="d-flex gap-2 mb-3">
                <button
                    type="button"
                    onClick={() => inputRef.current.click()}
                    className="btn btn-primary"
                    disabled={uploading}
                >
                    {multiple ? 'Upload Images/PDFs' : 'Upload Image/PDF'}
                </button>

                {uploading && <div className="spinner-border spinner-border-sm text-primary" role="status" aria-hidden="true" />}
                {uploadError && <div className="text-danger small align-self-center ms-2">{uploadError}</div>}
            </div>

            {/* Single file preview */}
            {!multiple && singleFile && (
                <div className="card mx-auto mb-3" style={{ width: 180, height: 180, position: 'relative' }}>
                    <button
                        type="button"
                        onClick={handleRemoveSingle}
                        className="btn-close position-absolute top-0 end-0 m-2"
                        title="Remove"
                        aria-label="Remove"
                        style={{ zIndex: 2 }}
                    />
                    <div className="d-flex align-items-center justify-content-center h-100">
                        {isImage(singleFile?.file) || singleFile?.preview ? (
                            <img
                                src={singleFile.preview}
                                alt={singleFile.name}
                                className="img-fluid h-100 w-100"
                                style={{ objectFit: 'cover' }}
                            />
                        ) : isPDF(singleFile?.file) ? (
                            <embed
                                src={singleFile.preview}
                                type="application/pdf"
                                width="100%"
                                height="100%"
                                style={{ border: 'none' }}
                            />
                        ) : (
                            <span>Unsupported file</span>
                        )}
                    </div>
                    <div className="card-footer text-center p-2" style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {singleFile.name}
                    </div>
                </div>
            )}

            {/* Gallery view for multiple files */}
            {multiple && galleryFiles.length > 0 && (
                <div className="row g-3">
                    {galleryFiles.map((fileObj, idx) => (
                        <div key={fileObj.id ?? fileObj.preview ?? idx} className="col-6 col-sm-4 col-md-3">
                            <div className="card position-relative" style={{ width: 140, height: 140 }}>
                                <button
                                    type="button"
                                    onClick={() => handleRemove(idx)}
                                    className="btn-close position-absolute top-0 end-0 m-2"
                                    title="Remove"
                                    aria-label="Remove"
                                    style={{ zIndex: 2 }}
                                />
                                <div className="d-flex align-items-center justify-content-center h-100">
                                    {isImage(fileObj?.file) || fileObj?.preview ? (
                                        <img
                                            src={fileObj.preview ?? fileObj.url}
                                            alt={fileObj.name}
                                            className="img-fluid h-100 w-100"
                                            style={{ objectFit: 'cover' }}
                                        />
                                    ) : isPDF(fileObj?.file) ? (
                                            <embed
                                                src={fileObj.preview ?? fileObj.url}
                                            type="application/pdf"
                                            width="100%"
                                            height="100%"
                                            style={{ border: 'none' }}
                                        />
                                    ) : (
                                        <span>Unsupported file</span>
                                    )}
                                </div>
                                <div className="card-footer text-center p-2" style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {fileObj.name}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default FileView;