export const defaults = {
  apiDir: "api",
  viewsDir: "views",
  routesDir: "router",
  storesDir: "stores",
};

export const privateDefaults = {
  usePolling: true,
  api: {
    routesFile: "_routes.ts",
    urlmapFile: "_urlmap.ts",
  },
  views: {
    routesFile: "_routes.ts",
    urlmapFile: "_urlmap.ts",
  },
  cache: {
    fetchDir: "@fetch",
    assetsDir: "@assets",
  },
};
