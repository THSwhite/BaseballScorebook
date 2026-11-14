# 棒球文字轉播（Baseball Scorebook）

這是一個逐打席記錄棒球比賽的網頁工具。記錄員登入後記錄比賽，觀眾不用登入，就能即時看到文字轉播和打擊成績。

## 功能

- **球隊管理**：建立球隊和球員名單，可設定背號、主要守位、投打習慣。
- **建立比賽**：選擇 1set／2set（每隊一次連打兩局），再排好兩隊先發。局數不設上限，記錄員按「結束比賽」才會結束。
- **逐打席記錄**：記錄安打、上壘、出局、雙殺、犧牲打，以及擊球方向、高度、守備路線、失誤，跑者去向可以手動調整。
- **換人**：代跑、代打、換人、守位交換、臨時插入打者。
- **修改歷史**：可以修改、插入、刪除過去的紀錄。改完後，後面的局面、棒次、比分會整個重新計算。
- **離線記錄**：斷線時先存在本機，恢復連線後自動同步。
- **即時轉播**：使用 Supabase Realtime 推送，並以輪詢當作備援。

## 開發

```bash
npm install
npm run dev      # 開發伺服器
npm run build    # 打包到 dist/
npm run lint     # oxlint 檢查
```

需要在 `.env.local` 設定 Supabase 連線：

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

用到的資料表：`teams`、`players`、`games`、`lineups`、`plate_appearances`。

## 程式結構

```
src/
  pages/            每個路由一個頁面
  components/       共用元件（Navbar、Modal）
  features/
    auth/           登入狀態
    teams/          球隊與球員名單
    games/          比賽列表、建立比賽、先發名單
    scoring/        記錄頁（記錄畫面、換人、修改歷史、離線佇列）
    live/           觀眾轉播頁
  utils/            純函式（不含畫面），記錄頁與轉播頁共用
    baseballRules.js    規則常數、守備位置
    plateAppearance.js  打席引擎：套用一個打席、重播整場比賽
    lineup.js           先發 + 換人 → 目前打線
    history.js          修改歷史後重新推算整條時間軸
    formatters.js       把紀錄轉成轉播文字
    gameSummary.js      轉播分組、局數比分、打擊成績
```

比賽狀態不會另外儲存，而是把所有紀錄依序「重播」得出來。所以復原、修改歷史、離線補送都不會讓狀態錯亂。

部署在 Vercel，`vercel.json` 會把所有路徑導回 `index.html`，讓前端路由正常運作。
