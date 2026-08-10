// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface UsersEndpointsType {
    list(): Promise<any>;
    byId(id: any): Promise<any>;
    create(data: any): Promise<any>;
    update(id: any, data: any): Promise<any>;
    del(id: any): Promise<any>;
    setBulkAccess(changes: any): Promise<any>;
    setAppRoles(id: any, roleKeys: any): Promise<any>;
    createInvite(data: any): Promise<any>;
    sendInvite(id: any): Promise<any>;
    createMailbox(id: any, { serverId, localPart, domain, name, kind, quotaMb, access_roles }?: any): Promise<any>;
    listDirectory(): Promise<any>;
    listEmployees(): Promise<any>;
    listRoles(): Promise<any>;
    meta: any;
}

export const UsersEndpoints: UsersEndpointsType;
declare const _default: UsersEndpointsType;
export default _default;
