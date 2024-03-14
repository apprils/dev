import { join } from "node:path";

import type { ResolvedConfig } from "vite";
import fsx from "fs-extra";

import type {
  ResolvedPluginOptions,
  Route,
  RouteAlias,
  ApiTemplates,
  BootstrapPayload,
} from "../@types";

import { resolvePath } from "../base";
import { sourceFilesParsers } from "../api";

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

type Workers = typeof import("./workers");

export async function apiGenerator(
  config: ResolvedConfig,
  options: ResolvedPluginOptions,
  { workerPool }: { workerPool: Workers },
) {
  const { sourceFolder, apiDir } = options;

  const routeMap: Record<string, Route> = {};
  const aliasMap: Record<string, RouteAlias> = {};

  const tplWatchers: Record<string, () => Promise<void>> = {};
  const srcWatchers: Record<string, () => Promise<void>> = {};

  const customTemplates: ApiTemplates = options.apiGenerator?.templates || {};

  const watchHandler = async (file: string) => {
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
      await workerPool.handleSrcFileUpdate({
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

  // populating tplWatchers for bootstrap
  for (const handler of Object.values(tplWatchers)) {
    await handler();
  }

  // populating srcWatchers for bootstrap (only call alfter tplWatchers populated)
  for (const handler of Object.values(srcWatchers)) {
    await handler();
  }

  const bootstrapPayload: BootstrapPayload<Workers> = {
    routes: Object.values(routeMap),
    aliases: Object.values(aliasMap),
    cacheDir: config.cacheDir,
    apiDir,
    sourceFolder,
    rootPath: resolvePath(".."),
    customTemplates,
  };

  return {
    bootstrapPayload,
    watchHandler,
    watchPatterns: [...Object.keys(tplWatchers), ...Object.keys(srcWatchers)],
  };
}
