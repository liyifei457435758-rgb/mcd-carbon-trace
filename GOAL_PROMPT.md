# McCarbon Trace 执行目标书

你是执行者。把本仓库从空目录完成为可公开参赛的 McCarbon Trace（麦碳账本）MVP。用户是最终拍板人；本任务书是唯一执行边界。若未收到新的裁决，按“我替领导拍板”的默认值执行。

## 我替领导拍板

- 交付普通 HTML/CSS/原生 JS 网页，Three.js 只做水池、面积和像素人视觉；不使用 Streamlit。
- 首版从麦当劳 MCP 的实时菜单中选择约六个套餐，覆盖单人/双人、牛肉/鸡肉、分量差异。MCP 不可用时允许离线 fixture，但必须显眼标注。
- 碳排是主指标；水、土地、人力小时、资金成本独立呈现。所有结果都叫筛选级估算/参考区间。
- Token 只从 `MCD_MCP_TOKEN` 读取。只读白名单为菜单、餐品详情、营养和时间工具；订单、地址、优惠券、账户、积分、商城工具一律拒绝。
- 不接 DeepSeek，除非后续出现确实需要自然语言解析且用户另行提供密钥。

## 目的与完成态

用户选择套餐后，网页能显示可复现的生命周期估算、p10/p50/p90 区间、分段贡献和来源证据；CLI 能在 fixture 下复算同一结果；文档足以让评委配置 MCP 并运行。

## 必须交付

实现 `src/mcdcarbon/` 计算器与 MCP 客户端、`data/factors.json`、`data/meal_mappings.json`、脱敏 fixture、`web/index.html`、`styles.css`、`app.js`、Three.js 场景、测试，以及 `README.md`、`MCP_INTEGRATION.md`、`mcp-config.example.json`。从官方仓库原样复制 `CONTEST_DECLARATION.md`，不得修改。写 `PROGRESS.md` 记录每个阶段的实际命令和输出。

## 公式与反作弊

使用活动数据×排放因子逐阶段求和：原料/养殖种植、加工冷链、包装、运输、门店电力、配送和浪费；运输按 kg·km 换算。牛吃草的光合吸收不得直接抵扣；只有有来源的永久固碳才可抵扣。不得把 kgCO2e、水、土地、工时、人民币直接相加。不得提交真实 Token；不得用 mock 冒充 MCP 已接入；不得删除测试、放宽阈值、吞掉错误或用 `|| true`。

## 机器验收

```text
python -m unittest discover -s tests -v
python -m mcdcarbon.cli --fixture data/fixtures/menu.json --meal <id>
python -m http.server 8000 --directory web
```

测试必须覆盖单位换算、运输公式、缺因子显式报错、重复活动求和、`p10 ≤ p50 ≤ p90`。网页在无网络 fixture 下必须能选择套餐并更新四类视觉参照物；必须有 `prefers-reduced-motion` 降级和键盘焦点样式。

## 进度与止损

每完成一阶段更新 `PROGRESS.md`；遇到无法验证的来源写入 `BLOCKED.md`，不得用猜测替代。相同验收失败连续三次就停止该路径，保留错误和下一步。最终报告实际运行命令、输出和未解决阻塞。

