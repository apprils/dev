export type MiddleworkerParams = Record<number, string>;
export type MiddleworkerPayloadTypes = Record<number, string>;

export type TypeFile = {
  importPath: string;
  file: string;
  content: string;
  rebuild: () => Promise<void>;
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
  alias?: string | string[];
  file?: string;
  template?: string;
  meta?: Record<string, unknown>;
};

export type Route = {
  name: string;
  path: string;
  importName: string;
  importPath: string;
  file: string;
  fileExt: string;
  meta: string;
  serialized: string;
};
