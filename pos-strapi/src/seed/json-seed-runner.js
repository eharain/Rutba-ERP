'use strict';

const fs = require('fs');
const path = require('path');

const SEED_DATA_DIR = path.join(__dirname, 'data');
const WORKSPACE_ROOT = path.join(__dirname, '..', '..', '..');
const SEED_DEBUG = false;
const MAX_REPORTED_ERRORS = 5;

function debugLog(strapi, message) {
    if (SEED_DEBUG) {
        strapi.log.info(message);
    }
}

function toErrorMessage(error) {
    if (!error) {
        return 'Unknown error';
    }

    if (typeof error.message === 'string' && error.message.trim()) {
        return error.message.trim();
    }

    return String(error);
}

function getMimeTypeFromFileName(fileName) {
    const ext = path.extname(fileName).toLowerCase();
    const mimeByExt = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
        '.avif': 'image/avif',
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
    };

    return mimeByExt[ext] || 'application/octet-stream';
}

function resolveSeedFilePath(seedPath) {
    if (!seedPath || typeof seedPath !== 'string') {
        throw new Error('Invalid $seedMedia.path.');
    }

    const trimmed = seedPath.trim();
    if (!trimmed) {
        throw new Error('Invalid $seedMedia.path: empty value.');
    }

    if (path.isAbsolute(trimmed)) {
        return trimmed;
    }

    const fromWorkspace = path.join(WORKSPACE_ROOT, trimmed);
    if (fs.existsSync(fromWorkspace)) {
        return fromWorkspace;
    }

    const fromSeedDir = path.join(SEED_DATA_DIR, trimmed);
    return fromSeedDir;
}

async function findExistingUploadedFile(strapi, fileName) {
    const existing = await strapi.db.query('plugin::upload.file').findMany({
        where: { name: fileName },
        orderBy: { id: 'desc' },
        limit: 1,
    });

    return existing?.[0] || null;
}

async function ensureSeedMediaFile(strapi, mediaDef, fileName) {
    if (!mediaDef || typeof mediaDef !== 'object') {
        throw new Error(`Invalid $seedMedia definition in ${fileName}.`);
    }

    const filePath = resolveSeedFilePath(mediaDef.path);
    if (!fs.existsSync(filePath)) {
        throw new Error(`[json-seed] Media file not found for ${fileName}: ${mediaDef.path}`);
    }

    const absolutePath = path.resolve(filePath);
    const baseName = path.basename(absolutePath);
    const existing = await findExistingUploadedFile(strapi, baseName);
    if (existing?.id) {
        return existing.id;
    }

    const stats = fs.statSync(absolutePath);
    const mimeType = getMimeTypeFromFileName(baseName);

    const uploadService = strapi.plugin('upload').service('upload');
    const uploaded = await uploadService.upload({
        data: {
            fileInfo: {
                name: mediaDef.name || baseName,
                alternativeText: mediaDef.alternativeText || mediaDef.name || baseName,
                caption: mediaDef.caption || '',
            },
        },
        files: {
            filepath: absolutePath,
            originalFilename: baseName,
            mimetype: mimeType,
            size: stats.size,
        },
    });

    if (!uploaded?.[0]?.id) {
        throw new Error(`[json-seed] Upload failed for media file ${mediaDef.path} in ${fileName}.`);
    }

    return uploaded[0].id;
}

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

function isSingleTypeUid(strapi, uid) {
    const model = strapi.contentType(uid);
    return model?.kind === 'singleType';
}

