import { join } from "node:path";

import type { ResolvedConfig } from "vite";
import { glob } from "fast-glob";
import fsx from "fs-extra";
import { sortTemplates } from "@appril/crud/templates";

import type { ResolvedPluginOptions, BootstrapPayload } from "../@types";
import type { CustomTemplates, Options, Table } from "./@types";
import { resolvePath } from "../base";
import { extractTables } from "./tables";

type Workers = typeof import("./workers");

export async function crudGenerator(
  config: ResolvedConfig,
  options: ResolvedPluginOptions,
  { workerPool }: { workerPool: Workers },
) {
  const { sourceFolder, apiDir } = options;

  const {
    base,
    dbxConfig,
    schemas = ["public"],
  } = options.crudGenerator as Options;

  const tableMap: Record<string, Table> = {};

  const tplWatchers: Record<string, () => Promise<void>> = {};
  const schemaWatchers: Record<string, () => Promise<string>> = {};

  const customTemplates: CustomTemplates = {
    api: {},
    client: {},
  };

  const watchHandler = async (file: string) => {
    if (schemaWatchers[file]) {
      // updating tableMap
      const schema = await schemaWatchers[file]();

      // then feeding it to worker
      await workerPool.handleSchemaFileUpdate({
        schema,
        tables: Object.values(tableMap),
        customTemplates,
      });

      return;
    }

    if (tplWatchers[file]) {
      // updating customTemplates
      await tplWatchers[file]();

      // then feeding it to worker
      await workerPool.handleCustomTemplateUpdate({
        tables: Object.values(tableMap),
        customTemplates,
      });

      return;
    }

    for (const table of Object.values(tableMap)) {
      if (table.apiFileFullpath === file) {
        await workerPool.handleApiFileUpdate({
          table,
          customTemplates,
        });
        return;
      }
    }
  };

  const cacheDir = join(config.cacheDir, base);

  // watching custom templates for updates
  for (const [key, map] of Object.entries(customTemplates) as [
    k: keyof CustomTemplates,
    v: Record<string, { file: string; content: string }>,
  ][]) {
    const optedTemplates = options.crudGenerator?.[`${key}Templates`];

    let customMap: Record<string, string> = {};

    if (typeof optedTemplates === "string") {
      const entries = await glob(join(optedTemplates, "**/*"), {
        cwd: resolvePath(),
        objectMode: true,
        absolute: false,
        onlyFiles: true,
        deep: 3,
      });

      for (const { name, path } of entries.sort(sortTemplates)) {
        customMap[name.replace(".tpl", "")] = path;
      }
    } else if (typeof optedTemplates === "object") {
      customMap = optedTemplates;
    }

    for (const [name, path] of Object.entries(customMap)) {
      const file = resolvePath(path);
      tplWatchers[file] = async () => {
        map[name] = {
          file,
          content: await fsx.readFile(file, "utf8"),
        };
      };
    }
  }

  // watching schemas for added/removed tables
  for (const schema of schemas) {
    const file = resolvePath(dbxConfig.base, join(schema, "index.ts"));

    schemaWatchers[file] = async () => {
      const tables = await extractTables({
        apiDir,
        options: options.crudGenerator as Options,
        config,
        schema,
      });

      for (const table of tables) {
        tableMap[table.basename] = table;
      }

      return schema;
    };
  }

  // populating customTemplates for bootstrap
  for (const handler of Object.values(tplWatchers)) {
    await handler();
  }

  // pupulating tableMap for bootstrap
  for (const handler of Object.values(schemaWatchers)) {
    await handler();
  }

  const bootstrapPayload: BootstrapPayload<Workers> = {
    rootPath: resolvePath(".."),
    cacheDir,
    apiDir,
    sourceFolder,
    base,
    dbxBase: dbxConfig.base,
    tables: Object.values(tableMap),
    customTemplates,
  };

  return {
    bootstrapPayload,
    watchHandler,
    watchPatterns: [
      // watching custom templates;
      // regenerate all tables modules on change
      ...Object.keys(tplWatchers),

      // watching schema files for added/removed tables;
      // extract tables and rebuild schema tables modules on change
      ...Object.keys(schemaWatchers),

      // watching api files;
      // regenerate table modules on change
      ...[`${resolvePath(apiDir)}/**/*.ts`],
    ],
  };
}
