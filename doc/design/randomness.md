# 抽選seed與可重現性

狀態：2026-10-26已確認採用drand quicknet v2作為正式seed來源及來源證明；已建立ChaCha20的TS／Go交叉驗證測試，正式配位及段落串流規格尚未完整定案。現有Python工具保留作清票／第二輪規則原型，使用SystemRandom，不能作正式drand抽選入口或宣稱已有seed重現功能。

使用者指定先驗證ChaCha20及遞減池抽取：相同drand seed交給TS與Go，從1～150依序抽出、移除並逐筆比對。工具與固定測試規格見[ChaCha20交叉驗證](../tools/verify-draw/tool.md)。此測試尚未串接住戶配位；下方算法提案不代表正式實作已完成。

## 建議方向

每一個實際抽選段落各自產生一個256-bit seed，不用年度、目前時間或戶號直接當seed。第一輪A棟、B棟、大小腳踏車及第二輪各類分別保存；無參與戶或無車位時記錄跳過，不生成seed或呼叫抽選亂數。

按下抽取時向drand quicknet v2請求latest，驗證BLS簽章後，以SHA-256(signature bytes)取得256-bit seed，保存為完整十六進位字串。固定鏈與驗證方式見下方；不以本機亂數替代正式seed。正式配位不使用`Math.random()`；動畫需要的亂數獨立，不消耗正式配位亂數序列。

seed本身不夠重現結果，必須一併固定：

- 活動ID、輪次、段落ID與嘗試識別。
- 實際參與戶及車位池快照，含明確輸入順序及正規化規則。
- 規則版本、亂數生成器名稱與版本、洗牌算法版本、必要的整數／位元規格。
- seed、輸入內容摘要、正式配位結果與結果摘要。

可重現亂數生成器需選有明確規格與測試向量的實作，實作前再定案。不以JavaScript引擎的內建Math.random行為當作算法契約，也不自行發明密碼學亂數算法。隨機排列建議Fisher–Yates，範圍整數採無偏映射（例如rejection sampling），避免直接取餘數的偏差。

## 建議執行順序

1. 主持人確認本段名單與車位池，將其快照固定並顯示摘要。
2. 按抽選時檢查該段未執行，先保存按鈕時間、「已啟動」紀錄及輸入、算法版本，再請求並驗證drand seed及保存原始回應；未保存成功不得繼續產生正式結果。
3. 從該seed及固定輸入以確定性算法計算結果，保存結果並驗證寫入成功。
4. 成功後播放戶號卡片落位等演出，匯出CSV。

seed已保存但結果未寫完時，從相同seed及輸入恢復計算；結果已保存時直接讀結果重播。失敗不換seed重抽；活動索引未更新但已有該段啟動紀錄時，也需先恢復或報錯，不能當成全新抽選。重播與重新匯出不消耗新的正式亂數。

## 現場與封存

已確認：每段按下抽取時，立即顯示並保存當下本機時間（臺灣時區）；取得資料後在同一畫面顯示drand round、完整seed、round預定時間及簽章驗證狀態，讓現場與實況錄影能核對。保存按鈕時間、請求起迄、鏈資訊、原始簽章回應及驗證結果，並提供該鏈固定round的API查詢網址。顯示欄位與流程見[前端演出](presentation.md)。

quicknet每3秒一輪，正常連線下預期錄影中的當下時間與取得round的預定時間約在一輪內；這是操作預期，不是硬性保證。網路、快取與本機時鐘會影響差值，畫面及紀錄保留實際差值，不宣稱drand簽章證明本機按鈕時間。超過一輪時是否阻擋抽選仍待確認，不自動換round重抽。

drand作為亂數來源及簽章證明；錄影保留現場取值過程。可重現仍須固定輸入與算法，來源簽章本身不證明未挑選round或完成整場活動審計。

禁止將取消演出視為取消抽選，或為了重新播放生成新seed。正式重抽的條件、核准及原結果作廢程序仍待確認；演練另開測試活動，與正式存檔清楚分開。

## 驗證要求

