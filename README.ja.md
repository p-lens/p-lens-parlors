# p-lens-parlors

> **この日本語版が原本です。** [English](README.md) は翻訳で、内容が食い違うときは日本語版に従います。

日本のパチンコ・パチスロ店舗の公開一覧です。P-Lens（Pレンズ）のために、また使いたい人の誰にでも使えるように、JSON Lines 形式で [Open Database License](LICENSE) のもとに公開しています。

```text
data/parlors.jsonl     位置のある店舗
data/unplaced.jsonl    貯玉補償基金または運営会社から知られていて、まだ地図に置かれていない店舗
data/rejections.jsonl  却下した申請（app.p-lens.jp が表示するため）
```

parlors.p-lens.jp で静的ファイルとして公開します。app.p-lens.jp は `parlors.jsonl` と `rejections.jsonl` を読み、survey.p-lens.jp は `parlors.jsonl` と `unplaced.jsonl` を読んで、ここに反映される報告を受け付けます。

## 形式

1 行に 1 店舗です。

| 項目 | | |
|---|---|---|
| `id` | 必ず | OpenStreetMap の要素に置いた店舗は `osm:<type>/<id>`、貯玉補償基金の加盟店でまだ置かれていない店舗は `cf:<hash>`、運営会社だけから知られている店舗は `op:<chain>:<hash>` |
| `name` | 必ず | 運営会社自身の店名が分かればそれ、なければ貯玉補償基金に加盟している名前、それもなければ OpenStreetMap の名前。全角半角・大文字小文字・空白・記号の違いを除いて、同じ名前の店舗は 2 つありません。同じ名前で呼ばれる店舗が 2 つあるときは、基金自身の書き方にならって、それぞれ名前のあとに所在地を付けます（例：`ネバーランド(八戸)`） |
| `reading` | 必ず | ひらがな |
| `branchReading` | ある場合 | 運営会社が書いている支店名の読み |
| `keywords` | ある場合 | 検索に使うほかの名前。`name` と違うときの OpenStreetMap の名前 |
| `prefecture` | 必ず | 47 都道府県のいずれか |
| `address` | 分かる場合 | 都道府県より後ろ |
| `addressSource` | `address` とともに | `operator`（運営会社のサイト）、`chodama`（貯玉補償基金の加盟店一覧）、`osm-tags`（要素の `addr:*`）、`osm-areas`（位置が含まれる OpenStreetMap の行政区域）のいずれか |
| `addressPrecision` | `address` とともに | `street`（番地まで）、`town`（町丁目まで）、`municipality`（市区町村まで）のいずれか |
| `lat`, `lon` | 位置のある店舗のみ | WGS84 |
| `osm` | 置かれている場合 | OpenStreetMap の要素 |
| `officialName`, `officialUrl` | 分かる場合 | 運営会社が公表しているもの |
| `readingSource` | 必ず | `official-branch` または `generated` |
| `checked` | 必ず | 事実を最後に確かめた日（YYYY-MM-DD） |
| `submissions` | 後から | この店舗が応えた survey.p-lens.jp の申請 |

`rejections.jsonl`：`{"submission", "reason"?}`

## データの出どころ

