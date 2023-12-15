
{{#routes}}
declare module "fetch:{{name}}" {
{{fetchModule}}
}

{{/routes}}

{{#routes}}
import {{importName}} from "fetch:{{name}}";
{{/routes}}

export default {
{{#routes}}
get "{{name}}"() { return {{importName}} },
{{/routes}}

}

