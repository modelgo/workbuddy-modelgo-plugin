---
name: modelgo
description: ModelGo 官方助手。用户提到 ModelGo / modelgo，想把 ModelGo 的模型加入 WorkBuddy、查看 ModelGo 有哪些模型、检查或更换 ModelGo 密钥、移除 ModelGo 模型时使用。
description_en: Official ModelGo assistant. Use when the user mentions ModelGo, wants to add ModelGo models to WorkBuddy, list ModelGo models, check or change the ModelGo key, or remove ModelGo models.
metadata:
  author: ModelGo
  homepage: https://github.com/modelgo/workbuddy-modelgo-plugin
---

# ModelGo

ModelGo 是一个模型服务，地址是 `https://api.modelgo.ai`。这个技能把 ModelGo 的模型写进 WorkBuddy 的模型列表，之后用户在输入框下方的模型选择里就能选用。

全部操作通过一个命令行工具完成，路径相对本文件是 `../../scripts/cli.mjs`。用 Node 运行，每条命令输出一段 JSON：

```text
node <插件目录>/scripts/cli.mjs <命令>
```

`<插件目录>` 是本文件往上两级的目录（包含 `scripts`、`extras` 的那一层）；环境变量 `CODEBUDDY_PLUGIN_ROOT` 存在时就是它。

找不到 `node` 时，用 WorkBuddy 自带的：`~/.workbuddy/binaries/node/versions/current/bin/node`（Windows 为 `%USERPROFILE%\.workbuddy\binaries\node\versions\current\node.exe`）。

## 用户想做什么 → 用哪条命令

| 用户说 | 命令 |
|---|---|
| 第一次用 / 帮我配置 ModelGo | 先 `status`，再按下面的"首次配置" |
| ModelGo 配好了吗 / 密钥还有效吗 | `status --verify` |
| ModelGo 有哪些模型 | `models`，可加 `--search 关键词` |
| 把某些模型加进来 | `add <模型id> ...` |
| 全部加进来 | `add --all`，先告诉用户数量并得到确认 |
| 换了密钥，或模型信息想刷新 | `sync` |
| 移除某些 / 全部 ModelGo 模型 | `remove <模型id> ...` 或 `remove --all` |

## 必须遵守

1. **密钥不进聊天。** 不要向用户索要密钥，不要复述或展示密钥，也不要把密钥放进任何命令的参数。保存密钥只有一种方式：让用户自己打开下面的设置工具。如果用户已经把密钥贴进了聊天，提醒他这把密钥已经出现在聊天记录里，建议到 ModelGo 控制台重置后再用设置工具保存新的。
2. **改动前说清楚。** `add`、`sync`、`remove` 会修改 WorkBuddy 的 `models.json`。执行前告诉用户会加入或移除哪些模型；工具每次写入前会自动备份，输出里的 `backup` 是备份文件路径，照实告诉用户。
3. **只动 ModelGo 的模型。** 工具只会增删改它自己写入的条目。如果输出提示某个模型 id 已被其他来源占用，不要想办法绕过，如实告诉用户。
4. **改完要重启。** `add`、`sync`、`remove` 成功后，告诉用户：从托盘或菜单栏彻底退出 WorkBuddy 再打开（只关窗口不生效），然后在输入框下方的模型选择里切换。
5. **不替用户花钱。** 这些命令只读取模型列表，不调用模型，不产生费用。不要为了"测试一下"而用 ModelGo 的模型发请求，除非用户明确要求。
6. **照实报告。** 命令输出 `ok: false` 时，把 `error` 的意思告诉用户，不要说成成功。

## 首次配置

1. 运行 `status`。输出里 `key.set` 为 `false` 说明还没有密钥。
2. 让用户自己保存密钥，给出设置工具的完整路径，由用户双击打开：
   - macOS：`<插件目录>/extras/设置密钥.command`
   - Windows：`<插件目录>\extras\设置密钥.bat`

   工具会在一个终端窗口里请用户粘贴密钥（输入时不显示），向 ModelGo 验证通过后保存在本机。密钥在 https://modelgo.ai 的控制台创建，以 `mgk_` 开头。
3. 用户说保存好了之后，运行 `status --verify` 确认。
4. 运行 `models` 列出可用模型。模型可能有几十个，不要全部念出来：按用户的需求挑几个推荐，或问用户想用哪一类。输出里的 `images` 表示能否读图，`reasoning` 是可选的思考档位。
5. 用户选定后运行 `add <模型id> ...`，然后按"必须遵守"第 4 条提醒重启。

## 输出里的字段

- `status`：`key.set`、`key.masked`（脱敏后的密钥，可以展示）、`added`（已加入的模型 id）、`next`（下一步建议）。
- `models`：每个模型的 `id`、`added`、`contextWindow`、`images`、`reasoning`。`notUsableHere` 是 ModelGo 有但不能在 WorkBuddy 里用的模型（它们不走 WorkBuddy 使用的接口）。
- `add` / `sync` / `remove`：`added`、`updated`、`removed`、`backup`、`restart`。
