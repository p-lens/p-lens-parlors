/**
 * Checks the list's files line by line, as app.p-lens.jp and survey.p-lens.jp
 * read them, and exits non-zero on any error. Run before every commit that
 * touches data/.
 *
 *   bun tools/check.ts
 */
import { join } from "node:path"

const PREFECTURES = new Set([
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県", "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県",
  "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県", "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県",
  "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
])

/** What a parlor's name cannot hold, since app.p-lens.jp writes it into an hledger account and commodity. */
const UNWRITABLE = /[:",;\n\r\t]| {2}/

const READING = /^[ぁ-ゖー]+$/

const ADDRESS_SOURCES = new Set(["operator", "chodama", "osm-tags", "osm-areas"])

const ADDRESS_PRECISIONS = new Set(["street", "town", "municipality"])

type Json = Readonly<Record<string, unknown>>

type Finding = { readonly level: "error" | "warning"; readonly file: string; readonly line: number; readonly message: string }

const isJson = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value)

const inJapan = (lat: unknown, lon: unknown): boolean => typeof lat === "number" && typeof lon === "number" && lat >= 20 && lat <= 46 && lon >= 122 && lon <= 154

const filled = (value: unknown): value is string => typeof value === "string" && value.trim() !== "" && value === value.trim()

/** Every problem of one parlor line; a placed parlor needs a position, an unplaced one must not have one. */
const parlorFindings = (value: unknown, placed: boolean): readonly { readonly level: Finding["level"]; readonly message: string }[] => {
  if (!isJson(value)) return [{ level: "error", message: "not a JSON object" }]
  const { id, name, reading, keywords, prefecture, address, addressSource, addressPrecision, lat, lon, officialUrl } = value
  const addressDescribed = address === undefined ? addressSource === undefined && addressPrecision === undefined : ADDRESS_SOURCES.has(String(addressSource)) && ADDRESS_PRECISIONS.has(String(addressPrecision))
  return [
    ...(filled(id) ? [] : [{ level: "error" as const, message: "id missing" }]),
    ...(filled(name) && !UNWRITABLE.test(name) ? [] : [{ level: "error" as const, message: "name missing or unwritable" }]),
    ...(filled(reading) && READING.test(reading) ? [] : [{ level: "error" as const, message: "reading missing or not hiragana" }]),
    ...(keywords === undefined || (Array.isArray(keywords) && keywords.length > 0 && keywords.every((word) => filled(word) && !UNWRITABLE.test(word))) ? [] : [{ level: "error" as const, message: "keywords empty or unwritable" }]),
    ...(typeof prefecture === "string" && PREFECTURES.has(prefecture) ? [] : [{ level: "error" as const, message: `prefecture not one of the 47: ${String(prefecture)}` }]),
    ...(address === undefined || filled(address) ? [] : [{ level: "error" as const, message: "address empty or untrimmed" }]),
    ...(addressDescribed ? [] : [{ level: "error" as const, message: "address without a known addressSource and addressPrecision, or those without an address" }]),
    ...(officialUrl === undefined || (typeof officialUrl === "string" && /^https?:\/\//.test(officialUrl)) ? [] : [{ level: "error" as const, message: "officialUrl is not a web address" }]),
    ...(placed
      ? inJapan(lat, lon) ? [] : [{ level: "error" as const, message: "placed parlor without a position in Japan" }]
      : lat === undefined && lon === undefined ? [] : [{ level: "error" as const, message: "unplaced parlor with a position" }]),
    ...(placed && address === undefined ? [{ level: "warning" as const, message: "no address" }] : []),
  ]
}

const GAMES = new Set(["pachinko", "pachislot"])

/** A corner's name as a parlor's board says its rate: `4円`, `0.5円`, `20円`. */
const TIER = /^\d+(\.\d+)?円$/

const DAY = /^\d{4}-\d{2}-\d{2}$/

const isCount = (value: unknown): boolean => typeof value === "number" && Number.isInteger(value) && value > 0

const onlyKeys = (value: Json, known: readonly string[]): boolean => Object.keys(value).every((key) => known.includes(key))

/**
 * Whether a corner's terms read: each of them left out or a whole number
 * above zero, and nothing else said. A parlor rents tokens, takes them back
 * on a replay, and gives special prizes for them: each kind of prize by
 * its name, with the tokens it takes. It exchanges nothing for money, so a
 * corner has `prizes` and never an exchange, and no yen.
 */
const isTier = (value: unknown): boolean => {
  if (!isJson(value) || !onlyKeys(value, ["rental", "replay", "prizes"])) return false
  const { rental, replay, prizes } = value
  const replayReads = replay === undefined || (isJson(replay) && onlyKeys(replay, ["paidOut", "deducted"]) && isCount(replay["paidOut"]) && isCount(replay["deducted"]))
  const prizesRead = prizes === undefined || (isJson(prizes) && Object.keys(prizes).length > 0 && Object.entries(prizes).every(([name, tokens]) => filled(name) && isCount(tokens)))
  return (rental === undefined || isCount(rental)) && replayReads && prizesRead
}

/** Whether a parlor's corners read: under the games it has, at least one corner in all, each by its rate. */
const areTiers = (value: unknown): boolean => {
  if (!isJson(value) || !Object.keys(value).every((game) => GAMES.has(game))) return false
  const games = Object.values(value)
  return games.every((corners) => isJson(corners) && Object.entries(corners).every(([name, terms]) => TIER.test(name) && isTier(terms))) && games.some((corners) => isJson(corners) && Object.keys(corners).length > 0)
}

/** How far ahead of today a line's day may be, in days: half a year, for a change made known before it comes. */
const DAYS_AHEAD = 183

/** Whether a day is one a line may be of: a day written as one, and no further ahead than a change is made known. */
const isCheckedDay = (value: unknown): boolean => typeof value === "string" && DAY.test(value) && (Date.parse(value) - Date.now()) / 86_400_000 <= DAYS_AHEAD

/** A line of corners by what tells it from another: the parlor and the day it was checked. */
const checkedKey = (id: unknown, checked: unknown): string => `${String(id)} on ${String(checked)}`

/**
 * Every problem of one line of a parlor's corners: it is about a parlor
 * the list has, by its id, as checked on one day. Rates change, so a
 * parlor has a line for each day it was checked, the earlier ones kept as
 * what held then — but one line a day.
 */
const tiersFindings = (value: unknown, parlors: ReadonlyMap<string, string>, told: ReadonlyMap<string, string>): readonly { readonly level: Finding["level"]; readonly message: string }[] => {
  if (!isJson(value)) return [{ level: "error", message: "not a JSON object" }]
  const { id, tiers, checked, submissions } = value
  return [
    ...(onlyKeys(value, ["id", "tiers", "checked", "submissions"]) ? [] : [{ level: "error" as const, message: "a field the format does not have" }]),
    ...(filled(id) && parlors.has(id) ? [] : [{ level: "error" as const, message: `id of no listed parlor: ${String(id)}` }]),
    ...(filled(id) && told.has(checkedKey(id, checked)) ? [{ level: "error" as const, message: `id ${id} checked ${String(checked)} also in ${told.get(checkedKey(id, checked)) ?? ""}` }] : []),
    ...(areTiers(tiers) ? [] : [{ level: "error" as const, message: "tiers missing, empty or not as the format has them" }]),
    ...(isCheckedDay(checked) ? [] : [{ level: "error" as const, message: "checked missing, not a day, or more than half a year ahead" }]),
    ...(submissions === undefined || (Array.isArray(submissions) && submissions.length > 0 && submissions.every(filled)) ? [] : [{ level: "error" as const, message: "submissions empty" }]),
  ]
}

const jsonOf = (line: string): unknown => {
  try {
    return JSON.parse(line)
  } catch {
    return undefined
  }
}

/**
 * The name app.p-lens.jp writes a parlor under: its `officialName` where the
 * list gives one a book could write, else its `name`.
 */
const writtenName = (value: Json): string | undefined => {
  const { name, officialName } = value
  if (typeof officialName === "string" && officialName.trim() !== "" && !UNWRITABLE.test(officialName.trim())) return officialName.trim()
  return typeof name === "string" ? name.trim() : undefined
}

/**
 * A name as app.p-lens.jp compares names: widths and case aside, katakana as
 * hiragana, and no spaces or marks — so P ARK and Park are one name.
 */
const nameKey = (name: string): string =>
  name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s'’・.\-&!_]/g, "")
    .replace(/[ァ-ヶ]/g, (character) => String.fromCodePoint((character.codePointAt(0) ?? 0) - 0x60))

/**
 * A file's findings. A P-Lens book keeps a parlor's savings under the name
 * it writes, so two parlors written under one name would be one account
 * there — and under names a space or a width apart, two accounts nobody
 * could tell apart. A parlor not yet placed is held to it too, so that
 * placing one never finds its name taken.
 */
const findingsOf = async (file: string, placed: boolean, seen: Map<string, string>, named: Map<string, string>): Promise<readonly Finding[]> => {
  const lines = (await Bun.file(join(import.meta.dir, "..", "data", file)).text()).split("\n").filter((line) => line !== "")
  return lines.flatMap((line, index) => {
    const value = jsonOf(line)
    const id = isJson(value) && typeof value["id"] === "string" ? value["id"] : undefined
    const name = isJson(value) ? writtenName(value) : undefined
    const duplicate = id !== undefined && seen.has(id) ? [{ level: "error" as const, message: `id ${id} also in ${seen.get(id) ?? ""}` }] : []
    const key = name === undefined ? undefined : nameKey(name)
    const shared = key !== undefined && named.has(key) ? [{ level: "error" as const, message: `written as ${name ?? ""}, as is ${named.get(key) ?? ""}` }] : []
    if (id !== undefined && !seen.has(id)) seen.set(id, `${file}:${index + 1}`)
    if (key !== undefined && !named.has(key)) named.set(key, `${file}:${index + 1}`)
    return [...parlorFindings(value, placed), ...duplicate, ...shared].map((finding) => ({ ...finding, file, line: index + 1 }))
  })
}

/**
 * The findings of the corners' file, held against the parlors of the two
 * files before it. It is a file of its own on purpose, tied to the list by
 * a parlor's id and nothing else, so it can be taken away whole.
 */
const tiersFindingsOf = async (file: string, parlors: ReadonlyMap<string, string>): Promise<readonly Finding[]> => {
  const lines = (await Bun.file(join(import.meta.dir, "..", "data", file)).text()).split("\n").filter((line) => line !== "")
  const told = new Map<string, string>()
  return lines.flatMap((line, index) => {
    const value = jsonOf(line)
    const found = tiersFindings(value, parlors, told).map((finding) => ({ ...finding, file, line: index + 1 }))
    if (isJson(value) && !told.has(checkedKey(value["id"], value["checked"]))) told.set(checkedKey(value["id"], value["checked"]), `${file}:${index + 1}`)
    return found
  })
}

const seen = new Map<string, string>()
const named = new Map<string, string>()
const findings = [...(await findingsOf("parlors.jsonl", true, seen, named)), ...(await findingsOf("unplaced.jsonl", false, seen, named)), ...(await tiersFindingsOf("tiers.jsonl", seen))]
const errors = findings.filter((finding) => finding.level === "error")
const warnings = findings.filter((finding) => finding.level === "warning")
for (const finding of errors.slice(0, 50)) console.error(`${finding.file}:${finding.line} ${finding.message}`)
console.log(`${seen.size} parlors, ${errors.length} errors, ${warnings.length} placed without an address`)
process.exit(errors.length === 0 ? 0 : 1)