- **店舗とその名前・住所** は、まず一般社団法人貯玉補償基金が [chodama.or.jp](https://www.chodama.or.jp/hall/) で公表している加盟店一覧に拠ります（2026-10-06 に閲覧）。採るのは加盟している名前と住所という事実だけで、ほかには何も採りません。基金は店舗の貯玉が登録される先なので、どの店舗が貯玉を扱い、どの名前で扱っているかについて、その一覧が公式の拠りどころです。基金の全角文字は通常の幅に直して書いています。その日の時点での同サイトの[利用規約](https://www.chodama.or.jp/kiyaku.php)は[アーカイブ](https://web.archive.org/web/20261006025228/https://www.chodama.or.jp/kiyaku.php)してあります。
- **位置** は [OpenStreetMap](https://www.openstreetmap.org/)（© OpenStreetMap contributors, ODbL）に拠ります。パチンコ店または遊技場としてタグ付けされた要素のうち、編集時点（2026-10-05）で営業中と判断したものです。加盟店は、位置がその住所の町に入り、名前が書き方または読みで一致するか、支店名を除いた名前である要素に置きます。ただし、近くにほかに当てはまる加盟店がないときに限ります。当てはまる要素のない加盟店は、survey.p-lens.jp で位置が報告されるまで、位置なしの未配置として載せます。
- **正式名称・公式ページ・住所** は、運営会社が自社サイトで公表している店舗一覧に拠り、それぞれ `officialUrl` にリンクしています。運営会社が店名を示している店舗は、その名前が `name` です。名前と住所は事実であり、それらのサイトからほかには何も採りません。
- **OpenStreetMap だけが知っている店舗** は、その名前のまま載せます。住所は要素自身の `addr:*` タグがあればそれ、なければ位置が含まれる OpenStreetMap の行政区域（市区町村、あれば町丁目）から採るので、どこまで細かいかは `addressPrecision` が示します。全角半角・大文字小文字・空白・記号の違いを除いて、ほかの配置済み店舗と同じ名前のものは載せません。P-Lens の帳簿は店舗の貯玉をその名前で持つので、同じ名前の 2 店舗は 1 つの口座になってしまうからです。
- OpenStreetMap から置いた店舗の **都道府県** は位置から推定しました。**読み** は [Geolonia 住所データ](https://github.com/geolonia/japanese-addresses)（CC BY 4.0）の地名の読みと [Sudachi](https://github.com/WorksApplications/Sudachi)（SudachiDict, Apache-2.0）で生成しました。Geolonia 住所データは、住所の町がどこにあるかを知るのにも使っています。生成した読みは間違っていることがあります。訂正は survey.p-lens.jp で受け付けています。
- survey.p-lens.jp で受け付ける **報告** は、現地または運営会社自身のサイトで確かめた一次情報で、投稿者が CC0 で提供し、取り込む前に確認しています。

店舗ポータルサイト、Google マップなどの地図サービス、そのほか規約で禁じているデータベースからは、何も採っていません。

## 使うとき

**「© P-Lens contributors, © OpenStreetMap contributors」** と表示し、このデータベースから派生したデータベースは ODbL のもとに置いてください。

## 確かめ方

```sh
bun install
bun run check
```

## 公開のしかた

`main` に入ったものが、そのまま parlors.p-lens.jp に出ます。Cloudflare がこのリポジトリを見ていて、`main` が進むたびに `bun run check` を走らせ、通れば `data/` を公開します。検査に落ちた一覧は公開されません。

```text
Cloudflare の設定（Workers ＞ このリポジトリを接続）
  ビルドの命令      bun install && bun run check
  デプロイの命令    bunx wrangler deploy
  ビルドの変数      BUN_VERSION=1.4.2
```

`BUN_VERSION` は、`bun.lock` を書いた Bun と同じか新しい版にします。Cloudflare に元から入っている Bun が古いと、`bun.lock` を読めずに止まります。

何をどこに出すかは `wrangler.jsonc` に、ファイルと一緒に送るヘッダーは `data/_headers` に、parlors.p-lens.jp を開いた人に見せる案内は `data/index.html` にあります。一覧はほかのサイトのページから読まれるので、どのサイトからも読めるようにしてあります。

## 報告を取り込む

survey.p-lens.jp で送られた報告は、このリポジトリの issue になります（ラベルは `survey`、`parlor` と、`add`・`locate`・`gone`・`amend` のいずれか）。issue には確認のための表と、GeoJSON としての記録が入っています。

1. issue を読み、出どころと内容を確かめる
2. `data/parlors.jsonl` または `data/unplaced.jsonl` を直す。座標の分かった店舗は `unplaced.jsonl` から `parlors.jsonl` へ移す
3. `bun run check`
4. コミットのメッセージに `Closes #番号` と書いて `main` に入れる

`main` に入れば、公開も issue を閉じるのも自動です。survey.p-lens.jp と app.p-lens.jp は開くたびにここを読むので、どちらも入れ直す必要はありません。
