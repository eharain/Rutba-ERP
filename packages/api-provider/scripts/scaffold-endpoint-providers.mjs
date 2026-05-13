import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toLegacyAlias } from './scaffold__property_mapper__.js';

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

        const fileExports = entries
            .filter((entry) => entry.isFile())
            .map((entry) => entry.name)
            .filter((name) => name.endsWith('.js') && name !== 'index.js')
            .filter((name) => name !== '__client_core__.js')
            .sort((a, b) => a.localeCompare(b))
            .map((name) => `export * from './${name}';`);

        const dirExports = entries
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
            .sort((a, b) => a.localeCompare(b))
            .map((name) => `export * from './${name}/index.js';`);

        const lines = [...fileExports, ...dirExports];
        const indexPath = path.join(dir, 'index.js');

        if (lines.length === 0) {
            if (fs.existsSync(indexPath)) {
                fs.unlinkSync(indexPath);
            }
            continue;
        }

        fs.writeFileSync(indexPath, `${lines.join('\n')}\n`, 'utf8');
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
    let escaped = false;

    for (let i = openIndex; i < source.length; i += 1) {
        const ch = source[i];

        if ((inSingle || inDouble || inTemplate) && ch === '\\' && !escaped) {
            escaped = true;
            continue;
        }

        if (inSingle && ch === "'" && !escaped) inSingle = false;
        else if (inDouble && ch === '"' && !escaped) inDouble = false;
        else if (inTemplate && ch === '`' && !escaped) inTemplate = false;
        else if (!inSingle && !inDouble && !inTemplate) {
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
    let escaped = false;

    for (let i = 0; i < objectBody.length; i += 1) {
        const ch = objectBody[i];

        if ((inSingle || inDouble || inTemplate) && ch === '\\' && !escaped) {
            token += ch;
            escaped = true;
            continue;
        }

        if (!inSingle && !inDouble && !inTemplate) {
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

function parseTopLevelProperty(part) {
    const prop = part.replace(/^\/\*[\s\S]*?\*\//g, '').replace(/^\/\/.*$/gm, '').trim();
    if (!prop) return null;

    const methodMatch = prop.match(/^([A-Za-z_$][\w$]*)\s*\(/);
    if (methodMatch) {
        return { key: methodMatch[1], isFunction: true };
    }

    const quotedKeyMatch = prop.match(/^(?:'([^']+)'|"([^"]+)"|`([^`]+)`|([A-Za-z_$][\w$]*))\s*:/);
    if (!quotedKeyMatch) return null;

    const key = quotedKeyMatch[1] ?? quotedKeyMatch[2] ?? quotedKeyMatch[3] ?? quotedKeyMatch[4];
    const valuePart = prop.slice(quotedKeyMatch[0].length).trim();
    const isFunction = /^(async\s+)?\(/.test(valuePart)
        || /^(async\s+)?[A-Za-z_$][\w$]*\s*=>/.test(valuePart)
        || /^function\b/.test(valuePart)
        || /^async\s+function\b/.test(valuePart);

    return { key, isFunction };
}

function loadApiShape(apiRelativePath, exportName) {
    const apiPath = path.join(packageRoot, apiRelativePath.replace(/\\/g, '/'));
    const source = fs.readFileSync(apiPath, 'utf8');
    const objectBody = readExportedObjectLiteral(source, exportName);

    if (!objectBody) {
        throw new Error(`Unable to parse API export ${exportName} from ${apiRelativePath}`);
    }

    const properties = splitTopLevelProperties(objectBody)
        .map(parseTopLevelProperty)
        .filter(Boolean);

    if (properties.length === 0) {
        throw new Error(`No properties found for API export ${exportName} in ${apiRelativePath}`);
    }

    return properties;
}

function buildProviderFileContent(parsed, apiShape, imports) {
    const clientName = parsed.clientName ?? 'authApi';

    const functionEntries = apiShape.filter((entry) => entry.isFunction);
    const nonFunctionEntries = apiShape.filter((entry) => !entry.isFunction);

    const methodLines = [];
    const endpointPropertyLines = [];
    const methodNameByKey = new Map();

    functionEntries.forEach(({ key }) => {
        const functionName = isValidIdentifier(key) ? key : `_endpoint_${key.replace(/[^A-Za-z0-9_$]/g, '_')}`;
        methodNameByKey.set(key, functionName);

        const apiRef = toApiMemberReference(parsed.apiAliasName, key);

        methodLines.push(`async function ${functionName}(...args) {`);
        methodLines.push(`    return executeEndpoint(${clientName}, '${key}', ${apiRef}(...args));`);
        methodLines.push('}');
        methodLines.push('');

        endpointPropertyLines.push(isValidIdentifier(key)
            ? `    ${key},`
            : `    '${key}': ${functionName},`);
    });

    const usedAliases = new Set(apiShape.map((entry) => entry.key));
    functionEntries.forEach(({ key }) => {
        const alias = toLegacyAlias(key);
        if (!alias || usedAliases.has(alias)) return;
        usedAliases.add(alias);

        const targetMethod = methodNameByKey.get(key);
        methodLines.push(`async function ${alias}(...args) {`);
        methodLines.push(`    return ${targetMethod}(...args);`);
        methodLines.push('}');
        methodLines.push('');

        endpointPropertyLines.push(`    ${alias},`);
    });

    nonFunctionEntries.forEach(({ key }) => {
        const apiRef = toApiMemberReference(parsed.apiAliasName, key);
        endpointPropertyLines.push(isValidIdentifier(key)
            ? `    ${key}: ${apiRef},`
            : `    '${key}': ${apiRef},`);
    });

    return [
        `import { ${clientName} } from '${imports.libApiImportPath}';`,
        `import { executeEndpoint } from '${imports.coreImportPath}';`,
        `import { ${parsed.apiExportName} as ${parsed.apiAliasName} } from '${imports.apiImportPath}';`,
        '',
        ...methodLines,
        'const endpoints = {',
        ...endpointPropertyLines,
        '};',
        '',
        'export default endpoints;',
        `export const ${parsed.endpointExportName} = endpoints;`,
        '',
    ].join('\n');
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
        const providerContent = normalizeSpacing(buildProviderFileContent(parsed, apiShape, {
            libApiImportPath: toImportPath(providerDir, path.join(packageRoot, 'lib', 'api.js')),
            coreImportPath: toImportPath(providerDir, coreOutputPath),
            apiImportPath: toImportPath(providerDir, apiAbsPath),
        }));
        fs.writeFileSync(providerPath, providerContent, 'utf8');
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

        if (exportNames.length > 1) {
            apiSkipped.push(`${apiRelative} (multiple exports: ${exportNames.join(', ')})`);
            continue;
        }

        const exportName = exportNames[0];
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
        const providerContent = normalizeSpacing(buildProviderFileContent(parsed, apiShape, {
            libApiImportPath: toImportPath(providerDir, path.join(packageRoot, 'lib', 'api.js')),
            coreImportPath: toImportPath(providerDir, coreOutputPath),
            apiImportPath: toImportPath(providerDir, apiFileAbs),
        }));

        fs.writeFileSync(providerPath, providerContent, 'utf8');
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
