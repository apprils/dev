import { dirname, join } from "path";
import { parentPort } from "worker_threads";

import { generate } from "ts-to-zod";

import type { Route, TypeFile } from "../@types";
import { fileGenerator } from "../base";
import { render } from "../render";
import { extractApiAssets } from "../ast";
import { privateDefaults } from "../defaults";

import schemaSourceTpl from "./templates/schema-source.tpl";
import assetsTpl from "./templates/assets.tpl";
import indexTpl from "./templates/index.tpl";

const { generateFile } = fileGenerator();

let sourceFolder: string;
let assetsDir: string;
let importZodErrorHandlerFrom: string | undefined;

export async function bootstrap(data: {
  routes: Route[];
  sourceFolder: string;
  cacheDir: string;
  typeFiles: TypeFile[];
  importZodErrorHandlerFrom?: string;
}) {
  const { cacheDir, routes, typeFiles } = data;

  sourceFolder = data.sourceFolder;
  assetsDir = join(cacheDir, privateDefaults.cache.assetsDir);
  importZodErrorHandlerFrom = data.importZodErrorHandlerFrom;

  for (const route of routes) {
    await generateRouteAssets({ route, typeFiles });
  }

  await generateIndexFiles({ routes });
}

export async function handleSrcFileUpdate({
  file,
  routes,
  typeFiles,
}: {
  file: string;
  routes: Route[];
  typeFiles: TypeFile[];
}) {
  // making sure newly added routes have assets generated
  for (const route of routes.filter((e) => e.srcFile === file)) {
    await generateRouteAssets({ route, typeFiles });
  }

  await generateIndexFiles({ routes });
}

export async function generateRouteAssets({
  route,
  typeFiles,
}: {
  route: Route;
  typeFiles: TypeFile[];
}) {
  // biome-ignore format:
  const {
    typeDeclarations,
    middleworkerParams,
    middleworkerPayloadTypes,
  } = await extractApiAssets(route.fileFullpath, {
    root: sourceFolder,
    base: dirname(route.file),
  });

  const payloadTypes = Object.entries(middleworkerPayloadTypes).map(
    ([index, text]) => {
      return {
        id: `$__payloadValidation${padStart(index, 3)}__`,
        index,
        text,
      };
    },
  );

  const typeLiterals: string[] = [];

  for (const t of typeDeclarations.filter((e) => !e.importDeclaration)) {
    typeLiterals.push(t.text);
  }

  for (const typeFile of typeFiles) {
    typeLiterals.push(typeFile.content);

    if (
      typeDeclarations.some((e) =>
        e.importDeclaration?.path.startsWith(typeFile.importPath),
      )
    ) {
      if (!typeFile.routes.has(route.fileFullpath)) {
        parentPort?.postMessage({
          pool: "apiAssets",
          task: "updateTypeFiles",
          data: {
            typeFile: typeFile.file,
            addRoute: route.fileFullpath,
          },
        });
      }
    } else if (typeFile.routes.has(route.fileFullpath)) {
      parentPort?.postMessage({
        pool: "apiAssets",
        task: "updateTypeFiles",
        data: {
          typeFile: typeFile.file,
          removeRoute: route.fileFullpath,
        },
      });
    }
  }

  const sourceText = render(schemaSourceTpl, {
    typeLiterals,
    payloadTypes,
  });

  const { getZodSchemasFile, errors } = generate({
    sourceText,
    nameFilter: (id) => payloadTypes.some((e) => e.id === id || e.text === id),
    getSchemaName: (e) => e,
  });

  await generateFile(join(assetsDir, route.file), {
    template: assetsTpl,
    context: {
      ...route,
      middleworkerParams: Object.entries(middleworkerParams).map(
        ([index, text]) => ({ index, text }),
      ),
      typeDeclarations,
      zodSchemas: errors.length ? "" : getZodSchemasFile("index.ts"),
      payloadTypes: errors.length ? [] : payloadTypes,
      errors,
      importZodErrorHandlerFrom,
    },
  });
}

export async function generateIndexFiles({
  routes,
}: {
  routes: Route[];
}) {
  await generateFile(join(assetsDir, "index.ts"), {
    template: indexTpl,
    context: { routes },
  });
}

function padStart(
  str: string | number,
  maxlength: number,
  fill = "0",
  decorate?: (s: string | number) => string,
): string {
  const prefixLength = maxlength - String(str).length;

  // biome-ignore format:
  const prefix = prefixLength > 0
    ? Array(prefixLength).fill(fill).join("")
    : "";

  return decorate ? prefix + decorate(str) : prefix + str;
}
