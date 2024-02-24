import type { Route } from "../@types";

export type WorkerData = {
  fetchDir: string;
  generateRouteAssets?: {
    route: Route;
    root: string;
    base: string;
  };
  generateIndexFiles?: {
    routes: Route[];
    sourceFolder: string;
    importStringifyFrom?: string;
  };
};
