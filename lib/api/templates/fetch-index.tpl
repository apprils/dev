{{BANNER}}

{{#routes}}
import {{importName}} from "./{{importPath}}";
{{/routes}}

export default {
{{#routes}}
  get "{{name}}"() { return {{importName}} },
{{/routes}}
}

