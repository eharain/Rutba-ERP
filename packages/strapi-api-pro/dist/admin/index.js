"use strict";
const jsxRuntime = require("react/jsx-runtime");
require("react");
const __variableDynamicImportRuntimeHelper = (glob, path, segs) => {
  const v = glob[path];
  if (v) {
    return typeof v === "function" ? v() : Promise.resolve(v);
  }
  return new Promise((_, reject) => {
    (typeof queueMicrotask === "function" ? queueMicrotask : setTimeout)(
      reject.bind(
        null,
        new Error(
          "Unknown variable dynamic import: " + path + (path.split("/").length !== segs ? ". Note that variables only represent file names one level deep." : "")
        )
      )
    );
  });
};
const strapi = {
  name: "api-pro"
};
const pluginPkg = {
  strapi
};
const pluginId = pluginPkg.strapi.name;
const getTrad = (id) => `${pluginId}.${id}`;
const PluginIcon = () => /* @__PURE__ */ jsxRuntime.jsx(
  "span",
  {
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: 16,
      height: 16,
      fontSize: 9,
      fontWeight: 700,
      borderRadius: 3,
      border: "1px solid currentColor"
    },
    children: "AP"
  }
);
const name = pluginPkg.strapi.name;
const index = {
  register(app) {
    app.addMenuLink({
      to: `/plugins/${name}`,
      icon: PluginIcon,
      intlLabel: {
        id: getTrad("plugin.name"),
        defaultMessage: "Strapi API Pro"
      },
      Component: async () => {
        const { default: App } = await Promise.resolve().then(() => require("../_chunks/App-CeSWiVbl.js"));
        return App;
      }
    });
    app.registerPlugin({
      id: name,
      name
    });
  },
  async registerTrads({ locales }) {
    const importedTrads = await Promise.all(
      locales.map(
        (locale) => __variableDynamicImportRuntimeHelper(/* @__PURE__ */ Object.assign({ "./translations/en.json": () => Promise.resolve().then(() => require("../_chunks/en-CUItAh8j.js")) }), `./translations/${locale}.json`, 3).then(({ default: data }) => ({ data, locale })).catch(() => ({ data: {}, locale }))
      )
    );
    return Promise.resolve(importedTrads);
  }
};
module.exports = index;
