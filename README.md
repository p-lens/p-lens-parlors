# p-lens-parlors

> **日本語版が原本です。** [README.ja.md](README.ja.md) is the original; this English text is a translation, and where the two differ the Japanese holds.

An open list of pachinko and pachislot parlors in Japan, kept for P-Lens
(Pレンズ) and anyone else who wants it, as JSON Lines under the
[Open Database License](LICENSE).

```text
data/parlors.jsonl     parlors with a position
data/unplaced.jsonl    parlors known from the 貯玉補償基金 or their operator, not yet placed on the map
data/rejections.jsonl  submissions turned down, for app.p-lens.jp to show
```

Published as static files at parlors.p-lens.jp. app.p-lens.jp reads
`parlors.jsonl` and `rejections.jsonl`; survey.p-lens.jp reads `parlors.jsonl`
and `unplaced.jsonl` and takes reports that end up here.

## Format

One parlor a line:

| field | | |
|---|---|---|
| `id` | always | `osm:<type>/<id>` for a parlor placed on an OpenStreetMap element, `cf:<hash>` for a member of the 貯玉補償基金 not yet placed, `op:<chain>:<hash>` for one known from its operator alone |
| `name` | always | the operator's own name when known, else the name it is a member of the 貯玉補償基金 under, else OpenStreetMap's; no two parlors share one, widths, case, spaces and marks aside, so where two go by one name each is written with its place after it, as the fund writes some: `ネバーランド(八戸)` |
| `reading` | always | hiragana |
| `branchReading` | sometimes | the branch's reading as the operator writes it |
| `keywords` | sometimes | other names it is found by: OpenStreetMap's, or the one it is a member of the 貯玉補償基金 under, where `name` is not it |
| `prefecture` | always | one of the 47 |
| `address` | when known | after the prefecture |
| `addressSource` | with `address` | `operator` (its own site), `chodama` (the 貯玉補償基金's member list), `osm-tags` (the element's `addr:*`), or `osm-areas` (the OpenStreetMap administrative areas its position falls in) |
| `addressPrecision` | with `address` | `street` (down to the number), `town` (町丁目), or `municipality` (市区町村) |
| `lat`, `lon` | placed only | WGS84 |
| `osm` | when placed | the OpenStreetMap element |
| `officialName`, `officialUrl` | when known | as the operator publishes them |
| `readingSource` | always | `official-branch` or `generated` |
| `checked` | always | the day the facts were last checked, YYYY-MM-DD |
| `submissions` | later | survey.p-lens.jp submissions this parlor answers |

`rejections.jsonl`: `{"submission", "reason"?}`.

## Where the data comes from

- **The parlors, their names and their addresses** come first from the member
  list the 一般社団法人貯玉補償基金 publishes at
  [chodama.or.jp](https://www.chodama.or.jp/hall/), read on 2026-10-06: the
  name a parlor is a member under and its address, both facts, and nothing
  else. The fund is where a parlor's savings are registered, so its list is
  the official word on which parlors keep them and under what name. Its wide
  characters are written at their usual width. The site's
  [terms of use](https://www.chodama.or.jp/kiyaku.php) as they stood that day
  are [archived](https://web.archive.org/web/20261006025228/https://www.chodama.or.jp/kiyaku.php).
- **Positions** come from [OpenStreetMap](https://www.openstreetmap.org/)
  (© OpenStreetMap contributors, ODbL): elements tagged as pachinko or gaming
  halls, judged still operating at compilation (2026-10-05). A member is
  placed on the element whose position falls in the town of its address and
  whose name agrees with its own, as written or as read, or is its name
  without the branch — and only when no other member nearby would do. A
  member no element answers is listed unplaced, with no position, until one
  is reported through survey.p-lens.jp.
- **Official names, pages and addresses** come from the store lists operators
  publish on their own websites, each linked in `officialUrl`. Where an
  operator names a parlor, that name is the parlor's `name`. Names and
  addresses are facts; nothing else is taken from those sites.
- **Parlors only OpenStreetMap knows** keep its name, and an address from the
  element's own `addr:*` tags where it has them, else from the OpenStreetMap
  administrative areas its position falls in — 市区町村, and 町丁目 where
  OpenStreetMap has them — so `addressPrecision` says how far down it goes.
  One whose name another placed parlor shares, widths, case, spaces and
  marks aside, is left out: a P-Lens book keeps a parlor's savings under its
  name, and two parlors under one name would be one account.
- **Prefectures** of parlors placed from OpenStreetMap were inferred from
  their position, and **readings** were generated with the place-name
  readings of [Geolonia 住所データ](https://github.com/geolonia/japanese-addresses)
  (CC BY 4.0), which also says where the town of an address is, and
  [Sudachi](https://github.com/WorksApplications/Sudachi) (SudachiDict,
  Apache-2.0). A generated reading may be wrong; corrections are welcome
  through survey.p-lens.jp.
- **Reports** taken at survey.p-lens.jp are first-hand (seen on site or on the
  operator's own site), given under CC0 by their contributors, and reviewed
  before they are merged.

Nothing here is taken from parlor portals, map services such as Google Maps,
or any other database whose terms forbid it.

## Using it

Attribute as **"© P-Lens contributors, © OpenStreetMap contributors"** and
keep a database derived from this one under the ODbL.

## Checking it

```sh
bun install
bun run check
```

## How it is published

What is on `main` is what parlors.p-lens.jp serves. Cloudflare watches this
repository: each time `main` moves it runs `bun run check`, and publishes
`data/` if that passes. A list that fails the check is not published.

```text
Cloudflare's settings (Workers > connect this repository)
  build command     bun install && bun run check
  deploy command    bunx wrangler deploy
  build variable    BUN_VERSION=1.4.2
```

`BUN_VERSION` is the Bun that wrote `bun.lock`, or a newer one. The Bun
Cloudflare comes with may be too old to read `bun.lock`, and the build stops.

What goes where is in `wrangler.jsonc`, the headers sent with the files in
`data/_headers`, and what someone opening parlors.p-lens.jp is shown in
`data/index.html`. The list is read by pages on other sites, so any site may
read it.

## Taking a report in

A report sent at survey.p-lens.jp becomes an issue here, labelled `survey`,
`parlor` and one of `add`, `locate`, `gone`, `amend`. The issue holds a table
to review and the record as GeoJSON.

1. Read the issue, and check its source and what it says.
2. Edit `data/parlors.jsonl` or `data/unplaced.jsonl`. A parlor whose position
   is now known moves from `unplaced.jsonl` to `parlors.jsonl`.
3. `bun run check`
4. Commit with `Closes #number` in the message, and get it onto `main`.

Once on `main`, publishing and closing the issue are automatic.
survey.p-lens.jp and app.p-lens.jp read the list each time they are opened, so
neither needs deploying again.
