import { type Options, format } from "prettier";
import defaultOptions from "@appril/prettier-config";

export default function prettier(
  options?: Options,
): import("../@types").CodeFormatter {
  return function prettierFormatter(
    code: string,
    customOptions?: Options,
  ): Promise<string> {
    return format(code, {
      parser: "typescript",
      ...defaultOptions,
      ...options,
      ...customOptions,
    } as Options);
  };
}
