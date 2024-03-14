import { resolve, join } from "node:path";

import * as tsquery from "@phenomnomnominal/tsquery";
import fsx from "fs-extra";

import {
  type Node,
  type NodeArray,
  type Expression,
  type CallExpression,
  type ImportSpecifier,
  type ImportDeclaration,
  type ArrowFunction,
  type FunctionExpression,
  type TypeAliasDeclaration,
  type InterfaceDeclaration,
  type ParameterDeclaration,
  type PropertySignature,
  isArrowFunction,
  isFunctionExpression,
  isStringLiteral,
} from "typescript";

import type {
  TypeDeclaration,
  MiddleworkerParams,
  MiddleworkerPayloadTypes,
  FetchDefinition,
  FetchDefinitionOverload,
} from "./@types";

export async function extractApiAssets(
  file: string,
  {
    root,
    base,
  }: {
    root: string;
    base: string;
  },
): Promise<{
  typeDeclarations: TypeDeclaration[];
  middleworkerParams: MiddleworkerParams;
  middleworkerPayloadTypes: MiddleworkerPayloadTypes;
  fetchDefinitions: FetchDefinition[];
}> {
  const fileContent = (await fsx.exists(file))
    ? await fsx.readFile(file, "utf8")
    : "";

  const ast = tsquery.ast(fileContent);

  const typeDeclarations = extractTypeDeclarations(ast, { root, base });

  const callExpressions = tsquery
    .match(ast, "ExportAssignment ArrayLiteralExpression > CallExpression")
    .filter((e) => e.parent?.parent?.parent === ast) as CallExpression[];

  const middleworkerParams: MiddleworkerParams = {};
  const middleworkerPayloadTypes: MiddleworkerPayloadTypes = {};
  const fetchDefinitions: FetchDefinition[] = [];

  for (const [i, node] of callExpressions.entries()) {
    const method = node.expression.getText();
    const httpMethod = httpMethodByApi(method);

    if (!["get", "put", "patch", "post", "del"].includes(method)) {
      continue;
    }

    const upsertFetchDefinition = (overload: FetchDefinitionOverload) => {
      let def = fetchDefinitions.find((e) => e.method === method);
      if (!def) {
        def = {
          method,
          httpMethod,
          overloads: [],
          get bodyType() {
            return this.overloads
              .reduce((a: string[], e) => {
                a.includes(e.bodyType) || a.push(e.bodyType);
                return a;
              }, [])
              .join(" | ");
          },
        };
        fetchDefinitions.push(def);
      }
      def.overloads.push(overload);
      return def;
    };

    if (isStringLiteral(node.arguments?.[0])) {
      upsertFetchDefinition({
        paramsType: { name: "params?", text: "{}" },
        payloadType: {
          name: "payload?",
          text: "Record<string|number, unknown>",
        },
        bodyType: "unknown",
      });

      continue;
    }

    const middleworker = node.arguments?.[0] as
      | ArrowFunction
      | FunctionExpression
      | undefined;

    if (
      !middleworker ||
      ![isArrowFunction(middleworker), isFunctionExpression(middleworker)].some(
        (e) => e === true,
      )
    ) {
      continue;
    }

    // biome-ignore format:
    const {
      pathParams, payloadType,
      fetchParamsType, fetchPayloadType,
    } = paramsMapper(middleworker.parameters);

    if (pathParams) {
      middleworkerParams[i] = pathParams;
    }

    if (payloadType) {
      middleworkerPayloadTypes[i] = payloadType;
    }

    upsertFetchDefinition({
      paramsType: fetchParamsType,
      payloadType: fetchPayloadType,
      bodyType: extractReturnType(middleworker) || "unknown",
    });
  }

  return {
    typeDeclarations,
    middleworkerParams,
    middleworkerPayloadTypes,
    fetchDefinitions,
  };
}

function extractTypeDeclarations(
  ast: ReturnType<(typeof tsquery)["ast"]>,
  {
    root,
    base,
  }: {
    root: string;
    base: string;
  },
): TypeDeclaration[] {
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

  for (const node of [...importDeclarations]) {
    let path = JSON.parse(node.moduleSpecifier.getText());

    if (/^\.\.?\/?/.test(path)) {
      path = join(root, resolve(base, path));
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

  return Object.values(typeDeclarationsMap);
}

function paramsMapper(parameters: NodeArray<ParameterDeclaration>): {
  pathParams: string | undefined;
  payloadType: string | undefined;
  fetchParamsType: FetchDefinitionOverload["paramsType"];
  fetchPayloadType: FetchDefinitionOverload["payloadType"];
} {
  let pathParams: string | undefined;
  let payloadType: string | undefined;

  const fetchParamsType = {
    name: "params?",
    text: "Record<symbol, never>",
  };

  const fetchPayloadType = {
    name: "payload?",
    text: "Record<string|number, unknown>",
  };

  for (const [i, parameter] of parameters.entries()) {
    if (i === 0) {
      // processing params parameter at position 0
      // params only accept literal type
      const [typeExp] = tsquery
        .match(parameter, "TypeLiteral")
        .filter((e) => e.parent === parameter);

      if (!typeExp) {
        continue;
      }

      fetchParamsType.name = "params";
      fetchParamsType.text = typeExp.getText();

      const props = tsquery
        .match(typeExp, "PropertySignature")
        .filter((e) => e.parent === typeExp) as PropertySignature[];

      pathParams = props
        .map((prop) => {
          const name = prop.name.getText();
          const optional = prop.questionToken?.getText() ? true : false;
          const wildcard = prop.type?.getText().endsWith("[]");
          const literal = isLiteralParam(prop);

          if (literal) {
            return literal;
          }

          const chunks = [":", name];

          if (optional) chunks.push("?");
          else if (wildcard) chunks.push("*");

          return chunks.join("");
        })
        .join("/");
    } else if (i === 1) {
      // processing payload parameter at position 1
      const [typeExp] = tsquery
        .match(
          parameter,
          "IntersectionType,TypeReference,TypeLiteral,AnyKeyword",
        )
        .filter((e) => e.parent === parameter);

      payloadType = typeExp?.getText();

      if (payloadType) {
        // got payload type;
        // if params argument is optional, payload should be too
        fetchPayloadType.name = fetchParamsType.name.includes("?")
          ? "payload?"
          : "payload";

        fetchPayloadType.text = payloadType;
      } else {
        // no payload type provided, allow optional payload
        fetchPayloadType.name = "payload?";
      }
    }
  }

  return {
    pathParams,
    fetchParamsType,
    fetchPayloadType,
    payloadType,
  };
}

function isLiteralParam(prop: PropertySignature) {
  if (!prop.type || "literal" in prop.type === false) {
    return undefined;
  }
  return isStringLiteral(prop.type.literal as Node)
    ? JSON.parse(prop.type.getText()) || prop.name.getText()
    : undefined;
}

function extractReturnType(node: Expression | Node): string | undefined {
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

export function httpMethodByApi(apiMethod: string): string {
  return apiMethod === "del" ? "DELETE" : apiMethod.toUpperCase();
}
