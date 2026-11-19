# 《太虛神農紀：雙極靈樞》（Shennong Pharma）

> **純靜態前端自主神經藥理學互動輕小說遊戲（Phase 1＋Phase 2 全四卷 Ch.06–Ch.09 完整版）**  
> Zero-backend vanilla HTML5 + CSS3 + ES6+ JavaScript + JSON interactive pharmacology visual novel.  
> 🌐 **GitHub Pages 線上遊玩**：https://lumus-lab.github.io/shennong-pharma/

---

## 核心特色

- **完整覆蓋全四卷 75 項核心藥理考點（Vol.1–2 Ch.06–07 36 項 ＋ Vol.3–4 Ch.08–09 39 項）**
  - **第一、二卷（Ch.06–07）**：醫學字首字根、細胞訊號三法、血腦障壁（BBB）四級銨鐵律、交感三大特例、九大靈訊、GPCR 與腎上腺素／多巴胺亞型、四象膽鹼酯改造、毒菇生物鹼、修格蘭氏症候群、青光眼／老花眼、`Furchgott` 內皮實驗、括約肌 `NANC`、TCA 過量禁忌、MG vs. 膽鹼性雙危象、`LEMS`（`Amifampridine`）與農夫 JM／沙林有機磷毒理急救。
  - **第三卷（Ch.08 玄冥封脈篇）**：抗蕈毒鹼立體異構（`Atropine l/d` 效價、`Scopolamine` 環氧橋、`Atropine fever` 顛茄熱）、眼科時效梯度（`5–6d` 至 `15–60m`）、`Tiotropium` 動力學選擇性、`OAB`（`Tolterodine/Fesoterodine` `5-HMT` vs. 滿溢性尿失禁禁忌）、菸鹼五聚體離子順位（`N_M` `Na⁺`第一 vs. `N_N` `Ca²⁺`第一）、`Varenicline` 戒菸四階段、神經節阻斷優勢張力、八大 `NMB` 動力學與 `Hofmann` 降解、NMJ Phase I/II 雙相鎖與四連刺激（TOF）、`RyR1` 惡性高熱（`IV Dantrolene`）、燒燙傷 `α₇AChR` 高血鉀鈣鹽穩膜、Case Study 2 `CICV` `Sugammadex`（7 天替代避孕），以及中樞解痙、`BTX-A/B` SNARE 切割與 ALS `Riluzole`。
  - **第四卷（Ch.09 太陽烈火篇）**：腎上腺髓質 `80% Epi / 20% NE`、兒茶酚胺生合成（`TH / PNMT`）與 `VMA/HVA` 匯流、不可逆 `MAOI` 九大酪胺食物「起司效應」、微觀 `Gq` 五縮血管與 `PKA` 抑 `MLCK` / `FXYD1+NKCC` 低血鉀 / `DHPR/RYR1` 手抖、IV 四大擬交感胺動脈曲線與「腎上腺素反轉」、*JAMA 2026* 姿勢性低血壓衣架痛（`Midodrine` / `Droxidopa`）、*JAMA 2025* 長輩 OAB（`Oxybutynin` 譫妄 vs. `Mirabegron` 高壓禁用）、五大興奮劑 `VMAT` 轉運矩陣與前額葉 `HCN` `Signal/Noise` 調控、嗜鉻細胞瘤「先 α 後 β」鐵律、*JAMA 2025* BPH 與 114 國考 `Tamsulosin` 虹膜鬆脫 `IFIS`、`Propranolol` 局麻禁點眼、`2022 台灣偏頭痛指引`（`Allodynia` 與孕婦 `Acetaminophen` vs. `Valproate`）、青光眼六大類點眼、`WADA` 運動禁藥，以及壓軸大結局 **`β` 阻斷劑過量休克：`IV Glucagon` 繞道心肌獨立 `Gs` 受體回陽救援！**
  - **嚴格採用台灣醫學／藥理學繁體中文慣用語**（致效劑、拮抗劑、正腎上腺素、神經傳導物質、血腦障壁、過極化、心搏過速／過緩、阿茲海默症、巴金森氏症、思覺失調症、氣喘、良性攝護腺肥大、尿滯留、麩胺酸、肝醣、升糖素、生體可用率、首渡效應等）。

- **三遊玩模式 × 天機籤號 Seeded PRNG（Mulberry32）× 分流自動存檔**
  - **365 題嚴謹四選一架構**：全書 37 關 83 題劇情主線、24 道高危急症補救、103 題校內歷屆藥理考古變體，以及 **155 題近六年（110–115 年共 12 場考試）中華民國考選部醫師(一)《醫學(二)》（47 題）＋藥師(一)《藥學(一)／藥理學與藥物化學》（108 題）自主神經國考真題**，全數統一為嚴謹四選一並附完整逐項詳解。
  - **模式 A《太虛試煉・Roguelike 速行篇》**（標準 6 關 / 強化 8 關）：提供 **6 大路線**及變體抽籤切換（`主線實驗＋考古均勻混抽`／`歷屆考古對話變體優先`／`近 6 年醫／藥師國考真題優先`），依路線**按需動態載入 JSON 模組**。
  - **模式 B《神農紀實・連貫章回篇》**：支援「全四卷大貫通（全 10 章 37 關・75 考點）」、「下篇直入：三、四卷（19 關）」及「上篇重溫：一、二卷（18 關）」；並可切換「標準章回」、「國考真題專刷（主線＋155 題近 6 年醫／藥師國考）」、「全考古全刷（341 題全過）」或「純原著劇情線（83 主線題）」。
  - **模式 C《國考歷屆實戰殿・110–115 醫／藥師真題》**：完整保留考選部原題文字與更正後最終標準答案（含 `111-1 藥師 Q45`、`110-1 藥師 Q29` 官方更正備註），支援依**類科（醫師／藥師）**、**年度／場次（110-1 至 115-2）**、**章節（Ch.06–09）**、**狀態（未答／答錯／標記）**與**關鍵字**即時篩選；提供「逐題精練（即時核對＋四選項詳解＋丹譜考點跳轉）」與「擬真模考（亂數計時交卷＋醫／藥師與章節弱點診斷）」雙模式，誤答自動匯入靈樞丹譜錯題筆記。
  - 採 `saves_v2` 三槽分離存檔加上獨立國考精熟紀錄（`taixu_shennong_ne_v1`），彼此互不覆寫。

