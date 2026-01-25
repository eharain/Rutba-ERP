
import axios from "axios";
import { storage } from "./storage";
import qs from 'qs';


const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:1337/api";

export const IMAGE_URL = API_URL.substring(0, API_URL.length - 4)

// ------------------ Base Helper ------------------
function authHeaders(jwt) {
    return jwt ? { Authorization: `Bearer ${jwt}` } : {};
}

async function get(path, data = {}, jwt) {
    const res = await axios.get(querify(`${API_URL}${path}`, data), {
        data,
        headers: { ...authHeaders(jwt) },
    });
    return res.data; // Strapi returns { data, meta }
}

async function getWithPagination(path, data = {}, jwt) {
    const res = await axios.get(querify(`${API_URL}${path}`, data), {
        data,
        headers: { ...authHeaders(jwt) },
    });
    return { data: res.data.data, meta: res.data.meta };
}

async function post(path, data, jwt) {
    const res = await axios.post(`${API_URL}${path}`, data, {
        headers: { "Content-Type": "application/json", ...authHeaders(jwt) },
    });
    return res.data;
}

async function put(path, data, jwt) {
    const res = await axios.put(`${API_URL}${path}`, data, {
        headers: { "Content-Type": "application/json", ...authHeaders(jwt) },
    });
    return res.data;
}

async function del(path, jwt) {
    const res = await axios.delete(`${API_URL}${path}`, {
        headers: { ...authHeaders(jwt) },
    });
    return res.data;
}


async function uploadFile(files, ref, field, refId, { name, alt, caption }, jwt) {
    const form = new FormData();
    if (Array.isArray(files)) {
        for (const file of files) {
            form.append('files', file);
        }
    } else {
        form.append('files', files);
    }

    if (ref) {
        form.append('ref', `api::${ref}.${ref}`);
    }

    if (field) {
        form.append('field', field);
    }
    if (refId) {
        form.append('refId', refId);
    }

    if (name || alt || caption) {
        // optional metadata
        let finfor = {
            name,
            alternativeText: alt,
            caption: caption,
        }

        if (Array.isArray(files)) {
            finfor = files.map((f,i) => {
                return {
                    name:(name??"") + i,
                    alternativeText: alt,
                    caption: caption,
                }
            });
        }
        form.append('fileInfo', JSON.stringify(finfor));

    }
    const res = await axios.post(`${API_URL}/upload`, form, {
        headers: { 'Content-Type': 'multipart/form-data', ...authHeaders(jwt) },
    });

    const data = res.data;


    if (Array.isArray(data)) {
        data.filter(d => (d.url ?? "").startsWith('/')).forEach(d => d.url = StraipImageUrl(d.url))
    } else {
        data.url = StraipImageUrl(data.url);
    }

    return data;
}
async function deleteFile(fileId, jwt) {
    const res = await axios.delete(`${API_URL}upload/files/${fileId}`, {
        headers: { 'Content-Type': 'multipart/form-data', ...authHeaders(jwt) },
    });
    // Strapi v5 DELETE returns 204 No Content on success
    console.log('Delete file status:', res.status); // 204
    return res.status === 204;
}
export function StraipImageUrl(url) {
    return (url ?? "").startsWith('/') ? IMAGE_URL + url : url;
}

// ------------------ Public API (no auth) ------------------
export const api = {
    fetch: async (path, params) => await get(path, params),
    get: async (path) => await get(path),
    post: async (path, data) => await post(path, data),
    put: async (path, data) => await get(path, data),
    del: async (path) => await del(path),
    uploadFile: async (file, ref, field, refId) => await uploadFile(file, ref, field, refId),
};

// ------------------ Auth API (uses localStorage JWT) ------------------
export const authApi = {
    fetch: async (path, data) => await get(path, data, storage.getItem("jwt")),
    fetchWithPagination: async (path, data) => await getWithPagination(path, data, storage.getItem("jwt")),
    get: async (path, data) => await get(path, data, storage.getItem("jwt")),
    post: async (path, data) => await post(path, data, storage.getItem("jwt")),
    put: async (path, data) => await put(path, data, storage.getItem("jwt")),
    del: async (path) => await del(path, storage.getItem("jwt")),
    uploadFile: async (file, ref, field, refId, info) => await uploadFile(file, ref, field, refId, info, storage.getItem("jwt")),
    deleteFile: async (fileId) => await deleteFile(fileId, storage.getItem("jwt")),
};



export const authAPI = authApi;

export function querify(u, data) {
    if (typeof data == "object" && Object.keys(data).length > 0) {
        return u + '?' + qs.stringify(data, { encodeValuesOnly: true });
    }
    return u;
}

export async function getStockStatus() {
    return [
        "Received",     // Newly received, not yet available for sale
        "InStock",      // Available for sale
        "Reserved",     // Held for a customer/order but not yet sold
        "Sold",         // Already sold
        "Returned",     // Returned by customer and added back
        "ReturnedDamaged", // Returned but damaged",
        "ReturnedToSupplier", // Returned back to supplier
        "Damaged",      // Not sellable due to damage
        "Lost",         // Missing in inventory
        "Expired",      // Expired product (if applicable)
        "Transferred"   // Moved to another branch/warehouse
    ].reduce((pre, status) => {
        pre[status] = status;
        pre.statuses.push(status);
        return pre;
    }, { statuses: [] });

}