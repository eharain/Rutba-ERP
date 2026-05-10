import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Check if a function is async
 * @param {Function} fn
 * @returns {boolean}
 */
function isAsyncFunction(fn) {
  if (typeof fn !== 'function') return false;
  return fn.constructor.name === 'AsyncFunction';
}

/**
 * Read all endpoint files from the endpoints directory
 * @returns {string[]} Array of file paths
 */
function getEndpointFiles() {
  const endpointsDir = path.join(__dirname, '../endpoints');
  const files = fs.readdirSync(endpointsDir);
  return files
    .filter(file => file.endsWith('.js'))
    .map(file => path.join(endpointsDir, file));
}

/**
 * Dynamically import a module and extract all exports
 * @param {string} filePath
 * @returns {Promise<Object>} Object containing all named exports
 */
async function importModule(filePath) {
  try {
    const absolutePath = path.resolve(filePath);
    const importedModule = await import(`file://${absolutePath}`);
    return importedModule;
  } catch (error) {
    console.warn(`Failed to import ${filePath}:`, error.message);
    return {};
  }
}

/**
 * Extract non-async methods from an object
 * @param {Object} obj
 * @returns {Object} Object containing only non-async methods
 */
function extractNonAsyncMethods(obj) {
  const nonAsyncMethods = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'function' && !isAsyncFunction(value)) {
      nonAsyncMethods[key] = value;
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Recursively extract from nested objects (in case of nested exports)
      const nestedNonAsync = extractNonAsyncMethods(value);
      Object.assign(nonAsyncMethods, nestedNonAsync);
    }
  }

  return nonAsyncMethods;
}

/**
 * Extract async methods from an object
 * @param {Object} obj
 * @returns {string[]} Array of async method names
 */
function extractAsyncMethodNames(obj) {
  const asyncMethodNames = [];

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'function' && isAsyncFunction(value)) {
      asyncMethodNames.push(key);
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Recursively extract from nested objects
      const nestedAsync = extractAsyncMethodNames(value);
      asyncMethodNames.push(...nestedAsync);
    }
  }

  return asyncMethodNames;
}

/**
 * Main function to combine all endpoints
 */
async function combineEndpoints() {
  const endpointFiles = getEndpointFiles();
  const combinedEndpoints = {};
  const exposed_methods = [];
  const fileContents = {}; // Track content by file
  const skeleton = {}; // Skeleton with just names and async methods

  console.log(`Found ${endpointFiles.length} endpoint files\n`);

  for (const file of endpointFiles) {
    const fileName = path.basename(file);
    console.log(`Processing: ${fileName}`);

    const moduleExports = await importModule(file);
    fileContents[fileName] = {};

    // Iterate through all exports in the module
    for (const [exportName, exportValue] of Object.entries(moduleExports)) {
      if (exportName === 'default') continue; // Skip default exports

      if (typeof exportValue === 'object' && exportValue !== null && !Array.isArray(exportValue)) {
        // Extract non-async methods from the exported object
        const nonAsyncMethods = extractNonAsyncMethods(exportValue);

        // Extract async methods from the exported object
        const asyncMethodNames = extractAsyncMethodNames(exportValue);

        if (Object.keys(nonAsyncMethods).length > 0) {
          console.log(`  ✓ Found ${Object.keys(nonAsyncMethods).length} endpoint definitions in ${exportName}`);
          // Merge into combined endpoints
          Object.assign(combinedEndpoints, nonAsyncMethods);

          // Store by file and export name
          fileContents[fileName][exportName] = {
            endpoints: Object.keys(nonAsyncMethods),
            count: Object.keys(nonAsyncMethods).length
          };
        }

        if (asyncMethodNames.length > 0) {
          console.log(`  ✓ Found ${asyncMethodNames.length} async methods in ${exportName}`);
          exposed_methods.push(...asyncMethodNames);

          // Add async methods to skeleton
          if (!skeleton[fileName]) {
            skeleton[fileName] = {};
          }
          skeleton[fileName][exportName] = {
            async_methods: asyncMethodNames,
            async_count: asyncMethodNames.length
          };
        }
      }
    }
  }

  console.log(`\n✓ Successfully combined ${Object.keys(combinedEndpoints).length} total endpoint definitions\n`);
  console.log(`✓ Found ${exposed_methods.length} total async methods (exposed_methods)\n`);

  return { combinedEndpoints, exposed_methods, fileContents, skeleton };
}

// Export functions for programmatic use
export { 
  combineEndpoints,
  isAsyncFunction,
  getEndpointFiles,
  importModule,
  extractNonAsyncMethods,
  extractAsyncMethodNames
};

// Run if executed directly
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  try {
    const { combinedEndpoints, exposed_methods, fileContents, skeleton } = await combineEndpoints();

    // Create temp directory for output (git-ignored and compilation-ignored)
    const tempDir = path.join(__dirname, '../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Generate simple combined format (filename on top, entire file content below)
    let simpleCombinedOutput = '// Combined Endpoints - All Files\n\n';
    const endpointsDir = path.join(__dirname, '../endpoints');

    for (const [fileName, content] of Object.entries(fileContents)) {
      simpleCombinedOutput += `// ============================================\n`;
      simpleCombinedOutput += `// FILE: ${fileName}\n`;
      simpleCombinedOutput += `// ============================================\n\n`;

      // Read and include entire file content
      const filePath = path.join(endpointsDir, fileName);
      try {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        simpleCombinedOutput += fileContent;
      } catch (error) {
        simpleCombinedOutput += `// [ERROR: Could not read file - ${error.message}]\n`;
      }

      simpleCombinedOutput += `\n\n`;
    }

    // Save simple combined format to temp directory
    const simplePath = path.join(tempDir, 'combined-endpoints-simple.js');
    fs.writeFileSync(simplePath, simpleCombinedOutput);
    console.log(`✓ Simple format saved to: ${simplePath}\n`);

    // Save skeleton format (only async method names)
    const skeletonPath = path.join(tempDir, 'combined-endpoints-skeleton.json');
    fs.writeFileSync(skeletonPath, JSON.stringify({
      description: 'Skeleton format with only async method names (exposed_methods) - no implementation',
      skeleton,
      exposed_methods,
      timestamp: new Date().toISOString()
    }, null, 2));
    console.log(`✓ Skeleton format saved to: ${skeletonPath}\n`);

    // Save full metadata
    const fullMetadataPath = path.join(tempDir, 'combined-endpoints.json');
    fs.writeFileSync(fullMetadataPath, JSON.stringify({
      combinedEndpointsCount: Object.keys(combinedEndpoints).length,
      exposed_methods,
      fileBreakdown: fileContents,
      timestamp: new Date().toISOString()
    }, null, 2));
    console.log(`✓ Full metadata saved to: ${fullMetadataPath}\n`);

    console.log('=== OUTPUT FILES (in temp directory) ===');
    console.log(`1. combined-endpoints-simple.js  - Simple format with full file contents`);
    console.log(`2. combined-endpoints-skeleton.json - Skeleton with only async method names`);
    console.log(`3. combined-endpoints.json - Full metadata with statistics\n`);
    console.log(`Output Location: packages/api-provider/temp/\n`);
  } catch (error) {
    console.error('Error combining endpoints:', error);
    process.exit(1);
  }
}




