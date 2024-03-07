{{BANNER}}

import { type Meta, routeMapper } from "@appril/core/router";

import assets from "{{assetsDir}}";
import router from "./_router";

{{#routes}}
const {{importName}}$meta: Meta = {{meta}};
{{/routes}}

export const routes = {
{{#routes}}
  "{{name}}": {
    name: "{{name}}",
    path: "{{path}}",
    file: "{{file}}",
    meta: {{importName}}$meta,
  },
{{/routes}}
}

{{#routes}}
import {{importName}} from "{{sourceFolder}}/{{importPath}}";
for (
  const { name, path, method, middleware } of routeMapper(
    {{importName}} as [],
    routes["{{name}}"],
    assets["{{name}}"],
  )
) {
  router.register(path, [method], middleware, { name });
}

{{/routes}}

export default router.routes();

