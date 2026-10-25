# McDonald's MCP 集成说明

## 用途

McCarbon Trace 使用麦当劳 MCP 读取当前菜单和餐品结构，再把餐品编码映射到本地可审计的筛选级生命周期因子。MCP 本身不提供碳足迹工具，因此碳、水、土地、人力和资金估算不冒充麦当劳官方数据。

## 连接方式

- Endpoint：`https://mcp.mcd.cn`
- Transport：Streamable HTTP
- Header：`Authorization: Bearer <MCD_MCP_TOKEN>`
- Token 来源：进程环境变量 `MCD_MCP_TOKEN`
- 配置示例：`mcp-config.example.json`

PowerShell：

```powershell
$env:MCD_MCP_TOKEN = "在当前终端安全输入的 Token"
$env:PYTHONPATH = "$PWD\src"
python scripts\sync_mcd_menu.py --city 北京 --keyword 天安门 `
  --meal-code 9900005466 --meal-code 9900016055 `
  --meal-code 9900005462 --meal-code 9900005411 `
  --meal-code 9900005453 --meal-code 9900005428
```

仓库代码不读取 `.env` 文件，也不保存 Token。真实 Token 不得进入 Git、截图、日志、网页或 `CONTEST_DECLARATION.md`。

## 只读工具白名单

客户端只允许以下工具：

- `query-meals`：读取当前门店可售餐品/套餐；
- `query-meal-detail`：读取套餐组成和默认选择；
- `list-nutrition-foods`：读取公开营养字段；
- `now-time-info`：记录查询时间。
- `query-nearby-stores`：按公开城市/关键词检索门店，以取得后续菜单查询所需的 `storeCode`。
- `campaign-calendar`：读取活动日历（本项目不用于计算）。

客户端会拒绝订单、地址、配送地址、优惠券、账户、积分、商城兑换等有外部副作用的工具。MCP 的限流、可用地域和条款以官方文档为准。

## 推荐调用流程

1. `initialize`，声明 MCP 协议版本和客户端信息。
2. 发送 `notifications/initialized`。
3. `tools/list`，记录实际可用工具名称。
4. 调用 `query-meals`；对选中的 6 个餐品调用 `query-meal-detail`；必要时调用营养工具。
5. 只保留餐品编码、名称、套餐组成、营养字段和抓取时间，生成脱敏快照。
6. 将快照映射到 `data/factors.json` 和 `meal_mappings.json`，再运行本地计算器。

也可以用仓库脚本保存脱敏菜单响应：

```powershell
$env:PYTHONPATH = "$PWD\src"
python scripts/sync_mcd_menu.py --store-code 1950212 --output data/mcp_menu_snapshot.json
python scripts/normalize_mcp_menu.py --snapshot data/mcp_menu_snapshot.json --output data/mcp_meals.json
```

脚本只写 MCP 返回的数据和抓取时间，绝不写 Authorization header 或 Token。若要核对具体餐品详情，可增加一个或多个 `--meal-code` 参数；接口实际参数以 `tools/list` 返回的 schema 为准。

## 本次验证记录

2026-10-25，使用公开城市检索 `北京 / 天安门` 获取匹配门店 `storeCode=1951020`，随后以 `orderType=1, beType=1` 调用 `query-meals`。MCP 返回 88 个餐品，并对 6 个选中套餐调用 `query-meal-detail`：`9900005466`、`9900016055`、`9900005462`、`9900005411`、`9900005453`、`9900005428`。网页当前使用 `data/mcp_meals.json` 中的这 6 个 MCP 编码。原料克重仍是本地筛选估算，因 MCP 未返回供应商配方克重。

## 离线降级

没有 Token、网络失败或 MCP 返回 401/429 时，网页可以使用 `data/fixtures/menu.json` 完成演示。页面必须显示“离线示例数据”，不能把 fixture 宣称成实时菜单。真实 MCP 接入需要在有有效 Token 的终端运行 `--sync-mcp` 并保存不含凭证的工具输出证据。

