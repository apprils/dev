import { join } from "node:path";

import { stringify } from "yaml";

import type { View, ViewTemplates } from "../@types";
import { BANNER } from "../render";
import { fileGenerator } from "../base";
import { typedRoutes } from "./typed-routes";

import viewTpl from "./templates/view.tpl";
import routesTpl from "./templates/routes.tpl";
import typedRoutesTpl from "./templates/typed-routes.tpl";
import urlmapTpl from "./templates/urlmap.tpl";
import envStoreTpl from "./templates/env-store.tpl";
import { privateDefaults } from "../defaults";

const { generateFile } = fileGenerator();

let sourceFolder: string;
let routesDir: string;
let storesDir: string;
let viewsDir: string;
let apiDir: string;

export async function bootstrap(data: {
  views: View[];
  sourceFolder: string;
  routesDir: string;
  storesDir: string;
  viewsDir: string;
  apiDir: string;
  customTemplates: ViewTemplates;
}) {
  const { customTemplates } = data;

  sourceFolder = data.sourceFolder;
  routesDir = data.routesDir;
  storesDir = data.storesDir;
  viewsDir = data.viewsDir;
  apiDir = data.apiDir;

  for (const view of data.views) {
    await generateViewFiles({ view, customTemplates });
  }

  await generateIndexFiles(data);
}

export async function handleSrcFileUpdate({
  file,
  views,
  customTemplates,
}: { file: string; views: View[]; customTemplates: ViewTemplates }) {
  // making sure newly added views have files generated
  for (const view of views.filter((e) => e.srcFile === file)) {
    await generateViewFiles({ view, customTemplates });
  }

  await generateIndexFiles({ views });
}

async function generateViewFiles({
  view,
  customTemplates,
}: { view: View; customTemplates: ViewTemplates }) {
  await generateFile(
    join(viewsDir, view.file),
    {
      template: customTemplates.view || viewTpl,
      context: {},
    },
    { overwrite: false },
  );
}

async function generateIndexFiles(data: { views: View[] }) {
  const views = data.views.sort((a, b) => a.name.localeCompare(b.name));

  await generateFile(join(routesDir, "_routes.d.ts"), {
    template: typedRoutesTpl,
    context: {
      BANNER,
      routes: typedRoutes(views),
    },
  });

  await generateFile(join(storesDir, "env.ts"), {
    template: envStoreTpl,
    context: {
      BANNER,
      sourceFolder,
      apiDir,
      viewsWithEnvApi: views.filter((e) => e.envApi),
    },
  });

  for (const [outfile, template] of [
    [privateDefaults.views.routesFile, routesTpl],
    [privateDefaults.views.urlmapFile, urlmapTpl],
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

  {
    const reducer = (map: Record<string, object>, view: View) => {
      if (view.envApi) {
        map[view.envApi] = {};
      }
      return map;
    };

    const content = [
      BANNER.trim().replace(/^/gm, "#"),
      stringify(views.reduce(reducer, {})),
    ].join("\n");

    await generateFile(join(apiDir, "_000_env_routes.yml"), content);
  }
}
