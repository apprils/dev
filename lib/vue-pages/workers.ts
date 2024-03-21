import { join } from "node:path";

import { stringify } from "yaml";

import type { VuePage, VuePageTemplates } from "../@types";
import { BANNER } from "../render";
import { fileGenerator } from "../base";
import { typedRoutes } from "./typed-routes";

import pageTpl from "./templates/page.tpl";
import routesTpl from "./templates/routes.tpl";
import typedRoutesTpl from "./templates/typed-routes.tpl";
import envStoreTpl from "./templates/env-store.tpl";
import { defaults } from "../defaults";

const { generateFile } = fileGenerator();

let sourceFolder: string;
let routerDir: string;
let storesDir: string;
let pagesDir: string;
let apiDir: string;

export async function bootstrap(data: {
  pages: VuePage[];
  sourceFolder: string;
  routerDir: string;
  storesDir: string;
  pagesDir: string;
  apiDir: string;
  customTemplates: VuePageTemplates;
}) {
  const { customTemplates } = data;

  sourceFolder = data.sourceFolder;
  routerDir = data.routerDir;
  storesDir = data.storesDir;
  pagesDir = data.pagesDir;
  apiDir = data.apiDir;

  for (const page of data.pages) {
    await generateVuePageFiles({ page, customTemplates });
  }

  await generateIndexFiles(data);
}

export async function handleSrcFileUpdate({
  file,
  pages,
  customTemplates,
}: { file: string; pages: VuePage[]; customTemplates: VuePageTemplates }) {
  // making sure newly added pages have files generated
  for (const page of pages.filter((e) => e.srcFile === file)) {
    await generateVuePageFiles({ page, customTemplates });
  }

  await generateIndexFiles({ pages });
}

async function generateVuePageFiles({
  page,
  customTemplates,
}: { page: VuePage; customTemplates: VuePageTemplates }) {
  await generateFile(
    join(pagesDir, page.file),
    {
      template: customTemplates.page || pageTpl,
      context: page,
    },
    { overwrite: false },
  );
}

async function generateIndexFiles(data: { pages: VuePage[] }) {
  const pages = data.pages.sort((a, b) => a.name.localeCompare(b.name));

  await generateFile(join(routerDir, defaults.vuePages.routesDtsFile), {
    template: typedRoutesTpl,
    context: {
      BANNER,
      routes: typedRoutes(pages),
    },
  });

  await generateFile(join(storesDir, defaults.vuePages.envStoreFile), {
    template: envStoreTpl,
    context: {
      BANNER,
      sourceFolder,
      apiDir,
      pagesWithEnvApi: pages.filter((e) => e.envApi),
    },
  });

  for (const [outfile, template] of [
    // biome-ignore format:
    [defaults.vuePages.routesFile, routesTpl],
  ]) {
    await generateFile(join(routerDir, outfile), {
      template,
      context: {
        BANNER,
        sourceFolder,
        pages,
        pagesDir,
        storesDir,
      },
    });
  }

  {
    const reducer = (map: Record<string, object>, page: VuePage) => {
      if (page.envApi) {
        map[page.envApi] = {};
      }
      return map;
    };

    const content = [
      BANNER.trim().replace(/^/gm, "#"),
      stringify(pages.reduce(reducer, {})),
    ].join("\n");

    await generateFile(join(apiDir, defaults.vuePages.envRoutesFile), content);
  }
}
