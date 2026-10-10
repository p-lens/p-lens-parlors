# p-lens-parlors

> **日本語版が原本です。** [README.ja.md](README.ja.md) is the original; this English text is a translation, and where the two differ the Japanese holds.

An open list of pachinko and pachislot parlors in Japan, kept for P-Lens
(Pレンズ) and anyone else who wants it, as JSON Lines under the
[Open Database License](LICENSE).

```text
data/parlors.jsonl     parlors with a position
data/unplaced.jsonl    parlors known from the 貯玉補償基金 or their operator, not yet placed on the map
data/rejections.jsonl  submissions turned down, for app.p-lens.jp to show
data/tiers.jsonl       each parlor's corners and their rates, for the parlors someone reported
```

Published as static files at parlors.p-lens.jp. app.p-lens.jp reads
`parlors.jsonl` and `rejections.jsonl`; survey.p-lens.jp reads `parlors.jsonl`
and `unplaced.jsonl` and takes reports that end up here.

## Format

One parlor a line:

| field | | |
|---|---|---|
| `id` | always | given when a parlor is first listed and never changed: `osm:<type>/<id>` for one listed placed on an OpenStreetMap element, `cf:<hash>` for a member of the 貯玉補償基金 listed unplaced, `op:<chain>:<hash>` for one listed from its operator alone. A parlor placed later keeps its `cf:` or `op:` id |
| `name` | always | the operator's own name when known, else the name it is a member of the 貯玉補償基金 under, else OpenStreetMap's — but where the fund lists separate members at one address and their operator names them as one, each goes by the name it is a member under; no two parlors share one, widths, case, spaces and marks aside, so where two go by one name each is written with its place after it, as the fund writes some: `ネバーランド(八戸)` |
| `reading` | always | hiragana |
| `branchReading` | sometimes | the branch's reading as the operator writes it |
| `keywords` | sometimes | other names it is found by: OpenStreetMap's, or the one it is a member of the 貯玉補償基金 under, where `name` is not it, or the one its operator gives several members together |
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

### Corners and their rates (`tiers.jsonl`)

Which corners a parlor has by rate, what each rents at and replays at, and the
balls or medals each kind of its special prizes takes, are kept in a file apart
from the list. One line is one parlor as checked on one
day, tied to the list by its `id` alone. Only parlors someone reported are in it, and most
are not.

```json
{"id":"osm:way/…","tiers":{"pachinko":{"4円":{"rental":250,"replay":{"paidOut":125,"deducted":133},"prizes":{"大景品":1400,"小景品":140}},"1円":{"rental":1000}},"pachislot":{"20円":{"rental":50,"prizes":{"小景品":28}}}},"checked":"2026-10-11","submissions":["…"]}
```

| Field | | |
|---|---|---|
| `id` | always | The `id` of a parlor in `parlors.jsonl` or `unplaced.jsonl`. A parlor has a line for each day it was checked |
| `tiers` | always | Under `pachinko` and `pachislot`, the parlor's corners keyed by name — `4円`, `1円`, `20円`, `5円`, the rate the parlor advertises. As many corners as it has |
| `tiers.*.*.rental` | when known | The rental: balls or medals for ¥1,000 |
| `tiers.*.*.replay` | when known | The replay: `paidOut` (what it pays out) and `deducted` (what it takes off the savings), the same number where there is no fee |
| `tiers.*.*.prizes` | when known | The special prizes: under each prize's name as the parlor calls it (`大景品`, `小景品`, …), the balls or medals one of it takes. The smallest prize is the least that can be exchanged |
| `checked` | always | The day the line's facts were checked (YYYY-MM-DD): that they held that day, not since when. A change posted before it comes is written with the day it begins, so the day may be up to half a year ahead |
| `submissions` | later | The reports at survey.p-lens.jp the line was made from |

Rates change. What is checked again is added as a line with its own `checked`,
and the line before is not rewritten. What a corner is now is the line with the
latest `checked` not after today among those that name the corner; earlier
lines are kept as what held on their day, and a line of a day still to come
is notice of what will hold then. A line names only the corners checked that day, so a
corner it leaves out was not looked at then, not closed.

A corner says only what is known of it. `{}` says no more than that the parlor
has a corner at that rate.

A parlor rents balls and medals, takes them back on a replay and gives special
prizes for them; it exchanges nothing for money. Here too a parlor's corner has
its `prizes` — each prize and the balls or medals it takes — and no yen. The
special prizes are bought by a broker (特殊景品交換所, the booth that buys
them) that is not the parlor; what a prize comes to there is the broker's
affair, and nothing of it is kept in this repository. What players saw
special prizes come to is set apart in a repository of its own,
[p-lens-brokers](https://github.com/p-lens/p-lens-brokers).

The file is kept apart from the list **on purpose**. It includes a number
parlors do not state in public, so the file can be removed alone should
publishing it have to stop. Removing it does nothing to the list.
app.p-lens.jp does not read it.

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
  operator names a parlor, that name is the parlor's `name`. But members the
  fund lists separately at one address each keep their own savings, so each
  is a parlor under the fund's name and address even where the operator
  names them as one, and the operator's name is kept in `keywords`; where
  the operator's parlor was placed on an OpenStreetMap element, each member
  is placed on that same element. Names and addresses are facts; nothing
  else is taken from those sites.
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
- **Corners and their rates** come from reports taken at survey.p-lens.jp and
  nowhere else: what the reporter saw on the parlor's boards, or found in
  taking prizes there and to the broker. Nothing is taken from another site.
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
read it. Each file is sent with its version in `ETag`, which other sites are
let read: app.p-lens.jp asks for the versions alone and reads a file only when
its version has moved.

## Taking a report in

A report sent at survey.p-lens.jp becomes an issue here, labelled `survey`,
`parlor` and one of `add`, `locate`, `gone`, `amend`. The issue holds a table
to review and the record as GeoJSON.

1. Read the issue, and check its source and what it says.
2. Edit `data/parlors.jsonl` or `data/unplaced.jsonl`. A parlor whose position
   is now known moves from `unplaced.jsonl` to `parlors.jsonl`. A parlor's
   corners and their rates go into `data/tiers.jsonl` as a new line, its
   `checked` the day the report says they were seen, the lines before left as
   they are — パチンコ as
   `pachinko`, パチスロ as `pachislot`, a rate of 4 as `4円`, the replay's two
   counts as `replay`'s `paidOut` and `deducted` — and of its special prizes,
   each prize's name and the balls or medals it takes into that corner's
   `prizes`. What the reporter received for a prize at the broker, and the
   broker's name, go not into this repository but into
   [p-lens-brokers](https://github.com/p-lens/p-lens-brokers), as an
   observation.
3. `bun run check`
4. Commit with `Closes #number` in the message, and get it onto `main`.

Once on `main`, publishing and closing the issue are automatic.
survey.p-lens.jp and app.p-lens.jp read the list each time they are opened, so
neither needs deploying again.
