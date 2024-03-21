export const customizableDefaults = {
  apiDir: "api",
  routerDir: "router",
  viewsDir: "views",
  storesDir: "stores",
  varDir: "var",
  useWorkers: true,
  usePolling: true,
};

export const defaults = {
  api: {
    routesFile: "_routes.ts",
  },
  views: {
    routesFile: "_routes.ts",
    routesDtsFile: "_routes.d.ts",
    envStoreFile: "env.ts",
    envRoutesFile: "_000_env_routes.yml",
  },
  var: {
    fetchDir: "@fetch",
    apiAssetsDir: "@apiAssets",
  },
};
