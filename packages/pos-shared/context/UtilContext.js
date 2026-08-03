import React, { createContext, useContext, useMemo, useState, useEffect, useCallback } from "react";
import { storage } from "@rutba/api-provider/lib/storage";
import { BranchesEndpoints } from "@rutba/api-provider/endpoints";
import { useAuth } from "./AuthContext";

const UtilContext = createContext(null);

// Branch-level print settings defaults — stored on the branch entity. These
// are the *recommended* values tuned for clear thermal output, so the settings
// panel's "Reset" restores the best-known configuration (not a bare minimum).
export const BRANCH_PRINT_DEFAULTS = {
    // Base body size. 12px reads cleanly on an 80mm thermal head without
    // wrapping the common item lines; smaller starts to look cramped in print.
    fontSize: 12,
    itemsFontSize: 12,
    // How many px smaller the secondary lines (original unit price, discount,
    // sub-labels) render compared to their parent line. Just 1px keeps the
    // discount line clearly legible while still reading as secondary.
    detailFontDelta: 1,
    // Hard floor for any computed font size — nothing on the receipt is
    // allowed to shrink below this, however the deltas stack up. 10px is about
    // the smallest that stays sharp on a 203dpi thermal printer.
    minFontSize: 10,
    // Left/right inset of the receipt body, in px. Keeps text off the paper
    // edge without leaving the wide margin a fixed-width layout produces.
    sideMargin: 5,
    fontFamily: 'sans-serif',
    showTax: true,
    showCustomer: true,
    showBranch: true,
    branchFields: ['name', 'companyName', 'web'],
    socialFields: [],
    socialQRFields: [],
    showTerms: false
};

// Printer-level settings defaults — stored in localStorage per device.
export const INVOICE_PRINT_DEFAULTS = {
    paperWidth: '80mm'
};

// Allowed ranges for the numeric print controls. Shared by the settings UI
// (input min/max + clamping) so a typed value can't produce an unprintable
// receipt.
export const PRINT_SETTING_LIMITS = {
    fontSize: { min: 8, max: 24 },
    itemsFontSize: { min: 8, max: 24 },
    detailFontDelta: { min: 0, max: 6 },
    minFontSize: { min: 6, max: 20 },
    sideMargin: { min: 0, max: 20 }
};

export function clampPrintSetting(field, value) {
    const limits = PRINT_SETTING_LIMITS[field];
    const num = Number(value);
    if (!limits) return num;
    // Empty / non-numeric falls back to the default rather than the floor —
    // clearing the box shouldn't silently pick the smallest legal value.
    if (value === '' || value == null || !Number.isFinite(num)) return BRANCH_PRINT_DEFAULTS[field];
    return Math.min(limits.max, Math.max(limits.min, Math.round(num)));
}

// Clamp every numeric field at once — used before persisting so an
// out-of-range value typed into a box can never reach the branch record.
export function clampPrintSettings(settings) {
    const next = { ...settings };
    for (const field of Object.keys(PRINT_SETTING_LIMITS)) {
        next[field] = clampPrintSetting(field, next[field]);
    }
    return next;
}

