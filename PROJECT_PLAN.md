# McCarbon Trace（麦碳账本）项目规划

状态：仅完成规划，未开始生产代码。

## 1. 一句话目标

让用户选择一份真实的麦当劳套餐，看到它从原料、加工、包装、运输、门店到配送的筛选级生命周期估算，并把碳排、水、土地、人力和资金成本转换成直观的生活参照物。

页面的核心问题不是“麦当劳到底排放了多少”，而是“在现有公开因子和 MCP 餐品结构下，这份餐的可解释估算是什么、哪些环节最值得改进”。

## 2. 参赛定位与边界

- 项目暂名：McCarbon Trace / 麦碳账本。
- 目标用户：想理解饮食环境影响的消费者、门店运营者和开发者。
- MCP 只负责真实的菜单、套餐组成、餐品详情和营养数据；碳足迹模型、因子和视觉解释由项目本地实现。
- 结果统一使用“筛选级估算 / 参考区间”措辞，不声称获得麦当劳真实供应商数据，也不把估算写成审计结论。
- 牛、鸡、土豆、番茄等按配方质量分摊；不能把整头牛、整块农田或一整年运输量归给一份套餐。
- 牛吃草的光合吸收不作为直接抵扣；只有有边界、有来源的永久碳移除才允许进入抵扣项。
- 物理量与货币量分开输出。若显示“影子碳价”，必须显示价格假设和敏感性，不把 kgCO2e 与人民币直接相加。

## 3. 首版餐品选择

程序启动后优先调用 MCP 的只读工具：

1. `query-meals` 获取当前门店可售菜单；
2. `query-meal-detail` 获取套餐组成和默认选择；
3. `list-nutrition-foods` 补充营养字段。

从返回数据中挑选约六个套餐，优先满足两个对比轴：

- 单人餐与双人餐；
- 牛肉堡与鸡肉堡；
- 另外保留一个薯条/饮料占比明显的组合，以及一个高分量组合。

选择器必须记录 `source=mcd_mcp`、工具名、抓取时间和餐品编码。如果 MCP 不可用，页面可以使用仓库内的脱敏 fixture，但必须显眼标注“离线示例数据”，不能伪装成实时数据。

## 4. 计算模型

对订单 `o`，主指标采用 kgCO2e：

```text
GWP100(o) =
  Σ_i q_i · Σ_s EF(i,s)
  + Σ_t (mass_t · distance_t / 1000 · EF_transport(t))
  + Σ_e (kWh_e · EF_grid(e))
  + Σ_p (mass_p · EF_packaging(p))
  + waste_adjustment
  − verified_permanent_removals
```

其中 `i` 是配方原料，`s` 是养殖/种植、饲料、加工、冷链、门店制作等阶段，`t` 是运输段，`p` 是包装材料。所有因子都保存：`source`、`version/year`、`geography`、`scope`、`unit`、`value`、`low`、`high`、`uncertainty_note`。

输出不是单个伪精确数字，而是：

```text
impact = {
  carbon_kgco2e: {p10, p50, p90},
  water_litre: {value, low, high},
  land_m2_year: {value, low, high},
  labor_hours: {value, note},
  cost_rmb: {value, note},
  provenance: [...]
}
```

首版使用公开可核查的食品供应链平均因子和显式假设；真实供应商因子、ecoinvent、Agribalyse 等作为后续可替换数据源，不把受限数据库打包进仓库。

## 5. 网页体验

不用 Streamlit。采用普通 HTML/CSS/原生 JavaScript，Three.js 作为可选的视觉层，页面可由静态服务器直接打开。

设计方向是“餐盘背后的供应链仪表盘”：麦当劳红/金色只作为品牌识别线索，主体使用深炭黑、纸张白和环境数据青色，配合网格、刻度和小票式数据排版，避免做成普通红黄营销页。页面必须响应式、键盘可操作、尊重 `prefers-reduced-motion`。

交互结构：

