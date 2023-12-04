{{BANNER}}

{{#routes}}
import {{importName}} from "./api/{{importPath}}";
{{/routes}}

export default {
{{#routes}}
  get "{{name}}"() { return {{importName}} },
{{/routes}}
}

