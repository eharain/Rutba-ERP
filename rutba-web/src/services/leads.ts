import { WebLeadsEndpoints } from '@rutba/api-provider/endpoints/web/leads.js';

export function createWebLeadsService(config = {}) {
 
  const createLead = async (data) => {
    const payload = {
      ...data,
      source: data?.source || 'Website',
      status: 'New',
    };
    const res = await WebLeadsEndpoints.create(payload);
    return res?.data ?? res;
  };

    return { endpoints: WebLeadsEndpoints, createLead };
}

