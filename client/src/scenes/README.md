# TresJS停車場場景

已依使用者提供的機車與腳踏車平面圖建立基本場景。使用TresJS／Three.js整合Vue MVVM，不計算抽選、不保存活動狀態。

- ParkingCanvas.vue：TresCanvas與正交攝影機，按需渲染。
- ParkingGraphics.vue：地板、隔間、柱體、坡道輪廓與車位。
- ParkingBay.vue／ParkingLabel.vue：車格、選取高亮及離線文字圖層。
- ParkingCamera.vue：俯視、斜俯視、旋轉、平移、縮放及定位。
- labels.ts：Canvas字圖集，不下載字型或模型。

配置在[layouts.json](../models/parking/layouts.json)，尺寸與位置轉換在[layout.ts](../models/parking/layout.ts)，顯示狀態由[useParkingScene](../viewmodels/useParkingScene.ts)管理。

1 unit＝1公尺。車格依指定尺寸建立，編號與隔間關係依平面圖；不追求建築實際尺度。無障礙拆分的左右標號仍為預覽，未套用正式登記與配位。

操作與限制見[3D場景文件](../../../doc/design/parking-scene.md)。
