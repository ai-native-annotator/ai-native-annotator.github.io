/**
 * The page did not start: get it started.
 *
 * The host lets a browser keep each script for ten minutes. Right after the site changes, a reload
 * can therefore run new files against old ones it still holds, and one module importing a name
 * another does not export yet fails the whole module graph: the page draws and nothing runs.
 *
 * So when the page has not started by the time it has loaded (app.js marks <body> "booted"), every
 * script the page is made of is fetched again past the browser's copy, and the page is reloaded,
 * twice at most. A classic script on purpose: it must run when the modules cannot.
 */
(function () {
  var KEY = 'skillparse_boot_retry';
  var IMPORT = /(?:^|[^\w$])(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?['"](\.[^'"]+)['"]/g;

  /** Every module reachable from app.js, the worker and the stylesheet, fetched past the browser's copy. */
  async function refetch() {
    var seen = new Set();
    var queue = ['js/skillparse/app.js', 'js/skillparse/py-worker.js', 'css/skillparse.css', 'index.html']
      .map(function (path) { return new URL(path, document.baseURI).href; });
    while (queue.length) {
      var url = queue.shift();
      if (seen.has(url)) continue;
      seen.add(url);
      try {
        var text = await (await fetch(url, { cache: 'reload' })).text();
        if (!url.endsWith('.js')) continue;
        for (var m of text.matchAll(IMPORT)) queue.push(new URL(m[1], url).href);
      } catch (e) { /* offline, or gone: the reload will say so */ }
    }
  }

  window.addEventListener('load', function () {
    setTimeout(async function () {
      var tries = 0;
      try { tries = Number(sessionStorage.getItem(KEY) || 0); } catch (e) { return; }
      if (document.body.classList.contains('booted')) {
        try { sessionStorage.removeItem(KEY); } catch (e) { /* fine */ }
        return;
      }
      if (location.protocol === 'file:' || tries >= 2) return;      // the banner says what to do
      sessionStorage.setItem(KEY, String(tries + 1));
      await refetch();
      location.reload();
    }, 300);
  });
}());
