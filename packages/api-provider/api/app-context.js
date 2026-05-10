import { getAdminMode, getAppName, setAdminMode, setAppName } from '@/lib/api.js';

export const AppContextEndpoints = {
  setAppName: (name) => setAppName(name),
  getAppName: () => getAppName(),
  setAdminMode: (enabled) => setAdminMode(enabled),
  getAdminMode: () => getAdminMode(),
};
