import fsx from "fs-extra";

import type { ResolvedConfig } from "vite";

import type {
  ResolvedPluginOptions,
  View,
  ViewTemplates,
  BootstrapPayload,
} from "../@types";

import { resolvePath } from "../base";
import { sourceFilesParsers } from "./parsers";

/** {viewsDir}/_views.yml schema:

some-view:
# will generate {viewsDir}/some-view.vue

another-view/:
# will generate {viewsDir}/another-view/another-view.vue

another-view/base:
# will generate {viewsDir}/another-view/base.vue

some-page.html:
# will generate {viewsDir}/some-page.html.vue

# provide meta
some-view:
  meta:
    restricted: true
    privileges:
      role: manager
*/

/**
 * Generates various files based on {viewsDir}/_views.yml
 *
 * Generated files:
 *    - {viewsDir}/{view}.vue (or {viewsDir}/{view}/{view}.vue if path ends in a slash)
 *    - {routerDir}/_routes.ts
 *    - {routerDir}/_routes.d.ts
 *    - {storesDir}/env.ts
 *
 * @param {Object} [opts={}] - options
 * @param {string} [opts.routerDir="router"] - path to routes folder
 * @param {string} [opts.viewsDir="views"] - path to views folder (should contain _views.yml file)
 * @param {string} [opts.storesDir="stores"] - path to stores folder
 * @param {string} [opts.apiDir="api"] - path to api folder
 * @param {object} [opts.templates={}] - custom templates
 */

type Workers = typeof import("./workers");

export async function viewsGenerator(
  config: ResolvedConfig,
  options: ResolvedPluginOptions,
  { workerPool }: { workerPool: Workers },
) {
  const { sourceFolder, routerDir, storesDir, viewsDir, apiDir } = options;

  const viewMap: Record<string, View> = {};

  const tplWatchers: Record<string, () => Promise<void>> = {};
  const srcWatchers: Record<string, () => Promise<void>> = {};

  const customTemplates: ViewTemplates = {};

  const watchHandler = async (file: string) => {
    if (tplWatchers[file]) {
      // updating templates; to be used on newly added views only
      // so no need to update anything here
      await tplWatchers[file]();
      return;
    }

    if (srcWatchers[file]) {
      // updating viewMap
      await srcWatchers[file]();

      // then feeding it to worker
      await workerPool.handleSrcFileUpdate({
        file,
        views: Object.values(viewMap),
        customTemplates,
      });

      return;
    }
  };

  for (const [name, file] of Object.entries(
    options.viewsGenerator.templates || {},
  ) as [name: keyof ViewTemplates, file: string][]) {
    tplWatchers[resolvePath(file)] = async () => {
      customTemplates[name] = await fsx.readFile(resolvePath(file), "utf8");
    };
  }

  for (const { file, parser } of await sourceFilesParsers({
    config,
    viewsDir,
  })) {
    srcWatchers[file] = async () => {
      for (const { view } of await parser()) {
        viewMap[view.path] = view;
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
    views: Object.values(viewMap),
    sourceFolder,
    routerDir,
    storesDir,
    viewsDir,
    apiDir,
    customTemplates,
  };

  return {
    bootstrapPayload,
    watchHandler,
    watchPatterns: [...Object.keys(tplWatchers), ...Object.keys(srcWatchers)],
  };
}
