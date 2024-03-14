import type { ResolvedConfig } from "vite";

import type { ResolvedPluginOptions, Route, BootstrapPayload } from "../@types";
import { resolvePath } from "../base";
import { sourceFilesParsers } from "../api";

type Workers = typeof import("./workers");

export async function fetchGenerator(
  config: ResolvedConfig,
  options: ResolvedPluginOptions,
  { workerPool }: { workerPool: Workers },
) {
  const { sourceFolder, apiDir } = options;

  const { filter = (_r: Route) => true, importStringifyFrom } =
    options.fetchGenerator;

  const srcWatchers: Record<string, () => Promise<void>> = {};

  const routeMap: Record<string, Route> = {};

  const watchHandler = async (file: string) => {
    if (srcWatchers[file]) {
      // updating routeMap
      await srcWatchers[file]();

      // then feeding routeMap to worker
      await workerPool.handleSrcFileUpdate({
        file,
        routes: Object.values(routeMap),
      });

      return;
    }

    if (routeMap[file]) {
      await workerPool.handleRouteFileUpdate({
        route: routeMap[file],
      });
      return;
    }
  };

  for (const { file, parser } of await sourceFilesParsers({ apiDir })) {
    srcWatchers[file] = async () => {
      for (const { route } of await parser()) {
        if (filter(route)) {
          routeMap[route.fileFullpath] = route;
        }
      }
    };
  }

  // populating routeMap for bootstrap
  for (const handler of Object.values(srcWatchers)) {
    await handler();
  }

  const bootstrapPayload: BootstrapPayload<Workers> = {
    routes: Object.values(routeMap),
    // absolute path to folder containing generated files
    cacheDir: config.cacheDir,
    apiDir,
    sourceFolder,
    rootPath: resolvePath(".."),
    importStringifyFrom,
  };

  return {
    bootstrapPayload,
    watchHandler,
    watchPatterns: [
      // watching source files for changes
      ...Object.keys(srcWatchers),
      // also watching files in apiDir for changes
      ...[`${resolvePath(apiDir)}/**/*.ts`],
    ],
  };
}
