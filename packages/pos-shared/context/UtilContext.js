import React, { createContext, useContext, useMemo, useState, useEffect, useCallback } from "react";
import { storage } from "../lib/storage";
import { authApi } from "../lib/api";

const UtilContext = createContext(null);

export function UtilProvider({ children }) {
    // State variables for branch, branch-desk, and user
    const [branch, setBranchState] = useState(null);
    const [desk, setDeskState] = useState(null);
    const [user, setUserState] = useState(null);
    const [currency, setCurrencyState] = useState('Rs');
    const [labelSize, setLabelSizeState] = useState('2.4x1.5'); // in inches
    const [printMode, setPrintModeState] = useState('thermal');
    const [cashRegister, setCashRegisterState] = useState(null);
    const [showBranchDeskModal, setShowBranchDeskModal] = useState(false);
    const [hydrated, setHydrated] = useState(false);

    // Branch-level print settings defaults — stored on the branch entity.
    const BRANCH_PRINT_DEFAULTS = {
        fontSize: 11,
        itemsFontSize: 11,
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
    const INVOICE_PRINT_DEFAULTS = {
        paperWidth: '80mm'
    };

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

    // Refresh the branch entity from the API after hydration so that
    // fields edited in the admin panel (social links, etc.) are always current.
    useEffect(() => {
        if (!hydrated || !branch?.documentId) return;
        (async () => {
            try {
                const response = await authApi.get(`/branches/${branch.documentId}?populate[0]=desks&populate[1]=currency`);
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
    }, [hydrated]); // eslint-disable-line react-hooks/exhaustive-deps

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
            const response = await authApi.put(`/branches/${branch.documentId}`, { data: { printSettings: merged } });
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
    }), [branch, desk, user, labelSize, currency, printMode, cashRegister, invoicePrintSettings, ensureBranchDesk, showBranchDeskModal, hydrated]);

    return (
        <UtilContext.Provider value={value}>
            {children}
        </UtilContext.Provider>
    );
}


export function useUtil() {
    return useContext(UtilContext);
}