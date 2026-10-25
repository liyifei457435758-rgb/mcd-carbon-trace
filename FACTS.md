# McCarbon Trace · 屏幕事实与推导

这份文件把数据物理化界面中的数字、来源和换算写在一起。它说明的是本项目的筛选级模型，不是麦当劳供应商审计。

| 屏幕读数 | 来源 | 推导/单位 | 展示规则 |
|---|---|---|---|
| MCP 餐品名称、价格、默认搭配 | 麦当劳 MCP，`https://mcp.mcd.cn`，`query-meals` + `query-meal-detail` | 直接使用脱敏快照 `data/mcp_menu_snapshot.json` | 页面标记为 MCP LIVE MENU |
| 碳、水、土地 | `data/factors.json`；主参考为 Our World in Data / Poore–Nemecek 2018，`https://ourworldindata.org/grapher/food-emissions-supply-chain` | 配方质量 × 因子；叠加包装、门店电力和公路运输；p10/p50/p90 来自三角分布采样 | 所有读数标注“筛选级估算” |
| 水物件 | 上述水足迹结果 | 1 个浴缸 = 100 L；浴缸数 = `ceil(p50 / 100)` | Three.js 场景显示浴缸和躺卧人物；超过可视范围显示 `+N` |
| 土地物件 | 上述土地占用结果 | 400 m 标准跑道参照面积固定为约 7,200 m²；占用点按结果放大显示 | 跑道是感知参照，不是新的测量值；页面明确写出参照口径 |
| 人力物件 | `labor_chain` 的累计 person-minutes | `H = Σ(stage.minutes) / 60`；1 枚 = 8 h | 覆盖养殖/种植、中央厨房、仓储干线、门店、制作包装和末端配送；不等同于实际排班 |
| 资金物件 | `Meal.cost_model` 的 full-chain-screening-v1 情景 | `C = Σ(原料、农场/饲料、加工、冷链、运输、设施折旧、煤气电力、门店人工、包装、配送)`；1 张 = ¥100；10 张 = 1 捆 = ¥1,000 | Three.js 红色钞票捆旁边放同一人物作高度参照；不是售价声明。MCP 未提供发票、工资、租金或折旧，所有金额可替换 |
| 物种差异 | `data/factors.json` | 牛肉、鸡肉分别使用各自公开平均因子 | 不把牛的光合作用吸收作为抵扣 |

## 交互来源

- 数据物理化视觉语法参考：[lemo-opuscar data-physical STYLE.md](https://github.com/lemomo-ai/lemo-opuscar/blob/main/styles/data-physical/STYLE.md)。
- 轻量交互模式参考：[React Bits](https://github.com/DavidHDev/react-bits)，当前以 `web/react-bits-lite.js` 的零依赖适配实现 CountUp、SpotlightCard、TiltedCard、AnimatedContent；没有声称静态页面运行 React Bits 包。
- 食品品牌的章节节奏和触点叙事参考：[Monopo · Outfry](https://monopo.london/work/outfry-korean-fried-chicken-branding/)。不复制其品牌资产。
- 人物模型：Khronos glTF Sample Models 的 [CesiumMan](https://github.com/KhronosGroup/glTF-Sample-Models/tree/master/2.0/CesiumMan)，模型目录声明 CC BY 4.0；本项目将其本地化为 `web/assets/cesium-man.glb`，页面仍保留来源和许可证记录。
- 浴缸、跑道和人民币钞票捆使用 Three.js 几何体生成，避免引入授权不稳定的外部模型；它们是可读的比例道具，不是现实物件的官方测量。
