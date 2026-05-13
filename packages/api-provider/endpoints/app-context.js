import { getActiveRole, getAppName, setActiveRole, setAppName } from '../lib/api.js';

export const AppContextEndpoints = {
  setAppName: (name) => setAppName(name),
  getAppName: () => getAppName(),
  setActiveRole: (roleKey) => setActiveRole(roleKey),
  getActiveRole: () => getActiveRole(),
};


