import pluginPkg from '../../../package.json';

const pluginId = pluginPkg.strapi.name;

export const getTrad = (id) => `${pluginId}.${id}`;
