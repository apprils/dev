import { join } from "path";

import { generate } from "ts-to-zod";

import type {
  MiddleworkerPayloadTypes,
  TypeDeclaration,
  TypeFile,
} from "./@types";

import { resolvePath } from "../base";
import { render, renderToFile } from "../render";

import schemaSourceTpl from "./templates/schema/source.tpl";
import schemaModuleTpl from "./templates/schema/module.tpl";

export async function zodSchemaFactory({
  sourceFolder,
  path,
  middleworkerPayloadTypes,
  typeDeclarations,
  typeFiles,
  importZodErrorHandlerFrom,
  cacheDir,
}: {
  sourceFolder: string;
  path: string;
  middleworkerPayloadTypes: MiddleworkerPayloadTypes;
  typeDeclarations: TypeDeclaration[];
  typeFiles: TypeFile[];
  importZodErrorHandlerFrom?: string;
  cacheDir: string;
}): Promise<string | undefined> {
  const payloadTypes = Object.entries(middleworkerPayloadTypes).map(
    ([index, text]) => {
      return {
        id: `PayloadValidation_ZodSchema_0${index}`,
        index,
        text,
      };
    },
  );

  if (!payloadTypes.length) {
    return;
  }

  const typeLiterals: string[] = [];

  for (const t of typeDeclarations) {
    if (t.importDeclaration) {
      typeLiterals.push(
        ...typeFiles.flatMap((e) =>
          t.importDeclaration?.path.startsWith(e.importPath) ? [e.content] : [],
        ),
      );
    } else {
      typeLiterals.push(t.text);
    }
  }

  const sourceText = render(schemaSourceTpl, {
    typeLiterals,
    payloadTypes,
  });

  const { getZodSchemasFile, errors } = generate({
    sourceText,
    nameFilter: (id) => payloadTypes.some((e) => e.id === id || e.text === id),
    getSchemaName: (e) => e,
  });

  const outpath = join(cacheDir, "@zod", path);

  await renderToFile(`${outpath}.ts`, schemaModuleTpl, {
    path,
    typeDeclarations,
    zodSchemas: errors.length ? "" : getZodSchemasFile("index.ts"),
    payloadTypes,
    errors,
    importZodErrorHandlerFrom,
  });

  return outpath.replace(resolvePath(".."), `${sourceFolder}/..`);
}
