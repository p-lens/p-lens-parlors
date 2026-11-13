/**
 * Takes in, unattended, the survey reports that only add to the list: a
 * position for a parlor that has none, or one that agrees with where a
 * parlor is already placed; and a correction that says nothing but a
 * parlor's corners and their special prizes, added to `tiers.jsonl` as
 * what was checked that day. Everything else — a position that would move
 * a placed parlor, reports that disagree, a correction of anything else,
 * any other kind of report — is left to a person, labelled `needs-review`
 * with the reason.
 *
 *   bun tools/intake.ts                      read the open survey issues, apply, commit, push, close
 *   bun tools/intake.ts --dry-run            apply to data/ only: no commit, no push, nothing written to GitHub
 *   bun tools/intake.ts --dry-run --issue 26 --issue 27
 *                                            the issues named, open or closed, instead of the open ones
 *
 * Reads GITHUB_REPOSITORY (default p-lens/p-lens-parlors) and GITHUB_TOKEN,
 * which writing to GitHub needs.
 */
import { join } from "node:path"

const REPOSITORY = process.env["GITHUB_REPOSITORY"] ?? "p-lens/p-lens-parlors"
const TOKEN = process.env["GITHUB_TOKEN"]
const DATA = join(import.meta.dir, "..", "data")
const ROOT = join(import.meta.dir, "..")

/** The account survey.p-lens.jp opens its issues as; an issue anyone else opened is never taken in unattended. */
const SURVEY_BOT = "p-lens-survey[bot]"

/** The label an issue gets when it is left to a person; an issue that has it is passed over until it is taken off. */
const HOLD = "needs-review"

/** How far apart, in metres, two pins of one parlor may lie and still be taken as agreeing. */
const NEAR = 30

const AUTHOR = { name: "P-Lens contributors", email: "338057823+p-lens@users.noreply.github.com" }

const BASEMAPS: Readonly<Record<string, string>> = { "gsi-pale": "地理院タイル", "gsi-std": "地理院タイル" }

const SOURCES: Readonly<Record<string, string>> = { "on-site": "seen on site", publication: "read from the operator's own site" }

type Json = Readonly<Record<string, unknown>>

type Issue = { readonly number: number; readonly body: string | null; readonly user: { readonly login: string }; readonly labels: readonly { readonly name: string }[]; readonly pull_request?: unknown }

type Report = {
  readonly issue: number
  readonly submission: string
  readonly subject: string
  readonly lat: number
  readonly lon: number
  readonly method: string
  readonly basemap: string | undefined
  readonly source: string
  readonly observedOn: string
  readonly takenAt: string
  readonly contributor: string
}

type Parlor = Record<string, unknown> & { readonly id: string; readonly name: string }

const args = process.argv.slice(2)
const dryRun = args.includes("--dry-run")
const named = args.flatMap((arg, index) => (args[index - 1] === "--issue" ? [Number(arg)] : []))

const isJson = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value)

