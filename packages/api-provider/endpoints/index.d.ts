// AUTO-MAINTAINED. Mirrors endpoints/index.js — re-exports the generated
// provider surface plus the hand-authored helpers that live alongside it.

export * from '../providers/generated/client/index';

export const AppContextEndpoints: {
    setAppName(name: any): any;
    getAppName(): any;
    setActiveRole(roleKey: any): any;
    getActiveRole(): any;
};

export function searchBranches(searchTerm: any, page?: any, rowsPerPage?: any): Promise<any>;

export function saveProductItems(documentId: any, items: any): Promise<any>;
export function saveProduct(id: any, formData: any, ...rest: any[]): Promise<any>;
export function fetchProducts(...args: any[]): Promise<any>;
export function loadProduct(id: any, ...rest: any[]): Promise<any>;
export function searchProduct(term: any, ...rest: any[]): Promise<any>;
export function createProduct(...args: any[]): Promise<any>;
export function searchProducts(term: any, ...rest: any[]): Promise<any>;