固定測試向量需驗證跨啟動重現、名單排序規則、車位唯一性、名單多於／少於車位、無參與者跳過、動畫不影響配位、seed已存但結果未存的恢復，以及已存在結果時拒絕再次抽選。

## 第三方公開驗證選項

後續狀態：使用者確認RANDOM.ORG開發key不適合正式環境，正式抽選先不採用；已完成測試仍作開發紀錄。正式來源已選drand quicknet v2；NIST僅保留調查紀錄。

使用者提出本機seed缺少外部審計的疑慮。以下保留方案調查；drand已定案，其餘服務未採用。

### drand公開亂數＋事前資料承諾

2026-10-26使用者確認採用quicknet：chain hash為`52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971`。已讀官方鏈info核對period=3秒、genesis_time=1692803367、schemeID=bls-unchained-g1-rfc9380。與先前測試的default 30秒chained鏈不同，公鑰及驗證scheme必須一併切換，不能只換URL。

quicknet公鑰：`83cf0f2896adee7eb8b5f01fcad3912212c437e0073e911fb90022d3e760183c8c4b450b6a0a6c3ac6a5776a2d1064510d1fec758c921cc22b0e17e63aaf4bcb5ed66304de9cf809bd274ca73bab4af5a6e9c76a4bc09e76eae8991ef5ece45a`。固定鏈資訊應封存並隨程式固定，不逐次信任任意來源的公鑰。預定round時間為`1692803367 + (round - 1) * 3`（Unix秒），不是服務端收到請求或實際回應時間。

採用v2查詢路徑：`https://api.drand.sh/v2/chains/<chainHash>/rounds/latest`及`https://api.drand.sh/v2/chains/<chainHash>/rounds/<round>`。quicknet為unchained，不能要求一定有previous_signature；仍需驗證每筆簽章及randomness。若選按鈕後等待下一輪的演出，先保存指定round，再等待並驗證同一round；按鈕與資料發布交界造成的延遲或失敗不得偷偷換輪。

drand提供固定round的公開亂數及可驗證簽章，支援事前指定未來round。適合保留本機抽選演出的架構，但drand本身不保存本社區的登記、配位或活動審計頁。

更強的事前承諾方案（未採用為目前操作流程）：在亂數公布前，固定並對外公布活動ID、排序後的名單及車位池摘要、規則／算法版本、指定鏈識別與未來round、段落及seed推導方式；之後取得該round並驗證簽章，依公開算法推導各段seed及配位。不得看過結果再換round、輸入順序、nonce或推導規則，此方案與目前已確認的按鈕時請求latest流程不同，若日後需要再另行確認。

資料承諾需有外部可核對的事前發布／時間證據。只把hash寫進同一台電腦或事後上傳Drive，不能獨立證明是在亂數揭露前定案。稽核包需保存承諾原文、發布證據、完整規則及輸入、鏈公鑰／識別、round、簽章、推導算法、各段seed與結果。取得公開beacon後可本機運算及播放；無網路時可由別台設備帶入同一round的簽章資料，不偷偷改成本機亂數或換round。

### RANDOM.ORG服務

測試工具已獨立建立：見[第三方seed測試腳本](../tools/random-org-seed/tool.md)。支援generateSignedBlobs、getResult及verifySignature，使用者已完成兩筆真實generate／get／verify測試，取回紀錄一致且簽章驗證通過；尚未串入正式抽選。

使用者澄清主要需求為：按抽選時向第三方請求seed，取得第三方提供的時間戳、seed原文及可驗證憑據，配位仍在本機執行。這與將整個抽選交給第三方不同；同seed必須搭配相同算法／版本、輸入順序及呼叫規格，才會重現相同配位。

Signed API的`generateSignedBlobs`可作候選，請求一份256-bit hex資料作seed；回應random物件包含data、completionTime（服務端產生完成時間）、serialNumber及userData，另有signature。可將活動ID、輪次、段落、名單／車位池摘要及算法版本納入userData，保存完整random與signature，不自行重排或改寫已簽原文。signature可透過官方驗證表單、verifySignature或離線公鑰方式查驗來源及完整性。

