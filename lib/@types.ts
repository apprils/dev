
import { type Options as PrettierOptions } from "prettier";

export type CodeFormatter = (
  code: string,
  opts?: PrettierOptions,
) => Promise<string>;

export type RenderOptions = {
  format?: CodeFormatter;
}

