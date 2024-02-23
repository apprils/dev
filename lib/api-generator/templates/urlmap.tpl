{{BANNER}}

import type { URLMapperConfig } from "~/helpers/url";

import config from "~/config";
import { urlMapper } from "~/helpers/url";
import { baseurl, apiurl } from "{{sourceFolder}}/config";

export class URLMapper {

  #config: URLMapperConfig;

  constructor(config: URLMapperConfig) {
    this.#config = config
  }

  get $config() { return this.#config }

  {{#routes}}
  get "{{name}}"() { return urlMapper(this.$config, { base: baseurl + apiurl }, {{serialized}}) }
  {{/routes}}

}

export default new URLMapper(config)

