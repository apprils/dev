import { join } from "node:path";

import { stringify } from "yaml";

import type { View, ViewTemplates } from "../@types";
import { BANNER } from "../render";
import { fileGenerator } from "../base";
import { typedRoutes } from "./typed-routes";

import viewTpl from "./templates/view.tpl";
import routesTpl from "./templates/routes.tpl";
import typedRoutesTpl from "./templates/typed-routes.tpl";
import envStoreTpl from "./templates/env-store.tpl";
import { defaults } from "../defaults";

const { generateFile } = fileGenerator();

let sourceFolder: string;
let routerDir: string;
let storesDir: string;
let viewsDir: string;
let apiDir: string;

export async function bootstrap(data: {
  views: View[];
  sourceFolder: string;
  routerDir: string;
  storesDir: string;
  viewsDir: string;
  apiDir: string;
  customTemplates: ViewTemplates;
}) {
  const { customTemplates } = data;

  sourceFolder = data.sourceFolder;
  routerDir = data.routerDir;
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

  await generateFile(join(routerDir, defaults.views.routesDtsFile), {
    template: typedRoutesTpl,
    context: {
      BANNER,
      routes: typedRoutes(views),
    },
  });

  await generateFile(join(storesDir, defaults.views.envStoreFile), {
    template: envStoreTpl,
    context: {
      BANNER,
      sourceFolder,
      apiDir,
      viewsWithEnvApi: views.filter((e) => e.envApi),
    },
  });

  for (const [outfile, template] of [
    // biome-ignore format:
    [defaults.views.routesFile, routesTpl],
  ]) {
    await generateFile(join(routerDir, outfile), {
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

    await generateFile(join(apiDir, defaults.views.envRoutesFile), content);
  }
}
