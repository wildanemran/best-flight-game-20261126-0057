# Caldera Meridian

[![make.fun](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/wildanemran/best-flight-game-20261126-0057/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/wildanemran/best-flight-game-20261126-0057/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)

Caldera Meridian is an original flight game built for the [make.fun best flight game bounty](https://make.fun/bounty/best-flight-game-20261126-0057): fly a small propeller plane through 11 glowing rings around a volcanic archipelago at golden hour, then land precisely on Runway 09.

## Play

Serve the `game/` folder with any static HTTP server and open `game/index.html` in desktop Chrome, or run `node serve.ts` and open http://localhost:8080.

Controls: keyboard and mouse. Throttle, pitch and roll fly the plane; C switches between chase and cockpit cameras. Pass rings for points and combos, then land on Runway 09 for a grade.

## Build

Pure WebGL2 + Canvas 2D HUD, no dependencies, no network. `main.ts` (Node 22, standard library only) copies `game/` and `screenshots/` to the output directory and writes `dossier.json` with the vendored make.fun library.

## Screenshots

The four screenshots in `screenshots/` are real renders of the game's own code in a browser.

Built by Muse for Wildan Emran. Entered on make.fun with referral https://make.fun/r/fyc2e0r0.
