import { resolve, dirname, basename, join } from "path";

import type { Plugin, ResolvedConfig } from "vite";
import fsx from "fs-extra";
import { glob } from "glob";
import { parse } from "yaml";

import { type BuildOptions, transform } from "esbuild";

import type { Endpoint, PayloadParam, Route, TypeDeclaration } from "./@types";

import { BANNER, render, renderToFile } from "../render";
import { resolvePath, sanitizePath, filesGeneratorFactory } from "../base";
import { extractTypedEndpoints } from "./ast";
import { esbuilderFactory } from "./esbuilder";

import routeTpl from "./templates/route.tpl";
import routesTpl from "./templates/routes.tpl";
import routesDtsTpl from "./templates/routes.d.tpl";
import urlmapTpl from "./templates/urlmap.tpl";

import fetchMdlTpl from "./templates/fetch/module.tpl";
import fetchDtsTpl from "./templates/fetch/module.d.tpl";
import fetchBaseTpl from "./templates/fetch/base.tpl";
import fetchIdxTpl from "./templates/fetch/index.tpl";
import fetchHmrTpl from "./templates/fetch/hmr.tpl";

const defaultTemplates = {
  route: routeTpl,
  routes: routesTpl,
  routesDts: routesDtsTpl,
  urlmap: urlmapTpl,
};

type Templates = Record<keyof typeof defaultTemplates, string>;

type Options = {
  esbuildConfig: BuildOptions;
  apiDir?: string;
  apiHmrFlushPatterns?: RegExp[];
  heuristicsFilter?: (r: Pick<Route, "name" | "path" | "file">) => boolean;
  fetchModulePrefix?: string;
  sourceFiles?: string | string[];
  templates?: Partial<Templates>;
};

// aliases not reflected in fetch modules nor in urlmap
type RouteAlias = Omit<Route, "serialized" | "fetchModuleId">;

type RouteSetup = {
  name?: string;
  alias?: string | string[];
  file?: string;
  template?: string;
  meta?: Record<string, any>;
};

type FetchModule = {
  id: string;
  name: string;
  importName: string;
  watchFiles: string[];
  code: string;
  hmrUpdate?: string;
};

/** {apiDir}/_routes.yml schema:

# will generate {apiDir}/some-route.ts
some-route:

# will generate {apiDir}/account/activate/index.ts
account/activate/:

# will generate {apiDir}/account/activate/verify.ts
account/activate/verify:

# will generate {apiDir}/some-page.html.ts
some-page.html:

# will generate {apiDir}/another-page.html/index.ts
another-page.html/:

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
 * Generates various files based on {apiDir}/_routes.yml
 *
 * Generated files:
 *    - {apiDir}/{route}.ts (or {apiDir}/{route}/index.ts if path ends in a slash)
 *    - {apiDir}/_routes.ts - importing route files and exporting mapped routes
 *    - {apiDir}/_fetch.d.ts
 *    - {apiDir}/_fetch.ts
 *    - {apiDir}/_urlmap.ts
 *
 * @param {object} [opts={}] - options
 * @param {string} [opts.esbuildConfig]
 * @param {string} [opts.apiDir="api"] - path to api folder.
 *    where to place generated files
 * @param {string} [opts.sourceFiles="**\/*_routes.yml"] - yaml files glob pattern
 *    files containing route definitions, resolved relative to apiDir
 * @param {object} [opts.templates={}] - custom templates
 */

const PLUGIN_NAME = "vite-plugin-appril-api";