export function UtilProvider({ children }) {
    const { jwt: authJwt, loading: authLoading, user: authUser } = useAuth() || {};
    // State variables for branch, branch-desk, and user
    const [branch, setBranchState] = useState(null);
    const [desk, setDeskState] = useState(null);
    const [user, setUserState] = useState(null);
    const [currency, setCurrencyState] = useState('Rs');
    const [labelSize, setLabelSizeState] = useState('2.4x1.5'); // in inches
    const [printMode, setPrintModeState] = useState('thermal');
    // How the label renders the price:
    //   'selling' — selling price only (current default)
    //   'offer'   — offer price if set, else fall back to selling
    //   'both'    — selling crossed out + offer beside it (for promo labels)
    const [labelPriceMode, setLabelPriceModeState] = useState('selling');
    const [cashRegister, setCashRegisterState] = useState(null);
    const [showBranchDeskModal, setShowBranchDeskModal] = useState(false);
    const [hydrated, setHydrated] = useState(false);

    const [invoicePrintSettings, setInvoicePrintSettingsState] = useState(INVOICE_PRINT_DEFAULTS);

    function getLabelSize() {
        return labelSize;
    }

    // Load values from storage once on mount
    useEffect(() => {
        try {
            // Branch and desk are loaded from localStorage directly (persistent across sessions)
            const storedBranch = localStorage.getItem("branch");
            const storedDesk = localStorage.getItem("branch-desk");
            setBranchState(storedBranch ? JSON.parse(storedBranch) : null);
            setDeskState(storedDesk ? JSON.parse(storedDesk) : null);
            setUserState(storage.getJSON("user") ?? null);
            setCurrencyState(storage.getJSON("currency") ?? 'Rs');
            setLabelSizeState(storage.getJSON("label-size") ?? '2.4x1.5');
            setPrintModeState(storage.getJSON("print-mode") ?? 'thermal');
            setLabelPriceModeState(storage.getJSON("label-price-mode") ?? 'selling');
            setCashRegisterState(storage.getJSON("cash-register") ?? null);
            // Printer-level settings — stored in localStorage per device.
            const rawPrint = localStorage.getItem("invoice-print-settings");
            const storedPrint = rawPrint ? JSON.parse(rawPrint) : {};
            setInvoicePrintSettingsState({ ...INVOICE_PRINT_DEFAULTS, ...storedPrint });
        } catch (err) {
            console.error('UtilProvider: failed to load from storage', err);
        } finally {
            setHydrated(true);
        }
    }, []); // run once

    // Track the authenticated session. The storage read above only runs at
    // mount, so a session that lands afterwards (login redirect, refresh,
    // remember-me writing to the other store) left `user` null for the rest of
    // the page's life — which is how cash registers were created with no
    // `opened_by`, and only an admin could then close them.
    useEffect(() => {
        if (authUser) setUserState(authUser);
    }, [authUser]);

    // Refresh the branch entity from the API after hydration so that
    // fields edited in the admin panel (social links, etc.) are always current.
    // Wait for auth to be ready — otherwise this fires during the fresh-login
    // window (AuthCallback in flight) with no JWT in storage, which trips the
    // "session expired" dialog via authCall's no-tokens short-circuit.
    useEffect(() => {
        if (!hydrated || !branch?.documentId) return;
        if (authLoading || !authJwt) return;
        (async () => {
            try {
                const response = await BranchesEndpoints.byId(branch.documentId);
                const fresh = response?.data ?? response;
                if (fresh && fresh.documentId) {
                    setBranchState(fresh);
                    localStorage.setItem("branch", JSON.stringify(fresh));
                }
            } catch (err) {
                // Silent — stale localStorage copy is still usable
                console.warn('Branch refresh failed, using cached data', err?.message);
            }
        })();
    }, [hydrated, authJwt, authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

    function getBranch() {
        return branch;
    }
    function getBranchDesk() {
        return desk;
    }
    function getUser() {
        return user;
    }
    function getCurrency() {
        return currency;
    }
    function setCurrency(newCurrency) {
        setCurrencyState(newCurrency);
        try {
            storage.setJSON("currency", newCurrency);
        } catch (err) {
            console.error('Failed to persist currency', err);
        }
    }
    function setBranch(newBranch) {
        setBranchState(newBranch);
        try {
            localStorage.setItem("branch", JSON.stringify(newBranch));
        } catch (err) {
            console.error('Failed to persist branch', err);
        }
    }
    function setBranchDesk(newDesk) {
        setDeskState(newDesk);
        try {
            localStorage.setItem("branch-desk", JSON.stringify(newDesk));
        } catch (err) {
            console.error('Failed to persist branch-desk', err);
        }
    }
    function setLabelSize(newSize) {
        setLabelSizeState(newSize);
        try {
            storage.setJSON("label-size", newSize);
        } catch (err) {
            console.error('Failed to persist label-size', err);
        }
    }
    function setPrintMode(newMode) {
        setPrintModeState(newMode);
        try {
            storage.setJSON("print-mode", newMode);
        } catch (err) {
            console.error('Failed to persist print-mode', err);
        }
    }
    function setLabelPriceMode(newMode) {
        setLabelPriceModeState(newMode);
        try {
            storage.setJSON("label-price-mode", newMode);
        } catch (err) {
            console.error('Failed to persist label-price-mode', err);
        }
    }

    function setCashRegister(newRegister) {
        setCashRegisterState(newRegister);
        try {
            storage.setJSON("cash-register", newRegister);
        } catch (err) {
            console.error('Failed to persist cash-register', err);
        }
    }

    // Setter that persists printer-level settings to localStorage.
    function setInvoicePrintSettings(newSettings) {
        setInvoicePrintSettingsState(newSettings);
        try {
            localStorage.setItem("invoice-print-settings", JSON.stringify(newSettings));
        } catch (err) {
            console.error('Failed to persist invoice-print-settings', err);
        }
    }

    // Returns the merged branch-level print settings with defaults.
    function getBranchPrintSettings() {
        return { ...BRANCH_PRINT_DEFAULTS, ...(branch?.printSettings || {}) };
    }

    // Update branch print settings locally (state + localStorage) for live preview.
    // Does NOT call the API — use saveBranchPrintSettings to persist to the backend.
    function updateBranchPrintSettings(newSettings) {
        const merged = { ...BRANCH_PRINT_DEFAULTS, ...newSettings };
        const updatedBranch = { ...branch, printSettings: merged };
        setBranchState(updatedBranch);
        try {
            localStorage.setItem("branch", JSON.stringify(updatedBranch));
        } catch (err) {
            console.error('Failed to update branch print settings locally', err);
        }
    }

    // Persist branch-level print settings to the branch entity via API
    // and update local branch state so the UI reflects immediately.
    async function saveBranchPrintSettings(newSettings) {
        if (!branch?.documentId) {
            console.error('saveBranchPrintSettings: no branch selected');
            return;
        }
        const merged = { ...BRANCH_PRINT_DEFAULTS, ...newSettings };
        try {
            const response = await BranchesEndpoints.update(branch.documentId, { printSettings: merged });
            // Use the API response to get the full fresh branch entity,
            // so any fields updated in the admin panel are picked up.
            const fresh = response?.data ?? response;
            const updatedBranch = (fresh && fresh.documentId) ? fresh : { ...branch, printSettings: merged };
            setBranchState(updatedBranch);
            localStorage.setItem("branch", JSON.stringify(updatedBranch));
        } catch (err) {
            console.error('Failed to persist branch print settings', err);
        }
    }

    function getLocation() {
        if (!branch || !desk) {
            return null;
        }
        return {
            branch,
            desk
        };
    }
    function locationString() {
        const loc = getLocation();
        if (!loc) return "No branch/desk selected";
        return `${loc.branch.name} - ${loc.desk.name}`;
    }
    function RandomNon22Char() {
        const start = 'O'.charCodeAt(0);
        const end = 'Z'.charCodeAt(0);
        const randomCode = Math.floor(Math.random() * (end - start + 1)) + start;
        return String.fromCharCode(randomCode);
    }
    function padHex(value, length, char = ' ') {
        if (typeof value === 'number') {
            value = value.toString(22).toUpperCase();
        }
        let ps = char + String(value ?? '');
        return ps.length > length * 2 ? ps.substring(0, length * 2) : ps;
    }
    function generateNextPONumber() {
        if (!branch || !desk || !user) {
            return null;
        }
        return (branch.po_prefix ?? 'PO') +
            '-' +
            (
                padHex(branch.id, 2, RandomNon22Char()) +
                padHex(user.id, 3, RandomNon22Char()) +
                padHex(Date.now(), 6, RandomNon22Char())
            );
    }
    const ensureBranchDesk = useCallback(() => {
        if (!branch || !desk) {
            setShowBranchDeskModal(true);
            return false;
        }
        return true;
    }, [branch, desk]);

    function generateNextInvoiceNumber() {
        if (!branch || !desk || !user) {
            return null;
        }
        return (desk?.invoice_prefix ?? 'INV') +
            '-' +
            (
                padHex(branch.id, 2, RandomNon22Char()) +
                padHex(desk.id, 2, RandomNon22Char()) +
                padHex(user.id, 3, RandomNon22Char()) +
                padHex(Date.now(), 6, RandomNon22Char())
            );
    }

    const value = useMemo(() => ({
        getBranch,
        getBranchDesk,
        getUser,
        setBranch,
        setBranchDesk,
        setCurrency,
        getCurrency,
        currency,
        getLocation,
        locationString,
        generateNextPONumber,
        generateNextInvoiceNumber,
        RandomNon22Char,
        padHex,
        branch,
        desk,
        user,
        labelSize,
        getLabelSize,
        setLabelSize,
        printMode,
        setPrintMode,
        labelPriceMode,
        setLabelPriceMode,
        cashRegister,
        setCashRegister,
        invoicePrintSettings,
        setInvoicePrintSettings,
        getBranchPrintSettings,
        updateBranchPrintSettings,
        saveBranchPrintSettings,
        ensureBranchDesk,
        showBranchDeskModal,
        setShowBranchDeskModal,
        hydrated
    }), [branch, desk, user, labelSize, currency, printMode, labelPriceMode, cashRegister, invoicePrintSettings, ensureBranchDesk, showBranchDeskModal, hydrated]);

    return (
        <UtilContext.Provider value={value}>
            {children}
        </UtilContext.Provider>
    );
}


export function useUtil() {
    return useContext(UtilContext);
}