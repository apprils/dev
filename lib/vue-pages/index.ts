import { resolve } from "node:path";

import fsx from "fs-extra";

import type { ResolvedConfig } from "vite";

import type {
  ResolvedPluginOptions,
  VuePage,
  VuePageTemplates,
  BootstrapPayload,
} from "../@types";

import { sourceFilesParsers } from "./parsers";

/** {pagesDir}/_pages.yml schema:

some-page:
# will generate {pagesDir}/some-page.vue

another-page/:
# will generate {pagesDir}/another-page/another-page.vue

another-page/base:
# will generate {pagesDir}/another-page/base.vue

some-page.html:
# will generate {pagesDir}/some-page.html.vue

# provide meta
some-page:
  meta:
    restricted: true
    privileges:
      role: manager
*/

/**
 * Generates various files based on {pagesDir}/_pages.yml
 *
 * Generated files:
 *    - {pagesDir}/{page}.vue (or {pagesDir}/{page}/{page}.vue if path ends in a slash)
 *    - {routerDir}/_routes.ts
 *    - {routerDir}/_routes.d.ts
 *    - {storesDir}/env.ts
 *
 * @param {Object} [opts={}] - options
 * @param {string} [opts.routerDir="router"] - path to routes folder
 * @param {string} [opts.pagesDir="pages"] - path to pages folder (should contain _pages.yml file)
 * @param {string} [opts.storesDir="stores"] - path to stores folder
 * @param {string} [opts.apiDir="api"] - path to api folder
 * @param {object} [opts.templates={}] - custom templates
 */

type Workers = typeof import("./workers");

export async function vuePages(
  config: ResolvedConfig,
  options: ResolvedPluginOptions,
  { workerPool }: { workerPool: Workers },
) {
  const {
    sourceFolder,
    sourceFolderPath,
    routerDir,
    storesDir,
    pagesDir,
    apiDir,
  } = options;

  const pageMap: Record<string, VuePage> = {};

  const tplWatchers: Record<string, () => Promise<void>> = {};
  const srcWatchers: Record<string, () => Promise<void>> = {};

  const customTemplates: VuePageTemplates = {};

  const watchHandler = async (file: string) => {
    if (tplWatchers[file]) {
      // updating templates; to be used on newly added pages only
      // so no need to update anything here
      await tplWatchers[file]();
      return;
    }

    if (srcWatchers[file]) {
      // updating pageMap
      await srcWatchers[file]();

      // then feeding it to worker
      await workerPool.handleSrcFileUpdate({
        file,
        pages: Object.values(pageMap),
        customTemplates,
      });

      return;
    }
  };

  for (const [name, path] of Object.entries(
    options.vuePages.templates || {},
  ) as [name: keyof VuePageTemplates, file: string][]) {
    const file = resolve(sourceFolderPath, path);
    tplWatchers[file] = async () => {
      customTemplates[name] = await fsx.readFile(file, "utf8");
    };
  }

  for (const { file, parser } of await sourceFilesParsers(config, options)) {
    srcWatchers[file] = async () => {
      for (const { page } of await parser()) {
        pageMap[page.path] = page;
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
    pages: Object.values(pageMap),
    sourceFolder,
    routerDir,
    storesDir,
    pagesDir,
    apiDir,
    customTemplates,
  };

  return {
    bootstrapPayload,
    watchHandler,
    watchPatterns: [...Object.keys(tplWatchers), ...Object.keys(srcWatchers)],
  };
}
