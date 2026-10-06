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

const seen = new Map<string, string>()
const named = new Map<string, string>()
const findings = [...(await findingsOf("parlors.jsonl", true, seen, named)), ...(await findingsOf("unplaced.jsonl", false, seen, named))]
const errors = findings.filter((finding) => finding.level === "error")
const warnings = findings.filter((finding) => finding.level === "warning")
for (const finding of errors.slice(0, 50)) console.error(`${finding.file}:${finding.line} ${finding.message}`)
console.log(`${seen.size} parlors, ${errors.length} errors, ${warnings.length} placed without an address`)
process.exit(errors.length === 0 ? 0 : 1)
