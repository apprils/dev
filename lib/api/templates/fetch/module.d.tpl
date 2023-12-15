{{BANNER}}

{{#routes}}
declare module "fetch:{{name}}" {
{{fetchModule}}
}

{{/routes}}

declare module "fetch:" {
  {{#routes}}
  import {{importName}} from "fetch:{{name}}";
  {{/routes}}

  export default {
  {{#routes}}
  get "{{name}}"() { return {{importName}} },
  {{/routes}}

  }

}

