
{{#routes}}
import {{importName}} from "./{{importPath}}";
{{/routes}}

export default {
  {{#routes}}
  "{{name}}": {{importName}},
  {{/routes}}
}
