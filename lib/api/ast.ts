import { resolve, join } from "path";

import * as tsquery from "@phenomnomnominal/tsquery";

import {
  type Node,
  type CallExpression,
  type Expression,
  type ImportSpecifier,
  type ImportDeclaration,
  SyntaxKind,
  isArrowFunction,
  isFunctionExpression,
} from "typescript";

type Entry = {
  method: string;
  args: string[];
  bodyType: string;
};

const METHODS = ["get", "post", "put", "patch", "del"];

const METHODS_REGEX = new RegExp(`\\b(${METHODS.join("|")})\\b`);

export function extractTypedEndpoints(
  src: string,
  opt: {
    root: string;
    base: string;
  },
): {
  typeDeclarations: string[];
  endpoints: { method: string; entries: Entry[] }[];
} {
  const ast = tsquery.ast(src);

  const callExpressions: CallExpression[] = tsquery.match(
    ast,
    "ExportAssignment ArrayLiteralExpression > CallExpression",
  );

  const importDeclarations: ImportDeclaration[] = tsquery.match(
    ast,
    "ImportDeclaration",
  );

  const interfaceDeclarations = tsquery.match(ast, "InterfaceDeclaration");

  const typeAliasDeclarations = tsquery.match(ast, "TypeAliasDeclaration");

  const typeDeclarations = new Set<string>();
  const endpoints: Record<string, Entry[]> = {};

  for (const node of [...importDeclarations]) {
    let path = node.moduleSpecifier
      .getText()
      .replace(/^\W|\W$/g, "" /** removing quotes */);

    if (/^\.\.?\/?/.test(path)) {
      path = join(opt.root, resolve(opt.base, path));
    }

    for (const spec of tsquery.match(
      node,
      "ImportSpecifier",
    ) as ImportSpecifier[]) {
      if (node.importClause?.isTypeOnly) {
        typeDeclarations.add(
          `import type { ${spec.getText()} } from "${path}";`,
        );
      } else if (spec.isTypeOnly) {
        typeDeclarations.add(`import { ${spec.getText()} } from "${path}";`);
      }
    }
  }

  for (const node of [...interfaceDeclarations, ...typeAliasDeclarations]) {
    typeDeclarations.add(node.getText());
  }

  for (const node of callExpressions) {
    const [method] = node.expression.getText().match(METHODS_REGEX) || [];

    if (!method || !METHODS.includes(method)) {
      continue;
    }

    const args = argumentsMapper(node.arguments?.[0]);

    let bodyType;

    if (node.typeArguments?.[2]) {
      // BodyT provided as TypeArgument, like
      // get<StateT, ContextT, BodyT>(...)
      bodyType = node.typeArguments[2].getText();
    } else {
      const handler = node.arguments.find(
        (e) => isArrowFunction(e) || isFunctionExpression(e),
      );

      if (handler) {
        // provided as explicit return type
        // get(async (ctx): BodyT => {...})
        bodyType = getReturnType(handler);
      }
    }

    if (!endpoints[method]) {
      endpoints[method] = [];
    }

    endpoints[method].push({
      method,
      args,
      bodyType: bodyType || "unknown",
    });
  }

  return {
    typeDeclarations: [...typeDeclarations],
    endpoints: Object.entries(endpoints).map(([method, entries]) => ({
      method,
      entries,
    })),
  };
}

function argumentsMapper(exp: Expression) {
  const args = ["data?: Record<string, any>"];

  if (!exp || exp.kind !== SyntaxKind.StringLiteral) {
    return args;
  }

  const text = exp.getText().replace(/^\W|\W$/g, ""); // removing quotes

  if (/\*/.test(text)) {
    // accept any number of args
    args[0] = "...args: (string|number|Record<string, any>)[]";
  } else {
    for (const [i, arg] of text.split("/").reverse().entries()) {
      if (/^:/.test(arg)) {
        args.unshift(`${arg.replace(/\W/g, "_")}0${i}: string|number`);
      } else {
        args.unshift(`literal0${i}: "${arg}"`);
      }
    }
  }

  return args;
}

function getReturnType(node: Expression | Node): string | undefined {
  const [typeReference] = tsquery
    .match(node, "TypeReference,TypeLiteral,AnyKeyword")
    .filter((e) => e.parent === node);

  if (typeReference) {
    if (/^Promise(\s+)?</.test(typeReference.getText())) {
      const [wrappedType] = tsquery.match(
        typeReference,
        "TypeReference:first-child,TypeLiteral:first-child,AnyKeyword:first-child",
      );

      return wrappedType?.getText();
    }

    return typeReference.getText();
  }
}
