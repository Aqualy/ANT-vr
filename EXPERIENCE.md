# ANT · A neighbourhood in your hands

A resident opens the Blackout Communication Kit, makes a Paper Profile, visits a Blob, meets a neighbour, chooses what to share, and adds a symbol. The final network view connects those small actions. It is a calm preparation-time experience: people and paper establish trust before a blackout. The complete journey is playable in VR or on a screen, without scores or failure states.

| Chapter | See and do | Feedback | Budget |
|---|---|---|---:|
| 01 · Welcome | A paper neighbourhood on a table. Settle in and touch the green tag. | The first subject stands up; progress stays on the table. | 20 s |
| 02 · Kit | Lift the lid. Pick up the A3 Neighbourhood Map and A5 Paper Profile. | Five real kit prints appear; the map unfolds. | 40 s |
| 03 · Profile | Stick two different interests into the dashed circles; accept Noor. | The selected tokens appear on the Paper Profile. | 50 s |
| 04 · Blob | Touch the Blob, hand over the profile, choose Public or Private. | A human-scale counter and volunteer operators surround the same reachable workspace. | 50 s |
| 05 · Public | Turn a booklet page; notice a shared interest and continue. | A neighbour's matching interest is visible before moving on. | 25 s |
| 06 · Private | Accept a neighbour's request to read more. | The covered information is shared only after the choice. | 20 s |
| 07 · Symbol | Draw a garden symbol; press it onto the board. | Your mark becomes part of the neighbourhood's shared language. | 40 s |
| 08 · Further | Watch copies connect the other Blobs and light travel along fibre. | A three-second sequence completes automatically; the instruction identifies electricity's role. | 25 s |
| 09 · Ending | Look over the neighbourhood. Choose Done or Restart. | The full network remains visible and the run is recorded. | 20 s |
| **Total** | | | **290 s** |

These are design budgets, not measured human completion times. The reproducible timing scripts store actual wall-clock and application timings in `evidence/timing-first-time/run.json` and `evidence/timing-fast/run.json` when executed. They include deliberate pauses followed by application actions. A physical headset stopwatch run must also include headset/browser entry and permission time.

## Guidance and comfort

Only the current task stands up; other chapters are removed. One short instruction names the next physical action. Green identifies that action. Each constituent action has its own guidance: the kit chapter contains lid, map, and profile actions rather than asking the visitor to discover all three at once.

After ten idle seconds, the next target is emphasized. After twenty, that action completes gently. The limit applies to each action so visitors still see the story; per-chapter and total safeguards prevent a stalled run. Skip step remains available throughout. Hovering alone does not postpone assistance.

Touching the Blob changes the set around the visitor. The camera is not moved, animated, or scaled. This deliberately replaces the suggested walk-in transition: the visitor keeps the same reachable table position while the counter and operators become human scale. No locomotion is required. Recenter places the workspace relative to the current head position and facing direction, supporting seated or standing use. Paper keeps its real dimensions; readable action labels sit beside it. Sound and haptics reinforce successful actions, but every outcome is visible and works muted.

## Layout in the headset (2026-11-13)

- **Headline:** the instruction is display type set straight on the grey room above the table, with a small eyebrow (`02 / 09 · OPEN THE KIT`) over it. No panel. The far houses are kept low so nothing rises behind it.
- **Console:** controls lie on a slope along the front edge of the table (`CONSOLE_TILT`), so they never stand between the visitor and the chapter: the progress chain (black = done, green = now, outlined = to come), the chapter's green action pill behind it, and grey Skip step / Recenter pills at the corners.
- **Labels** are pills and soft cards with round corners (real geometry, so edges stay crisp); signs in the model stand on thin black posts. Grey pills are secondary choices, green is the next action.
- **Feedback:** anything pressable grows 6% under a ray or fingertip. After ten idle seconds the action pill breathes; it no longer changes colour, so the palette stays exact.
- **Chapters fold up** out of the tabletop in 0.45 s (scale only, world-locked; the camera is never moved).
- **Ground:** white distance rings at 1.5, 3 and 4.5 m around the table (as on the Neighbourhood Map), a ring of low paper houses 12 to 16 m away and the green ground discs of other Blobs. The ground stays on the real floor while the table follows the visitor's height; table legs and the paper-cut operators run on below it and are hidden by an unlit grey ground disc.
- **On a screen** the HTML overlay carries the headline, progress and Skip/Recenter, so the in-headset ones are hidden and moved out of reach.

## Visual and performance contract

Use only black, white, `#DDDDDD`, and ANT green `#C5D92F`; no gradients or post-processing. Real print painters, token artwork, logo paths, and the supplied blob engine are reused. Adobe Fonts load from the existing web kits with Arial fallback; no font files are bundled.

The same IWSDK renderer draws the blob engine into small render targets, throttled and disposed with each chapter. Instanced houses and shared materials reduce calls; there are no real-time shadows, physics, or imported scenery models. Paper textures are generated at bounded sizes rather than shipping oversized photographic textures. KTX2/glTF compression adds no useful savings to this procedural scene and is not included. Desktop pixel ratio is capped at 1.5, XR framebuffer scale is 0.85, foveation is 1, and the SDK enables MSAA/multiview rendering. Live diagnostics report FPS, calls, triangles, textures, and geometries; targets are **under 150 draw calls and 150,000 triangles per frame**. Headless desktop FPS is not a Quest 2 measurement.
