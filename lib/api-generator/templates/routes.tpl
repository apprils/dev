{{BANNER}}

import { type Meta, routeMapper } from "@appril/core/router";
import router from "./_router";

{{#routes}}
const {{importName}}$meta: Meta = {{meta}};
{{/routes}}

export const routes = {
{{#routes}}
  "{{name}}": {
    name: "{{name}}",
    path: "{{path}}",
    meta: {{importName}}$meta,
  },
{{/routes}}
}

{{#routes}}
import {{importName}} from "{{sourceFolder}}/{{importPath}}";
{{#payloadValidation}}
import {{payloadValidation.importName}} from "{{payloadValidation.importPath}}";
{{/payloadValidation}}
for (
  const { name, path, method, middleware } of routeMapper(
    {{importName}} as [],
    routes["{{name}}"],
    {{middleworkerParams}},
    {{#payloadValidation}}
    {{payloadValidation.importName}},
    {{/payloadValidation}}
  )
) {
  router.register(path, [method], middleware, { name });
}

{{/routes}}

export default router.routes();

