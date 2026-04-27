'use strict';

const fs = require('fs');
const path = require('path');

const SEED_DATA_DIR = path.join(__dirname, 'data');

function listSeedFiles() {
    if (!fs.existsSync(SEED_DATA_DIR)) {
        return [];
    }

    return fs
        .readdirSync(SEED_DATA_DIR)
        .filter((fileName) => fileName.toLowerCase().endsWith('.json'))
        .sort();
}

function parseSeedFile(fileName) {
    const fullPath = path.join(SEED_DATA_DIR, fileName);
    const raw = fs.readFileSync(fullPath, 'utf8');
    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== 'object') {
        throw new Error(`Seed file "${fileName}" must be a JSON object.`);
    }

    if (!parsed.uid || typeof parsed.uid !== 'string') {
        throw new Error(`Seed file "${fileName}" is missing required string field "uid".`);
    }

    if (!Array.isArray(parsed.records)) {
        throw new Error(`Seed file "${fileName}" is missing required array field "records".`);
    }

    return {
        uid: parsed.uid,
        records: parsed.records,
        enabled: parsed.enabled !== false,
        fileName,
    };
}

function getRecordLocator(record) {
    const locate = record?.locate || {};
    const by = typeof locate.by === 'string' ? locate.by.trim() : '';
    const value = locate.value;

    if (!by) {
        throw new Error('Each seed record must define locate.by.');
    }

    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) {
            throw new Error('Each seed record must define a non-empty locate.value.');
        }
        return { by, value: trimmed };
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
        return { by, value };
    }

    throw new Error('Each seed record must define a valid locate.value (string | number | boolean).');
}

async function findExistingDocument(strapi, uid, locator) {
    const filters = {
        [locator.by]: { $eq: locator.value },
    };

    const existing = await strapi.documents(uid).findMany({
        filters,
        fields: ['id', 'documentId', 'slug'],
        pagination: { pageSize: 1 },
    });

    return existing?.[0] || null;
}

function getRecordData(record) {
    if (!record || typeof record !== 'object' || !record.data || typeof record.data !== 'object') {
        throw new Error('Each seed record must include a "data" object.');
    }

    return record.data;
}

function getRecordPolicy(record) {
    const policy = record?.policy || {};
    const editable = typeof policy.editable === 'boolean' ? policy.editable : false;
    const revertOnSeed = typeof policy.revertOnSeed === 'boolean' ? policy.revertOnSeed : !editable;

    return {
        editable,
        revertOnSeed,
    };
}

async function resolveSeedLink(strapi, link, fileName) {
    if (!link || typeof link !== 'object') {
        throw new Error('Invalid $seedLink definition.');
    }

    const uid = typeof link.uid === 'string' ? link.uid.trim() : '';
    const by = typeof link.by === 'string' ? link.by.trim() : '';
    const value = typeof link.value === 'string' ? link.value.trim() : '';
    const returnMode = typeof link.return === 'string' ? link.return.trim() : 'documentRef';

    if (!uid || (by !== 'slug' && by !== 'documentId') || !value) {
        throw new Error(`Invalid $seedLink in ${fileName}. Required: uid, by("slug"|"documentId"), value.`);
    }

    const filters = by === 'documentId'
        ? { documentId: { $eq: value } }
        : { slug: { $eq: value } };

    const target = await strapi.documents(uid).findMany({
        filters,
        fields: ['id', 'documentId', 'slug'],
        pagination: { pageSize: 1 },
    });

    if (!target?.[0]) {
        strapi.log.warn(`[json-seed] Missing relation target for ${uid} (${by}: ${value}) in ${fileName}`);
        return null;
    }

    const found = target[0];

    if (returnMode === 'id') {
        return found.id;
    }

    if (returnMode === 'documentId') {
        return found.documentId;
    }

    return { documentId: found.documentId };
}

async function resolveSeedLinksInValue(strapi, value, fileName) {
    if (Array.isArray(value)) {
        const resolvedItems = [];
        for (const item of value) {
            const resolvedItem = await resolveSeedLinksInValue(strapi, item, fileName);
            if (resolvedItem !== null && typeof resolvedItem !== 'undefined') {
                resolvedItems.push(resolvedItem);
            }
        }
        return resolvedItems;
    }

    if (!value || typeof value !== 'object') {
        return value;
    }

    if (Object.prototype.hasOwnProperty.call(value, '$seedLink')) {
        return resolveSeedLink(strapi, value.$seedLink, fileName);
    }

    const resolvedObject = {};
    const keys = Object.keys(value);

    for (const key of keys) {
        resolvedObject[key] = await resolveSeedLinksInValue(strapi, value[key], fileName);
    }

    return resolvedObject;
}

async function applyRecord(strapi, uid, record, fileName) {
    const locator = getRecordLocator(record);
    const policy = getRecordPolicy(record);
    const data = await resolveSeedLinksInValue(strapi, getRecordData(record), fileName);
    const existing = await findExistingDocument(strapi, uid, locator);

    if (!existing) {
        await strapi.documents(uid).create({ data });
        strapi.log.info(`[json-seed] Created ${uid} from ${fileName} (${locator.by}: ${locator.value})`);
        return;
    }

    if (!policy.revertOnSeed && policy.editable) {
        strapi.log.info(`[json-seed] Kept existing ${uid} from ${fileName} (${locator.by}: ${locator.value}) because editable=true and revertOnSeed=false`);
        return;
    }

    await strapi.documents(uid).update({
        documentId: existing.documentId,
        data,
    });

    strapi.log.info(`[json-seed] Updated ${uid} from ${fileName} (${locator.by}: ${locator.value})`);
}

async function runJsonSeeds(strapi) {
    const files = listSeedFiles();

    if (files.length === 0) {
        strapi.log.info('[json-seed] No seed JSON files found.');
        return;
    }

    strapi.log.info(`[json-seed] Loading ${files.length} seed file(s) from src/seed/data`);

    for (const fileName of files) {
        const seedFile = parseSeedFile(fileName);
        if (!seedFile.enabled) {
            strapi.log.info(`[json-seed] Skipped disabled seed file ${fileName}`);
            continue;
        }

        for (const record of seedFile.records) {
            await applyRecord(strapi, seedFile.uid, record, fileName);
        }
    }

    strapi.log.info('[json-seed] Complete.');
}

module.exports = runJsonSeeds;
