# ANT artwork provenance

The VR experience reuses the real ANT print artwork from the sibling `ant-website` project. Source assets and the website were not edited. SHA-256 comparisons below were checked on 13 November 2026.

| VR file | Website source, relative to `ant-website/` | SHA-256 (both files identical) |
| --- | --- | --- |
| `src/art/engine.js` | `src/lib/blobs/engine.js` | `5c8d9632bef5093e562f3c808650f2745ddb5c302eb0de6623080b596967354d` |
| `src/art/engine.d.ts` | `src/lib/blobs/engine.d.ts` | `7cb8bf08f839bf30cbe4c7a969a0a571cbad5c5be43dc517321a814ee0d0191c` |
| `src/art/pictos.ts` | `src/lib/components/world/pictos.ts` | `a9822353b53325385fa2a02ab15f584ddc0746632c5a3920c3396db5bf227d3c` |
| `src/art/logo-paths.ts` | `src/lib/brand/logo-paths.ts` | `5c4267445e5ce50c9e95a8588a2e505f641383de526cea50a3e31389acc62387` |
| `public/brand/ANT_logo.svg` | `static/brand/ANT_logo.svg` | `dc348d33da364d3d184cee936e4f071b928f73c5b14563a9d461c6071900e0a0` |
| `public/brand/ANT_logo_white.svg` | `static/brand/ANT_logo_white.svg` | `c9013e939b5a1bc357100454d7bdfe0fee9fc42dbe68b01c86d84dd9355923d5` |
| `public/brand/ANT_symbol.svg` | `static/brand/ANT_symbol.svg` | `dbddd54583069d03e1959e0f97de3841c7b2d2784f1b07c8eac0c38f2657a356` |
| `public/prints/neighbourhood-map.jpg` | `static/prints/neighbourhood-map.jpg` | `58e7c0606587d52a2e6a396d99d0ef652b6d1703529e7c42654799acb89b7d11` |

`src/art/real.ts` comes from `ant-website/src/lib/prints/real.ts`. Its two module imports point to local copies; the map URL uses Vite's `BASE_URL` so the print also loads under a subpath. After normalizing line endings, those are the only changes. No artwork coordinates, colours, names, text, sizes or drawing paths were changed.

- Source SHA-256: `57e21f4d269e04cf18ea7693396a5a64c64c241776a638eb1d5fe41f7ad90f57`
- Adapted SHA-256: `136bfc224ce5afa8604c7d07d38fa699392ff3df4a1d27b908b57c182df40ecf`

`art.ts` supplies runtime canvas textures, font loading, metre-sized paper planes, token discs and world labels. Paper Profile pages are A5 (148 × 210 mm); the map is A3 (297 × 420 mm); Symbol System templates are A6 (105 × 148 mm); Interest Tokens are 25 mm; the kit lid is 240 × 220 mm. The supplied map retains its approved soft-grey cartographic linework, the palette exception recorded in the parent `CLAUDE.md`. Other artwork uses black, grey `#DDDDDD`, white and ANT green `#C5D92F`.

Fonts are requested only through the original Adobe Fonts web kits. No font files are copied or bundled. Canvas painting falls back to Helvetica/Arial after a bounded 2.5-second wait, and the map repaints if its image arrives later.

`blobHost.ts` adapts the website's shared-context approach. The original engine remains byte-identical. It renders into small Three.js render targets at no more than 12 updates per second and skips unchanged data. The adapter restores the active render target, cube face and mip level, including the immersive XR render target. A context wrapper tracks every raw buffer, shader, program, vertex array and texture made by the engine; disposal releases these without creating or losing a second WebGL context. Render targets and materials are also disposed explicitly. Raw field draws are exposed as the host's cumulative `drawCount` because Three.js's own statistics do not count them.

New labels use a nominal 43 mm em by default (approximately 30 mm visible capital height), with black text on white or ANT green. Source paper text is intentionally kept at the real printed scale; the experience supplies separate, larger action tags for instructions.
