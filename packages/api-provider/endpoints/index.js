
export  *  from '../providers/generated/client/index.js';

// MediaUtils are pure local utilities (return a URL string / booleans),
// not HTTP endpoints. The scaffolder wraps every descriptor function as an
// async authApi call by default, which turns `imageBaseUrl()` into a Promise
// that 404s ("/apiundefined") and gets string-concatenated as
// "[object Promise]/uploads/...". Override the generated wrapper with the
// source descriptors so callers get the synchronous values they expect.
export { MediaUtilsEndpoints } from '../api/media-utils.js';

// UploadEndpoints.uploadFiles / .deleteFile delegate to authApi internally
// (multipart + auth header + full Strapi URL). The auto-generated wrapper
// would re-wrap them as `authApi.post(ep.path, ...)` and break the upload
// (no path → /apiundefined, no multipart → empty body). Source override.
export { UploadEndpoints } from '../api/upload.js';

// StockHelpersEndpoints are pure local helpers (getStockStatus returns a
// static array, relationConnects is a synchronous transform). Same scaffolder
// issue as MediaUtils/Upload — the generated wrapper calls authApi.fetch on a
// non-endpoint descriptor and 404s. Source override.
export { StockHelpersEndpoints } from '../api/stock-helpers.js';

export {AppContextEndpoints } from './app-context.js';

export { searchBranches } from './helpers/branches.js';
export { saveProductItems, saveProduct, fetchProducts, loadProduct, searchProduct, createProduct, searchProducts } from './helpers/products.js';
