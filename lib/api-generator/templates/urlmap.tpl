{{BANNER}}

import { type URLMapperConfig, urlMapper } from "{{sourceFolder}}/../helpers/url";
import config from "{{sourceFolder}}/../config";
import { baseurl, apiurl } from "{{sourceFolder}}/config";

export class URLMapper {

  #config: URLMapperConfig;

  constructor(config: URLMapperConfig) {
    this.#config = config
  }

  get $config() { return this.#config }

  {{#routes}}
  get "{{name}}"() {
    return urlMapper(
      this.$config,
      { base: baseurl + apiurl },
      {{serialized}},
    )
  }

  {{/routes}}

}

export default new URLMapper(config)

