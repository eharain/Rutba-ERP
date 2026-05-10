import { WebLeadsEndpoints } from '@/api/web/leads.js';
import { createWebClientProxy } from './createWebClientProxy.js';

export function createWebLeadsService(config = {}) {
  const proxy = createWebClientProxy(WebLeadsEndpoints, config);

  const createLead = async (data) => {
    const payload = {
      ...data,
      source: data?.source || 'Website',
      status: 'New',
    };
    const res = await proxy.create(payload);
    return res?.data ?? res;
  };

  return { endpoints: proxy, createLead };
}
