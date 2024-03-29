export type PluginOptions = {
  esbuildConfig: import("esbuild").BuildOptions;
  apiDir?: string;
  routerDir?: string;
  pagesDir?: string;
  storesDir?: string;
  varDir?: string;
  useWorkers?: boolean;
  usePolling?: boolean;
  apiAssets?: {
    filter?: (route: Route) => boolean;
    typeMap?: Record<string, string | string[]>;
    importZodErrorHandlerFrom?: string;
  };
  apiGenerator?: {
    templates?: ApiTemplates;
  };
  apiHandler?: {
    flushPatterns?: RegExp[];
  };
  fetchGenerator?: {
    filter?: (route: Route) => boolean;
  };
  vuePages?: {
    templates?: VuePageTemplates;
  };
  crudGenerator?: import("./crud-generator/@types").Options;
};

export type ResolvedPluginOptions = Required<
  Omit<PluginOptions, "crudGenerator">
> & {
  sourceFolder: string;
  sourceFolderPath: string;
  crudGenerator?: import("./crud-generator/@types").Options;
};

export type MiddleworkerParams = Record<number, string>;
export type MiddleworkerPayloadTypes = Record<number, string>;

export type TypeFile = {
  file: string;
  importPath: string;
  content: string;
  routes: Set<string>;
};

export type TypeDeclaration = {
  text: string;
  importDeclaration?: {
    name: string;
    path: string;
  };
  typeAliasDeclaration?: {
    name: string;
    text: string;
  };
  interfaceDeclaration?: {
    name: string;
    text: string;
  };
};

export type FetchDefinitionOverload = {
  paramsType: { name: string; text: string };
  payloadType: { name: string; text: string };
  bodyType: string;
};

export type FetchDefinition = {
  method: string;
  httpMethod: string;
  overloads: FetchDefinitionOverload[];
  bodyType: string;
};

export type RouteSetup = {
  name?: string;
  basename?: string;
  alias?: string | string[];
  file?: string;
  template?: string;
  meta?: Record<string, unknown>;
};

export type Route = {
  srcFile: string;
  name: string;
  basename: string;
  path: string;
  importName: string;
  importPath: string;
  // relative file path
  file: string;
  // abs file path
  fileFullpath: string;
  meta: string;
  serialized: string;
  assetsPath?: string;
  template?: string;
};

export type RouteAlias = Omit<Route, "serialized">;

export type ApiTemplates = {
  route?: string;
};

export type VuePageSetup = {
  params?: string;
  env?: string | boolean;
  meta?: Record<string, unknown>;
  options?: Record<string, unknown>;
};

export type VuePage = {
  srcFile: string;
  name: string;
  importName: string;
  path: string;
  params: string;
  file: string;
  meta: string;
  options: string;
  importPath: string;
  envApi?: string;
  serialized?: string;
};

export type VuePageTemplates = {
  page?: string;
};

// biome-ignore format:
export type BootstrapPayload<
  T extends { bootstrap: (_p: never) => void }
> = Parameters<T["bootstrap"]>[0];
