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

export type Route = {
  name: string;
  importName: string;
  path: string;
  importPath: string;
  file: string;
  fileExt: string;
  meta: string;
  serialized: string;
  middleworkerParams: string;
  payloadValidation?: { importName: string; importPath: string };
};