- **即時聯動「SVG 內景脈象儀」＋ 8 座互動臨床實驗室**
  - **SVG 脈象儀**：動態繪製 8 種心電脈波（Normal / Brady / Tachy / AFib / Wide QRS / Long QT / **HyperK 尖高 T 波** / **Asystole 平直紅線**）、BP / MAP / 脈壓、IOP、**核心體溫 (Temp)**、**血清血鉀 (K⁺)**、動態瞳孔／睫狀肌、支氣管口徑／黏液、NMJ 張力條與 **4 柱四連刺激 TOF 長條圖**，兼備 WebAudio 脈象提示音與素箋日間／墨硯夜間雙主題。
  - **8 座互動微實驗台**：《三才真言碑》、《四象膽鹼酯煉丹台》、《Furchgott 離體血管台》、《NMJ 雙相鎖與 TOF 逆轉台》、《MAOI 起司效應餐盤推演台》、《兒茶酚胺 SAR 改造台》、《四大擬交感胺血流動力模擬器》、《ADHD 前額葉 HCN 訊噪實驗台》。

- **「靈樞丹譜」修煉總庫**
  - 自動解鎖 **75 張核心考點卡片**（支援雙層篩選：卷別 `Vol.1–4` ＋ 9 大主題分類 ＋ 即時關鍵字搜尋）、**15 大完整藥理對照總表**（含考前速查一鍵預覽）、自動收錄誤答之 **錯題筆記**，以及 **9 種結局殿堂**（含《太虛神農・四卷大圓滿》、《玄冥破陣・太陽烈火大宗師》等）。

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
# 輸出：dist/index_standalone.html（已內嵌所有 CSS、JS、全部 4 卷 JSON 與 110–115 國考題庫，支援 file:// 直接離線開啟）
```

---

## 專案目錄結構

```text
shennong-pharma/
├── index.html                  # 主介面骨架（開局三模式畫卷、書卷劇本、SVG 脈象儀、國考實戰殿、丹譜抽屜）
├── styles/
│   └── theme.css               # 素箋日間／墨硯夜間雙主題、古風篆印、國考實戰殿與實驗台響應式排版
├── js/
│   ├── rng.js                  # FNV-1a + Mulberry32 可重現隨機數產生器與加權抽樣
│   ├── state.js                # 三槽分離存檔 (saves_v2)、國考精熟紀錄、護心丹、陰陽平衡與實驗台狀態
│   ├── pulseMonitor.js         # SVG 內景脈象儀即時動畫（ECG 含 HyperK、Temp、K+、4 柱 TOF）與音效
│   ├── codex.js                # 靈樞丹譜（75 考點雙層篩選、單卡定位跳轉、15 大總表、錯題筆記、9 大結局）
│   ├── engine.js               # 雙遊戲模式狀態機、Hub 樞紐、8 座互動實驗台、危機補救分支與結局判定
│   ├── nationalExam.js         # 模式 C「國考歷屆實戰殿」（110–115 醫／藥師精練、擬真模考、弱點診斷、題號矩陣）
│   └── main.js                 # 按需延遲載入模組（expansions.json 分卷抓取）、模式切換與快捷鍵
├── data/
│   ├── expansions.json         # Phase 1 (vol1_vol2) ＋ Phase 2 (vol3_vol4) 模組註冊與按需載入設定
│   ├── national_exam_bank.json # 110–115 年醫師(一)／藥師(一) 國考自主神經真題庫（155 題＋考選部更正核對＋四選項詳解）
│   ├── vol1_vol2_nodes.json    # E01–E18 第一、二卷（Ch.06–07）完整劇情節點、校內考古與國考對話變體
│   ├── vol1_vol2_deck.json     # 一、二卷 Roguelike 卡池權重 ＋ 第 1–5 章節排序
│   ├── vol3_vol4_nodes.json    # E19–E37 第三、四卷（Ch.08–09）完整劇情節點、校內考古與國考對話變體
│   ├── vol3_vol4_deck.json     # 三、四卷＋全脈混戰／毒理急診卡池 ＋ 第 6–10 章節排序
│   ├── codex_entries.json      # #1–#75 核心考點卡片 ＋ 15 大完整對照總表
│   └── endings.json            # 9 種修煉結局定義與解鎖條件
└── tools/
    └── bundle_single_file.py   # 依 expansions.json 整合全四卷與國考題庫產出單檔離線 HTML
```

