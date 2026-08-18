import React, { useEffect, useState, useRef } from 'react';
import SaleInvoice from './SaleInvoice';
import {
    useUtil,
    BRANCH_PRINT_DEFAULTS,
    INVOICE_PRINT_DEFAULTS,
    PRINT_SETTING_LIMITS,
    clampPrintSetting,
    clampPrintSettings
} from '@rutba/shared/context/UtilContext';

const SaleInvoicePrint = ({ sale, items, totals, onClose  }) => {
    const { invoicePrintSettings, setInvoicePrintSettings, getBranchPrintSettings, saveBranchPrintSettings } = useUtil();

    // Snapshots captured when the settings panel opens — used to revert on Close.
    const snapshotPrinter = useRef(null);
    const snapshotBranch = useRef(null);

    // Local editable copies driving the controls.
    const [localPrinter, setLocalPrinter] = useState(invoicePrintSettings ?? { paperWidth: '80mm' });
    const [localBranch, setLocalBranch] = useState(getBranchPrintSettings());

    useEffect(() => {
        const timer = setTimeout(() => {
            window.print();
        }, 500);

        return () => clearTimeout(timer);
    }, []);

    function toggleBranchField(field) {
        const next = new Set(localBranch.branchFields || []);
        if (next.has(field)) next.delete(field); else next.add(field);
        setLocalBranch({ ...localBranch, branchFields: Array.from(next) });
    }

    function toggleSocialField(field) {
        const next = new Set(localBranch.socialFields || []);
        if (next.has(field)) next.delete(field); else next.add(field);
        setLocalBranch({ ...localBranch, socialFields: Array.from(next) });
    }

    function toggleSocialQRField(field) {
        const next = new Set(localBranch.socialQRFields || []);
        if (next.has(field)) next.delete(field); else next.add(field);
        setLocalBranch({ ...localBranch, socialQRFields: Array.from(next) });
    }

    // Keep whatever is typed while the box has focus — clamping on every
    // keystroke fights the user (typing "12" would clamp at "1"). The value is
    // clamped on blur, and again before it is persisted.
    function setNum(field, value) {
        setLocalBranch({ ...localBranch, [field]: value === '' ? '' : Number(value) });
    }

    function commitNum(field) {
        setLocalBranch({ ...localBranch, [field]: clampPrintSetting(field, localBranch[field]) });
    }

    // Apply the recommended best-print settings (BRANCH/INVOICE_PRINT_DEFAULTS
    // are tuned for clear thermal output). Only applied to the local copies —
    // the operator still has to hit Save/Print (or Close to abandon the reset).
    function resetDefaults() {
        setLocalPrinter({ ...INVOICE_PRINT_DEFAULTS });
        setLocalBranch({ ...BRANCH_PRINT_DEFAULTS });
    }

    const [showControls, setShowControls] = useState(false);

    function openControls() {
        // Snapshot current persisted values before any edits.
        snapshotPrinter.current = { ...(invoicePrintSettings ?? { paperWidth: '80mm' }) };
        snapshotBranch.current = { ...getBranchPrintSettings() };
        setShowControls(true);
    }

    function closeControls() {
        // Revert local state to the snapshot (cancel unsaved changes).
        if (snapshotPrinter.current) {
            setLocalPrinter(snapshotPrinter.current);
        }
        if (snapshotBranch.current) {
            setLocalBranch(snapshotBranch.current);
        }
        setShowControls(false);
    }

    // Persist both printer and branch settings (fonts clamped here too, in case
    // a box is still holding a typed value) and refresh the snapshots so a later
    // Close won't revert what was just saved. Shared by Save and Print.
    function persistSettings() {
        const branchToSave = clampPrintSettings(localBranch);
        setInvoicePrintSettings(localPrinter);
        saveBranchPrintSettings(branchToSave);
        setLocalBranch(branchToSave);
        snapshotPrinter.current = { ...localPrinter };
        snapshotBranch.current = { ...branchToSave };
        return branchToSave;
    }

    // Exclusive Save — persist the print settings and close the panel (no print).
    function handleSave() {
        persistSettings();
        setShowControls(false);
    }

    function handlePrint() {
        persistSettings();
        window.print();
    }

    return (
        <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
            {/* Toggle button - visible on screen only */}
            <button
                type="button"
                className="d-print-none btn btn-sm btn-primary position-fixed"
                aria-label="Toggle print settings"
                onClick={() => showControls ? closeControls() : openControls()}
                style={{ top: '20px', right: '20px', zIndex: 1100, borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
                ⚙
            </button>

            {/* Quick print button shown when controls are hidden */}
            {!showControls && (
                <button
                    type="button"
                    className="d-print-none btn btn-sm btn-success position-fixed"
                    aria-label="Quick print"
                    onClick={() => { saveBranchPrintSettings(localBranch); window.print(); }}
                    style={{ top: '20px', right: '70px', zIndex: 1100, borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                    🖨
                </button>
            )}

            {/* Print Controls - Only visible on screen and when toggled */}
            {showControls && (
            <div
                className="d-print-none position-fixed"
                style={{
                    top: '70px',
                    right: '20px',
                    background: 'black',
                    padding: '15px',
                    border: '2px solid #007bff',
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    zIndex: 1000,
                    maxHeight: '90vh',
                    overflowY: 'auto'
                }}
            >
                <div style={{ display: 'flex', gap: '20px' }}>
                    {/* ── Left Column: Printer + Font settings ── */}
                    <div style={{ minWidth: '180px' }}>
                        <div className="small text-info fw-bold mb-2">Printer (this device)</div>

                        <div className="mb-2">
                            <label className="form-label text-white small mb-1">Paper Width</label>
                            <select
                                className="form-select form-select-sm"
                                value={localPrinter.paperWidth}
                                onChange={(e) => setLocalPrinter({ ...localPrinter, paperWidth: e.target.value })}
                            >
                                <option value="58mm">58mm</option>
                                <option value="80mm">80mm</option>
                                <option value="210mm">A4</option>
                            </select>
                        </div>

                        <hr className="border-secondary my-2" />
                        <div className="small text-warning fw-bold mb-2">Branch (all desks)</div>

                        <div className="mb-2">
                            <label className="form-label text-white small mb-1">Font Size</label>
                            <input
                                type="number"
                                min={PRINT_SETTING_LIMITS.fontSize.min}
                                max={PRINT_SETTING_LIMITS.fontSize.max}
                                className="form-control form-control-sm"
                                value={localBranch.fontSize}
                                onChange={(e) => setNum('fontSize', e.target.value)}
                                onBlur={() => commitNum('fontSize')}
                            />
                        </div>

                        <div className="mb-2">
                            <label className="form-label text-white small mb-1">Items Font Size</label>
                            <input
                                type="number"
                                min={PRINT_SETTING_LIMITS.itemsFontSize.min}
                                max={PRINT_SETTING_LIMITS.itemsFontSize.max}
                                className="form-control form-control-sm"
                                value={localBranch.itemsFontSize ?? localBranch.fontSize}
                                onChange={(e) => setNum('itemsFontSize', e.target.value)}
                                onBlur={() => commitNum('itemsFontSize')}
                            />
                        </div>

                        <div className="mb-2">
                            <label className="form-label text-white small mb-1" title="How many px smaller the original price / discount line prints compared to the item line">
                                Detail Line Step (px)
                            </label>
                            <input
                                type="number"
                                min={PRINT_SETTING_LIMITS.detailFontDelta.min}
                                max={PRINT_SETTING_LIMITS.detailFontDelta.max}
                                className="form-control form-control-sm"
                                value={localBranch.detailFontDelta ?? BRANCH_PRINT_DEFAULTS.detailFontDelta}
                                onChange={(e) => setNum('detailFontDelta', e.target.value)}
                                onBlur={() => commitNum('detailFontDelta')}
                            />
                            <div className="text-secondary" style={{ fontSize: '11px' }}>
                                Gap between the item line and the original-price / discount line. 0 = same size.
                            </div>
                        </div>

                        <div className="mb-2">
                            <label className="form-label text-white small mb-1" title="No text on the receipt prints smaller than this">
                                Min Font Size
                            </label>
                            <input
                                type="number"
                                min={PRINT_SETTING_LIMITS.minFontSize.min}
                                max={PRINT_SETTING_LIMITS.minFontSize.max}
                                className="form-control form-control-sm"
                                value={localBranch.minFontSize ?? BRANCH_PRINT_DEFAULTS.minFontSize}
                                onChange={(e) => setNum('minFontSize', e.target.value)}
                                onBlur={() => commitNum('minFontSize')}
                            />
                        </div>

                        <div className="mb-2">
                            <label className="form-label text-white small mb-1" title="Blank space kept on the left and right edges of the receipt">
                                Side Margin (px)
                            </label>
                            <input
                                type="number"
                                min={PRINT_SETTING_LIMITS.sideMargin.min}
                                max={PRINT_SETTING_LIMITS.sideMargin.max}
                                className="form-control form-control-sm"
                                value={localBranch.sideMargin ?? BRANCH_PRINT_DEFAULTS.sideMargin}
                                onChange={(e) => setNum('sideMargin', e.target.value)}
                                onBlur={() => commitNum('sideMargin')}
                            />
                            <div className="text-secondary" style={{ fontSize: '11px' }}>
                                Left/right inset of the printed body. 0 = edge to edge.
                            </div>
                        </div>

                        <div className="mb-2">
                            <label className="form-label text-white small mb-1">Font</label>
                            <select
                                className="form-select form-select-sm"
                                value={localBranch.fontFamily || 'sans-serif'}
                                onChange={(e) => setLocalBranch({ ...localBranch, fontFamily: e.target.value })}
                            >
                                <option value="sans-serif">Sans-serif (clean)</option>
                                <option value="monospace">Monospace (receipt)</option>
                                <option value="'Segoe UI', Tahoma, sans-serif">Segoe UI</option>
                                <option value="Arial, Helvetica, sans-serif">Arial</option>
                                <option value="Verdana, Geneva, sans-serif">Verdana</option>
                                <option value="'Courier New', monospace">Courier New</option>
                            </select>
                        </div>

                        <div className="text-white">
                            <div className="form-check text-white mb-1">
                                <input className="form-check-input" type="checkbox" id="showTax" checked={localBranch.showTax} onChange={(e) => setLocalBranch({ ...localBranch, showTax: e.target.checked })} />
                                <label className="form-check-label small" htmlFor="showTax">Show Tax</label>
                            </div>
                            <div className="form-check text-white mb-1">
                                <input className="form-check-input" type="checkbox" id="showBranch" checked={localBranch.showBranch} onChange={(e) => setLocalBranch({ ...localBranch, showBranch: e.target.checked })} />
                                <label className="form-check-label small" htmlFor="showBranch">Show Branch</label>
                            </div>
                            <div className="form-check text-white">
                                <input className="form-check-input" type="checkbox" id="showCustomer" checked={localBranch.showCustomer} onChange={(e) => setLocalBranch({ ...localBranch, showCustomer: e.target.checked })} />
                                <label className="form-check-label small" htmlFor="showCustomer">Show Customer</label>
                            </div>
                            <div className="form-check text-white mt-1">
                                <input className="form-check-input" type="checkbox" id="showTerms" checked={localBranch.showTerms ?? false} onChange={(e) => setLocalBranch({ ...localBranch, showTerms: e.target.checked })} />
                                <label className="form-check-label small" htmlFor="showTerms">Show Terms</label>
                            </div>
                        </div>
                    </div>

                    {/* ── Right Column: Branch Fields + Social ── */}
                    <div style={{ minWidth: '160px' }}>
                        <div className="small text-white fw-bold mb-1">Branch Fields</div>
                        <div className="form-check text-white">
                            <input className="form-check-input" type="checkbox" id="bf-name" checked={(localBranch.branchFields || []).includes('name')} onChange={() => toggleBranchField('name')} />
                            <label className="form-check-label small" htmlFor="bf-name">Branch Name</label>
                        </div>
                        <div className="form-check text-white">
                            <input className="form-check-input" type="checkbox" id="bf-company" checked={(localBranch.branchFields || []).includes('companyName')} onChange={() => toggleBranchField('companyName')} />
                            <label className="form-check-label small" htmlFor="bf-company">Company Name</label>
                        </div>
                        <div className="form-check text-white mb-2">
                            <input className="form-check-input" type="checkbox" id="bf-web" checked={(localBranch.branchFields || []).includes('web')} onChange={() => toggleBranchField('web')} />
                            <label className="form-check-label small" htmlFor="bf-web">Website</label>
                        </div>

                        <hr className="border-secondary my-2" />

                        <div className="small text-white fw-bold mb-1">Social / Contact Links</div>
                        <div className="form-check text-white">
                            <input className="form-check-input" type="checkbox" id="sf-email" checked={(localBranch.socialFields || []).includes('email')} onChange={() => toggleSocialField('email')} />
                            <label className="form-check-label small" htmlFor="sf-email">Email</label>
                        </div>
                        <div className="form-check text-white">
                            <input className="form-check-input" type="checkbox" id="sf-phone" checked={(localBranch.socialFields || []).includes('phone')} onChange={() => toggleSocialField('phone')} />
                            <label className="form-check-label small" htmlFor="sf-phone">Phone</label>
                        </div>
                        <div className="form-check text-white">
                            <input className="form-check-input" type="checkbox" id="sf-watsapp" checked={(localBranch.socialFields || []).includes('watsapp')} onChange={() => toggleSocialField('watsapp')} />
                            <label className="form-check-label small" htmlFor="sf-watsapp">WhatsApp</label>
                        </div>
                        <div className="form-check text-white">
                            <input className="form-check-input" type="checkbox" id="sf-youtube" checked={(localBranch.socialFields || []).includes('youtube')} onChange={() => toggleSocialField('youtube')} />
                            <label className="form-check-label small" htmlFor="sf-youtube">YouTube</label>
                        </div>
                        <div className="form-check text-white">
                            <input className="form-check-input" type="checkbox" id="sf-tiktok" checked={(localBranch.socialFields || []).includes('tiktok')} onChange={() => toggleSocialField('tiktok')} />
                            <label className="form-check-label small" htmlFor="sf-tiktok">TikTok</label>
                        </div>
                        <div className="form-check text-white">
                            <input className="form-check-input" type="checkbox" id="sf-instagram" checked={(localBranch.socialFields || []).includes('instagram')} onChange={() => toggleSocialField('instagram')} />
                            <label className="form-check-label small" htmlFor="sf-instagram">Instagram</label>
                        </div>
                        <div className="form-check text-white">
                            <input className="form-check-input" type="checkbox" id="sf-twitter" checked={(localBranch.socialFields || []).includes('twitter')} onChange={() => toggleSocialField('twitter')} />
                            <label className="form-check-label small" htmlFor="sf-twitter">Twitter / X</label>
                        </div>

                        <hr className="border-secondary my-2" />

                        <div className="small text-white fw-bold mb-1">QR Codes</div>
                        <div className="form-check text-white">
                            <input className="form-check-input" type="checkbox" id="qr-watsapp" checked={(localBranch.socialQRFields || []).includes('watsapp')} onChange={() => toggleSocialQRField('watsapp')} />
                            <label className="form-check-label small" htmlFor="qr-watsapp">WhatsApp</label>
                        </div>
                        <div className="form-check text-white">
                            <input className="form-check-input" type="checkbox" id="qr-youtube" checked={(localBranch.socialQRFields || []).includes('youtube')} onChange={() => toggleSocialQRField('youtube')} />
                            <label className="form-check-label small" htmlFor="qr-youtube">YouTube</label>
                        </div>
                        <div className="form-check text-white">
                            <input className="form-check-input" type="checkbox" id="qr-tiktok" checked={(localBranch.socialQRFields || []).includes('tiktok')} onChange={() => toggleSocialQRField('tiktok')} />
                            <label className="form-check-label small" htmlFor="qr-tiktok">TikTok</label>
                        </div>
                        <div className="form-check text-white">
                            <input className="form-check-input" type="checkbox" id="qr-instagram" checked={(localBranch.socialQRFields || []).includes('instagram')} onChange={() => toggleSocialQRField('instagram')} />
                            <label className="form-check-label small" htmlFor="qr-instagram">Instagram</label>
                        </div>
                        <div className="form-check text-white">
                            <input className="form-check-input" type="checkbox" id="qr-twitter" checked={(localBranch.socialQRFields || []).includes('twitter')} onChange={() => toggleSocialQRField('twitter')} />
                            <label className="form-check-label small" htmlFor="qr-twitter">Twitter / X</label>
                        </div>
                    </div>
                </div>

                {/* ── Buttons spanning full width below both columns ── */}
                <div className="d-flex gap-2 mt-3 flex-wrap">
                    <button
                        onClick={handleSave}
                        className="btn btn-success btn-sm flex-fill"
                        title="Save & Close — save these print settings and close (no printing)"
                        aria-label="Save and close"
                        style={{ fontSize: '16px' }}
                    >
                        <i className="fas fa-save"></i>
                    </button>
                    <button
                        onClick={handlePrint}
                        className="btn btn-primary btn-sm flex-fill"
                        title="Print — save these settings and print"
                        aria-label="Print"
                        style={{ fontSize: '16px' }}
                    >
                        <i className="fas fa-print"></i>
                    </button>
                    <button
                        onClick={resetDefaults}
                        className="btn btn-outline-warning btn-sm flex-fill"
                        title="Reset — apply the recommended best-print settings (takes effect when you Save or Print)"
                        aria-label="Reset to recommended settings"
                        style={{ fontSize: '16px' }}
                    >
                        <i className="fas fa-undo"></i>
                    </button>
                    <button
                        onClick={closeControls}
                        className="btn btn-secondary btn-sm flex-fill"
                        title="Close — discard unsaved changes and close the panel"
                        aria-label="Close without saving"
                        style={{ fontSize: '16px' }}
                    >
                        <i className="fas fa-times"></i>
                    </button>
                </div>
            </div>
            )}

            <SaleInvoice sale={sale} items={items} totals={totals} printerSettings={localPrinter} branchPrintOverrides={localBranch} />
        </div>
    );
};

export default SaleInvoicePrint;

