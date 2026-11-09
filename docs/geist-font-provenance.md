# Geist local font provenance

October 30, 2026. Official licensed assets for Core 18B. These replace
the previous `next/font/google` build-time fetch of Geist and Geist Mono.
They are not copied from `.next` cache.

## Source

| Field | Value |
|---|---|
| Project | [vercel/geist-font](https://github.com/vercel/geist-font) |
| Homepage | [vercel.com/font](https://vercel.com/font) |
| Release | [v1.9.0](https://github.com/vercel/geist-font/releases/tag/v1.9.0) |
| Asset | `geist-font-v1.9.0.zip` |
| Download | `https://github.com/vercel/geist-font/releases/download/v1.9.0/geist-font-v1.9.0.zip` |
| GitHub asset digest | `sha256:1f2dd9ea90e68d0358a1d234a5f156807b2c3e0e295d78d87980a6dbad1fa58c` |
| Downloaded zip SHA-256 | `1f2dd9ea90e68d0358a1d234a5f156807b2c3e0e295d78d87980a6dbad1fa58c` |
| Zip size | 8,731,275 bytes |
| License | SIL Open Font License 1.1 (`app/fonts/OFL.txt`) |

The zip checksum matches the GitHub release asset digest. No npm `geist`
package was added.

## Files kept in this repository

Only the two variable roman webfonts used by the current layout, plus the
required license. Serif, pixel, static weights, and italics were not
vendored.

| File | SHA-256 | Bytes | Inspection |
|---|---|---|---|
| `app/fonts/Geist[wght].woff2` | `5c5588027e59e74e205b9d6c7fd877b261091cee367f6bb3a8d505da14cae512` | 69,576 | Magic `wOF2`. Name “Geist”, version 1.900. Axis `wght` 100–900. cmap 728; Latin A–Z/a–z and common punctuation present |
| `app/fonts/GeistMono[wght].woff2` | `cf5bf55f69e043b1ecf04b0719119b7298e94add67ebcaa709a925b945b46b25` | 71,272 | Magic `wOF2`. Name “Geist Mono”, version 1.900. Axis `wght` 100–900. cmap 889; same Latin sample present |
| `app/fonts/OFL.txt` | `c683bfbcc7e087f5d37a54ef628f10387c451a83ddc459b151403a164ac46c90` | 4,383 | SIL OFL 1.1 from the same zip |

Inspection used a throwaway `/tmp` `fontTools` venv and was not added as
an application dependency.

## Layout

`app/layout.tsx` loads these files with `next/font/local`, keeping
`--font-geist-sans` and `--font-geist-mono`. `display` remains `swap`.
Weight range is `100 900`. No other `next/font/google` import remains.

## Isolated cold-cache check (Core 18B)

Copy of the current working tree at `/tmp/bits-core18b-fonts`, excluding
`.git`, `.env*`, `.next`, `node_modules`, donor/auth/e2e local state,
and backups. `npm ci` used install-network. Isolated `npm run build` ran
on Node v24.13.1 with `HTTP_PROXY` / `HTTPS_PROXY` / `ALL_PROXY` set to
`http://127.0.0.1:9` so Google Fonts could not be fetched. Next compiled
successfully. Isolated `.next/static/media` contained the same two woff2
files (69,576 and 71,272 bytes). Grep of that `.next` tree found no
`fonts.googleapis` / `fonts.gstatic` strings.

Isolated `next start -p 3031` (no `-H`; Next 16 `proxy.ts` still 500s if
bound only to `127.0.0.1`) served `GET /visit` 200. Font assets returned
200 with magic `wOF2`. Browser computed `font-family` was `geistSans`
with `geistSans` loaded. Working-tree `.next/cache` was not deleted.
This does not claim a fully offline `npm ci`.