async function findExistingDocument(strapi, uid, locator) {
    if (isSingleTypeUid(strapi, uid)) {
        const single = await strapi.documents(uid).findFirst({
            status: 'draft',
            fields: ['id', 'documentId'],
        });
        return single || null;
    }

    if (locator.by === 'slug' || locator.by === 'documentId') {
        const filters = {
            [locator.by]: { $eq: locator.value },
        };

        const fields = ['id', 'documentId'];
        if (locator.by === 'slug') {
            fields.push('slug');
        }

        const existing = await strapi.documents(uid).findMany({
            filters,
            fields,
            pagination: { pageSize: 1 },
        });

        return existing?.[0] || null;
    }

    const existing = await strapi.db.query(uid).findMany({
        where: {
            [locator.by]: locator.value,
        },
        select: ['id', 'documentId', locator.by],
        limit: 1,
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

    if (!uid || !by || !value) {
        throw new Error(`Invalid $seedLink in ${fileName}. Required: uid, by, value.`);
    }

    let target;

    if (by === 'slug' || by === 'documentId') {
        const filters = {
            [by]: { $eq: value },
        };

        const fields = ['id', 'documentId'];
        if (by === 'slug') {
            fields.push('slug');
        }

        target = await strapi.documents(uid).findMany({
            filters,
            fields,
            pagination: { pageSize: 1 },
        });
    } else {
        target = await strapi.db.query(uid).findMany({
            where: {
                [by]: value,
            },
            select: ['id', 'documentId', by],
            limit: 1,
        });
    }

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

    if (Object.prototype.hasOwnProperty.call(value, '$seedMedia')) {
        return ensureSeedMediaFile(strapi, value.$seedMedia, fileName);
    }

    const resolvedObject = {};
    const keys = Object.keys(value);

    for (const key of keys) {
        resolvedObject[key] = await resolveSeedLinksInValue(strapi, value[key], fileName);
    }

    return resolvedObject;
}

async function applyRecord(strapi, uid, record, fileName) {
    const isSingleType = isSingleTypeUid(strapi, uid);
    const locator = isSingleType
        ? { by: 'singleType', value: 'singleton' }
        : getRecordLocator(record);
    const policy = getRecordPolicy(record);
    const data = await resolveSeedLinksInValue(strapi, getRecordData(record), fileName);
    const existing = await findExistingDocument(strapi, uid, locator);

    if (!existing) {
        await strapi.documents(uid).create({ data });
        debugLog(strapi, `[json-seed] Created ${uid} from ${fileName} (${locator.by}: ${locator.value})`);
        return 'created';
    }

    if (!policy.revertOnSeed && policy.editable) {
        debugLog(strapi, `[json-seed] Kept existing ${uid} from ${fileName} (${locator.by}: ${locator.value}) because editable=true and revertOnSeed=false`);
        return 'kept';
    }

    await strapi.documents(uid).update({
        documentId: existing.documentId,
        data,
    });

    debugLog(strapi, `[json-seed] Updated ${uid} from ${fileName} (${locator.by}: ${locator.value})`);
    return 'updated';
}

async function runJsonSeeds(strapi) {
    const files = listSeedFiles();

    if (files.length === 0) {
        strapi.log.info('[json-seed] No seed JSON files found.');
        return;
    }

    strapi.log.info(`[json-seed] Loading ${files.length} seed file(s) from src/seed/data`);

    const report = {
        filesTotal: files.length,
        filesProcessed: 0,
        filesSkipped: 0,
        recordsTotal: 0,
        created: 0,
        updated: 0,
        kept: 0,
        failed: 0,
        errors: [],
    };

    for (const fileName of files) {
        try {
            const seedFile = parseSeedFile(fileName);
            if (!seedFile.enabled) {
                report.filesSkipped += 1;
                debugLog(strapi, `[json-seed] Skipped disabled seed file ${fileName}`);
                continue;
            }

            report.filesProcessed += 1;

            for (const record of seedFile.records) {
                report.recordsTotal += 1;

                try {
                    const result = await applyRecord(strapi, seedFile.uid, record, fileName);
                    if (result === 'created') {
                        report.created += 1;
                    } else if (result === 'updated') {
                        report.updated += 1;
                    } else if (result === 'kept') {
                        report.kept += 1;
                    }
                } catch (error) {
                    report.failed += 1;
                    report.errors.push(`${fileName}: ${toErrorMessage(error)}`);

                    if (SEED_DEBUG) {
                        strapi.log.error(`[json-seed][debug] Record failed in ${fileName}: ${toErrorMessage(error)}`);
                    }
                }
            }
        } catch (error) {
            report.failed += 1;
            report.errors.push(`${fileName}: ${toErrorMessage(error)}`);

            if (SEED_DEBUG) {
                strapi.log.error(`[json-seed][debug] Seed file failed ${fileName}: ${toErrorMessage(error)}`);
            }
        }
    }

    strapi.log.info(
        `[json-seed] Complete. files=${report.filesProcessed}/${report.filesTotal}, records=${report.recordsTotal}, created=${report.created}, updated=${report.updated}, kept=${report.kept}, failed=${report.failed}`
    );

    if (report.errors.length > 0) {
        const shown = report.errors.slice(0, MAX_REPORTED_ERRORS);

        for (const err of shown) {
            strapi.log.error(`[json-seed] ${err}`);
        }

        if (report.errors.length > shown.length) {
            strapi.log.error(`[json-seed] ...and ${report.errors.length - shown.length} more error(s).`);
        }

        throw new Error(
            `[json-seed] Seeding finished with ${report.errors.length} error(s). Set SEED_DEBUG=true in json-seed-runner.js for detailed logs.`
        );
    }
}

module.exports = runJsonSeeds;
