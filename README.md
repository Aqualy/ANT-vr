# ANT VR

A playable, tactile introduction to ANT for Meta Quest 2 and desktop browsers. Open the Blackout Communication Kit, make your Paper Profile, meet the volunteer operators at a Blob, choose what to share, and connect your neighbourhood. The nine-chapter journey has a 290-second design budget. [EXPERIENCE.md](EXPERIENCE.md) describes the actions and comfort decisions.

## Run locally

Use Node 24 LTS and npm. All direct package versions are pinned; install from the lockfile.

```powershell
cd C:\school\sem5\IML\ANT_website_agent_files_v2\ant-vr
npm ci
npm run check
npm test
npm run dev
```

The development URL is **https://localhost:8081**. The server listens on the local network. IWSDK generates a self-signed development certificate; accept its browser warning only for this local development address. No certificate authority is installed. `npm run dev` serves without opening a managed window; open the URL in your browser. Select **Enter VR** on a headset or **Play on this screen** for mouse/keyboard play. If WebXR is unavailable, the full screen-based journey remains available.

```powershell
npm run build       # static production output: dist/
npm run preview     # serve the production build locally
npm run dev:status  # actual runtime URLs and readiness
npm run dev:down    # stop the managed development runtime
```

WebXR means the browser's immersive session. [IWSDK](https://iwsdk.dev/guides/overview.html) supplies its rendering and input framework; [IWER](https://iwsdk.dev/guides/02-testing-experience.html) emulates that session on desktop. The runtime uses IWSDK's entity-component system (ECS): small pieces of state are attached to objects and processed by registered systems.

## Play on Meta Quest 2

1. Connect the Quest and computer to the same Wi-Fi network.
2. Start `npm run dev`. Read the **Network** HTTPS address from its output or `npm run dev:status`.
3. Open that address in Quest Browser, accept the local certificate warning, and choose **Enter VR**. Allow immersive/hand-tracking permissions when requested.
4. Sit or stand comfortably, face the table, and press **Recenter**. All required actions are in front of you. There is no required walking or smooth camera movement.
5. Use the trigger to select tags, grip to pick up nearby paper, or hand tracking to touch/pinch. Release a misplaced item and it returns home. The controller's target ray points at a selection; its grip pose represents where the held object sits. [Input and grabbing guide](https://iwsdk.dev/guides/06-built-in-interactions.html).

If Wi-Fi access is blocked, enable developer mode and USB debugging on the Quest, connect USB, approve the device prompt, and use Android Platform Tools:

```powershell
adb devices
adb reverse tcp:8081 tcp:8081
```

Then visit **https://localhost:8081** in Quest Browser. IWER excludes Oculus Browser, so this remains the headset's native WebXR session. If the configured port changes, update both port numbers. A production HTTPS host needs no development-certificate exception. Physical controller feel, hand tracking, readability, and sustained frame rate require the headset checklist below.

## Desktop controls and emulator

On a screen, click the objects or use the large action button. Choose interest tokens and Public/Private directly. Draw by dragging over the Symbol System template. **Space** performs the current action, **R** recenters, **D** shows diagnostics, and **Skip step** advances a chapter. Restart clears the resident state and timing. Leaving VR returns to the landing page with a continuation option.

For IWSDK's managed headless browser and scripted checks, first stop an ordinary development session. The following intentionally starts a headless emulator and enables its trusted local script runner:

```powershell
npx @iwsdk/cli dev down
$env:IWSDK_GPU = 'swiftshader'  # optional: software rendering on hosts without usable GPU acceleration
npx @iwsdk/cli dev up --ai-mode agent --headless --allow-browser-automation --screenshot-width 1280 --screenshot-height 900
npx @iwsdk/cli dev status
npm run test:smoke
npx @iwsdk/cli browser run scripts/emulator-first-time.mjs
npx @iwsdk/cli browser run scripts/emulator-timing-status.mjs
# When status is complete (about four minutes):
npx @iwsdk/cli browser run scripts/emulator-timing-collect.mjs
npx @iwsdk/cli browser run scripts/emulator-fast.mjs
npx @iwsdk/cli browser run scripts/emulator-timing-status.mjs
# When status is complete (about eighty seconds):
npx @iwsdk/cli browser run scripts/emulator-timing-collect.mjs
```

For a visual review, `scripts/polish-shots.mjs` captures every chapter state in the emulated headset and `scripts/polish-desktop.mjs` the landing page and screen version (both write to `artifacts/`). Tilt the emulated headset toward the table first, or the shots look straight over it:

```powershell
npx @iwsdk/cli dev up --headless --allow-browser-automation
npx @iwsdk/cli browser run scripts/enter.mjs
npx @iwsdk/cli xr look-at --input-json '{"device":"headset","target":{"x":0,"y":1.25,"z":-0.8}}'
npx @iwsdk/cli browser run scripts/polish-shots.mjs --timeout 108000
```

