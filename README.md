# 《太虛神農紀：雙極靈樞》（Shennong Pharma）

> **純靜態前端自主神經藥理學互動輕小說遊戲（Phase 1：第一、二卷 Ch.06–Ch.07）**  
> Zero-backend vanilla HTML5 + CSS3 + ES6+ JavaScript + JSON interactive pharmacology visual novel.

---

## 核心特色

- **完整覆蓋 36 項核心藥理考點（Vol.1 Ch.06 18 項 ＋ Vol.2 Ch.07 18 項）**
  - 由醫學字首字根、細胞訊號三法、血腦障壁（BBB）四級銨鐵律、交感三大特例、九大靈訊、GPCR 與腎上腺素／多巴胺亞型，一路推進至 Ch.07 四象膽鹼酯改造、毒菇生物鹼、修格蘭氏症候群、青光眼／老花眼、`Furchgott` 內皮實驗、括約肌 `NANC`、TCA 過量禁忌、MG vs. 膽鹼性雙危象、`LEMS`（`Amifampridine`）與農夫 JM／沙林有機磷毒理急救。
  - **嚴格採用台灣醫學／藥理學繁體中文慣用語**（致效劑、拮抗劑、正腎上腺素、神經傳導物質、血腦障壁、過極化、心搏過速／過緩、阿茲海默症、巴金森氏症、氣喘、良性攝護腺肥大、尿滯留、麩胺酸、肝醣、升糖素、生體可用率、首渡效應等）。
- **雙遊玩模式 × 天機籤號 Seeded PRNG（Mulberry32）**
  - **模式 A《太虛試煉・Roguelike 速行篇》**（10–15 分鐘）：序章覺醒 → 擇定修煉路線（太陰丹房 / 兩儀總論 / 毒理急診混合）加權抽籤 4 場事件 → 終極 Boss 戰。相同天機籤號可重現完全相同的事件與題組順序，方便同儕對照刷題。
  - **模式 B《神農紀實・全卷章回篇》**（30–45 分鐘）：貫穿 5 大章回全 18 節點，第 2 章與第 4 章支援**自由接診／破陣樞紐**，隨身丹囊道具將改寫後續線索，並支援 `localStorage` 即時斷點續玩。
- **即時聯動「SVG 內景脈象儀」＋ 錯藥真實演繹＆危機補救**
  - 動態繪製心電脈波（Normal / Brady / Tachy / AFib / Wide QRS / Long QT / **Asystole 平直紅線**）、BP / MAP、IOP、動態瞳孔與睫狀肌、支氣管口徑與黏液分泌、NMJ 終板張力與特規警報印記，並內建可切換之溫和 WebAudio 脈象提示音。
  - 誤選高危誘答（如 TCA 寬 QRS 誤推 `Physostigmine`、MG 誤用直接致效劑、膽鹼性危象盲目加藥、隱性氣喘給 `Bethanechol`、磨除內皮給 `ACh`、有機磷漏 `Atropine` 拖至 `Aging`、`Reserpine` 踩中憂鬱／潰瘍禁忌）會真實演繹病理惡果並進入限時補救支線。
- **互動實驗室微元件與「靈樞丹譜」圖鑑抽屜**
  - 內含《三才真言碑抽籤破譯》、《四象膽鹼酯煉丹台 SAR 切換》、《Furchgott 離體血管內皮試驗台》。
  - 隨劇情自動解鎖 36 張考點卡片、7 大完整藥理對照總表（亦提供考前速查一鍵預覽）、錯題筆記自動收錄與 7 種結局殿堂。
- **Phase 2 無痛擴充設計**
  - 透過 [expansions.json](data/expansions.json) 預留 `vol3_vol4`（第三、四卷 Ch.08–09）擴充插槽，未來僅需掛載新 JSON 模組即可無縫擴充。

---

## 本機執行與離線單檔打包

本專案完全不依賴 Node 套件、建置工具或後端伺服器，可直接部署至 GitHub Pages / Cloudflare Pages。

### 1. 使用內建靜態伺服器開啟（推薦開發／測試用）

```bash
python3 -m http.server 8080
# 瀏覽器開啟 http://localhost:8080
```

### 2. 打包成「單一離線 HTML 檔」（可隨手傳給同學雙擊開啟，免本機伺服器）

```bash
python3 tools/bundle_single_file.py
# 輸出：dist/index_standalone.html（已內嵌所有 CSS、JS 與 JSON 資料，支援 file:// 直接離線開啟）
```

---

## 專案目錄結構

```text
shennong-pharma/
├── index.html                  # 主介面骨架（開局畫卷、書卷劇本區、SVG 脈象儀、結局、丹譜抽屜）
├── styles/
│   └── theme.css               # 素箋日間／墨硯夜間雙主題、古風篆印美學與響應式排版
├── js/
│   ├── rng.js                  # FNV-1a + Mulberry32 可重現隨機數產生器與加權抽樣
│   ├── state.js                # 雙模式狀態、護心丹、陰陽平衡、丹囊與 localStorage 自動存檔
│   ├── pulseMonitor.js         # SVG 內景脈象儀即時動畫繪製與 WebAudio 音效切換
│   ├── codex.js                # 靈樞丹譜（36 考點、7 大總表、錯題筆記、7 大結局圖鑑）
│   ├── engine.js               # 雙模式狀態機、Hub 樞紐、互動實驗台、危機補救分支與結局判定
│   └── main.js                 # 模組化資料載入（支援單檔離線內嵌與 Phase 2 擴充架構）、快捷鍵 (1-4 / Enter)
├── data/
│   ├── expansions.json         # Phase 1 現用模組與 Phase 2 (vol3_vol4) 擴充插槽註冊表
│   ├── vol1_vol2_nodes.json    # E01–E18 完整劇情節點、Question Clusters 與七大藥理危機分支
│   ├── vol1_vol2_deck.json     # 模式 A 三路線加權卡池 ＋ 模式 B 五章回劇本排序
│   ├── codex_entries.json      # 36 項核心考點卡片 ＋ 7 大完整對照總表
│   └── endings.json            # 7 種修煉結局定義與解鎖條件
└── tools/
    └── bundle_single_file.py   # 單檔離線 HTML 打包腳本
```
