export type View = {
  name: string;
  importName: string;
  path: string;
  params: string;
  file: string;
  meta: string;
  options: string;
  importPath: string;
  envApi?: string;
};

export type ExportedView = View & {
  serialized: string;
};
