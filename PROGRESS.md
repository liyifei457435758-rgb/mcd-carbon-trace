# PROGRESS

## 2026-10-25

- [x] 建立项目规划与 leader 执行目标书。
- [x] 建立标准库 Python 计算内核、因子表、六套餐 fixture 和测试。
- [x] 建立普通 HTML/CSS/原生 JS 网页，加入 Three.js 可选场景与 CSS 降级视觉。
- [x] 加入 MCP Streamable HTTP 客户端和只读工具白名单。
- [x] 加入 README、MCP_INTEGRATION、mcp-config.example、官方参赛声明。
- [x] `python -m unittest discover -s tests -v`：6 tests passed。
- [x] `python -m compileall -q src tests`：通过。
- [x] JSON 校验通过：因子、fixture、映射、网页数据和 MCP 配置示例均可解析。
- [x] 凭证扫描通过：仓库文件未发现真实 Token 或 Bearer 值。
- [x] 启动 `python -m http.server 8000 --directory web`，浏览器验证首屏、六套餐切换、分项指标和四类参照物。
- [x] 加入 `scripts/sync_mcd_menu.py`，支持只读菜单快照和可选餐品详情。
- [x] 使用临时进程环境变量完成真实 MCP 只读验证：公开检索门店、读取菜单、读取 6 个餐品详情；Token 未写入文件。
- [x] 将真实快照归一化为 6 个可计算餐品，并同步到 `web/data/mcp_meals.json`。
- [x] 修正 MCP `structuredContent` 门店响应解析，并记录当前菜单中家庭餐的新餐品编码。
- [x] 在浏览器中完成视觉验收：套餐切换、五类指标、来源展开和四类参照物均可用。
- [x] 按 data-physical 语法重做四类参照物：水片、土地块、人力枚、资金叠逐件装配，并加入单位图例、来源行和 pull-back 交互。
- [x] 加入零依赖 React Bits 交互适配层：CountUp、Spotlight、Tilt、滚动 reveal；保留静态 HTML 可直接运行。
- [x] 新增 `DESIGN.md` 与 `FACTS.md`，记录视觉令牌、交互规则、数字来源和单位换算。
- [x] 为四个指标卡加入算法说明弹窗：公式、变量、单位、当前结果与来源同时展示。
- [x] 加入独立的 pull-back 装置总览：四类材质物件逐组入场，显示 p50 数量、单位规则与超出可视范围的 `+N`。
- [x] 验证“展开装置 → 回到读数”状态切换和重新装配动画；验证水、土地、人力、资金四个算法弹窗。
- [x] 修正物件计数的浮点边界，并将土地读数提高到两位小数，避免显示值与物件数量产生误解。
- [x] 将四类物理化卡片升级为持续循环 Three.js 场景：浴缸 + 人物、400 m 跑道 + 跑者、供应链轨道人物、红色百元钞票捆 + 人物参照。
- [x] 本地化 Khronos CesiumMan GLB（CC BY 4.0）并保留归属说明；浴缸、跑道和钞票使用 Three.js 几何体，避免授权不稳定的外部模型。
- [x] 将人力从单一 `0.08 h` 占位值改为 8 个环节的累计 person-minutes；单人默认 28.5 min（0.48 h），双人默认 44.5 min（0.74 h），页面显示阶段分解。
- [x] 同步项目规划中的 MCP 验证状态：已记录真实只读握手、脱敏快照和筛选级数据边界，移除过期的 401 阻塞描述。
- [x] GitHub 公开仓库发布：已完成最终凭证扫描并发布到 `https://github.com/liyifei457435758-rgb/mcd-carbon-trace` 的 `main` 分支。

## 当前状态

代码、测试、网页和真实 MCP 快照已完成。算法弹窗和数据物理化总览已在本地 HTTP 页面验收。原料克重仍是筛选级估算：MCP 返回餐品结构和价格，但没有供应商配方克重，因此页面不会把结果标成官方审计值。

