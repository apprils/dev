import type { TableDeclaration } from "@appril/pgts";

import type {
  ApiTemplates,
  ClientTemplates,
  DefaultTemplates,
} from "@appril/crud";

export type { TableDeclaration };

export type TableAssets = {
  // tabme name for tables or alias name for aliases
  basename: string;
  // relative path inside apiDir, e.g. crud/products/
  apiPath: string;
  // fetch URL, e.g. /admin/api/crud/products
  apiBase: string;
  // relative path to file inside sourceFolder, e.g. api/crud/products/index.ts
  apiFile: string;
  apiFileFullpath: string;
  meta: Record<string, unknown>;
};

export type Table = TableDeclaration & TableAssets;

export type Options = {
  base: string;

  dbxConfig: import("@appril/pgts").Config & {
    connection: string | import("@appril/pgts").ConnectionConfig;
    base: string;
  };

  /**
    allowing multiple schemas. default: [ public ]
    same name tables would render inconsistently,
    so consider serve schemas separately, each with own base.
    eg. products table contained in both public and store schemas:
    plugins: [
      crudPlugin({ base: "crud", schemas: [ "public" ] }),
      crudPlugin({ base: "crudStore", schemas: [ "store" ] }),
    ] */
  schemas?: string[];

  apiTemplates?: ApiTemplates;
  clientTemplates?: ClientTemplates;

  alias?: Record<string, string | string[]>;
  tableFilter?: (t: TableDeclaration) => boolean;
  meta?:
    | Record<string, Record<string, unknown>>
    | ((t: Omit<Table, "meta">) => Record<string, unknown>);
};

export type CustomTemplates = {
  [K in keyof DefaultTemplates]: Partial<DefaultTemplates[K]>;
};
