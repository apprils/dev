{{BANNER}}

type Meta = Record<string, unknown>
type Options = Record<string, unknown>

export default {
{{#pages}}
  "{{name}}": {
    name: "{{name}}",
    path: "{{path}}",
    params: "{{params}}",
    meta: {{meta}} as Meta,
    options: {{options}} as Options,
    component: () => import("{{sourceFolder}}/{{pagesDir}}/{{importPath}}"),
  },
{{/pages}}
}