const api = async (path: string, init: RequestInit = {}): Promise<unknown> => {
  const response = await fetch(`https://api.github.com/repos/${REPOSITORY}${path}`, {
    ...init,
    headers: { accept: "application/vnd.github+json", "user-agent": "p-lens-parlors-intake", ...(TOKEN === undefined ? {} : { authorization: `Bearer ${TOKEN}` }), ...init.headers },
  })
  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${path}: ${response.status} ${await response.text()}`)
  return response.status === 204 ? undefined : response.json()
}

const openIssues = async (): Promise<readonly Issue[]> => {
  const pages: Issue[] = []
  for (let page = 1; ; page++) {
    const found = (await api(`/issues?state=open&labels=survey&per_page=100&page=${page}`)) as Issue[]
    pages.push(...found)
    if (found.length < 100) return pages.filter((issue) => issue.pull_request === undefined)
  }
}

/** What every survey report an issue holds is made of, read from its last JSON block, or why it cannot be read as one to take in. */
type Feature = { readonly properties: Json; readonly observation: Json; readonly subject: Json; readonly provenance: Json; readonly source: string }

const featureOf = (issue: Issue, kind: string): Feature | string => {
  if (issue.user.login !== SURVEY_BOT) return `${SURVEY_BOT} 以外が開いた Issue`
  const blocks = [...(issue.body ?? "").matchAll(/```json\n([\s\S]*?)\n```/g)]
  const last = blocks.at(-1)?.[1]
  if (last === undefined) return "報告の JSON がない"
  let feature: unknown
  try {
    feature = JSON.parse(last)
  } catch {
    return "報告の JSON が読めない"
  }
  const properties = isJson(feature) ? feature["properties"] : undefined
  const observation = isJson(properties) ? properties["observation"] : undefined
  const subject = isJson(observation) ? observation["subject"] : undefined
  const provenance = isJson(properties) ? properties["provenance"] : undefined
  const source = isJson(provenance) ? provenance["source"] : undefined
  if (!isJson(properties) || !isJson(observation) || !isJson(subject) || !isJson(provenance) || !isJson(source)) return "報告の形が想定と違う"
  if (properties["survey"] !== "parlor" || observation["kind"] !== kind) return `${kind} の報告ではない`
  if (properties["license"] !== "CC0-1.0") return `ライセンスが CC0-1.0 でない: ${String(properties["license"])}`
  if (typeof source["kind"] !== "string" || SOURCES[source["kind"]] === undefined) return `出典の種類が想定外: ${String(source["kind"])}`
  const fields = [properties["id"], subject["id"], provenance["observedOn"], properties["takenAt"], provenance["contributor"]]
  if (!fields.every((field) => typeof field === "string" && field !== "")) return "報告に欠けている項目がある"
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(provenance["observedOn"]))) return "確認した日が日付でない"
  return { properties, observation, subject, provenance, source: source["kind"] }
}

/** The kind of survey report an issue holds, by its labels; undefined when it is no survey report. */
const kindOf = (issue: Issue): string | undefined => {
  const labels = issue.labels.map((label) => label.name)
  if (!labels.includes("survey")) return undefined
  return labels.find((label) => label === "locate" || label === "amend") ?? `その他（${labels.filter((label) => label !== "survey" && label !== "parlor").join("・") || "種類不明"}）`
}

/** The position report an issue holds, or why it cannot be read as one to take in. */
const reportOf = (issue: Issue): Report | string => {
  const read = featureOf(issue, "locate")
  if (typeof read === "string") return read
  const { properties, observation, subject, provenance, source } = read
  const position = observation["position"]
  if (!isJson(position)) return "報告の形が想定と違う"
  const { latitude, longitude } = position
  if (typeof latitude !== "number" || typeof longitude !== "number" || latitude < 20 || latitude > 46 || longitude < 122 || longitude > 154) return "座標が日本の範囲にない"
  if (typeof position["method"] !== "string" || position["method"] === "") return "報告に欠けている項目がある"
  return {
    issue: issue.number,
    submission: String(properties["id"]),
    subject: String(subject["id"]),
    lat: latitude,
    lon: longitude,
    method: String(position["method"]),
    basemap: typeof position["basemap"] === "string" ? position["basemap"] : undefined,
    source,
    observedOn: String(provenance["observedOn"]),
    takenAt: String(properties["takenAt"]),
    contributor: String(provenance["contributor"]),
  }
}

/** One corner's terms as `tiers.jsonl` writes them. */
type CornerTerms = {
  readonly rental?: number
  readonly replay?: { readonly paidOut: number; readonly deducted: number }
  readonly replayCap?: number | "unlimited"
  readonly share?: boolean
  readonly prizes?: Readonly<Record<string, number>>
}

/** A parlor's corners as `tiers.jsonl` writes them: by game, then by the rate the corner is named by. */
type Corners = Readonly<Record<string, Readonly<Record<string, CornerTerms>>>>

/** A correction that says nothing but a parlor's corners and their special prizes. */
type CornerReport = {
  readonly issue: number
  readonly submission: string
  readonly subject: string
  readonly source: string
  readonly observedOn: string
  readonly corners: Corners
}

/** How the survey names a corner: its rate in yen and its game, `4円パチンコ`, `20円スロット`. */
const CORNER = /^(\d+(?:\.\d+)?)円(パチンコ|スロット)$/

const GAME_OF: Readonly<Record<string, string>> = { パチンコ: "pachinko", スロット: "pachislot" }

/** The most balls or medals a count of a report may be, as the survey takes them. */
const MOST_TOKENS = 100_000

/** What the survey says for a replay cap where a corner has none, and for whether a member may share what they hold. */
const NO_REPLAY_CAP = "上限なし"
const SHARES: Readonly<Record<string, boolean>> = { できる: true, できない: false }

const isTokens = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value > 0 && value <= MOST_TOKENS

/** Where a corner the survey names goes in `tiers.jsonl`: its game and its rate. */
const cornerAt = (label: unknown): { readonly game: string; readonly tier: string } | undefined => {
  const found = typeof label === "string" ? CORNER.exec(label) : null
  return found === null ? undefined : { game: GAME_OF[found[2] ?? ""] ?? "", tier: `${found[1] ?? ""}円` }
}

/** A row of the survey's corners as `tiers.jsonl` writes a corner, its fields in the format's order; or why it cannot be. */
const cornerTermsOf = (row: Json): CornerTerms | string => {
  const { rental, replayPaidOut, replayDeducted, replayCap, share } = row
  if (rental !== undefined && !isTokens(rental)) return "貸玉数・貸メダル数が数でない"
  if ((replayPaidOut === undefined) !== (replayDeducted === undefined) || (replayPaidOut !== undefined && (!isTokens(replayPaidOut) || !isTokens(replayDeducted)))) return "再プレイの払出・減数が揃っていない"
  if (replayCap !== undefined && replayCap !== NO_REPLAY_CAP && !isTokens(replayCap)) return "再プレイ上限が数でない"
  if (share !== undefined && (typeof share !== "string" || SHARES[share] === undefined)) return "持玉共有（分割）が想定外"
  return {
    ...(rental === undefined ? {} : { rental }),
    ...(isTokens(replayPaidOut) && isTokens(replayDeducted) ? { replay: { paidOut: replayPaidOut, deducted: replayDeducted } } : {}),
    ...(replayCap === undefined ? {} : { replayCap: replayCap === NO_REPLAY_CAP ? ("unlimited" as const) : (replayCap as number) }),
    ...(typeof share === "string" ? { share: SHARES[share] } : {}),
  }
}

const rowsOf = (value: unknown): readonly Json[] | undefined => (value === undefined ? [] : Array.isArray(value) && value.every(isJson) ? value : undefined)

/** A corner's terms with another's put over them, field by field, and its prizes by name. */
const overCorner = (before: CornerTerms | undefined, after: CornerTerms): CornerTerms => {
  const prizes = before?.prizes === undefined && after.prizes === undefined ? undefined : { ...before?.prizes, ...after.prizes }
  const { prizes: _before, ...kept } = before ?? {}
  const { prizes: _after, ...told } = after
  return { ...kept, ...told, ...(prizes === undefined ? {} : { prizes }) }
}

/** A parlor's corners with another report's put over them, corner by corner. */
const overCorners = (before: Corners, after: Corners): Corners =>
  Object.fromEntries(
    [...new Set([...Object.keys(before), ...Object.keys(after)])].map((game) => [
      game,
      Object.fromEntries([...new Set([...Object.keys(before[game] ?? {}), ...Object.keys(after[game] ?? {})])].map((tier) => [tier, ((told) => (told === undefined ? (before[game]?.[tier] as CornerTerms) : overCorner(before[game]?.[tier], told)))(after[game]?.[tier])])),
    ]),
  )

/** The correction an issue holds, where it says nothing but corners and their special prizes, or why it cannot be taken in unattended. */
const cornerReportOf = (issue: Issue): CornerReport | string => {
  const read = featureOf(issue, "amend")
  if (typeof read === "string") return read
  const { properties, observation, subject, provenance, source } = read
  const attributes = observation["attributes"]
  if (!isJson(attributes)) return "報告の形が想定と違う"
  const others = Object.keys(attributes).filter((key) => key !== "tiers" && key !== "prizes")
  if (others.length > 0) return `コーナーとレート以外の修正（${others.join("・")}）を含む`
  const [tiers, prizes] = [rowsOf(attributes["tiers"]), rowsOf(attributes["prizes"])]
  if (tiers === undefined || prizes === undefined || tiers.length + prizes.length === 0) return "コーナーとレートの形が想定と違う"
  const placed = [...tiers, ...prizes].map((row) => cornerAt(row["corner"]))
  if (placed.some((at) => at === undefined)) return "想定外のコーナー"
  if (prizes.some((row) => typeof row["name"] !== "string" || row["name"].trim() === "" || !isTokens(row["tokens"]) || row["yen"] !== undefined)) return "特殊景品の名前か必要な数が想定外"
  const terms = tiers.map(cornerTermsOf)
  const wrong = terms.find((found): found is string => typeof found === "string")
  if (wrong !== undefined) return wrong
  const told: Corners = tiers.reduce<Corners>((corners, row, index) => {
    const at = cornerAt(row["corner"]) as { game: string; tier: string }
    return overCorners(corners, { [at.game]: { [at.tier]: terms[index] as CornerTerms } })
  }, {})
  const corners = prizes.reduce<Corners>((held, row) => {
    const at = cornerAt(row["corner"]) as { game: string; tier: string }
    return overCorners(held, { [at.game]: { [at.tier]: { prizes: { [String(row["name"]).trim()]: row["tokens"] as number } } } })
  }, told)
  return { issue: issue.number, submission: String(properties["id"]), subject: String(subject["id"]), source, observedOn: String(provenance["observedOn"]), corners }
}

/** Metres between two positions, on a sphere: close enough for pins a few dozen metres apart. */
const metres = (a: { readonly lat: number; readonly lon: number }, b: { readonly lat: number; readonly lon: number }): number => {
  const radians = Math.PI / 180
  const dLat = (b.lat - a.lat) * radians
  const dLon = (b.lon - a.lon) * radians
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * Math.sin(dLon / 2) ** 2
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h))
}

const widest = (reports: readonly Report[]): number => Math.max(0, ...reports.flatMap((a) => reports.map((b) => metres(a, b))))

const readLines = async (file: string): Promise<string[]> => (await Bun.file(join(DATA, file)).text()).split("\n").filter((line) => line !== "")

const writeLines = (file: string, lines: readonly string[]): Promise<number> => Bun.write(join(DATA, file), lines.map((line) => `${line}\n`).join(""))

/** The parlor with a position, its fields in the order the list writes them: `lat` and `lon` after the address, as placed parlors have them. */
const placedAt = (parlor: Parlor, lat: number, lon: number): Parlor => {
  const after = ["addressPrecision", "addressSource", "address", "prefecture"].find((key) => key in parlor) ?? "name"
  return Object.fromEntries(Object.entries(parlor).flatMap(([key, value]) => (key === after ? [[key, value], ["lat", lat], ["lon", lon]] : [[key, value]]))) as Parlor
}

const latest = (...days: readonly unknown[]): string => days.filter((day): day is string => typeof day === "string").sort().at(-1) ?? ""

const withSubmissions = (parlor: Parlor, reports: readonly Report[]): Parlor => {
  const before = Array.isArray(parlor["submissions"]) ? (parlor["submissions"] as string[]) : []
  return { ...parlor, checked: latest(parlor["checked"], ...reports.map((report) => report.observedOn)), submissions: [...before, ...reports.map((report) => report.submission).filter((id) => !before.includes(id))] }
}

const how = (report: Report): string =>
  `${SOURCES[report.source] ?? report.source} on ${report.observedOn} and ${report.method === "pin" ? `pinned on ${BASEMAPS[report.basemap ?? ""] ?? report.basemap ?? "a map"}` : report.method === "gps" ? "taken by GPS" : `placed by ${report.method}`}`

const closes = (reports: readonly Report[]): string => [...new Set(reports.map((report) => report.issue))].sort((a, b) => a - b).map((issue) => `Closes #${issue}`).join("\n")

const wrap = (text: string): string => text.split(" ").reduce<string[]>((lines, word) => (lines.length > 0 && `${lines.at(-1)} ${word}`.length <= 72 ? [...lines.slice(0, -1), `${lines.at(-1)} ${word}`] : [...lines, word]), []).join("\n")

const git = async (...command: readonly string[]): Promise<void> => {
  const process = Bun.spawn(["git", ...command], {
    cwd: ROOT,
    env: { ...Bun.env, GIT_AUTHOR_NAME: AUTHOR.name, GIT_AUTHOR_EMAIL: AUTHOR.email, GIT_COMMITTER_NAME: AUTHOR.name, GIT_COMMITTER_EMAIL: AUTHOR.email },
    stdout: "inherit",
    stderr: "inherit",
  })
  if ((await process.exited) !== 0) throw new Error(`git ${command.join(" ")} failed`)
}

const checks = async (): Promise<boolean> => (await Bun.spawn(["bun", join(import.meta.dir, "check.ts")], { cwd: ROOT, stdout: "inherit", stderr: "inherit" }).exited) === 0

const hold = async (issues: readonly number[], reason: string): Promise<void> => {
  for (const issue of new Set(issues)) {
    console.log(`hold #${issue}: ${reason}`)
    if (dryRun) continue
    await api(`/issues/${issue}/labels`, { method: "POST", body: JSON.stringify({ labels: [HOLD] }) })
    await api(`/issues/${issue}/comments`, { method: "POST", body: JSON.stringify({ body: `自動では取り込みませんでした: ${reason}` }) })
  }
}

/** One change to the list, ready to write and commit, or the reason the reports behind it are left to a person. */
type Plan =
  | { readonly kind: "place"; readonly parlor: Parlor; readonly chosen: Report; readonly kept: readonly Report[]; readonly superseded: readonly Report[] }
  | { readonly kind: "confirm"; readonly parlor: Parlor; readonly kept: readonly Report[]; readonly superseded: readonly Report[]; readonly distance: number }
  | { readonly kind: "hold"; readonly reports: readonly Report[]; readonly reason: string }

/**
 * What the reports of one parlor come to. A contributor's later pin
 * corrects their earlier one; the pins left must agree with one another,
 * and, where the parlor is already placed, with where it is.
 */
const planFor = (reports: readonly Report[], unplaced: ReadonlyMap<string, Parlor>, placed: ReadonlyMap<string, Parlor>): Plan => {
  const byContributor = Map.groupBy([...reports].sort((a, b) => a.takenAt.localeCompare(b.takenAt)), (report) => report.contributor)
  const kept = [...byContributor.values()].map((own) => own.at(-1) as Report).sort((a, b) => a.takenAt.localeCompare(b.takenAt))
  const superseded = [...byContributor.values()].flatMap((own) => own.slice(0, -1))
  const spread = widest(kept)
  if (spread > NEAR) return { kind: "hold", reports, reason: `同じ店の報告どうしの位置が ${Math.round(spread)} m 離れている` }
  const waiting = unplaced.get(reports[0]?.subject ?? "")
  if (waiting !== undefined) {
    const chosen = [...kept].sort((a, b) => Number(b.source === "on-site") - Number(a.source === "on-site") || b.takenAt.localeCompare(a.takenAt))[0] as Report
    return { kind: "place", parlor: waiting, chosen, kept: [chosen, ...kept.filter((report) => report !== chosen)], superseded }
  }
  const standing = placed.get(reports[0]?.subject ?? "")
  if (standing === undefined) return { kind: "hold", reports, reason: `対象 ${reports[0]?.subject ?? ""} が一覧にない` }
  const position = { lat: Number(standing["lat"]), lon: Number(standing["lon"]) }
  const distance = Math.max(...kept.map((report) => metres(report, position)))
  if (distance > NEAR || superseded.length > 0) return { kind: "hold", reports, reason: `配置済みの店の位置を ${Math.round(distance)} m 動かす報告` }
  return { kind: "confirm", parlor: standing, kept, superseded, distance }
}

const messageOf = (plan: Exclude<Plan, { kind: "hold" }>): string => {
  const all = [...plan.kept, ...plan.superseded]
  if (plan.kind === "confirm") {
    const body = `Its position was reported again at survey.p-lens.jp, ${plan.kept.map(how).join("; and ")}. The pin${plan.kept.length > 1 ? "s lie" : " lies"} within ${Math.max(1, Math.round(plan.distance))} m of where it is placed, so the position stands and the report${plan.kept.length > 1 ? "s are" : " is"} named in its submissions.`
    return `Confirm ${plan.parlor.name}'s position, as reported again\n\n${wrap(body)}\n\n${closes(all)}\n`
  }
  const title = `Place ${plan.parlor.name}, ${plan.chosen.source === "on-site" ? "as reported from the spot" : "as its operator's site shows"}`
  const first =
    plan.kept.length === 1
      ? `Its position was reported at survey.p-lens.jp, ${how(plan.chosen)}, so it moves from the unplaced to the placed.`
      : `Its position was reported ${plan.kept.length} times at survey.p-lens.jp, so it moves from the unplaced to the placed. The pins lie within ${Math.max(1, Math.round(widest(plan.kept)))} m of one another and agree; the one ${how(plan.chosen)} is taken as its position, and all are named in its submissions.`
  const second = plan.superseded.length === 0 ? "" : `\n\n${wrap(`A later pin from the same contributor corrects ${plan.superseded.length > 1 ? "earlier ones" : "an earlier one"}, so ${plan.superseded.length > 1 ? "those are" : "that is"} turned down.`)}`
  return `${title}\n\n${wrap(first)}${second}\n\n${closes(all)}\n`
}

const issues = named.length > 0 ? await Promise.all(named.map(async (number) => (await api(`/issues/${number}`)) as Issue)) : await openIssues()
const waitingIssues = issues.filter((issue) => !issue.labels.some((label) => label.name === HOLD))
const kinds = waitingIssues.flatMap((issue) => ((kind) => (kind === undefined ? [] : [{ issue, kind }]))(kindOf(issue)))
for (const { issue, kind } of kinds) if (kind !== "locate" && kind !== "amend") await hold([issue.number], `${kind} の報告は手で取り込む`)
const read = kinds.filter(({ kind }) => kind === "locate").map(({ issue }) => ({ issue, report: reportOf(issue) }))
for (const { issue, report } of read) if (typeof report === "string") await hold([issue.number], report)
const corrections = kinds.filter(({ kind }) => kind === "amend").map(({ issue }) => ({ issue, report: cornerReportOf(issue) }))
for (const { issue, report } of corrections) if (typeof report === "string") await hold([issue.number], report)

const reports = read.flatMap(({ report }) => (typeof report === "object" ? [report] : []))
const taken = new Set([
  ...[...(await readLines("parlors.jsonl")), ...(await readLines("unplaced.jsonl")), ...(await readLines("tiers.jsonl"))].flatMap((line) => {
    const submissions = (JSON.parse(line) as Json)["submissions"]
    return Array.isArray(submissions) ? (submissions as string[]) : []
  }),
  ...(await readLines("rejections.jsonl")).map((line) => String((JSON.parse(line) as Json)["submission"])),
])
const fresh = reports.filter((report) => !taken.has(report.submission))
for (const report of reports) if (taken.has(report.submission)) console.log(`skip #${report.issue}: ${report.submission} is in the list already`)

const changed: number[] = []
for (const group of Map.groupBy(fresh, (report) => report.subject).values()) {
  const parlorLines = await readLines("parlors.jsonl")
  const unplacedLines = await readLines("unplaced.jsonl")
  const byId = (lines: readonly string[]): Map<string, Parlor> => new Map(lines.map((line) => JSON.parse(line) as Parlor).map((parlor) => [parlor.id, parlor]))
  const plan = planFor(group, byId(unplacedLines), byId(parlorLines))
  if (plan.kind === "hold") {
    await hold(plan.reports.map((report) => report.issue), plan.reason)
    continue
  }
  const line = (parlor: Parlor): string => JSON.stringify(parlor)
  if (plan.kind === "place") {
    await writeLines("unplaced.jsonl", unplacedLines.filter((each) => (JSON.parse(each) as Parlor).id !== plan.parlor.id))
    await writeLines("parlors.jsonl", [...parlorLines, line(withSubmissions(placedAt(plan.parlor, plan.chosen.lat, plan.chosen.lon), plan.kept))])
  } else {
    await writeLines("parlors.jsonl", parlorLines.map((each) => ((JSON.parse(each) as Parlor).id === plan.parlor.id ? line(withSubmissions(plan.parlor, plan.kept)) : each)))
  }
  if (plan.superseded.length > 0) await writeLines("rejections.jsonl", [...(await readLines("rejections.jsonl")), ...plan.superseded.map((report) => JSON.stringify({ submission: report.submission, reason: "後から届いた報告で位置が訂正されたため" }))])
  const message = messageOf(plan)
  console.log(`\n${message}`)
  if (!(await checks())) {
    await git("checkout", "--", "data")
    await hold([...plan.kept, ...plan.superseded].map((report) => report.issue), "取り込むと bun run check が通らない")
    continue
  }
  if (dryRun) continue
  await git("add", "data")
  await git("commit", "--quiet", "--message", message)
  changed.push(...[...plan.kept, ...plan.superseded].map((report) => report.issue))
}

const cornerReports = corrections
  .flatMap(({ report }) => (typeof report === "object" ? [report] : []))
  .filter((report) => {
    if (taken.has(report.submission)) console.log(`skip #${report.issue}: ${report.submission} is in the list already`)
    return !taken.has(report.submission)
  })
  .sort((a, b) => a.issue - b.issue)
for (const report of cornerReports) {
  const parlor = [...(await readLines("parlors.jsonl")), ...(await readLines("unplaced.jsonl"))].map((line) => JSON.parse(line) as Parlor).find((each) => each.id === report.subject)
  if (parlor === undefined) {
    await hold([report.issue], `対象 ${report.subject} が一覧にない`)
    continue
  }
  const lines = await readLines("tiers.jsonl")
  const at = lines.findIndex((line) => ((value) => value["id"] === report.subject && value["checked"] === report.observedOn)(JSON.parse(line) as Json))
  const before = at === -1 ? undefined : (JSON.parse(lines[at] as string) as Json)
  const submissions = Array.isArray(before?.["submissions"]) ? (before["submissions"] as string[]) : []
  const line = JSON.stringify({ id: report.subject, tiers: overCorners(isJson(before?.["tiers"]) ? (before["tiers"] as Corners) : {}, report.corners), checked: report.observedOn, submissions: [...submissions, report.submission] })
  await writeLines("tiers.jsonl", at === -1 ? [...lines, line] : lines.map((each, index) => (index === at ? line : each)))
  const how = `${SOURCES[report.source] ?? report.source} on ${report.observedOn}`
  const body = at === -1 ? `Its corners and their special prizes were reported at survey.p-lens.jp, ${how}, and are added as what was checked that day.` : `Its corners and their special prizes were reported again at survey.p-lens.jp, ${how}, and are put over what was checked that day, corner by corner and field by field: the later report stands.`
  const message = `${at === -1 ? "Take in" : "Put right"} ${parlor.name}'s corners, as reported\n\n${wrap(body)}\n\nCloses #${report.issue}\n`
  console.log(`\n${message}`)
  if (!(await checks())) {
    await git("checkout", "--", "data")
    await hold([report.issue], "取り込むと bun run check が通らない")
    continue
  }
  if (dryRun) continue
  await git("add", "data")
  await git("commit", "--quiet", "--message", message)
  changed.push(report.issue)
}

if (!dryRun && changed.length > 0) {
  await git("push", "--quiet", "origin", "HEAD:main")
  for (const issue of new Set(changed)) await api(`/issues/${issue}`, { method: "PATCH", body: JSON.stringify({ state: "closed", state_reason: "completed" }) })
}
