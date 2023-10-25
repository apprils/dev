
export type ExtraFileSetup = string | {
  template: string;
  overwrite: boolean;
}

export type ExtraFileEntry = {
  outfile: string;
  template: string;
  overwrite: boolean;
}

