
import fsx from "fs-extra";
import mustache from "mustache";

// disabling escape
mustache.escape = (s: string) => s

export const BANNER = `/**
* @generated file, do not modify manually!
*/`

export function render<Context = {}>(template: string, context: Context): string {
  return mustache.render(template, { ...context })
}

export function renderToFile<Context = {}>(
  file: string,
  template: string,
  context: Context,
): Promise<void> {
  return fsx.outputFile(
    file,
    render(template, context),
    "utf8"
  )
}

