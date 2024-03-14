import { dirname, join } from "node:path";

import { stringify } from "yaml";
import fsx from "fs-extra";
import readTemplates from "@appril/crud/templates";
import type { ApiTypesLiteral, DefaultTemplates } from "@appril/crud";

import { BANNER, render } from "../render";
import { fileGenerator } from "../base";

import type { CustomTemplates, Table } from "./@types";
import { extractTypes } from "./ast";

const { generateFile } = fileGenerator();

let defaultTemplates: DefaultTemplates;

// all these values are static so it's safe to store them at initialization;
// tables and customTemplates instead are constantly updated
// so should be provided to workers on every call
let rootPath: string;
let cacheDir: string;
let apiDir: string;
let sourceFolder: string;
let base: string;
let dbxBase: string;

export async function bootstrap(data: {
  rootPath: string;
  cacheDir: string;
  apiDir: string;
  sourceFolder: string;
  base: string;
  dbxBase: string;
  tables: Table[];
  customTemplates: CustomTemplates;
}) {
  const { tables, customTemplates } = data;

  rootPath = data.rootPath;
  cacheDir = data.cacheDir;
  apiDir = data.apiDir;
  sourceFolder = data.sourceFolder;
  base = data.base;
  dbxBase = data.dbxBase;

  // should always go first
  defaultTemplates = await readTemplates();

  // next after templates
  await updateTsconfig();
  await generateFile(join(cacheDir, "env.d.ts"), "");

  for (const table of tables) {
    await generateClientModules({ table, customTemplates });
  }

  await generateApiIndexFiles({ tables, customTemplates });
}

export async function handleSchemaFileUpdate({
  tables,
  schema,
  customTemplates,
}: {
  tables: Table[];
  schema: string;
  customTemplates: CustomTemplates;
}) {
  // ensuring modules generated for newly added tables
  for (const table of tables.filter((e) => e.schema === schema)) {
    await generateClientModules({ table, customTemplates });
  }

  // ensuring newly added tables reflected in api index files
  await generateApiIndexFiles({ tables, customTemplates });
}

export async function handleApiFileUpdate({
  table,
  customTemplates,
}: {
  table: Table;
  customTemplates: CustomTemplates;
}) {
  // rebuilding client modules for table represented by updated api file
  await generateClientModules({ table, customTemplates });

  // only client modules updated here, api index files not affected
}

export async function handleCustomTemplateUpdate({
  tables,
  customTemplates,
}: {
  tables: Table[];
  customTemplates: CustomTemplates;
}) {
  // rebuilding client modules for all tables when some custom template updated
  for (const table of tables) {
    await generateClientModules({ table, customTemplates });
  }

  // customTemplates only relevant to client modules, api index files not affected
}

async function generateApiIndexFiles(data: {
  tables: Table[];
  customTemplates: CustomTemplates;
}) {
  const tables = data.tables.sort((a, b) => a.name.localeCompare(b.name));
  const templates = { ...defaultTemplates.api, ...data.customTemplates?.api };

  const routes: Record<
    string,
    {
      name: string;
      basename: string;
      file: string;
      template: string;
      meta: Record<string, unknown>;
    }
  > = {};

  for (const table of tables) {
    routes[table.apiPath] = {
      name: table.apiPath,
      basename: table.basename,
      file: table.apiFile,
      template: templates["route.ts"].file,
      meta: table.meta,
    };
  }

  // not creating route file directly,
  // rather adding a corresponding entry to yml file
  // and file will be created by api generator plugin
  await generateFile(
    join(apiDir, `_000_${base}_routes.yml`),
    [BANNER.trim().replace(/^/gm, "#"), stringify(routes)].join("\n"),
  );

  // generating a bundle file containing api constructors for all tables
  await generateFile(join(apiDir, base, "base.ts"), {
    template: templates["base.ts"].content,
    context: {
      BANNER,
      sourceFolder,
      dbxBase,
      tables,
    },
  });
}

async function generateClientModules({
  table,
  customTemplates,
}: {
  table: Table;
  customTemplates: CustomTemplates;
}) {
  const apiTypes = await extractTypes(table.apiFileFullpath, {
    root: sourceFolder,
    base: dirname(table.apiFile),
  });

  const templates = { ...defaultTemplates.client, ...customTemplates.client };

  for (const [file, tpl] of Object.entries(templates)) {
    // biome-ignore format:
    let content = [
      [/@crud:base-placeholder\b/, base],
    ].reduce(
      (prev, [regex, text]) => prev.replace(regex, text as string),
      tpl.content,
    );

    const context: Record<string, unknown> = {
      ...table,
      dbxBase,
      apiTypes,
    };

    if (["assets.ts", "apiTypes.ts"].includes(file)) {
      const apiTypesLiteral: ApiTypesLiteral = {
        EnvT: false,
        ListAssetsT: false,
        ItemAssetsT: false,
      };

      for (const key of Object.keys(
        apiTypesLiteral,
      ) as (keyof ApiTypesLiteral)[]) {
        apiTypesLiteral[key] = key in apiTypes;
      }

      context.apiTypesLiteral = JSON.stringify(apiTypesLiteral);

      content = render(content, context);
    }

    await generateFile(join(cacheDir, table.basename, file), content);
  }
}

async function updateTsconfig() {
  const paths = {
    // join is inappropriate here, we need slashes in any environment
    [`${base}/*`]: `${cacheDir.replace(rootPath, "..")}/*`,
  };

  const tsconfigPath = join(rootPath, sourceFolder, "tsconfig.json");

  let tsconfig = JSON.parse(await fsx.readFile(tsconfigPath, "utf8"));

  let updateTsconfig = false;

  for (const [key, val] of Object.entries(paths)) {
    if (tsconfig.compilerOptions.paths?.[key]?.includes?.(val)) {
      continue;
    }

    tsconfig = {
      ...tsconfig,
      compilerOptions: {
        ...tsconfig.compilerOptions,
        paths: {
          ...tsconfig.compilerOptions.paths,
          [key]: [val],
        },
      },
    };

    updateTsconfig = true;
  }

  if (updateTsconfig) {
    await fsx.writeJson(tsconfigPath, tsconfig, {
      spaces: 2,
    });
  }
}
