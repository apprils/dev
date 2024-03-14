export const customizableDefaults = {
  apiDir: "api",
  routerDir: "router",
  viewsDir: "views",
  storesDir: "stores",
  useWorkers: true,
  usePolling: true,
};

export const defaults = {
  api: {
    routesFile: "_routes.ts",
    urlmapFile: "_urlmap.ts",
  },
  views: {
    routesFile: "_routes.ts",
    routesDtsFile: "_routes.d.ts",
    urlmapFile: "_urlmap.ts",
    envStoreFile: "env.ts",
    envRoutesFile: "_000_env_routes.yml",
  },
  cache: {
    fetchDir: "@fetch",
    assetsDir: "@assets",
  },
};
