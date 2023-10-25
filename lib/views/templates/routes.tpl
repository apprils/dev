{{BANNER}}

type Meta = Record<string, any>
type Options = Record<string, any>

export default {
{{#views}}
  "{{name}}": {
    name: "{{name}}",
    path: "{{path}}",
    params: "{{params}}",
    meta: {{meta}} as Meta,
    options: {{options}} as Options,
    component: () => import("@/{{viewsDir}}/{{importPath}}"),
  },
{{/views}}
}

