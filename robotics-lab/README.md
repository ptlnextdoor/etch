# robotics-lab

Phase 1: a faithful, unmodified recreation of https://robotics-lab-app.vercel.app/ (eight robot-builder boards in interactive 3D). No build step: static HTML, CSS and ES modules. three.js r164 is vendored in `vendor/three`, as in the original.

## Run

    cd robotics-lab
    npm start            # or: python3 -m http.server 4173
    # open http://localhost:4173/  (boards via hash, e.g. #uno)

The page must be served over HTTP (import maps and ES modules do not load from `file://`).

## Source

The original serves its un-bundled source, so `index.html`, `css/`, `js/` and `vendor/three/` were captured as served (crawled from the module graph). Every board and the lab are procedural, with no image, font or model assets. Phase 2 (etch features and animations) is not started.

## Verification

`compare/` holds original (`orig-*`) and recreation (`clone-*`) screenshots of `#uno` and `#esp32` at 1440 and 390 px width. The files served by the original were copied byte for byte, so the pages render the same.