export async function vitePluginApprilApi(opts: Options): Promise<Plugin> {
  const {
    esbuildConfig,
    apiDir = "api",
    heuristicsFilter = (_r) => true,
    sourceFiles = "**/*_routes.yml",
    apiHmrFlushPatterns,
  } = opts;

  const sourceFolder = basename(resolvePath());

  const filesGenerator = filesGeneratorFactory();

  const outDirSuffix = "client";

  let esbuilder: ReturnType<typeof esbuilderFactory>;

  const fetchModulePrefix = `${opts.fetchModulePrefix?.trim() || "@fetch"}`;
  const fetchBaseModule = `${fetchModulePrefix}::base`;

  // ambient modules file.
  // do not use global import/export in module.d.tpl template!
  const fetchDtsFile = join(apiDir, "_fetch.d.ts");

  // regular index file with global export
  const fetchIdxFile = join(apiDir, "_fetch.ts");

  const virtualModules: {
    fetch: Record<string, FetchModule>;
  } = {
    fetch: {},
  };

  const watchMap: {
    srcFiles: Record<string, Function>;
    tplFiles: Record<string, Function>;
    apiFiles: Record<string, Function>;
  } = {
    srcFiles: {},
    tplFiles: {},
    apiFiles: {},
  };

  const readTemplate = (file: string) => {
    return fsx.readFile(/^\//.test(file) ? file : resolvePath(file), "utf8");
  };

  const templates = { ...defaultTemplates };

  const routeMap: Record<string, Route> = {};
  const aliasMap: Record<string, RouteAlias> = {};

  for (const [name, file] of Object.entries({ ...opts.templates }) as [
    name: keyof Templates,
    file: string,
  ][]) {
    // watching custom templates for updates
    watchMap.tplFiles[resolvePath(file)] = async () => {
      templates[name] = await readTemplate(file);
    };
  }

  const fetchModuleFactory = (
    route: Route,
    assets: {
      fetchModuleId: string;
      typeDeclarations: TypeDeclaration[];
      payloadParams: PayloadParam[];
      endpoints: Endpoint[];
    },
  ): FetchModule => {
    const { file, name } = route;
    const { fetchModuleId: id } = assets;
    return {
      id,
      name,
      importName: id.replace(/\W/g, "_"),
      watchFiles: [file],
      code: render(fetchMdlTpl, {
        apiDir,
        sourceFolder,
        fetchBaseModule,
        ...route,
        ...assets,
      }),
      hmrUpdate: `
        (updated) => {
          name = updated.name
          path = updated.path
          apiFactory = updated.apiFactory
        }
      `.trim(),
    };
  };

  async function configResolved(config: ResolvedConfig) {
    esbuilder = esbuilderFactory(esbuildConfig, {
      sourceFolder,
      apiDir,
      outDir: resolve(config.build.outDir, join("..", apiDir)),
      flushPatterns: apiHmrFlushPatterns,
      alias: config.resolve.alias,
    });

    const patterns = Array.isArray(sourceFiles)
      ? [...sourceFiles]
      : [sourceFiles];

    for (const pattern of patterns) {
      for (const file of await glob(pattern, { cwd: resolvePath(apiDir) })) {
        const filePath = resolvePath(apiDir, file);

        watchMap.srcFiles[filePath] = async () => {
          const fileContent = await fsx.readFile(filePath, "utf8");
          const routeDefinitions = parse(fileContent);

          for (const [routePath, routeSetup] of Object.entries(
            routeDefinitions,
          ) as [path: string, setup: RouteSetup | undefined][]) {
            const name = sanitizePath(routeSetup?.name || routePath).replace(
              /\/+$/,
              "",
            );

            const importPath = routeSetup?.file
              ? sanitizePath(routeSetup.file.replace(/\.[^.]+$/, ""))
              : join(apiDir, name);

            const importName = importPath.replace(/\W/g, "_");

            // path should start with a slash
            const path = join("/", name);

            const fileExt = routeSetup?.file
              ? routeSetup.file.replace(/.+(\.[^.]+)$/, "$1")
              : /\/$/.test(routePath)
                ? "/index.ts"
                : ".ts";

            const file = resolvePath(importPath + fileExt);

            const meta = JSON.stringify(routeSetup?.meta || {});

            const serialized = JSON.stringify({
              name,
              path,
            });

            const heuristicsEnabled = heuristicsFilter({ name, path, file });

            const fetchModuleId = heuristicsEnabled
              ? [fetchModulePrefix, name].join(":")
              : undefined;

            const schemaModuleId = heuristicsEnabled
              ? [sourceFolder, importPath + fileExt, "schema"].join(":")
              : undefined;

            routeMap[path] = {
              name,
              importName,
              path,
              importPath,
              file,
              fileExt,
              meta,
              serialized,
              fetchModuleId,
              schemaModuleId,
            };

            for (const alias of typeof routeSetup?.alias === "string"
              ? [routeSetup.alias]
              : [...(routeSetup?.alias || [])]) {
              const { importName, serialized, fetchModuleId, ...route } =
                routeMap[path];
              aliasMap[alias] = {
                ...route,
                name: alias,
                importName: [importName, alias.replace(/\W/g, "_")].join("$"),
                path: join("/", alias),
              };
            }

            if (fetchModuleId) {
              watchMap.apiFiles[file] = async () => {
                const fileContent = await fsx.readFile(file, "utf8");

                const assets = extractTypedEndpoints(fileContent, {
                  root: sourceFolder,
                  base: dirname(file.replace(resolvePath(), "")),
                });

                virtualModules.fetch[fetchModuleId] = fetchModuleFactory(
                  routeMap[path],
                  { fetchModuleId, ...assets },
                );

                const modules = Object.values(virtualModules.fetch).filter(
                  (e) => ![fetchModulePrefix, fetchBaseModule].includes(e.id),
                );

                const fetchBaseModuleCode = render(fetchBaseTpl, {
                  apiDir,
                  sourceFolder,
                });

                virtualModules.fetch[fetchBaseModule] = {
                  id: fetchBaseModule,
                  name: fetchBaseModule,
                  importName: fetchBaseModule,
                  watchFiles: [resolvePath(fetchDtsFile)],
                  code: fetchBaseModuleCode,
                };

                virtualModules.fetch[fetchModulePrefix] = {
                  id: fetchModulePrefix,
                  name: "Not supposed to be imported!",
                  importName: "Not supposed to be imported!",
                  watchFiles: [resolvePath(fetchDtsFile)],
                  code: render(fetchIdxTpl, {
                    apiDir,
                    sourceFolder,
                    modules,
                  }),
                };

                // (re)generating fetch files when some api file updated

                // generating file containing ambient fetch modules
                await filesGenerator.generateFile(fetchDtsFile, {
                  template: fetchDtsTpl,
                  context: {
                    BANNER,
                    apiDir,
                    sourceFolder,
                    modules,
                    defaultModuleId: fetchModulePrefix,
                    fetchBaseModule,
                    fetchBaseModuleCode,
                  },
                });

                // generating {apiDir}/_fetch.ts for access from outside sourceFolder,
                // eg. when need access to @admin fetch modules from inside @front sourceFolder
                await filesGenerator.generateFile(fetchIdxFile, {
                  template: fetchIdxTpl,
                  context: {
                    BANNER,
                    apiDir,
                    sourceFolder,
                    modules,
                  },
                });
              };
            }

            const template = routeSetup?.template
              ? await readTemplate(routeSetup?.template)
              : templates.route;

            await renderToFile(
              file,
              template,
              {
                ...routeSetup,
                ...routeMap[path],
              },
              { overwrite: false },
            );
          }

          // (re)generating base files when some source file updated

          const routesWithAlias = Object.values({
            ...aliasMap,
            ...routeMap, // routeMap can/should override aliasMap entries
          });

          const routesNoAlias = Object.values(routeMap);

          for (const [outFile, template, routes] of [
            ["_routes.ts", templates.routes, routesWithAlias],
            ["_routes.d.ts", templates.routesDts, routesWithAlias],
            ["_urlmap.ts", templates.urlmap, routesNoAlias],
          ] as const) {
            await filesGenerator.generateFile(join(apiDir, outFile), {
              template,
              context: {
                BANNER,
                apiDir,
                sourceFolder,
                routes,
              },
            });
          }
        };
      }
    }

    for (const handlerMap of [
      // 000 keep the order!
      watchMap.tplFiles, // 001
      watchMap.srcFiles, // 002
      watchMap.apiFiles, // 003
    ]) {
      for (const handler of Object.values(handlerMap)) {
        await handler();
      }
    }

    await filesGenerator.persistGeneratedFiles(
      join(sourceFolder, PLUGIN_NAME),
      (f) => join(sourceFolder, f),
    );
  }

  return {
    name: PLUGIN_NAME,

    async buildStart() {
      await esbuilder?.build();
    },

    resolveId(id) {
      if (virtualModules.fetch[id]) {
        return id;
      }
    },

    load(id) {
      if (virtualModules.fetch[id]) {
        return {
          code: virtualModules.fetch[id].code,
          map: null,
        };
      }
    },

    async transform(src, id) {
      if (id === resolvePath(fetchIdxFile)) {
        const hmrHandler = render(fetchHmrTpl, {});
        return {
          code: src + hmrHandler,
        };
      }

      if (virtualModules.fetch[id]) {
        const hmrHandler = render(fetchHmrTpl, virtualModules.fetch[id]);
        const { code } = await transform(src + hmrHandler, {
          loader: "ts",
        });
        return {
          code,
        };
      }
    },

    async handleHotUpdate({ server, file }) {
      for (const id of Object.keys(virtualModules.fetch)) {
        if (!virtualModules.fetch[id].watchFiles.includes(file)) {
          continue;
        }

        const virtualModule = server.moduleGraph.getModuleById(id);

        if (!virtualModule) {
          continue;
        }

        return [virtualModule];
      }
    },

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

    configResolved,

    async configureServer(server) {
      // using separate watcher cause api depends on a wider set of files
      await esbuilder?.watch();

      for (const map of Object.values(watchMap)) {
        server.watcher.add(Object.keys(map));
      }

      server.watcher.on("change", async (file) => {
        if (watchMap.tplFiles[file]) {
          await watchMap.tplFiles[file]();
          // regenerating everything when some template updated
          for (const handler of [
            ...Object.values(watchMap.srcFiles),
            ...Object.values(watchMap.apiFiles),
          ]) {
            await handler();
          }
        } else {
          for (const map of [watchMap.srcFiles, watchMap.apiFiles]) {
            if (map[file]) {
              await map[file]();
            }
          }
        }
      });
    },
  };
}
