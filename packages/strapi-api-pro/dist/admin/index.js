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
const PluginIcon = ({ width = 16, height = 16, ...rest }) => /* @__PURE__ */ jsxRuntime.jsxs(
  "svg",
  {
    xmlns: "http://www.w3.org/2000/svg",
    width,
    height,
    viewBox: "0 0 32 32",
    fill: "currentColor",
    "aria-hidden": "true",
    ...rest,
    children: [
      /* @__PURE__ */ jsxRuntime.jsx("path", { d: "M16 2 4 6v9.2c0 6.7 4.7 12.6 12 14.8 7.3-2.2 12-8.1 12-14.8V6L16 2Z" }),
      /* @__PURE__ */ jsxRuntime.jsx(
        "path",
        {
          fill: "#fff",
          d: "M10.3 18.5 13 13.4l1.7 3.2-1.4 2.6-3-.7Zm5 .9-1.4-2.6 2.4-4.5 2.4 4.5-1.4 2.6-2 .8-.0-.8Zm6.7-.9-3 .7-1.4-2.6 1.7-3.2 2.7 5.1Z"
        }
      )
    ]
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
        const { default: App } = await Promise.resolve().then(() => require("../_chunks/App-ftmI6spZ.js"));
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
