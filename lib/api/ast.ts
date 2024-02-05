import { resolve, join } from "path";

import * as tsquery from "@phenomnomnominal/tsquery";

import {
  type Node,
  type CallExpression,
  type Expression,
  type ImportSpecifier,
  type ImportDeclaration,
  type FunctionExpression,
  type ArrowFunction,
  isArrowFunction,
  isFunctionExpression,
  isStringLiteral,
} from "typescript";

type MethodOverload = {
  method: string;
  args: string[];
  bodyType: string;
};

const METHODS = ["get", "post", "put", "patch", "del"] as const;

const HTTP_METHODS = {
  get: "GET",
  post: "POST",
  put: "PUT",
  patch: "PATCH",
  del: "DELETE",
} as const;

const METHODS_REGEX = new RegExp(`\\b(${METHODS.join("|")})\\b`);

type Method = (typeof METHODS)[number];

export function extractTypedEndpoints(
  src: string,
  opt: {
    root: string;
    base: string;
  },
): {
  typeDeclarations: string[];
  endpoints: { method: string; overloads: MethodOverload[] }[];
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

  const endpoints: Partial<Record<Method, MethodOverload[]>> = {};

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
    const [method] = (node.expression.getText().match(METHODS_REGEX) ||
      []) as Method[];

    if (!method || !METHODS.includes(method)) {
      continue;
    }

    const handler = node.arguments.find(
      (e) => isArrowFunction(e) || isFunctionExpression(e),
    ) as ArrowFunction | FunctionExpression;

    const args = argumentsMapper(node.arguments?.[0], handler);

    let bodyType;

    if (node.typeArguments?.[2]) {
      // BodyT provided as TypeArgument, like
      // get<StateT, ContextT, BodyT>(...)
      bodyType = node.typeArguments[2].getText();
    } else if (handler) {
      // provided as explicit return type
      // get(async (ctx): BodyT => {...})
      bodyType = getReturnType(handler);
    }

    if (!endpoints[method]) {
      endpoints[method] = [];
    }

    endpoints[method]?.push({
      method,
      args,
      bodyType: bodyType || "unknown",
    });
  }

  return {
    typeDeclarations: [...typeDeclarations],
    endpoints: Object.entries(endpoints).map(([method, overloads]) => {
      return {
        method,
        useMethod: method.replace(/^\w/, (m) => "use" + m.toUpperCase()),
        httpMethod: HTTP_METHODS[method as Method],
        overloads,
      };
    }),
  };
}

function argumentsMapper(
  exp: Expression,
  handler: ArrowFunction | FunctionExpression | undefined,
) {
  // prettier-ignore
  const pathParams = isStringLiteral(exp)
    ? exp.getText().replace(/^\W|\W$/g, "") // removing quotes
    : null;

  const wildcardParams = pathParams?.includes("*");
  const optionalParams = pathParams?.includes("?");

  const payloadParam = handler?.parameters[1];
  let payloadType = "Record<string, any>";
  let payloadRequired = false;

  if (payloadParam) {
    const [typeExp] = tsquery
      .match(payloadParam, "TypeReference,TypeLiteral,AnyKeyword")
      .filter((e) => e.parent === payloadParam);

    if (typeExp) {
      payloadType = typeExp.getText();

      if (
        !tsquery
          .match(payloadParam, "QuestionToken")
          .filter((e) => e.parent === payloadParam).length
      ) {
        payloadRequired = true;
      }

      if (wildcardParams || optionalParams) {
        payloadRequired = false;
      }
    }
  }

  const args = [`payload${payloadRequired ? "" : "?"}: ${payloadType}`];

  if (!pathParams) {
    return args;
  }

  if (wildcardParams) {
    return ["params?: (string|number)[]", ...args];
  }

  for (const [i, arg] of pathParams.split("/").reverse().entries()) {
    const suffix = [0, i, arg.endsWith("?") ? "?" : ""].join("");
    if (/^:/.test(arg)) {
      args.unshift(`${arg.replace(/\W/g, "_")}${suffix}: string|number`);
    } else {
      args.unshift(`literal${suffix}: "${arg}"`);
    }
  }

  return args;
}

function getReturnType(node: Expression | Node): string | undefined {
  const [typeExp] = tsquery
    .match(node, "TypeReference,TypeLiteral,AnyKeyword")
    .filter((e) => e.parent === node);

  if (!typeExp) {
    return;
  }

  if (/^Promise(\s+)?</.test(typeExp.getText())) {
    const [wrappedType] = tsquery.match(
      typeExp,
      [
        "TypeReference:first-child",
        "TypeLiteral:first-child",
        "AnyKeyword:first-child",
      ].join(","),
    );

    return wrappedType?.getText();
  }

  return typeExp.getText();
}
