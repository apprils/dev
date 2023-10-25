
export type View = {
  name: string;
  path: string;
  params: string;
  file: string;
  meta: string;
  options: string;
  importPath: string;
  envApi?: string;
  envType: string;
}

export type ExportedView = View & {
  serialized: string;
}

