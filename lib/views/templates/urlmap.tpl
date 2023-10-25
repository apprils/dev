{{BANNER}}

import type { URLMapperConfig } from "~/helpers/url";

import config from "~/config";
import { urlMapper } from "~/helpers/url";
import { baseurl } from "{{sourceFolder}}/config";

export class URLMapper {

  #config: URLMapperConfig;

  constructor(config: URLMapperConfig) {
    this.#config = config
  }

  get $config() { return this.#config }

  {{#views}}
  get "{{name}}"() { return urlMapper(this.$config, { base: baseurl }, {{serialized}}) }
  {{/views}}

}

export default new URLMapper(config)