需區分：completionTime是服務完成亂數產生的時間，不是本機按鈕點擊時間；Signed API不是自動公開活動網址。官方提供getResult，以API key及serialNumber取回，保證保存至少一年，不保證永久；因此每年活動必須自行封存完整簽章回應。若需任何住戶直接瀏覽的第三方紀錄頁，另評估Verification Trail或專門抽選服務，不混稱Signed API本身即有公開審計頁。

- Verification Trail Service提供公開或私人的randomization紀錄，含參數、時間戳與驗證碼，已保存紀錄依服務說明不能修改或刪除，較接近「第三方有網址可查」的需求。
- Third-Party Draw Service由第三方執行抽選並提供結果查驗，屬需帳號及付費額度的服務；其選出得獎者模型能否適配完整車位一對一配置，需另驗證。
- Signed API可回傳簽章亂數並將userData納入簽章；官方明確說明userData單獨不能防止多次請求挑結果，不能把有效簽章直接視為從未重抽的證明。需要帳號／API key，如何安全授權及公開全部嘗試需另設計。

第三方亂數來源、第三方不可變活動紀錄及獨立稽核是不同能力；選型需明確決定住戶要查的是來源簽章、完整配位重算，還是服務商保存的活動紀錄。任何來源仍需確保名單、車位及配位算法在揭露亂數前已固定。

官方來源：[drand規格](https://docs.drand.love/docs/specification/)、[drand公開驗證說明](https://docs.drand.love/blog/2023/06/02/drand-explainer/)、[RANDOM.ORG Verification Trail](https://trails.random.org/)、[第三方抽選](https://www.random.org/draws/)、[Signed API限制](https://api.random.org/signatures)。

### drand與NIST的驗證區別（2026-10-26查核）

已實作[drand quicknet v2驗證工具](../tools/drand-seed/tool.md)，支援latest、指定round及保存原文的離線BLS驗證。round 33382601已完成連線及離線驗證，並推導seed與預定時間；尚未串入正式抽選。下述6583935是不同鏈的舊樣本。

- drand：固定鏈hash及受信任公鑰，依鏈scheme驗證BLS簽章，再核對SHA-256(signature bytes)是否等於randomness。只核對hash不構成來源驗證；由同一未信任回應臨時取得公鑰也不能建立獨立信任根。官方建議使用[drand-client](https://github.com/drand/drand-client)，保持disableBeaconVerification=false及指定chainVerificationParams。
- 使用者提供round 6583935的signature已在本機核對SHA-256與randomness相同；尚未由agent執行BLS驗證，不能宣稱該筆來源驗證通過。驗證時應查固定round，不再次查latest造成不同筆比對。
- drand回應不含本次request完成時間；round對應的預定時間可依固定鏈的genesis_time及period推導。這不是專屬於本活動的請求收據，而是大家共用的公開beacon。
- NIST：需取得pulse的簽章憑證，驗證信任與certificateId，依其規格序列化及驗證signatureValue，核對outputValue的生成規則；不能把pretty-printed JSON直接交給RSA驗證。
- [NIST官方頁](https://csrc.nist.gov/Projects/interoperable-randomness-beacons/beacon-20)於2026-10-23公告：2026-09-03起的pulse引用錯誤certificate，驗證需要改用不同憑證，後續將補歷史說明。使用者貼出的2026-10-25 pulse落在影響範圍，因此暫不把它列為已可正常驗證的正式來源。這是當日查核狀態，不是永久結論。

同筆資料查回一致、hash綁定一致、第三方簽章有效、資料足夠新鮮及活動未挑選round，屬不同驗證；不能只驗其中一項就宣稱整個抽選已被審計。

## 參考

- [Crypto.getRandomValues](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/getRandomValues)：瀏覽器提供密碼學強度的隨機值。
- [Math.random](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/random)：不提供密碼學安全亂數，也不能由使用者設定或重設內建seed。
- [SubtleCrypto.digest](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest)：SHA-256等內容摘要功能。
