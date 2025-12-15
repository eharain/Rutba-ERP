import React, { createContext, useContext, useMemo, useState, useEffect } from "react";
import { storage } from "../lib/storage";

const UtilContext = createContext(null);

export function UtilProvider({ children }) {
    // State variables for branch, branch-desk, and user
    const [branch, setBranchState] = useState(null);
    const [desk, setDeskState] = useState(null);
    const [user, setUserState] = useState(null);
    const [currency, setCurrencyState] = useState(null);

    // Load values from storage once on mount
    useEffect(() => {
        setBranchState(storage.getJSON("branch"));
        setDeskState(storage.getJSON("branch-desk"));
        setUserState(storage.getJSON("user") ?? null);
        setCurrencyState(storage.getJSON("currency") ?? null);
    }, []);

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
        storage.setJSON("currency", newCurrency);
    }
    function setBranch(newBranch) {
        setBranchState(newBranch);
        storage.setJSON("branch", newBranch);
    }
    function setBranchDesk(newDesk) {
        setDeskState(newDesk);
        storage.setJSON("branch-desk", newDesk);
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
            throw new Error("Branch, desk, or user not set");
        }
        return (branch.po_prefix ?? 'PO') +
            '-' +
            (
                padHex(branch.id, 2, RandomNon22Char()) +
                padHex(user.id, 3, RandomNon22Char()) +
                padHex(Date.now(), 6, RandomNon22Char())
            );
    }
    function generateNextInvoiceNumber() {
        if (!branch || !desk || !user) {
            throw new Error("Branch, desk, or user not set");
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
        user
    }), [branch, desk, user, currency]);

    return (
        <UtilContext.Provider value={value}>
            {children}
        </UtilContext.Provider>
    );
}


export function useUtil() {
    return useContext(UtilContext);
}