1. 首屏：选择套餐，立即看到“这不是一张账单，而是一条供应链”的主张和碳排区间。
2. 对比条：六个套餐按单人/双人、牛/鸡、分量排序。
3. 影响卡片：碳、用水、土地、人力、资金各自独立解释。
4. 震撼参照物：
   - 水：Three.js 水池/水位动画；旁边显示“相当于 X 个家庭年用水”。瀑布模式只能在来源和时间口径明确时启用。
   - 土地：面积矩形与天安门广场等公开参照面积比较，明确是面积类比，不是实际占用地块。
   - 人力：像素小人按工时聚合显示，数量过大时使用“每人代表 N 小时”的刻度，避免视觉误导。
   - 资金：现金堆叠或“可购买多少个巨无霸”的透明换算；航空母舰、iPhone 等高价参照仅在因子和价格有来源时出现。
5. 证据抽屉：展示每个因子的来源、年份、单位、区间和“估算/实时/假设”标签。

## 6. 工程结构

```text
D:\MCDgame
├─ src/mcdcarbon/
│  ├─ mcp_client.py          # Streamable HTTP，只读工具白名单
│  ├─ carbon_model.py        # 单位换算、分段求和、区间/抽样
│  ├─ schemas.py             # Meal / Factor / Impact 数据结构
│  └─ cli.py                 # 复现性命令行入口
├─ data/
│  ├─ factors.json           # 可审计因子与来源
│  ├─ meal_mappings.json     # MCP 餐品编码到原料估算
│  └─ fixtures/              # 脱敏离线菜单
├─ web/
│  ├─ index.html
│  ├─ styles.css
│  ├─ app.js
│  └─ three-scenes.js
├─ tests/
├─ scripts/sync_mcd_menu.py
├─ README.md
├─ MCP_INTEGRATION.md
├─ mcp-config.example.json
├─ CONTEST_DECLARATION.md    # 从官方仓库原样复制，禁止改写
└─ GOAL_PROMPT.md            # 下一轮可粘贴到 goal 的执行任务书
```

## 7. 执行顺序与验收

1. 记录空仓库基线；确认 Python、Node.js 和静态服务器命令。
2. 实现 MCP 客户端：Token 只读 `MCD_MCP_TOKEN`，只允许菜单/详情/营养/时间工具，拒绝订单、地址、优惠券、积分和商城副作用工具。
3. 拉取菜单并保存脱敏快照，选出六个套餐；失败时切换 fixture 并报告原因。
4. 实现因子模型、区间计算、来源链和单元测试。
5. 实现网页交互、Three.js 场景、动画降级和移动端布局。
6. 复制官方参赛声明，补齐 README、MCP_INTEGRATION 和配置示例；扫描仓库确认没有 Token、密码或签名 URL。
7. 运行验收：

```text
python -m unittest discover -s tests -v
python -m mcdcarbon.cli --fixture data/fixtures/menu.json --meal <id>
python -m http.server 8000 --directory web
```

验收必须能证明：单位换算正确、运输公式正确、缺因子会显式失败、区间满足 `p10 ≤ p50 ≤ p90`、网页能在离线 fixture 下完成一次选择和对比。没有真实 MCP 握手证据时，不得声称“已接入”。

## 8. 当前状态与安全处理

2026-10-25 已在临时进程环境变量中完成一次真实只读 MCP 验证：先用 `query-nearby-stores` 获取门店，再用 `query-meals` 和 6 次 `query-meal-detail` 生成脱敏菜单快照。Token 只存在于本地终端进程，没有写入 Git、网页、截图、测试输出或文档。

MCP 没有供应商配方克重、生命周期因子、工资、租金或折旧数据，因此原料质量、运输距离、门店能源、人力和资金属于项目的筛选级情景假设。页面和文档必须把这些结果标为估算/参考区间，不能称为麦当劳官方供应链审计。发布前仍需重新运行凭证扫描，确认只提交环境变量占位符。

