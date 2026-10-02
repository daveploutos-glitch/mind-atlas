# 認知圖鑑 · Mind Atlas

Chi Wai 個人認知學習平台（舒服紙感 UI，唔係霓虹風）。  
用 Instagram 式圖像＋文字滑卡，記錄同複習每日學到嘅概念。

線上：**https://daveploutos-glitch.github.io/mind-atlas/**

視覺參考 CFA L2 cards（cream `#f5f3ee`、深藍 `#1f4e79`）；架構參考 Fit Life（GitHub Pages + JSON + vanilla JS + localStorage + version.json）。

## 開啟

- Pages：https://daveploutos-glitch.github.io/mind-atlas/
- 本機：喺本目錄跑 `python3 -m http.server 8766`，再開 `http://localhost:8766/`

## 結構

| 路徑 | 說明 |
|---|---|
| `index.html` | 主頁（zh-Hant UI）|
| `styles.css` / `app.js` | 紙感樣式與邏輯 |
| `data/concepts.json` | 所有概念卡（封面／核心／例子／行動／問題）|
| `data/days.json` | 每日簡報 meta，連結 concept ids |
| `data/tags.json` | 領域同標籤目錄 |
| `version.json` | 建置標記（前端可輪詢更新）|
| `.nojekyll` | 讓 GitHub Pages 唔經 Jekyll |

## 五個分區

1. **今日 Feed** — 當日（或最新一日）概念，橫向滑卡
2. **圖鑑 Library** — 搜尋＋領域／標籤篩選
3. **主題地圖 Map** — 五大領域計數，撳入圖鑑篩選
4. **複習 Review** — 未答問題、收藏、最近睇過（localStorage）
5. **歷程 Archive** — 按日回顧

## 本機狀態（唔會因 deploy 消失）

- 收藏：`mindatlas.bookmarks.v1`
- 問題答案：`mindatlas.answers.v1`
- 最近瀏覽：`mindatlas.recent.v1`

## 點樣每日加新概念（給 parent agent）

1. 喺 `data/concepts.json` 的 `concepts` 陣列 **開頭**（或任意位置）加一個物件，形狀如下：

```json
{
  "id": "2026-10-03-example-id",
  "date": "2026-10-03",
  "title": "標題",
  "subtitle": "副標／一句鉤子",
  "domain": "思維模型",
  "tags": ["標籤1", "標籤2"],
  "source": {"label": "來源名", "url": "https://..."},
  "cover": {
    "emoji": "💡",
    "gradient": ["#e8f0e6", "#d4e4f0"],
    "hook": "一句鉤子"
  },
  "slides": [
    {"type": "cover", "title": "...", "body": "..."},
    {"type": "core", "title": "核心", "body": "..."},
    {"type": "example", "title": "例子", "body": "..."},
    {"type": "action", "title": "今日行動", "body": "..."},
    {"type": "question", "title": "問你", "body": "..."}
  ],
  "related": []
}
```

2. 喺 `data/days.json` 加／更新當日條目，`conceptIds` 指向上面嘅 `id`。
3. （可選）喺 `data/tags.json` 補新標籤。
4. 更新 `version.json` 的 `version` / `built`（例如 `20261003120000-xxxxx`）。
5. `git add -A && git commit -m "docs(concepts): YYYY-MM-DD …" && git push`
6. 等 GitHub Pages 約 30–90 秒；瀏覽器撳「檢查更新」或硬刷新。

`domain` 請用五大領域之一：`思維模型` / `商機趨勢` / `世界事` / `習慣決策` / `牛人觀點`。

## 授權

Personal learning notes for Chi Wai. Repo may be public for GitHub Pages.
