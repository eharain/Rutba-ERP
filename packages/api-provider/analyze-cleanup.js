/**
 * Automated API File Cleanup Script
 * 
 * This script cleans API files by:
 * 1. Removing transport-executing methods (fetch*, post*, put*, del*)
 * 2. Ensuring pure descriptors accept data parameters
 * 3. Adding proper JSDoc comments
 * 4. Adding meta objects
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_DIR = path.join(__dirname, 'api');

// Patterns to identify transport-executing methods
const TRANSPORT_PATTERNS = [
    /\s+fetch\w+:\s*(async\s*)?\([^)]*\)\s*=>\s*\{[\s\S]*?authApi\./,
    /\s+post\w+:\s*(async\s*)?\([^)]*\)\s*=>\s*(authApi\.post|authApi\.fetch)/,
    /\s+put\w+:\s*(async\s*)?\([^)]*\)\s*=>\s*(authApi\.put|authApi\.patch)/,
    /\s+del\w+:\s*(async\s*)?\([^)]*\)\s*=>\s*authApi\.del/,
    /\s+patch\w+:\s*(async\s*)?\([^)]*\)\s*=>\s*authApi\.patch/,
];

// Pattern to find Object.assign blocks
const OBJECT_ASSIGN_PATTERN = /Object\.assign\([^,]+,\s*\{[\s\S]*?\}\);/g;

function analyzeFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const fileName = path.basename(filePath);

    const hasAuthApi = content.includes('authApi.');
    const hasImportAuthApi = /import.*authApi/.test(content);
    const hasDataNode = content.includes('dataNode');
    const hasGetUser = content.includes('getUser');
    const hasGetBranch = content.includes('getBranch');

    const transportMethods = [];
    const lines = content.split('\n');

    lines.forEach((line, idx) => {
        if (/\s+(fetch|post|put|del|patch)\w+:/.test(line)) {
            // Check if this method uses authApi
            const methodStart = idx;
            let braceCount = 0;
            let inMethod = false;
            let methodContent = '';

            for (let i = methodStart; i < Math.min(methodStart + 50, lines.length); i++) {
                const l = lines[i];
                methodContent += l + '\n';

                if (l.includes('{')) braceCount += (l.match(/\{/g) || []).length;
                if (l.includes('}')) braceCount -= (l.match(/\}/g) || []).length;

                if (braceCount === 0 && inMethod) break;
                if (braceCount > 0) inMethod = true;
            }

            if (methodContent.includes('authApi.') || methodContent.includes('=> authApi')) {
                const methodName = line.match(/\s+(\w+):/)?.[1];
                if (methodName) {
                    transportMethods.push({ name: methodName, line: idx + 1 });
                }
            }
        }
    });

    return {
        fileName,
        filePath,
        hasAuthApi,
        hasImportAuthApi,
        hasDataNode,
        hasGetUser,
        hasGetBranch,
        transportMethods,
        needsCleaning: hasAuthApi && transportMethods.length > 0,
        lines: lines.length,
    };
}

function generateCleanupReport() {
    const files = fs.readdirSync(API_DIR)
        .filter(f => f.endsWith('.js') && f !== 'index.js')
        .map(f => path.join(API_DIR, f));

    const analysis = files.map(analyzeFile);

    const needsCleaning = analysis.filter(a => a.needsCleaning);
    const alreadyClean = analysis.filter(a => !a.needsCleaning);

    console.log('\n=== API PROVIDER CLEANUP REPORT ===\n');
    console.log(`Total files: ${analysis.length}`);
    console.log(`Already clean: ${alreadyClean.length}`);
    console.log(`Need cleaning: ${needsCleaning.length}\n`);

    console.log('=== FILES NEEDING CLEANUP ===\n');
    needsCleaning.forEach(file => {
        console.log(`📁 ${file.fileName} (${file.lines} lines)`);
        console.log(`   Transport methods (${file.transportMethods.length}):`);
        file.transportMethods.forEach(m => {
            console.log(`   - ${m.name} (line ${m.line})`);
        });
        console.log('');
    });

    // Group by priority
    const highPriority = ['sales.js', 'customers.js', 'purchases.js', 'categories.js', 
                          'suppliers.js', 'stock-items.js', 'payments.js', 'cash-registers.js',
                          'sale-orders.js', 'sale-items.js', 'purchase-items.js', 'product-groups.js'];

    const high = needsCleaning.filter(f => highPriority.includes(f.fileName));

    console.log('\n=== HIGH PRIORITY FILES ===\n');
    high.forEach(file => {
        console.log(`🔴 ${file.fileName} - ${file.transportMethods.length} methods to remove`);
    });

    // Save detailed report
    const report = {
        timestamp: new Date().toISOString(),
        summary: {
            total: analysis.length,
            clean: alreadyClean.length,
            needsCleaning: needsCleaning.length,
        },
        files: analysis,
        highPriority: high.map(f => f.fileName),
    };

    fs.writeFileSync(
        path.join(__dirname, 'cleanup-report.json'),
        JSON.stringify(report, null, 2)
    );

    console.log('\n✅ Detailed report saved to cleanup-report.json\n');
}

// Run the analysis
generateCleanupReport();
