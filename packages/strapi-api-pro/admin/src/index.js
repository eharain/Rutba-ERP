import pluginPkg from '../../package.json';
import { Puzzle } from '@strapi/icons';
import { getTrad } from './utils';

const name = pluginPkg.strapi.name;

export default {
  register(app) {
    app.addMenuLink({
      to: `/plugins/${name}`,
      icon: Puzzle,
      intlLabel: {
        id: getTrad('plugin.name'),
        defaultMessage: 'Strapi API Pro',
      },
      Component: async () => {
        const { default: App } = await import('./pages/App');
        return App;
      },
    });

    app.registerPlugin({
      id: name,
      name,
    });
  },
  async registerTrads({ locales }) {
    const importedTrads = await Promise.all(
      locales.map((locale) =>
        import(`./translations/${locale}.json`)
          .then(({ default: data }) => ({ data, locale }))
          .catch(() => ({ data: {}, locale }))
      )
    );

    return Promise.resolve(importedTrads);
  },
};
