{{BANNER}}

/**
* gently borrowed from posva/unplugin-vue-router
*/

import type {
  RouteRecordInfo,
  ParamValue,
  ParamValueOneOrMore,
  ParamValueZeroOrMore,
  ParamValueZeroOrOne,
} from "unplugin-vue-router";

export interface RouteNamedMap {
{{#routes}}
  "{{name}}": RouteRecordInfo<"{{name}}", "{{path}}", {{typedParams}}>;
{{/routes}}
}

declare module "vue-router" {

  import type {
    NavigationGuard,
    RouteLocationNormalizedLoadedTypedList,
    _RouterTyped,
    RouterLinkTyped,
  } from "unplugin-vue-router";

  export interface TypesConfig {

    beforeRouteUpdate: NavigationGuard<RouteNamedMap>;
    beforeRouteLeave: NavigationGuard<RouteNamedMap>;

    $route: RouteLocationNormalizedLoadedTypedList<RouteNamedMap>[keyof RouteNamedMap];
    $router: _RouterTyped<RouteNamedMap>;

    RouterLink: RouterLinkTyped<RouteNamedMap>;

  }

}

