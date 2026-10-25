# McCarbon Trace · 麦碳账本

一份套餐，背后是一整条供应链。

McCarbon Trace 是麦当劳程序员创意开发大赛参赛作品。它读取麦当劳 MCP 的餐品结构，再用公开食品供应链因子做一份可解释的筛选级估算：把碳排、水、土地、人力工时和资金情景拆开显示，并用水池、面积、像素人和现金堆叠把抽象数字变成可感知的尺度。

项目是独立开发的非官方产品，结果不是麦当劳供应链审计，也不代表官方立场。没有供应商实测数据时，页面会明确显示“估算”“假设”或“离线示例数据”。资金读数使用 `full-chain-screening-v1` 情景，把农场/饲料、加工、仓储冷链、运输、门店装修与灶台折旧、煤气电力、各岗位人工、外包装和末端配送逐项列出；它不是菜单售价，也不是麦当劳财务数据。

界面设计记录见 [DESIGN.md](DESIGN.md)，屏幕数字、来源和单位换算见 [FACTS.md](FACTS.md)。人物模型使用本地化的 Khronos CesiumMan CC BY 4.0 GLB；GLB 是 Three.js `GLTFLoader` 原生支持的格式，不再做有损转换。浴缸、400 m 跑道和百元钞票捆由 Three.js 几何体生成。

## 快速运行

需要 Python 3.10+。计算器仅使用 Python 标准库。

```powershell
cd D:\MCDgame
$env:PYTHONPATH = "$PWD\src"
python -m mcdcarbon.cli --fixture data/fixtures/menu.json
python -m mcdcarbon.cli --fixture data/fixtures/menu.json --meal solo-beef
python -m unittest discover -s tests -v
```

启动网页：

```powershell
python -m http.server 8000 --directory web
```

打开 `http://localhost:8000`。页面默认读取 `web/data/mcp_meals.json` 的脱敏实时菜单快照；文件不可用时回退到 fixture。Three.js CDN 不可用时仍保留 CSS 视觉降级。

页面使用原生 ES Modules 保持可直接运行；`web/react-bits-lite.js` 借鉴 React Bits 的 CountUp、SpotlightCard、TiltedCard 和 AnimatedContent 交互模式，没有引入 React 构建链，也不声称运行 React Bits 包。

### 数据物理化交互

在“把抽象数字，装配成一张看得懂的账”区域：

- 点击 WATER、LAND、LABOR、COST 指标卡，会打开算法说明，显示公式、输入变量、单位换算、当前套餐结果和来源。
- 物件按单位逐件落下并在落地后保持稳定；`+N` 只表示超过可视上限的压缩数量。
- “展开装置”触发一次 pull-back 总览，把四种材质和数量规则放到同一张工作台；“回到读数”会重新播放装配并回到四张指标卡。
- 动效遵循 `STYLE.md` 的物件、材质、装配和来源规则；开启系统减少动态效果时，保留读数、公式和单位而取消位移动画。

## 真实 MCP 菜单

只读 MCP 客户端位于 `src/mcdcarbon/mcp_client.py`。先在当前终端设置 `MCD_MCP_TOKEN`，再运行：

```powershell
$env:PYTHONPATH = "$PWD\src"
python -m mcdcarbon.cli --sync-mcp
```

集成边界和工具白名单见 [MCP_INTEGRATION.md](MCP_INTEGRATION.md)。真实 Token 不能提交；参赛声明要求配置使用环境变量占位符。

## 计算边界

主公式是活动数据 × 因子：

```text
GWP100 = 原料 + 加工/冷链 + 包装 + 运输 + 门店电力 + 浪费 - 有证据的永久固碳
```

原料按配方质量分摊，运输按 kg·km 换算。每个因子带来源、地区、单位和上下界；结果返回 p10/p50/p90。牛吃草的光合吸收不作为直接抵扣。水、土地、人力和人民币保持各自单位，影子碳价只作为显式情景参数。

## 参考与限制

- Our World in Data / Poore & Nemecek 2018 食品供应链平均因子：用于公开筛选比较。
- `dish-carbon-calculator`：借鉴分项展示思路，未复制其代码或数据。
- Brightway2、premise、Agribalyse：作为未来完整 LCA 的扩展方向；受限数据库不打包进本项目。

当前网页使用 2026-10-25 从 MCP 读取并脱敏的六个餐品：巨无霸三件套、开心亲子双人餐、板烧鸡腿堡三件套、不素之霸双层牛堡三件套、麦香鸡套餐、培根安格斯厚牛堡三件套。它们的餐品结构、价格和默认搭配来自 MCP；配方克重仍是本地筛选估算，不是麦当劳供应商配方披露。`data/meal_mappings.json` 保留离线 fixture 的估算映射，便于无网络时测试。

