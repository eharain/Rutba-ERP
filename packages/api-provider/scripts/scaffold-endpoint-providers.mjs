import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..');
const endpointsDir = path.join(packageRoot, 'endpoints');
const apiDir = path.join(packageRoot, 'api');
const providersGeneratedDir = path.join(packageRoot, 'providers', 'generated', 'client');
const legacyProvidersGeneratedDir = path.join(packageRoot, 'providers', 'generated');
const coreTemplatePath = path.join(__dirname, 'scaffold__core__.js');
const coreOutputPath = path.join(providersGeneratedDir, '___core__.js');

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getDirectoriesRecursive(rootDir) {
    const dirs = [rootDir];
    const entries = fs.readdirSync(rootDir, { withFileTypes: true });
    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        dirs.push(...getDirectoriesRecursive(path.join(rootDir, entry.name)));
    }
    return dirs;
}

function scaffoldDirectoryIndexes(rootDir) {
    const directories = getDirectoriesRecursive(rootDir)
        .sort((a, b) => b.length - a.length);

    for (const dir of directories) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        const jsFiles = entries
            .filter((entry) => entry.isFile())
            .map((entry) => entry.name)
            .filter((name) => name.endsWith('.js') && name !== 'index.js')
            .filter((name) => name !== '__client_core__.js')
            .sort((a, b) => a.localeCompare(b));

        const dtsFiles = entries
            .filter((entry) => entry.isFile())
            .map((entry) => entry.name)
            .filter((name) => name.endsWith('.d.ts') && name !== 'index.d.ts')
            .sort((a, b) => a.localeCompare(b));

        const subDirs = entries
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
            .sort((a, b) => a.localeCompare(b));

        const fileExports = jsFiles.map((name) => `export * from './${name}';`);
        const dirExports = subDirs.map((name) => `export * from './${name}/index.js';`);
        const jsLines = [...fileExports, ...dirExports];
        const indexJsPath = path.join(dir, 'index.js');

        if (jsLines.length === 0) {
            if (fs.existsSync(indexJsPath)) {
                fs.unlinkSync(indexJsPath);
            }
        } else {
            fs.writeFileSync(indexJsPath, `${jsLines.join('\n')}\n`, 'utf8');
        }

        const dtsFileExports = dtsFiles.map((name) => `export * from './${name.replace(/\.d\.ts$/, '')}';`);
        const dtsDirExports = subDirs
            .filter((name) => fs.existsSync(path.join(dir, name, 'index.d.ts')))
            .map((name) => `export * from './${name}';`);
        const dtsLines = [...dtsFileExports, ...dtsDirExports];
        const indexDtsPath = path.join(dir, 'index.d.ts');

        if (dtsLines.length === 0) {
            if (fs.existsSync(indexDtsPath)) {
                fs.unlinkSync(indexDtsPath);
            }
            continue;
        }

        fs.writeFileSync(
            indexDtsPath,
            `// AUTO-GENERATED — do not edit.\n${dtsLines.join('\n')}\n`,
            'utf8',
        );
    }
}

function toImportPath(fromDir, targetFileAbs) {
    const rel = path.relative(fromDir, targetFileAbs).replace(/\\/g, '/');
    return rel.startsWith('.') ? rel : `./${rel}`;
}

function getApiFilesRecursive(dir, base = dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...getApiFilesRecursive(fullPath, base));
            continue;
        }
        if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
        files.push(path.relative(base, fullPath).replace(/\\/g, '/'));
    }

    return files.sort((a, b) => a.localeCompare(b));
}

