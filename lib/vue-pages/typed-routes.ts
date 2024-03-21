import type { VuePage } from "../@types";

type Param = {
  name: string;
  nameSuffix: string;
  modifier: string;
  optional: boolean;
  type: string;
};

export function typedRoutes(pages: VuePage[]) {
  return pages.map(typedRoute);
}

function typedRoute(page: VuePage): VuePage & { typedParams: string } {
  const params: Param[] = extractParams(page);
  return { ...page, typedParams: typedParams(params).join(", ") };
}

function typedParams(params: Param[]): string[] {
  return params.length
    ? [typedParamsMapper(params, true), typedParamsMapper(params, false)]
    : ["Record<never, never>", "Record<never, never>"];
}

function typedParamsMapper(params: Param[], isRaw: boolean): string {
  const mapper = (p: Param) => `${p.name + p.nameSuffix}: ${p.type}<${isRaw}>`;
  return `{ ${params.map(mapper).join(", ")} }`;
}

function extractParams(page: VuePage): Param[] {
  return page.params
    .split(/(:[^/]+)/)
    .filter((e) => e[0] === ":")
    .map(paramMapper);
}

function paramMapper(param: string): Param {
  const [_, _name, _modifier] = param.split(/:([\w-]+)/);

  const modifier = _modifier.replace(/[^?*+]/g, "");
  const optional = ["?", "*"].includes(modifier);

  let type = "ParamValue";

  if (modifier === "+") {
    type = "ParamValueOneOrMore";
  } else if (modifier === "*") {
    type = "ParamValueZeroOrMore";
  } else if (modifier === "?") {
    type = "ParamValueZeroOrOne";
  }

  return {
    name: _name,
    nameSuffix: optional ? "?" : "",
    modifier,
    optional,
    type,
  };
}
