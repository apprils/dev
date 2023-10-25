{{BANNER}}

{{#routes}}
import {{importName}} from "@/{{apiDir}}/{{importPath}}";
{{/routes}}

type Meta = Record<string, any>

export default {
{{#routes}}
  "{{name}}": {
    name: "{{name}}",
    path: "{{path}}",
    file: "{{file}}",
    meta: {{meta}} as Meta,
    spec: {{importName}},
  },
{{/routes}}
}

