{{BANNER}}

/// <reference path="./_routes.d.ts" />

{{#routes}}
import {{importName}} from "{{sourceFolder}}/{{importPath}}";
{{#schemaModuleId}}
import {{importName}}_schema from "{{schemaModuleId}}";
{{/schemaModuleId}}
{{/routes}}

type Meta = Record<string, any>

export default {
{{#routes}}
  "{{name}}": {
    name: "{{name}}",
    path: "{{path}}",
    file: "{{file}}",
    meta: {{meta}} as Meta,
    spec: [
      {{#schemaModuleId}}
      ...{{importName}}_schema,
      {{/schemaModuleId}}
      ...{{importName}},
    ] as [],
  },
{{/routes}}
}

