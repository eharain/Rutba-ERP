// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface UploadEndpointsType {
    upload(): Promise<any>;
    uploadFiles(files: any, ref: any, field: any, refId: any, info: any): Promise<any>;
    deleteFile(fileId: any): Promise<any>;
}

export const UploadEndpoints: UploadEndpointsType;
declare const _default: UploadEndpointsType;
export default _default;
