import type { View } from "../@types";

type Param = {
  name: string;
  nameSuffix: string;
  modifier: string;
  optional: boolean;
  type: string;
};

export function typedRoutes(views: View[]) {
  return views.map(typedRoute);
}

function typedRoute(view: View): View & { typedParams: string } {
  const params: Param[] = extractParams(view);
  return { ...view, typedParams: typedParams(params).join(", ") };
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

function extractParams(view: View): Param[] {
  return view.params
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
