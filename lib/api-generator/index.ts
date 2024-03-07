import { basename, join } from "path";

import type { Plugin } from "vite";
import fsx from "fs-extra";

import type { Route, RouteAlias, ApiTemplates } from "../@types";
import { defaults, privateDefaults } from "../defaults";
import { resolvePath } from "../base";
import { sourceFilesParsers } from "../api";
import { workerPool } from "../worker-pool";
import { bootstrap } from "./workers";

type Options = {
  apiDir?: string;
  templates?: Partial<ApiTemplates>;
  usePolling?: boolean;
};

/** {apiDir}/_routes.yml schema:

some-route:
# will generate {apiDir}/some-route.ts

account/activate/:
# will generate {apiDir}/account/activate/index.ts

account/activate/verify:
# will generate {apiDir}/account/activate/verify.ts

some-page.html:
# will generate {apiDir}/some-page.html.ts

another-page.html/:
# will generate {apiDir}/another-page.html/index.ts

# aliases
users/login:
  alias: users/authorize

# or
users/login:
  alias:
    - users/authorize
    - login

# provide meta object
some-route:
  meta:
    restricted: true
    privileges:
      role: manager

*/

/**
 * Generates multiple files based on {apiDir}/_routes.yml
 *
 * Generated files:
 *    - {apiDir}/{route}.ts (or {apiDir}/{route}/index.ts if path ends in a slash)
 *    - {apiDir}/_routes.ts - importing route files and exporting mapped routes
 *    - {apiDir}/_urlmap.ts
 *
 * @param {object} [opts={}] - options
 * @param {string} [opts.apiDir="api"] - path to api folder where to place generated files
 * @param {object} [opts.templates={}] - custom templates
 */

const PLUGIN_NAME = "@appril:apiGeneratorPlugin";

type WatchHandler = (file?: string) => Promise<void>;

export async function apiGeneratorPlugin(opts?: Options): Promise<Plugin> {
  // biome-ignore format:
  const {
    apiDir = defaults.apiDir,
    usePolling = privateDefaults.usePolling,
  } = opts || {};

  const sourceFolder = basename(resolvePath());

  const outDirSuffix = "client";

  const routeMap: Record<string, Route> = {};
  const aliasMap: Record<string, RouteAlias> = {};

  const tplWatchers: Record<string, WatchHandler> = {};
  const srcWatchers: Record<string, WatchHandler> = {};

  const customTemplates: ApiTemplates = opts?.templates || {};

  const runWatchHandler = async (file: string) => {
    if (tplWatchers[file]) {
      // updating templates; to be used on newly added routes only
      // so no need to update anything here
      await tplWatchers[file]();
      return;
    }

    if (srcWatchers[file]) {
      // updating routeMap / aliasMap
      await srcWatchers[file]();

      // then feeding them to worker
      await workerPool.apiGenerator.handleSrcFileUpdate({
        file,
        routes: Object.values(routeMap),
        aliases: Object.values(aliasMap),
        customTemplates,
      });

      return;
    }
  };

  // srcWatchers and tplWatchers should be ready by the time configureServer called,
  // so it's safer to run this here rather than inside configResolved
  for (const [name, file] of Object.entries(customTemplates) as [
    name: keyof ApiTemplates,
    file: string,
  ][]) {
    tplWatchers[resolvePath(file)] = async () => {
      customTemplates[name] = await fsx.readFile(resolvePath(file), "utf8");
    };
  }

  for (const { file, parser } of await sourceFilesParsers({ apiDir })) {
    srcWatchers[file] = async () => {
      for (const { route, aliases } of await parser()) {
        const { path } = route;

        routeMap[path] = route;

        for (const alias of aliases) {
          const { importName, serialized, ...route } = routeMap[path];
          aliasMap[alias] = {
            ...route,
            name: alias,
            importName: [importName, alias.replace(/\W/g, "_")].join("$"),
            path: join("/", alias),
          };
        }
      }
    };
  }

  return {
    name: PLUGIN_NAME,

    config(config) {
      if (!config.build?.outDir) {
        throw new Error("Config is missing build.outDir");
      }
      return {
        build: {
          outDir: join(config.build.outDir, outDirSuffix),
        },
      };
    },

    async configResolved(config) {
      // populating tplWatchers for bootstrap
      for (const handler of Object.values(tplWatchers)) {
        await handler();
      }

      // populating srcWatchers for bootstrap (only call alfter tplWatchers populated)
      for (const handler of Object.values(srcWatchers)) {
        await handler();
      }

      const payload = {
        routes: Object.values(routeMap),
        aliases: Object.values(aliasMap),
        cacheDir: config.cacheDir,
        apiDir,
        sourceFolder,
        rootPath: resolvePath(".."),
        customTemplates,
      } as const;

      config.command === "build"
        ? await bootstrap(payload)
        : await workerPool.apiGenerator.bootstrap(payload);
    },

    configureServer({ watcher }) {
      watcher.options = {
        ...watcher.options,
        disableGlobbing: false,
        usePolling,
      };

      watcher.add(Object.keys(tplWatchers));
      watcher.add(Object.keys(srcWatchers));

      watcher.on("change", runWatchHandler);
    },
  };
}
