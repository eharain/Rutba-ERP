// AUTO-GENERATED — do not edit. Source: scaffold-endpoint-providers.mjs
export interface HelpdeskConfigEndpointsType {
    listWorkflows({ filters }?: any): Promise<any>;
    getWorkflow(documentId: any): Promise<any>;
    createWorkflow(data: any): Promise<any>;
    updateWorkflow(documentId: any, data: any): Promise<any>;
    listSlaPolicies({ filters }?: any): Promise<any>;
    getSlaPolicy(documentId: any): Promise<any>;
    createSlaPolicy(data: any): Promise<any>;
    updateSlaPolicy(documentId: any, data: any): Promise<any>;
    listSlaCalendars(): Promise<any>;
    createSlaCalendar(data: any): Promise<any>;
    updateSlaCalendar(documentId: any, data: any): Promise<any>;
    listCatalog({ audience, filters }?: any): Promise<any>;
    getCatalogItem(documentId: any): Promise<any>;
    createCatalogItem(data: any): Promise<any>;
    updateCatalogItem(documentId: any, data: any): Promise<any>;
    publishCatalogItem(documentId: any, data: any): Promise<any>;
    runCatalogSubmit(documentId: any, data: any): Promise<any>;
    listAutomationRules({ filters }?: any): Promise<any>;
    getAutomationRule(documentId: any): Promise<any>;
    createAutomationRule(data: any): Promise<any>;
    updateAutomationRule(documentId: any, data: any): Promise<any>;
    runAutomationRule(documentId: any, data: any): Promise<any>;
    listRoutingRules({ filters }?: any): Promise<any>;
    createRoutingRule(data: any): Promise<any>;
    updateRoutingRule(ruleId: any, data: any): Promise<any>;
    runRoutingPreview(data: any): Promise<any>;
    getRoutingAvailability({ deskId, deskKey, teamId }?: any): Promise<any>;
    listMacros({ filters }?: any): Promise<any>;
    createMacro(data: any): Promise<any>;
    updateMacro(documentId: any, data: any): Promise<any>;
    removeMacro(documentId: any): Promise<any>;
    listResolutionCodes(): Promise<any>;
    createResolutionCode(data: any): Promise<any>;
    updateResolutionCode(documentId: any, data: any): Promise<any>;
    getSettings(): Promise<any>;
    updateSettings(data: any): Promise<any>;
    meta: any;
}

export const HelpdeskConfigEndpoints: HelpdeskConfigEndpointsType;
declare const _default: HelpdeskConfigEndpointsType;
export default _default;
