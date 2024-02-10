export const METHODS = ["get", "post", "put", "patch", "del"] as const;

export type Method = (typeof METHODS)[number];

export type MethodOverloadParam = {
  scope: "params" | "payload" | "explicitPayload";
  name: string;
  type: string;
  optional: boolean;
};

export type MethodOverload = {
  method: Method;
  params: MethodOverloadParam[];
  renderedParams: string[];
  bodyType: string;
};

export type PayloadParam = MethodOverloadParam & {
  id: string;
  method: Method;
  params: string;
};

export type Endpoint = {
  method: Method;
  useMethod: string;
  httpMethod: string;
  overloads: MethodOverload[];
  bodyType: string;
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
  fetchModuleId?: string;
  schemaModuleId?: string;
};
