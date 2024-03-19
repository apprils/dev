import { join, resolve } from "node:path";

import type { ResolvedConfig } from "vite";
import pgts from "@appril/pgts";

import type { Options, Table, TableAssets, TableDeclaration } from "./@types";
import type { ResolvedPluginOptions } from "../@types";

export async function extractTables(
  config: ResolvedConfig,
  options: ResolvedPluginOptions,
  schema: string,
) {
  const { sourceFolderPath, apiDir } = options;

  const {
    base,
    dbxConfig,
    alias = {},
    tableFilter,
    meta,
  } = options.crudGenerator as Options;

  const tableAssets = (
    table: TableDeclaration,
    { basename }: { basename: string },
  ): TableAssets => {
    const apiPath = join(base, basename);

    const apiFile = join(apiDir, apiPath, "index.ts");

    const partial: Omit<TableAssets, "meta"> = {
      basename,
      apiPath,
      apiBase: join(config.base, apiDir, apiPath),
      apiFile,
      apiFileFullpath: resolve(sourceFolderPath, apiFile),
    };

    return {
      ...partial,
      // biome-ignore format:
      meta: typeof meta === "function"
        ? meta({ ...table, ...partial })
        : { ...meta?.["*"], ...meta?.[basename] },
    };
  };

  const tableFlatMapper = (table: TableDeclaration): Table[] => {
    const tables: Table[] = [];

    if (!tableFilter || tableFilter(table)) {
      if (!table.primaryKey) {
        console.log(`[ ${table.name} ] - no primaryKey defined, skipping...`);
        return [];
      }

      tables.push({
        ...table,
        ...tableAssets(table, { basename: table.name }),
      });
    }

    const aliasNames: string[] = [];

    if (typeof alias[table.name] === "string") {
      aliasNames.push(alias[table.name] as string);
    } else if (Array.isArray(alias[table.name])) {
      aliasNames.push(...(alias[table.name] as string[]));
    }

    for (const basename of aliasNames) {
      tables.push({ ...table, ...tableAssets(table, { basename }) });
    }

    return tables;
  };

  const { tables } = await pgts(dbxConfig.connection, {
    ...dbxConfig,
    schemas: [schema],
  });

  return tables.flatMap(tableFlatMapper);
}
