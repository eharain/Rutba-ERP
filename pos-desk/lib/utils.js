import { storage } from "./storage";

export function brachTaxRate() {
    return getBranch()?.tax_rate ?? 0;
}
export function getBranch() {
    const branch = storage.getJSON("branch");
    return branch;
}
export function getBranchDesk() {
    const desk = storage.getJSON("branch-desk");
    return desk;
}

export function getCashRegister() {
    return storage.getJSON("cash-register");
}

export function getUser() {
    const storedUser = storage.getJSON("user");
    return storedUser ?? null;
}
export function setBranch(branch) {
    storage.setJSON("branch", branch);
}
export function setBranchDesk(desk) {
    storage.setJSON("branch-desk", desk);
}

export function getLocation() {
    const branch = getBranch();
    const desk = getBranchDesk();
    if (!branch || !desk) {
        return null;
    }
    return {
        branch,
        desk
    };
}
export function locationString() {
    const loc = getLocation();
    if (!loc) return "No branch/desk selected";
    return `${loc.branch.name} - ${loc.desk.name}`;
}

export function generateNextPONumber() {

    const user = getUser();
    const loc = getLocation();
    if (!loc.branch || !loc.desk || !user) {
        throw new Error("Branch, desk, or user not set");
    }
    return (loc.branch.po_prefix ?? 'PO') +
        '-' +
        (
            padHex(loc.branch.id, 2, RandomNon22Char()) +
            //  padHex(loc.desk.id, 2, RandomNon22Char()) +
            padHex(user.id, 3, RandomNon22Char()) +
            padHex(Date.now(), 6, RandomNon22Char())
        );
}

// TODO: Make this configurable
export function calculateTax(amount) {
    return amount * 0.0;
}

export function generateNextInvoiceNumber() {

    const user = getUser();
    const loc = getLocation();
    if (!loc || !loc.branch || !loc.desk || !user) {
        throw new Error("Branch, desk, or user not set");
    }
    return (loc?.desk?.invoice_prefix ?? 'I') + '' + generateNextDocumentId();
}

export function generateNextDocumentId() {
    const user = getUser();
    const loc = getLocation();
    const fixDate = new Date(2026, 1, 1, 1, 0, 0);
    let time = Date.now() - fixDate.getTime();

    if (!loc || !loc.branch || !loc.desk || !user) {
        throw new Error("Branch, desk, or user not set");
    }
    return padHex(loc?.branch.id, 2, RandomNon22Char()) +
        padHex(loc?.desk.id, 2, RandomNon22Char()) +
        padHex(user?.id, 2, RandomNon22Char()) +
        padHex(time, 2, RandomNon22Char())

}
export function RandomNon22Char() {
    const start = 'O'.charCodeAt(0);
    const end = 'Z'.charCodeAt(0);
    const randomCode = Math.floor(Math.random() * (end - start + 1)) + start;
    return String.fromCharCode(randomCode);
}

export function padHex(value, length, char = ' ') {
    if (typeof value === 'number') {
        value = value.toString(32).toUpperCase(); // convert to hex and uppercase
    }

    let ps = char + String(value ?? '').padStart(length, char)//.padStart(length, char); // or padEnd for right padding
    return ps.length > length * 2 ? ps.substring(0, length * 2) : ps; // truncate if too long
}


export function prepareForPut(obj, relations = []) {
    if (!Array.isArray(relations)) {
        relations = [];
    }

    const copy = {}
    const skip = ['id', 'documentId', 'createdAt', 'updatedAt', 'publishedAt',"more"]
    //  const skip = ['id', 'documentId', 'createdAt', 'updatedAt', 'publishedAt']

    const mediaFields = ['logo', 'gallery', 'receipts'] // adjust to your schema
    if (relations.includes('users')) {
        obj.user = Array.isArray(obj.users) ? [...obj.users, getUser()] : [getUser()]
    }

    for (const [name, value] of Object.entries(obj)) {
        if (skip.includes(name)) continue

        if (relations.includes(name)) {
            if (Array.isArray(value)) {
                copy[name] = {
                    connect: value.map(v =>
                        mediaFields.includes(name)
                            ? { id: v.id } // media requires numeric id
                            : { documentId: v.documentId }
                    )
                }
            } else if (value) {
                copy[name] = {
                    connect: [
                        mediaFields.includes(name)
                            ? { id: value.id }
                            : { documentId: value.documentId }
                    ]
                }
            } else {
                copy[name] = { connect: [] }
            }
        } else {
            copy[name] = value
        }
    }

    return copy
}


const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const PHONE_REGEX = /(\+?\d{1,3}[\s-]?)?\d{3,4}[\s-]?\d{6,7}/;

export function parseContactLine(input) {
    const text = input.trim();

    const emailMatch = text.match(EMAIL_REGEX);
    const phoneMatch = text.match(PHONE_REGEX);

    const email = emailMatch ? emailMatch[0] : '';
    const phone = phoneMatch ? phoneMatch[0].replace(/\s+/g, '') : '';

    // Remove detected email & phone to get name
    let name = text
        .replace(email, '')
        .replace(phoneMatch ? phoneMatch[0] : '', '')
        .replace(/\s+/g, ' ')
        .trim();

    return {
        name: name || '',
        email: email || '',
        phone: phone || ''
    };
}



const STOCK_LINE_PATTERNS = [
    // name price qty discount
    /^(?<name>[a-zA-Z\s]+)\s+(?<price>\d+(?:\.\d+)?)\s+(?<qty>\d+)\s+(?<discount>\d+)%?$/,

    // name price qty
    /^(?<name>[a-zA-Z\s]+)\s+(?<price>\d+(?:\.\d+)?)\s+(?<qty>\d+)$/,

    // name price
    /^(?<name>[a-zA-Z\s]+)\s+(?<price>\d+(?:\.\d+)?)$/,

    // name only
    /^(?<name>[a-zA-Z\s]+)$/
];

export function parseStockLine(input) {
    const text = input.trim();

    for (const regex of STOCK_LINE_PATTERNS) {
        const match = text.match(regex);
        if (!match) continue;

        const { name, price, qty, discount } = match.groups || {};

        return {
            name: name?.trim() ?? '',
            price: price ? Number(price) : 0,
            quantity: qty ? Number(qty) : 1,
            discount: discount ? Number(discount) : 0
        };
    }

    // No match at all
    return {
        name: '',
        price: 0,
        quantity: 1,
        discount: 0
    };
}