function getExportedConstObjectNames(source) {
    const regex = /export\s+const\s+([A-Za-z_$][\w$]*)\s*=\s*\{/g;
    const names = [];
    let match;
    while ((match = regex.exec(source)) !== null) {
        names.push(match[1]);
    }
    return names;
}

function parseLegacyEndpointFile(source) {
    const lines = source.split(/\r?\n/);

    let clientImportIndex = -1;
    let clientName = null;
    let authImportIndex = -1;
    let proxyImportIndex = -1;
    let apiImportIndex = -1;
    let apiExportName = null;
    let apiAliasName = null;
    let apiImportPath = null;

    let constEndpointsIndex = -1;
    let exportDefaultIndex = -1;
    let exportConstIndex = -1;
    let endpointExportName = null;

    const apiImportRegex = /^import\s*\{\s*([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)\s*\}\s*from\s*['"](\.\.\/api\/[^'"]+)['"];?\s*$/;

    lines.forEach((line, idx) => {
        const trimmed = line.trim();

        const clientImportMatch = trimmed.match(/^import\s*\{\s*(authApi|api)\s*\}\s*from\s*['"]\.\.\/lib\/api\.js['"];?\s*$/);
        if (clientImportMatch) {
            clientImportIndex = idx;
            clientName = clientImportMatch[1];
        }

        if (trimmed === "import { authApi } from '../lib/api.js';") {
            authImportIndex = idx;
            return;
        }

        if (trimmed === "import { createClientProxy } from '../providers/createClientProxy.js';") {
            proxyImportIndex = idx;
            return;
        }

        const apiMatch = trimmed.match(apiImportRegex);
        if (apiMatch) {
            apiImportIndex = idx;
            apiExportName = apiMatch[1];
            apiAliasName = apiMatch[2];
            apiImportPath = apiMatch[3];
            return;
        }

        if (apiAliasName) {
            const constRegex = new RegExp(`^const\\s+endpoints\\s*=\\s*createClientProxy\\(\\s*${escapeRegExp(apiAliasName)}\\s*,\\s*(authApi|api)\\s*\\);\\s*$`);
            if (constRegex.test(trimmed)) {
                constEndpointsIndex = idx;
                return;
            }
        }

        if (/^export\s+default\s+endpoints\s*;\s*$/.test(trimmed)) {
            exportDefaultIndex = idx;
            return;
        }

        const exportConstMatch = trimmed.match(/^export\s+const\s+([A-Za-z_$][\w$]*)\s*=\s*endpoints\s*;\s*$/);
        if (exportConstMatch) {
            exportConstIndex = idx;
            endpointExportName = exportConstMatch[1];
        }
    });

    const hasCorePrelude = [
        clientImportIndex,
        proxyImportIndex,
        apiImportIndex,
        constEndpointsIndex,
        exportDefaultIndex,
        exportConstIndex,
    ].every((v) => v >= 0);

    if (!hasCorePrelude) {
        return null;
    }

    return {
        lines,
        apiExportName,
        apiAliasName,
        apiImportPath,
        clientName: clientName ?? (authImportIndex >= 0 ? 'authApi' : 'authApi'),
        endpointExportName,
        indexesToRemove: new Set([
            clientImportIndex,
            proxyImportIndex,
            apiImportIndex,
            constEndpointsIndex,
            exportDefaultIndex,
            exportConstIndex,
        ]),
    };
}

function parseMigratedEndpointFile(source, fileName) {
    const lines = source.split(/\r?\n/);

    let endpointExportName = null;
    const providerImportRegex = new RegExp(`^import\\s+endpoints\\s*,\\s*\\{\\s*([A-Za-z_$][\\w$]*)\\s*\\}\\s*from\\s*['\"]\\.\\.\\/providers\\/generated(?:\\/client)?\\/${escapeRegExp(fileName)}['\"];?\\s*$`);

    for (const line of lines) {
        const trimmed = line.trim();
        const importMatch = trimmed.match(providerImportRegex);
        if (importMatch) {
            endpointExportName = importMatch[1];
            break;
        }
    }

    if (!endpointExportName) {
        return null;
    }

    return { endpointExportName };
}

function parseExistingProviderFile(fileName) {
    const providerPath = fs.existsSync(path.join(providersGeneratedDir, fileName))
        ? path.join(providersGeneratedDir, fileName)
        : path.join(legacyProvidersGeneratedDir, fileName);

    if (!fs.existsSync(providerPath)) {
        return null;
    }

    const source = fs.readFileSync(providerPath, 'utf8');
    const lines = source.split(/\r?\n/);

    let clientName = null;
    let apiExportName = null;
    let apiAliasName = null;
    let apiImportPath = null;

    const clientImportRegex = /^import\s*\{\s*(authApi|api)\s*\}\s*from\s*['"](?:\.\.\/)+lib\/api\.js['"];?\s*$/;
    const apiImportRegex = /^import\s*\{\s*([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)\s*\}\s*from\s*['"]((?:\.\.\/)+api\/[^'"]+)['"];?\s*$/;

    for (const line of lines) {
        const trimmed = line.trim();

        const clientMatch = trimmed.match(clientImportRegex);
        if (clientMatch) {
            clientName = clientMatch[1];
            continue;
        }

        const apiMatch = trimmed.match(apiImportRegex);
        if (apiMatch) {
            apiExportName = apiMatch[1];
            apiAliasName = apiMatch[2];
            apiImportPath = apiMatch[3];
        }
    }

    if (!apiExportName || !apiAliasName || !apiImportPath) {
        return null;
    }

    return {
        clientName: clientName ?? 'authApi',
        apiExportName,
        apiAliasName,
        apiImportPath,
    };
}

function normalizeSpacing(content) {
    return `${content.replace(/\n{3,}/g, '\n\n').replace(/\s+$/g, '')}\n`;
}

function isValidIdentifier(name) {
    return /^[A-Za-z_$][\w$]*$/.test(name);
}

function toApiMemberReference(aliasName, key) {
    return isValidIdentifier(key)
        ? `${aliasName}.${key}`
        : `${aliasName}[${JSON.stringify(key)}]`;
}

function toApiRelativePath(parsed) {
    return parsed.apiImportPath.replace(/^((\.\.\/)+)api\//, 'api/');
}

function readExportedObjectLiteral(source, exportName) {
    const marker = `export const ${exportName} =`;
    const markerIndex = source.indexOf(marker);
    if (markerIndex < 0) return null;

    const openIndex = source.indexOf('{', markerIndex + marker.length);
    if (openIndex < 0) return null;

    let depth = 0;
    let inSingle = false;
    let inDouble = false;
    let inTemplate = false;
    let inLineComment = false;
    let inBlockComment = false;
    let escaped = false;

    for (let i = openIndex; i < source.length; i += 1) {
        const ch = source[i];
        const next = source[i + 1];

        if (inLineComment) {
            if (ch === '\n') inLineComment = false;
            continue;
        }
        if (inBlockComment) {
            if (ch === '*' && next === '/') {
                inBlockComment = false;
                i += 1;
            }
            continue;
        }
        if ((inSingle || inDouble || inTemplate) && ch === '\\' && !escaped) {
            escaped = true;
            continue;
        }

        if (inSingle && ch === "'" && !escaped) inSingle = false;
        else if (inDouble && ch === '"' && !escaped) inDouble = false;
        else if (inTemplate && ch === '`' && !escaped) inTemplate = false;
        else if (!inSingle && !inDouble && !inTemplate) {
            if (ch === '/' && next === '/') { inLineComment = true; i += 1; continue; }
            if (ch === '/' && next === '*') { inBlockComment = true; i += 1; continue; }
            if (ch === "'") inSingle = true;
            else if (ch === '"') inDouble = true;
            else if (ch === '`') inTemplate = true;
            else if (ch === '{') depth += 1;
            else if (ch === '}') {
                depth -= 1;
                if (depth === 0) {
                    return source.slice(openIndex + 1, i);
                }
            }
        }

        escaped = false;
    }

    return null;
}

function splitTopLevelProperties(objectBody) {
    const parts = [];
    let token = '';
    let curlies = 0;
    let brackets = 0;
    let parens = 0;
    let inSingle = false;
    let inDouble = false;
    let inTemplate = false;
    let inLineComment = false;
    let inBlockComment = false;
    let escaped = false;

    for (let i = 0; i < objectBody.length; i += 1) {
        const ch = objectBody[i];
        const next = objectBody[i + 1];

        if (inLineComment) {
            token += ch;
            if (ch === '\n') inLineComment = false;
            continue;
        }
        if (inBlockComment) {
            token += ch;
            if (ch === '*' && next === '/') {
                token += next;
                i += 1;
                inBlockComment = false;
            }
            continue;
        }
        if ((inSingle || inDouble || inTemplate) && ch === '\\' && !escaped) {
            token += ch;
            escaped = true;
            continue;
        }

        if (!inSingle && !inDouble && !inTemplate) {
            if (ch === '/' && next === '/') {
                inLineComment = true;
                token += ch;
                continue;
            }
            if (ch === '/' && next === '*') {
                inBlockComment = true;
                token += ch;
                continue;
            }
            if (ch === '{') curlies += 1;
            else if (ch === '}') curlies -= 1;
            else if (ch === '[') brackets += 1;
            else if (ch === ']') brackets -= 1;
            else if (ch === '(') parens += 1;
            else if (ch === ')') parens -= 1;

            if (ch === ',' && curlies === 0 && brackets === 0 && parens === 0) {
                if (token.trim()) parts.push(token.trim());
                token = '';
                escaped = false;
                continue;
            }
        }

        if (ch === "'" && !inDouble && !inTemplate && !escaped) inSingle = !inSingle;
        else if (ch === '"' && !inSingle && !inTemplate && !escaped) inDouble = !inDouble;
        else if (ch === '`' && !inSingle && !inDouble && !escaped) inTemplate = !inTemplate;

        token += ch;
        escaped = false;
    }

    if (token.trim()) parts.push(token.trim());
    return parts;
}

/**
 * Strip leading whitespace + JS comments (line or block, possibly multiple)
 * from the head of a string. Returns the remaining content unchanged.
 */
function stripLeadingComments(input) {
    let s = input;
    while (true) {
        const trimmed = s.replace(/^\s+/, '');
        if (trimmed.startsWith('//')) {
            const nl = trimmed.indexOf('\n');
            s = nl < 0 ? '' : trimmed.slice(nl + 1);
            continue;
        }
        if (trimmed.startsWith('/*')) {
            const end = trimmed.indexOf('*/');
            s = end < 0 ? '' : trimmed.slice(end + 2);
            continue;
        }
        return trimmed;
    }
}

function extractParenContent(source, openIndex) {
    if (source[openIndex] !== '(') return null;
    let depth = 0;
    let inSingle = false;
    let inDouble = false;
    let inTemplate = false;
    let escaped = false;

    for (let i = openIndex; i < source.length; i += 1) {
        const ch = source[i];

        if (escaped) {
            escaped = false;
            continue;
        }
        if (inSingle || inDouble || inTemplate) {
            if (ch === '\\') { escaped = true; continue; }
            if (inSingle && ch === "'") inSingle = false;
            else if (inDouble && ch === '"') inDouble = false;
            else if (inTemplate && ch === '`') inTemplate = false;
            continue;
        }

        if (ch === "'") inSingle = true;
        else if (ch === '"') inDouble = true;
        else if (ch === '`') inTemplate = true;
        else if (ch === '(') depth += 1;
        else if (ch === ')') {
            depth -= 1;
            if (depth === 0) return source.slice(openIndex + 1, i);
        }
    }

    return null;
}

function extractParamsFromValue(valuePart) {
    let trimmed = valuePart.replace(/^async\s+/, '').trimStart();

    if (trimmed.startsWith('function')) {
        trimmed = trimmed.replace(/^function\s*(?:[A-Za-z_$][\w$]*)?\s*/, '');
    }

    if (trimmed.startsWith('(')) {
        return extractParenContent(trimmed, 0) ?? '';
    }

    const singleArrowMatch = trimmed.match(/^([A-Za-z_$][\w$]*)\s*=>/);
    if (singleArrowMatch) return singleArrowMatch[1];

    return '';
}

function extractExplicitMethod(propBody) {
    // Look for a literal `method: 'xxx'` (or "xxx" / `xxx`) anywhere inside the
    // descriptor body. The body is small and already comment-stripped at the
    // top, but in-body comments are rare enough that a plain regex is fine.
    const m = propBody.match(/\bmethod\s*:\s*['"`]([A-Za-z]+)['"`]/);
    return m ? m[1].toLowerCase() : null;
}

function parseTopLevelProperty(part) {
    const prop = stripLeadingComments(part).trim();
    if (!prop) return null;

    const methodMatch = prop.match(/^([A-Za-z_$][\w$]*)\s*\(/);
    if (methodMatch) {
        const openIndex = prop.indexOf('(');
        const params = openIndex >= 0 ? (extractParenContent(prop, openIndex) ?? '') : '';
        return { key: methodMatch[1], isFunction: true, params, method: extractExplicitMethod(prop) };
    }

    const quotedKeyMatch = prop.match(/^(?:'([^']+)'|"([^"]+)"|`([^`]+)`|([A-Za-z_$][\w$]*))\s*:/);
    if (!quotedKeyMatch) return null;

    const key = quotedKeyMatch[1] ?? quotedKeyMatch[2] ?? quotedKeyMatch[3] ?? quotedKeyMatch[4];
    const valuePart = prop.slice(quotedKeyMatch[0].length).trim();
    const isFunction = /^(async\s+)?\(/.test(valuePart)
        || /^(async\s+)?[A-Za-z_$][\w$]*\s*=>/.test(valuePart)
        || /^function\b/.test(valuePart)
        || /^async\s+function\b/.test(valuePart);

    const params = isFunction ? extractParamsFromValue(valuePart) : '';
    const method = isFunction ? extractExplicitMethod(valuePart) : null;

    return { key, isFunction, params, method };
}

function splitParamList(paramsRaw) {
    const trimmed = paramsRaw.trim();
    if (!trimmed) return [];
    return splitTopLevelProperties(trimmed)
        .map((p) => p.trim())
        .filter(Boolean);
}

function splitParamAtTopLevelEquals(paramRaw) {
    let depth = 0;
    let inSingle = false;
    let inDouble = false;
    let inTemplate = false;
    let escaped = false;

    for (let i = 0; i < paramRaw.length; i += 1) {
        const ch = paramRaw[i];

        if (escaped) { escaped = false; continue; }
        if (inSingle || inDouble || inTemplate) {
            if (ch === '\\') { escaped = true; continue; }
            if (inSingle && ch === "'") inSingle = false;
            else if (inDouble && ch === '"') inDouble = false;
            else if (inTemplate && ch === '`') inTemplate = false;
            continue;
        }

        if (ch === "'") inSingle = true;
        else if (ch === '"') inDouble = true;
        else if (ch === '`') inTemplate = true;
        else if (ch === '{' || ch === '[' || ch === '(') depth += 1;
        else if (ch === '}' || ch === ']' || ch === ')') depth -= 1;
        else if (ch === '=' && depth === 0) {
            return { name: paramRaw.slice(0, i).trim(), hasDefault: true };
        }
    }

    return { name: paramRaw.trim(), hasDefault: false };
}

function toDtsParam(paramRaw) {
    const { name, hasDefault } = splitParamAtTopLevelEquals(paramRaw);
    if (!name) return '';
    if (name.startsWith('...')) return `${name}: any[]`;
    return `${name}${hasDefault ? '?' : ''}: any`;
}

function buildDtsParamList(paramsRaw) {
    return splitParamList(paramsRaw)
        .map(toDtsParam)
        .filter(Boolean)
        .join(', ');
}

/**
 * Spread-helper expansions. The /api descriptors import these helpers from
 * `__publish_generic_helper.js` and use them via object spread:
 *
 *     ...__publish_generic_helper('cms-pages'),
 *
 * The static parser cannot resolve the spread at runtime, so we hard-code the
 * helper shapes here. Keep this in sync with `api/__publish_generic_helper.js`.
 */
const SPREAD_HELPER_SHAPES = {
    __publish_generic_helper: [
        { key: 'updateDraft', isFunction: true, params: 'documentId, data', method: 'put' },
        { key: 'publish', isFunction: true, params: 'documentId', method: 'post' },
        { key: 'unpublish', isFunction: true, params: 'documentId', method: 'post' },
        { key: 'create', isFunction: true, params: 'data', method: 'post' },
        { key: 'del', isFunction: true, params: 'documentId', method: 'delete' },
    ],
    publishMethods: [
        { key: 'updateDraft', isFunction: true, params: 'documentId, data', method: 'put' },
        { key: 'publish', isFunction: true, params: 'documentId', method: 'post' },
        { key: 'unpublish', isFunction: true, params: 'documentId', method: 'post' },
    ],
    standard: [
        { key: 'create', isFunction: true, params: 'data', method: 'post' },
        { key: 'del', isFunction: true, params: 'documentId', method: 'delete' },
    ],
};

function parseSpreadHelper(part) {
    const trimmed = stripLeadingComments(part).trim();
    if (!trimmed.startsWith('...')) return null;

    const afterSpread = trimmed.slice(3).trimStart();
    const helperMatch = afterSpread.match(/^([A-Za-z_$][\w$]*)\s*\(/);
    if (!helperMatch) return null;

    const helperName = helperMatch[1];
    const shape = SPREAD_HELPER_SHAPES[helperName];
    if (!shape) return null;

    return shape.map((entry) => ({ ...entry }));
}

function loadApiShape(apiRelativePath, exportName) {
    const apiPath = path.join(packageRoot, apiRelativePath.replace(/\\/g, '/'));
    const source = fs.readFileSync(apiPath, 'utf8');
    const objectBody = readExportedObjectLiteral(source, exportName);

    if (!objectBody) {
        throw new Error(`Unable to parse API export ${exportName} from ${apiRelativePath}`);
    }

    const parts = splitTopLevelProperties(objectBody);
    const properties = [];
    const seenKeys = new Set();

    for (const part of parts) {
        const spreadShape = parseSpreadHelper(part);
        if (spreadShape) {
            for (const entry of spreadShape) {
                if (!seenKeys.has(entry.key)) {
                    properties.push(entry);
                    seenKeys.add(entry.key);
                }
            }
            continue;
        }

        const parsed = parseTopLevelProperty(part);
        if (!parsed) continue;
        if (seenKeys.has(parsed.key)) continue;
        properties.push(parsed);
        seenKeys.add(parsed.key);
    }

    if (properties.length === 0) {
        throw new Error(`No properties found for API export ${exportName} in ${apiRelativePath}`);
    }

    return properties;
}

function resolveHttpVerb(key, explicitMethod) {
    if (explicitMethod) return String(explicitMethod).toUpperCase();
    if (key.startsWith('post')) return 'POST';
    if (key.startsWith('put')) return 'PUT';
    if (key.startsWith('patch')) return 'PATCH';
    if (key.startsWith('del') || key.startsWith('delete')) return 'DELETE';
    return 'GET';
}

function buildSignatureAndForwarding(paramsRaw) {
    // Mirror the descriptor's own parameter list in the generated wrapper, so
    // call sites see the same named parameters (with defaults) instead of an
    // opaque `(...args)`. Destructured patterns can't be forwarded by name,
    // so they get a positional alias (`arg1`, `arg2`, …) that carries the
    // descriptor's default through unchanged.
    const parts = splitParamList(paramsRaw ?? '');
    if (parts.length === 0) {
        return { signature: '', forwarding: '' };
    }

    const sigParts = [];
    const fwdParts = [];

    parts.forEach((rawPart, idx) => {
        const { name: binding, hasDefault } = splitParamAtTopLevelEquals(rawPart);
        const defaultExpr = hasDefault
            ? rawPart.slice(binding.length).replace(/^\s*=\s*/, '').trimEnd()
            : null;

        if (binding.startsWith('...')) {
            sigParts.push(binding);
            fwdParts.push(binding);
            return;
        }

        if (/^[A-Za-z_$][\w$]*$/.test(binding)) {
            sigParts.push(rawPart);
            fwdParts.push(binding);
            return;
        }

        const alias = `arg${idx + 1}`;
        sigParts.push(hasDefault ? `${alias} = ${defaultExpr}` : alias);
        fwdParts.push(alias);
    });

    return { signature: sigParts.join(', '), forwarding: fwdParts.join(', ') };
}

function buildActionBody(functionName, clientName, apiRef, verb, signature, forwarding) {
    // Each generated action calls authApi.<verb> directly — the verb is
    // resolved at scaffold time from the descriptor's `method:` literal (or
    // its key prefix as a fallback). withQuery/wrapData are pure shape
    // helpers; the HTTP dispatch happens right here at the call site.
    const lines = [`async function ${functionName}(${signature}) {`];
    lines.push(`    const ep = ${apiRef}(${forwarding});`);

    if (verb === 'GET') {
        lines.push(`    return ${clientName}.fetch(ep.path, ep.params);`);
    } else if (verb === 'DELETE') {
        lines.push(`    return ${clientName}.del(withQuery(ep.path, ep.params));`);
    } else {
        // POST / PUT / PATCH — params (if any) ride in the query string, the
        // request body is the descriptor's `data`, envelope-wrapped to match
        // Strapi's { data: ... } convention.
        const verbLower = verb.toLowerCase();
        lines.push(`    return ${clientName}.${verbLower}(withQuery(ep.path, ep.params), wrapData(ep.data));`);
    }

    lines.push('}');
    return lines;
}

function buildProviderArtifacts(parsed, apiShape, imports) {
    const clientName = parsed.clientName ?? 'authApi';

    const functionEntries = apiShape.filter((entry) => entry.isFunction);
    const nonFunctionEntries = apiShape.filter((entry) => !entry.isFunction);

    const methodLines = [];
    const endpointPropertyLines = [];
    const methodNameByKey = new Map();
    const dtsMembers = [];
    const usedCoreHelpers = new Set(['strictEndpointGuard']);

    functionEntries.forEach(({ key, params, method }) => {
        const functionName = isValidIdentifier(key) ? key : `_endpoint_${key.replace(/[^A-Za-z0-9_$]/g, '_')}`;
        methodNameByKey.set(key, functionName);

        const apiRef = toApiMemberReference(parsed.apiAliasName, key);
        const verb = resolveHttpVerb(key, method);

        if (verb === 'DELETE' || verb === 'POST' || verb === 'PUT' || verb === 'PATCH') {
            usedCoreHelpers.add('withQuery');
        }
        if (verb === 'POST' || verb === 'PUT' || verb === 'PATCH') {
            usedCoreHelpers.add('wrapData');
        }

        const { signature, forwarding } = buildSignatureAndForwarding(params);
        methodLines.push(...buildActionBody(functionName, clientName, apiRef, verb, signature, forwarding));
        methodLines.push('');

        endpointPropertyLines.push(isValidIdentifier(key)
            ? `    ${key},`
            : `    '${key}': ${functionName},`);

        const dtsParams = buildDtsParamList(params ?? '');
        const memberKey = isValidIdentifier(key) ? key : JSON.stringify(key);
        dtsMembers.push(`    ${memberKey}(${dtsParams}): Promise<any>;`);
    });

    nonFunctionEntries.forEach(({ key }) => {
        const apiRef = toApiMemberReference(parsed.apiAliasName, key);
        endpointPropertyLines.push(isValidIdentifier(key)
            ? `    ${key}: ${apiRef},`
            : `    '${key}': ${apiRef},`);

        const memberKey = isValidIdentifier(key) ? key : JSON.stringify(key);
        dtsMembers.push(`    ${memberKey}: any;`);
    });

    const allowedKeysLiteral = JSON.stringify(
        endpointPropertyLines
            .map((line) => {
                const m = line.match(/^\s*(?:'([^']+)'|([A-Za-z_$][\w$]*))/);
                return m ? (m[1] ?? m[2]) : null;
            })
            .filter(Boolean),
    );

    const coreImportList = ['withQuery', 'wrapData', 'strictEndpointGuard']
        .filter((name) => usedCoreHelpers.has(name))
        .join(', ');

    const js = [
        `import { ${clientName} } from '${imports.libApiImportPath}';`,
        `import { ${coreImportList} } from '${imports.coreImportPath}';`,
        `import { ${parsed.apiExportName} as ${parsed.apiAliasName} } from '${imports.apiImportPath}';`,
        '',
        ...methodLines,
        'const endpoints = strictEndpointGuard(',
        `    '${parsed.endpointExportName}',`,
        '    {',
        ...endpointPropertyLines.map((line) => `    ${line}`),
        '    },',
        `    ${allowedKeysLiteral},`,
        ');',
        '',
        'export default endpoints;',
        `export const ${parsed.endpointExportName} = endpoints;`,
        '',
    ].join('\n');

    const dts = [
        '// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs',
        `export interface ${parsed.endpointExportName}Type {`,
        ...dtsMembers,
        '}',
        '',
        `export const ${parsed.endpointExportName}: ${parsed.endpointExportName}Type;`,
        `declare const _default: ${parsed.endpointExportName}Type;`,
        'export default _default;',
        '',
    ].join('\n');

    return { js, dts };
}

function migrateEndpointFileContent(fileName, parsed, source) {
    let lines;

    if (parsed.lines && parsed.indexesToRemove) {
        const remainingLines = parsed.lines.filter((_, idx) => !parsed.indexesToRemove.has(idx));
        let content = remainingLines.join('\n');

        if (parsed.apiAliasName) {
            const proxyCallRegex = new RegExp(`createClientProxy\\(\\s*${escapeRegExp(parsed.apiAliasName)}\\s*,\\s*(authApi|api)\\s*\\)`, 'g');
            content = content.replace(proxyCallRegex, 'endpoints');
        }

        lines = content.split(/\r?\n/);
    } else {
        lines = source.split(/\r?\n/);
    }

    const importLine = `import endpoints, { ${parsed.endpointExportName} } from '../providers/generated/client/${fileName}';`;

    lines = lines.map((line) => line.replace(
        new RegExp(`^import\\s+endpoints\\s*,\\s*\\{\\s*${escapeRegExp(parsed.endpointExportName)}\\s*\\}\\s*from\\s*['\"]\\.\\.\\/providers\\/generated\\/${escapeRegExp(fileName)}['\"];?\\s*$`),
        importLine,
    ));

    const existingImportIndex = lines.findIndex((line) => line.trim() === importLine);
    if (existingImportIndex < 0) {
        let lastImportIndex = -1;
        for (let i = 0; i < lines.length; i += 1) {
            if (lines[i].trim().startsWith('import ')) {
                lastImportIndex = i;
            }
        }

        const insertAt = lastImportIndex >= 0 ? lastImportIndex + 1 : 0;
        lines.splice(insertAt, 0, importLine, '');
    }

    const exportDefaultLine = 'export default endpoints;';
    const exportNamedLine = `export { ${parsed.endpointExportName} };`;

    const hasExportDefault = lines.some((line) => line.trim() === exportDefaultLine);
    const hasExportNamed = lines.some((line) => line.trim() === exportNamedLine);

    if (!hasExportDefault || !hasExportNamed) {
        let insertAfter = -1;
        for (let i = 0; i < lines.length; i += 1) {
            if (lines[i].trim().startsWith('import ')) {
                insertAfter = i;
            }
        }

        const exportInsertAt = insertAfter >= 0 ? insertAfter + 1 : 0;
        const exportLines = [];
        if (!hasExportDefault) exportLines.push(exportDefaultLine);
        if (!hasExportNamed) exportLines.push(exportNamedLine);

        lines.splice(exportInsertAt, 0, ...exportLines, '');
    }

    return normalizeSpacing(lines.join('\n'));
}

async function main() {
    if (!fs.existsSync(endpointsDir)) {
        throw new Error(`Missing endpoints directory: ${endpointsDir}`);
    }

    fs.mkdirSync(providersGeneratedDir, { recursive: true });
    fs.copyFileSync(coreTemplatePath, coreOutputPath);

    const staleClientCorePath = path.join(providersGeneratedDir, '__client_core__.js');
    if (fs.existsSync(staleClientCorePath)) {
        fs.unlinkSync(staleClientCorePath);
    }

    const generatedPropertyMapperPath = path.join(providersGeneratedDir, '___property_mapper__.js');
    if (fs.existsSync(generatedPropertyMapperPath)) {
        fs.unlinkSync(generatedPropertyMapperPath);
    }

    const files = fs
        .readdirSync(endpointsDir)
        .filter((file) => file.endsWith('.js') && file !== 'index.js')
        .sort((a, b) => a.localeCompare(b));

    const generated = [];
    const generatedFromApi = [];
    const migrated = [];
    const skipped = [];
    const apiSkipped = [];
    const refreshed = [];

    for (const fileName of files) {
        const endpointPath = path.join(endpointsDir, fileName);
        const source = fs.readFileSync(endpointPath, 'utf8');

        const alreadyMigrated = source.includes('../providers/generated/');
        let parsed = null;

        if (alreadyMigrated) {
            const migratedInfo = parseMigratedEndpointFile(source, fileName);
            const existingProviderInfo = parseExistingProviderFile(fileName);

            if (!migratedInfo || !existingProviderInfo) {
                skipped.push(`${fileName} (migrated but provider metadata missing)`);
                continue;
            }

            parsed = {
                ...existingProviderInfo,
                endpointExportName: migratedInfo.endpointExportName,
            };
        } else {
            parsed = parseLegacyEndpointFile(source);
            if (!parsed) {
                skipped.push(`${fileName} (unsupported prelude)`);
                continue;
            }
        }

        const providerPath = path.join(providersGeneratedDir, fileName);
        const providerDir = path.dirname(providerPath);
        const apiAbsPath = path.join(packageRoot, toApiRelativePath(parsed));
        const apiShape = loadApiShape(toApiRelativePath(parsed), parsed.apiExportName);
        const { js: providerJs, dts: providerDts } = buildProviderArtifacts(parsed, apiShape, {
            libApiImportPath: toImportPath(providerDir, path.join(packageRoot, 'lib', 'api.js')),
            coreImportPath: toImportPath(providerDir, coreOutputPath),
            apiImportPath: toImportPath(providerDir, apiAbsPath),
        });
        fs.writeFileSync(providerPath, normalizeSpacing(providerJs), 'utf8');
        fs.writeFileSync(providerPath.replace(/\.js$/, '.d.ts'), normalizeSpacing(providerDts), 'utf8');
        generated.push(path.relative(packageRoot, providerPath));

        if (!alreadyMigrated) {
        const migratedContent = migrateEndpointFileContent(fileName, parsed, source);
            fs.writeFileSync(endpointPath, migratedContent, 'utf8');
            migrated.push(path.relative(packageRoot, endpointPath));
        } else {
            const refreshedEndpoint = migrateEndpointFileContent(fileName, parsed, source);
            if (refreshedEndpoint !== source) {
                fs.writeFileSync(endpointPath, refreshedEndpoint, 'utf8');
            }
            refreshed.push(path.relative(packageRoot, endpointPath));
        }

        const legacyProviderPath = path.join(legacyProvidersGeneratedDir, fileName);
        if (fs.existsSync(legacyProviderPath)) {
            fs.unlinkSync(legacyProviderPath);
        }
    }

    const apiFiles = getApiFilesRecursive(apiDir)
        .filter((rel) => !rel.endsWith('/index.js'))
        // Root-level api files (e.g. api/site-setting.js) are processed only
        // when no paired endpoints/<name>.js exists — otherwise the endpoints
        // loop above already wrote the provider.
        .filter((rel) => rel.includes('/') || !fs.existsSync(path.join(endpointsDir, rel)));

    for (const apiRelative of apiFiles) {
        const apiFileAbs = path.join(apiDir, apiRelative);
        const source = fs.readFileSync(apiFileAbs, 'utf8');
        const exportNames = getExportedConstObjectNames(source);

        if (exportNames.length === 0) {
            apiSkipped.push(`${apiRelative} (no exported object constants)`);
            continue;
        }

        let exportName;
        if (exportNames.length === 1) {
            exportName = exportNames[0];
        } else {
            // Files with both `<X>Endpoints` and `<X>EndpointRules` exports:
            // the rules object is metadata (per-method scopes/policies), not an
            // endpoint surface, so prefer the `Endpoints` one.
            const endpointCandidates = exportNames.filter((n) => n.endsWith('Endpoints'));
            if (endpointCandidates.length === 1) {
                exportName = endpointCandidates[0];
            } else {
                apiSkipped.push(`${apiRelative} (ambiguous exports: ${exportNames.join(', ')})`);
                continue;
            }
        }
        const providerPath = path.join(providersGeneratedDir, apiRelative);
        const providerDir = path.dirname(providerPath);
        fs.mkdirSync(providerDir, { recursive: true });

        const parsed = {
            clientName: 'authApi',
            apiExportName: exportName,
            apiAliasName: `${exportName}Api`,
            endpointExportName: exportName,
        };

        const apiShape = loadApiShape(path.join('api', apiRelative).replace(/\\/g, '/'), exportName);
        const { js: providerJs, dts: providerDts } = buildProviderArtifacts(parsed, apiShape, {
            libApiImportPath: toImportPath(providerDir, path.join(packageRoot, 'lib', 'api.js')),
            coreImportPath: toImportPath(providerDir, coreOutputPath),
            apiImportPath: toImportPath(providerDir, apiFileAbs),
        });

        fs.writeFileSync(providerPath, normalizeSpacing(providerJs), 'utf8');
        fs.writeFileSync(providerPath.replace(/\.js$/, '.d.ts'), normalizeSpacing(providerDts), 'utf8');
        generatedFromApi.push(path.relative(packageRoot, providerPath));
    }

    scaffoldDirectoryIndexes(providersGeneratedDir);

    console.log(`[scaffold-endpoint-providers] Generated: ${generated.length}`);
    generated.forEach((file) => console.log(`  + ${file}`));

    console.log(`[scaffold-endpoint-providers] Generated from api subtree: ${generatedFromApi.length}`);
    generatedFromApi.forEach((file) => console.log(`  + ${file}`));

    console.log(`[scaffold-endpoint-providers] Migrated: ${migrated.length}`);
    migrated.forEach((file) => console.log(`  ~ ${file}`));

    console.log(`[scaffold-endpoint-providers] Refreshed: ${refreshed.length}`);
    refreshed.forEach((file) => console.log(`  = ${file}`));

    console.log(`[scaffold-endpoint-providers] Skipped: ${skipped.length}`);
    skipped.forEach((item) => console.log(`  - ${item}`));

    console.log(`[scaffold-endpoint-providers] Api subtree skipped: ${apiSkipped.length}`);
    apiSkipped.forEach((item) => console.log(`  - ${item}`));
}

main().catch((error) => {
    console.error('[scaffold-endpoint-providers] Failed:', error.message);
    process.exitCode = 1;
});