Run one timing workflow at a time against that browser and leave the page active. The starter returns immediately while real-time timers run in the page, allowing the longer journey to outlive the CLI's short command lease. Inspect status without reloading or interacting, then collect its JSON and screenshot before starting another run. Wait for `browserCommandReady: true`. The smoke test clicks **Enter VR** itself: `xr enter` only accepts a pending offer, and this application deliberately starts through the visitor's button. The `metaQuest2` emulator profile is configured in `iwsdk.config.json`. Screenshots and JSON are written under `evidence/`. Smoke captures pause the journey briefly so a slow screenshot cannot trigger assistance; timed runs take no screenshots until completion.

For interactive desktop emulation, open the local URL in a normal browser. In IWER's toolbar select controllers or hands. Play mode uses mouse movement to look; left mouse is the right trigger, right mouse is grip. Outside play mode, controller panels let you latch **Trig** or **Grip** and drag the controller handle. Select hands in the toolbar to test pinch input. [Full IWER controls](https://iwsdk.dev/guides/02-testing-experience.html).

The timing scripts use real wall-clock pauses for reading and aiming, then call the same application action dispatcher used by input. They neither accelerate the timer nor claim to be human usability trials. The automatic network chapter is allowed to complete on its own. Reports distinguish active journey time from wall time and exclude browser/headset entry permissions; the physical stopwatch test includes those. The smoke test validates application actions in an active immersive session; separate controller/hand probes are required to prove those input paths.

## Debugging and automation

The **D** key or Debug control toggles the diagnostic panel. It reports observed FPS, draw calls, triangles, texture/geometry counts, active time, and the current chapter time. Use the scene selector for direct inspection. A debug jump is marked in the exported log and does not qualify as a complete timed run.

`window.__ANTVR` provides:

```js
__ANTVR.snapshot()             // state, current action, timings, performance, xr
__ANTVR.runStep()              // perform the current action
__ANTVR.act('token-one', { token: 'gardening' })
__ANTVR.completeStep()         // scripted chapter completion, logged as such
__ANTVR.jumpTo('symbols')      // or a zero-based chapter index
__ANTVR.reset()                // reset and start a fresh journey
```

Completion dispatches `ant:complete` with the run snapshot and logs `ANT_RUN_COMPLETE` JSON. The download-log control exports the same data. Auto-assist starts after ten idle seconds and completes the current action after twenty. Time counts visible active use and pauses when the session or tab is hidden.

Key code: `src/run.ts` (journey state/timing), `src/app.ts` (IWSDK interaction system and UI), `src/journey-scene.ts` (chapter build/enter/update/exit/dispose), `src/scene-assets/ant.scene-asset.ts` (procedural world), `src/art/` (real prints/blob renderer), and `scripts/` (reproducible browser checks). The supplied blob engine is copied unchanged; its attribution remains with the copy. The website and its assets are not modified by this build.

## Static deployment preparation

`npm run build` produces a self-contained `dist/` directory. `render.yaml` describes a separate static service named `ant-vr`, following the existing website's Blueprint approach. It deliberately does not refer to or change the existing website service. No deployment is performed by these scripts.

For a future deployment, place this directory in its own Git repository with `render.yaml` at the root, connect that repository as a **new Render Blueprint**, and inspect the proposed new static service before applying. The build command is `npm ci && npm run check && npm test && npm run build`; publish directory is `./dist`; Node is 24. For a monorepo, set `rootDir` to this directory's repository-relative path and select the matching Blueprint path. Render reads the remote repository, so local-only files are not deployable until explicitly committed and pushed. [Render Blueprint reference](https://render.com/docs/blueprint-spec).

Use the final HTTPS URL directly in Quest Browser. If hosting inside an iframe, its parent must allow `xr-spatial-tracking`; a direct page is preferable. Adobe Fonts remain externally hosted through the project's existing kits with Arial fallback. No font files are bundled. IWER and the development command bridge are excluded from production output.

## Real Quest 2 release checklist

Desktop emulation cannot establish these physical results. Record device/browser version and a dated result for each before claiming on-headset certification.

- [ ] Cold-load the production build over HTTPS; enter and exit VR twice without a frozen or duplicated scene.
- [ ] Finish once seated and once standing. Recenter keeps every required target in a comfortable forward reach.
- [ ] Read the instruction and choices without leaning or squinting; examine the real-size A5 profile and A3 map.
- [ ] Use both controllers: select, grip, carry, release, token placement, profile handover, drawing, and board placement.
- [ ] Switch to hand tracking: poke, pinch, carry, release, and draw; test tracking loss and reacquisition.
- [ ] Drop each paper away from its destination and verify its return; hold an item while skipping/restarting.
- [ ] Check Public and Private outcomes, booklet matching, request consent, and visible symbol persistence.
- [ ] Stay idle through assistance, use Skip step, restart, end the session, and continue on screen.
- [ ] Complete with sound muted; confirm low sound level and comfortable haptics when enabled.
- [ ] Observe sustained 72 Hz on Quest 2, with fewer than 150 calls and 150,000 triangles; repeat runs and watch texture/geometry counts for growth.
- [ ] Time a first-time visitor from entering VR to Done with a real stopwatch: **five minutes or less**, including entry/permissions. Record reading, reach, or aiming delays and simplify if over budget.
