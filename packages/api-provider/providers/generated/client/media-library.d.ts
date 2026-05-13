// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface MediaLibraryEndpointsType {
    foldersTree(): Promise<any>;
    folders(parentId?: any): Promise<any>;
    folder(id: any): Promise<any>;
    files(params?: any): Promise<any>;
    file(id: any): Promise<any>;
    moveFiles(data: any): Promise<any>;
    uploadToFolder(data: any): Promise<any>;
    createFolder(data: any): Promise<any>;
    renameFolder(id: any, data: any): Promise<any>;
    deleteFolder(id: any): Promise<any>;
    updateFileInfo(id: any, data: any): Promise<any>;
    uploadFile(data: any): Promise<any>;
    delFile(id: any): Promise<any>;
}

export const MediaLibraryEndpoints: MediaLibraryEndpointsType;
declare const _default: MediaLibraryEndpointsType;
export default _default;
