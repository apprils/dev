import { basename, join } from "path";
import { readFile } from "fs/promises";

import type { Plugin, ResolvedConfig } from "vite";
import { parse, stringify } from "yaml";

import type { View, ExportedView } from "./@types";

import { defaults } from "../defaults";
import { resolvePath, sanitizePath, filesGeneratorFactory } from "../base";
import { BANNER, renderToFile } from "../render";
import { typedRoutes } from "./typed-routes";

import viewTpl from "./templates/view.tpl";
import routesTpl from "./templates/routes.tpl";
import typedRoutesTpl from "./templates/typed-routes.tpl";
import urlmapTpl from "./templates/urlmap.tpl";
import envStoreTpl from "./templates/env-store.tpl";

const defaultTemplates = {
  view: viewTpl,
  routes: routesTpl,
  typedRoutes: typedRoutesTpl,
  urlmap: urlmapTpl,
  envStore: envStoreTpl,
};

type TemplateName = keyof typeof defaultTemplates;
type TemplateMap = Record<TemplateName, string>;

type Options = {
  routesDir?: string;
  viewsDir?: string;
  storesDir?: string;
  apiDir?: string;
  templates?: Partial<TemplateMap>;
};

type ViewDefinition = {
  params?: string;
  meta?: Record<string, unknown>;
  options?: Record<string, unknown>;
  env?: string | boolean;
};

/** {viewsDir}/_views.yml schema:

# will generate {viewsDir}/some-view.vue
some-view:

# will generate {viewsDir}/another-view/another-view.vue
another-view/:

# will generate {viewsDir}/another-view/base.vue
"another-view/base:

# will generate {viewsDir}/some-page.html.vue
some-page.html:

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
 *    - {routesDir}/_routes.ts
 *    - {routesDir}/_routes.d.ts
 *    - {viewsDir}/{view}.vue (or {viewsDir}/{view}/{view}.vue if path ends in a slash)
 *    - {storesDir}/env.ts
 *
 * @param {Object} [opts={}] - options
 * @param {string} [opts.routesDir="router"] - path to routes folder
 * @param {string} [opts.viewsDir="views"] - path to views folder
 *    should contain _views.yml file
 * @param {string} [opts.storesDir="stores"] - path to stores folder
 * @param {string} [opts.apiDir="api"] - path to api folder
 * @param {object} [opts.templates={}] - custom templates
 */

const PLUGIN_NAME = "@appril:viewsGeneratorPlugin";

export function viewsGeneratorPlugin(opts?: Options): Plugin {
  const {
    routesDir = defaults.routesDir,
    viewsDir = defaults.viewsDir,
    storesDir = defaults.storesDir,
    apiDir = defaults.apiDir,
    templates: optedTemplates = {},
  } = { ...opts };

  const sourceFolder = basename(resolvePath());

  const viewsFile = join(viewsDir, "_views.yml");

  async function generateFiles(config: ResolvedConfig) {
    const { generateFile } = filesGeneratorFactory();

    // re-reading files every time
    const templates: TemplateMap = { ...defaultTemplates };

    for (const [name, file] of Object.entries(optedTemplates)) {
      templates[name as TemplateName] = await readFile(
        resolvePath(file),
        "utf8",
      );
    }

    const viewDefinitions = parse(
      await readFile(resolvePath(viewsFile), "utf8"),
    );

    const viewEntries: [string, ViewDefinition][] = Object.entries(
      viewDefinitions,
    ).map(([p, d]) => [p, d || {}]);

    const views: ExportedView[] = [];

    for (const [viewPath, viewDefinition] of viewEntries) {
      const importPath = sanitizePath(viewPath).replace(/\/+$/, "");

      const suffix = /\/$/.test(viewPath)
        ? `/${basename(importPath)}.vue`
        : ".vue";

      const path = join(config.base, importPath.replace(/^index$/, "")).replace(
        /\/$/,
        "",
      );

      const { env } = viewDefinition;

      let envApi: string | undefined;

      if (typeof env === "string") {
        envApi = env;
      } else if (env === true) {
        envApi = join(viewPath, "env");
      }

      const view: View = {
        name: importPath,
        importName: importPath.replace(/\W/g, "_"),
        path,
        params: String(viewDefinition.params || ""),
        meta: JSON.stringify(
          "meta" in viewDefinition ? viewDefinition.meta : {},
        ),
        options: JSON.stringify(
          "options" in viewDefinition ? viewDefinition.options : {},
        ),
        importPath: importPath + suffix,
        file: importPath + suffix,
        envApi,
      };

      const serialized = JSON.stringify({
        name: view.name,
        path: view.path,
      });

      views.push({ ...view, serialized });

      await renderToFile(
        resolvePath(viewsDir, view.file),
        templates.view,
        {},
        { overwrite: false },
      );
    }

    for (const [outfile, template] of [
      ["_routes.ts", templates.routes],
      ["_urlmap.ts", templates.urlmap],
    ]) {
      await generateFile(join(routesDir, outfile), {
        template,
        context: {
          BANNER,
          sourceFolder,
          views,
          viewsDir,
          storesDir,
        },
      });
    }

    await generateFile(join(routesDir, "_routes.d.ts"), {
      template: templates.typedRoutes,
      context: {
        BANNER,
        routes: typedRoutes(views),
      },
    });

    await generateFile(join(storesDir, "env.ts"), {
      template: templates.envStore,
      context: {
        BANNER,
        sourceFolder,
        apiDir,
        viewsWithEnvApi: views.filter((e) => e.envApi),
      },
    });

    {
      const reducer = (map: Record<string, object>, { envApi }: View) => ({
        ...map,
        ...(envApi ? { [envApi]: {} } : {}),
      });

      const content = [
        BANNER.trim().replace(/^/gm, "#"),
        stringify(views.reduce(reducer, {})),
      ].join("\n");

      await generateFile(join(apiDir, "_000_env_routes.yml"), content);
    }
  }

  return {
    name: PLUGIN_NAME,

    configResolved: generateFiles,

    configureServer(server) {
      // adding optedTemplates to watchlist

      const watchedFiles = [...Object.values(optedTemplates)];

      if (watchedFiles.length) {
        server.watcher.add(watchedFiles);

        server.watcher.on("change", (file) => {
          if (watchedFiles.some((path) => file.includes(path))) {
            return generateFiles(server.config);
          }
        });
      }
    },
  };
}
