
{{#typeDeclarations}}
{{.}}
{{/typeDeclarations}}

{{#payloadParams}}
export type {{id}} = {{type}};
{{/payloadParams}}

