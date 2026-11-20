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
| 第一次用 / 帮我配置 ModelGo / 打开 ModelGo 设置 / 换密钥 / 想换一批模型 | `ui`：在浏览器里打开设置页面，用户在页面上填密钥、勾模型、保存 |
| ModelGo 配好了吗 / 密钥还有效吗 | `status --verify` |
| ModelGo 有哪些模型 | `models`，可加 `--search 关键词` |
| 帮我加几个常用的 / 你推荐吧 | `add --recommended`（一组精选模型） |
| 把某些模型加进来 | `add <模型id> ...` |
| 全部加进来 | `add --all`。模型有几十个，会让模型选择很长：先告诉用户数量，建议改用推荐的那一组，用户坚持再执行 |
| 换了密钥，或模型信息想刷新 | `sync` |
| 移除某些 / 全部 ModelGo 模型 | `remove <模型id> ...` 或 `remove --all` |

## 必须遵守

1. **密钥不进聊天。** 不要向用户索要密钥，不要复述或展示密钥，也不要把密钥放进任何命令的参数。保存密钥只有一种方式：用户自己在设置页面里填。如果用户已经把密钥贴进了聊天，提醒他这把密钥已经出现在聊天记录里，建议到 ModelGo 控制台重置后再到设置页面保存新的。
2. **改动前说清楚。** `add`、`sync`、`remove` 会修改 WorkBuddy 的 `models.json`。执行前告诉用户会加入或移除哪些模型；工具每次写入前会自动备份，输出里的 `backup` 是备份文件路径，照实告诉用户。
3. **只动 ModelGo 的模型。** 工具只会增删改它自己写入的条目。如果输出提示某个模型 id 已被其他来源占用，不要想办法绕过，如实告诉用户。
4. **改完告诉用户去哪里看。** 模型列表变化后，告诉用户在输入框下方的模型选择里切换；如果没有出现，从托盘或菜单栏彻底退出 WorkBuddy 再打开（只关窗口不生效）。
5. **不替用户花钱。** 这些命令只读取模型列表，不调用模型，不产生费用。不要为了"测试一下"而用 ModelGo 的模型发请求，除非用户明确要求。
6. **照实报告。** 命令输出 `ok: false` 时，把 `error` 的意思告诉用户，不要说成成功。

## 首次配置

优先用设置页面，用户不需要打开终端，也不需要记任何命令：

1. 运行 `ui`。它立刻返回，输出里的 `opened` 为 `true` 表示页面已在用户的浏览器里打开。
2. 用一两句话告诉用户：页面已经打开，在页面上粘贴密钥（在 https://modelgo.ai 的控制台创建，以 `mgk_` 开头），勾选模型（推荐的一组已经勾好），点"保存到 WorkBuddy"。不要长篇解释。
3. `opened` 为 `false` 时，把输出里的 `url` 原样给用户，请他在这台电脑的浏览器里打开。这个地址只在本机有效，15 分钟不用会失效，失效后重新运行 `ui`。
4. 用户说保存好了之后，运行 `status --verify` 确认，再按"必须遵守"第 4 条告诉他去哪里切换模型。

用户也可以不经过对话，直接双击打开设置页面：macOS 是 `<插件目录>/extras/打开设置.command`，Windows 是 `<插件目录>\extras\打开设置.bat`。

只有用户明确要求在对话里完成（例如"直接帮我把 claude-sonnet-5.5 加上"）且密钥已经保存时，才用 `models`、`add`、`remove` 这些命令代他操作。模型有几十个，不要全部念出来。加入后模型在 WorkBuddy 里显示为 `ModelGo · <模型id>`。

## 输出里的字段

- `ui`：`url`（设置页面的地址）、`opened`（是否已在浏览器打开）。
- `status`：`key.set`、`key.masked`（脱敏后的密钥，可以展示）、`added`（已加入的模型 id）、`next`（下一步建议）。
- `models`：每个模型的 `id`、`added`、`recommended`、`contextWindow`、`images`、`reasoning`。`notUsableHere` 是 ModelGo 有但不能在 WorkBuddy 里用的模型（它们不走 WorkBuddy 使用的接口）。
- `add` / `sync` / `remove`：`added`、`updated`、`removed`、`backup`、`restart`。`recommendedButUnavailable` 是推荐组里这把密钥用不了的模型，照实告诉用户。

## 用户说不好用时

| 现象 | 原因和做法 |
|---|---|
| 模型选择里看不到 ModelGo 的模型 | 多半是没有彻底退出。让用户从托盘或菜单栏退出 WorkBuddy 再打开；再用 `status` 确认 `added` 不为空 |
| 提示 401 或密钥无效 | 运行 `status --verify`。密钥失效就运行 `ui`，让用户在设置页面保存新密钥，已加入的模型会一并更新 |
| 提示 404 或模型不存在 | 这把密钥已经不能用这个模型。运行 `sync`，输出的 `noLongerOffered` 就是这些模型，征得同意后 `remove` |
| 提示 402 或额度不足 | 账户余额或额度用完，请用户到 https://modelgo.ai 的控制台查看 |
| WorkBuddy 提示读取本地模型配置失败 | `models.json` 被手工改坏了。`status` 的 `modelsError` 会说明；每次写入前的备份在同目录下，文件名以 `models.json.bak-` 开头，告诉用户可以用最近一份恢复，不要自行覆盖 |
| 某个思考档位报错 | 运行 `sync` 刷新档位；仍然报错就如实告诉用户换一个档位，并建议反馈给 ModelGo |
