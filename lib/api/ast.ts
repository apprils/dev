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
  type TypeAliasDeclaration,
  type InterfaceDeclaration,
  isArrowFunction,
  isFunctionExpression,
  isStringLiteral,
} from "typescript";

import {
  type Method,
  type MethodOverloadParam,
  type MethodOverload,
  type PayloadParam,
  type Endpoint,
  type TypeDeclaration,
  METHODS,
} from "./@types";

const HTTP_METHODS = {
  get: "GET",
  post: "POST",
  put: "PUT",
  patch: "PATCH",
  del: "DELETE",
} as const;

const METHODS_REGEX = new RegExp(`\\b(${METHODS.join("|")})\\b`);

const PATH_PARAMS_REPLACE_MAP: Record<string, string> = {
  $: "$",
  ":": "_$s_", // start
  "/": "_$d_", // delimiter
  "-": "_$h_", // hyphen
  "?": "_$o_", // optional
  "*": "_$w_", // wildcard
};

export function extractTypedEndpoints(
  src: string,
  opt: {
    root: string;
    base: string;
  },
): {
  typeDeclarations: TypeDeclaration[];
  endpoints: Endpoint[];
  payloadParams: PayloadParam[];
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

  const interfaceDeclarations: InterfaceDeclaration[] = tsquery.match(
    ast,
    "InterfaceDeclaration",
  );

  const typeAliasDeclarations: TypeAliasDeclaration[] = tsquery.match(
    ast,
    "TypeAliasDeclaration",
  );

  const typeDeclarationsMap: Record<string, TypeDeclaration> = {};

  const endpoints: Partial<Record<Method, MethodOverload[]>> = {};

  const payloadParams: PayloadParam[] = [];

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
      const name = spec.getText();
      let text: string;
      if (node.importClause?.isTypeOnly) {
        text = `import type { ${name} } from "${path}";`;
      } else if (spec.isTypeOnly) {
        text = `import { ${name} } from "${path}";`;
      } else {
        continue;
      }
      typeDeclarationsMap[text] = { text, importDeclaration: { name, path } };
    }
  }

  for (const node of interfaceDeclarations) {
    const props = tsquery
      .match(node, "PropertySignature")
      .filter((e) => e.parent === node);

    const text = node.getText();

    typeDeclarationsMap[text] = {
      text,
      interfaceDeclaration: {
        name: node.name.getText(),
        text: `{ ${props.map((e) => e.getText()).join("\n")} }`,
      },
    };
  }

  for (const node of typeAliasDeclarations) {
    const props = tsquery
      .match(node, "TypeReference,IntersectionType")
      .filter((e) => e.parent === node);

    const text = node.getText();

    typeDeclarationsMap[text] = {
      text,
      typeAliasDeclaration: {
        name: node.name.getText(),
        text: props.map((e) => e.getText()).join("\n"),
      },
    };
  }

  const typeDeclarations = Object.values(typeDeclarationsMap);

  for (const node of callExpressions) {
    const [method] = (node.expression.getText().match(METHODS_REGEX) ||
      []) as Method[];

    if (!method || !METHODS.includes(method)) {
      continue;
    }

    const pathParams = isStringLiteral(node.arguments?.[0])
      ? node.arguments?.[0].getText().replace(/^\W|\W$/g, "") // removing quotes
      : null;

    const pathParamsId = pathParams?.replace(
      /\W/,
      (s) => PATH_PARAMS_REPLACE_MAP[s] || "_",
    );

    const handler = node.arguments.find(
      (e) => isArrowFunction(e) || isFunctionExpression(e),
    ) as ArrowFunction | FunctionExpression;

    const params = argumentsMapper(pathParams, handler);
    const payloadParam = params.find((e) => e.scope === "explicitPayload");

    if (payloadParam) {
      payloadParams.push({
        ...payloadParam,
        id: `__$${method}_${pathParamsId || ""}__$schema`,
        method,
        params: pathParams || "",
      });
    }

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
      params,
      renderedParams: params.map(
        (e) => `${e.name}${e.optional ? "?" : ""}: ${e.type}`,
      ),
      bodyType: bodyType || "unknown",
    });
  }

  const endpointsEntries = Object.entries(endpoints) as [
    m: Method,
    o: MethodOverload[],
  ][];

  return {
    typeDeclarations,
    payloadParams,
    endpoints: endpointsEntries.map(([method, overloads]): Endpoint => {
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
  pathParams: string | null,
  handler: ArrowFunction | FunctionExpression | undefined,
): MethodOverloadParam[] {
  const wildcardParams = pathParams?.includes("*");
  const optionalParams = pathParams?.includes("?");

  let explicitPayload: string | undefined;
  let optionalPayload = true;

  const payloadParam = handler?.parameters[1];

  if (payloadParam) {
    const [typeExp] = tsquery
      .match(
        payloadParam,
        "IntersectionType,TypeReference,TypeLiteral,AnyKeyword",
      )
      .filter((e) => e.parent === payloadParam);

    if (typeExp) {
      explicitPayload = typeExp.getText();

      if (
        !tsquery
          .match(payloadParam, "QuestionToken")
          .filter((e) => e.parent === payloadParam).length
      ) {
        optionalPayload = false;
      }

      if (wildcardParams || optionalParams) {
        optionalPayload = true;
      }
    }
  }

  const params: MethodOverloadParam[] = [
    {
      scope: explicitPayload ? "explicitPayload" : "payload",
      name: "payload",
      optional: optionalPayload,
      type: explicitPayload || "Record<string, any>",
    } as const,
  ];

  if (!pathParams) {
    return params;
  }

  if (wildcardParams) {
    return [
      {
        scope: "params",
        name: "params",
        type: "(string|number)[]",
        optional: true,
      },
      ...params,
    ];
  }

  for (const [i, param] of pathParams.split("/").reverse().entries()) {
    const [name, type] = /^:/.test(param)
      ? [`${param.replace(/\W/g, "_")}0${i}`, "string|number"]
      : [`literal0${i}`, `"${param}"`];
    params.unshift({
      scope: "params",
      name,
      type,
      optional: param.endsWith("?"),
    });
  }

  return params;
}

function getReturnType(node: Expression | Node): string | undefined {
  const [typeExp] = tsquery
    .match(node, "IntersectionType,TypeReference,TypeLiteral,AnyKeyword")
    .filter((e) => e.parent === node);

  if (!typeExp) {
    return;
  }

  if (/^Promise(\s+)?</.test(typeExp.getText())) {
    const [wrappedType] = tsquery.match(
      typeExp,
      [
        "IntersectionType:first-child",
        "TypeReference:first-child",
        "TypeLiteral:first-child",
        "AnyKeyword:first-child",
      ].join(","),
    );

    return wrappedType?.getText();
  }

  return typeExp.getText();
}
