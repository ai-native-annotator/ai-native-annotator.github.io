#!/usr/bin/env python3
"""
Local dev server that refuses to cache anything.

Why this exists instead of `python3 -m http.server`:

The plain server answers with 304 Not Modified based on mtime, and the browser
keeps its copy. That is fine for one file, and poison for an ES module graph,
because the cache decides *per file*. Pull a change and you can easily end up
running a fresh `i18n.js` against a stale `state.js`. The moment one module
imports a binding a stale sibling does not export yet, the browser reports:

    The requested module './state.js' does not provide an export named 'editKey'

...and the WHOLE graph fails to link. Nothing runs. Every button is dead. The
page looks completely normal because index.html renders on its own, and the
only clue is one line in the console. It is entirely an artefact of stale
caching — the code on disk is correct — which makes it maddening to chase.

So: no-store on everything. A local dev server has nothing to gain from
caching, and this failure mode costs an hour every time it happens.

    python3 serve.py            # http://localhost:8899/
    python3 serve.py 9000       # another port
"""

import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def send_head(self):
        # Ignore the browser's revalidation headers entirely, so we never
        # answer 304 and never hand back a stale module.
        self.headers.replace_header("If-Modified-Since", "") if "If-Modified-Since" in self.headers else None
        if "If-None-Match" in self.headers:
            del self.headers["If-None-Match"]
        if "If-Modified-Since" in self.headers:
            del self.headers["If-Modified-Since"]
        return super().send_head()

    def log_message(self, fmt, *args):
        # keep 404s loud, quieten the rest
        if args and len(args) > 1 and str(args[1]).startswith(("4", "5")):
            sys.stderr.write("  !! %s\n" % (fmt % args))
        else:
            super().log_message(fmt, *args)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8899
    handler = partial(NoCacheHandler, directory=".")
    with ThreadingHTTPServer(("", port), handler) as httpd:
        print(f"annotation workbench: http://localhost:{port}/")
        print("cache disabled (no 304s), so a pull is always picked up on refresh")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nstopped")


if __name__ == "__main__":
    main()
