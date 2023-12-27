
if (import.meta.hot) {
  const hmrUpdate = {{hmrUpdate}}{{^hmrUpdate}}function(){}{{/hmrUpdate}}
  const hmrHandler = (updated) => {
    hmrUpdate(updated)
    {{! TODO: without repeatedly accepting, hmr triggered only once; find out why }}
    import.meta.hot.accept(hmrHandler)
  }
  import.meta.hot.accept(hmrHandler)
}

