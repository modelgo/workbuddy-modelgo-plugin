# ModelGo for WorkBuddy

[English](README.md) | 中文

把 [ModelGo](https://modelgo.ai) 的模型加入 [WorkBuddy](https://www.workbuddy.ai) 的模型列表。

## 安装

在 WorkBuddy 的对话里输入：

```text
/plugin marketplace add modelgo/workbuddy-modelgo-plugin
/plugin install modelgo@modelgo
```

## 开始使用

安装后新开一个对话，对 WorkBuddy 说：

> 帮我配置 ModelGo

它会带你走完三步：

1. **保存密钥。** WorkBuddy 会给出一个设置工具的路径，你双击打开，在弹出的窗口里粘贴密钥。密钥在 [modelgo.ai](https://modelgo.ai) 的控制台创建，以 `mgk_` 开头。**不要把密钥发到对话里。**
2. **挑选模型。** 告诉 WorkBuddy 你想用哪些模型，或让它推荐。
3. **重启 WorkBuddy。** 从托盘或菜单栏彻底退出再打开，然后在输入框下方的模型选择里切换到 ModelGo 的模型。

之后可以随时说：

- ModelGo 有哪些模型？
- 把 claude-sonnet-5 加进来。
- 我换了 ModelGo 的密钥，帮我同步。
- 把 ModelGo 的模型都移除。

## 它做了什么

- **只改模型列表。** WorkBuddy 的自定义模型保存在 `~/.workbuddy/models.json`。插件只增删改它自己写入的条目，其他模型原样保留，每次写入前自动备份。
- **模型来自 ModelGo。** 列表用你的密钥读取，看到的就是这把密钥能用的对话模型，上下文窗口和是否支持图片也取自 ModelGo。
- **思考档位经过验证。** 每个模型只提供 ModelGo 实际接受的档位。
- **不替你花钱。** 配置过程只读取模型列表，不调用模型。

向量、图片、视频、音频模型不会列出：当前版本只覆盖对话模型。

## 密钥保存在哪里

WorkBuddy 的设计是把自定义模型的密钥保存在本机的 `models.json` 里，所以密钥以明文存在这台电脑上：

- `~/.workbuddy/modelgo/settings.json`（仅本人可读）
- `~/.workbuddy/models.json` 里 ModelGo 的条目，以及插件写入前留下的备份文件

密钥只会发送给 `api.modelgo.ai`，这个地址写死在插件里，不能通过配置更改。请不要分享上述文件。

## 不用对话，直接用命令

```sh
node plugins/modelgo/scripts/cli.mjs status --verify   # 检查状态
node plugins/modelgo/scripts/cli.mjs set-key           # 在终端里输入密钥
node plugins/modelgo/scripts/cli.mjs models            # 列出可用模型
node plugins/modelgo/scripts/cli.mjs add <模型id> ...   # 加入模型
node plugins/modelgo/scripts/cli.mjs sync              # 刷新已加入的模型
node plugins/modelgo/scripts/cli.mjs remove --all      # 全部移除
```

需要 Node 20 以上。没有安装的话，可以用 WorkBuddy 自带的 `~/.workbuddy/binaries/node/versions/current/bin/node`。

## 开发

```sh
npm test    # 单元测试，不联网
```

`scripts/probe-efforts.mjs` 是维护工具：逐个模型实测 ModelGo 接受哪些思考档位，并更新 `plugins/modelgo/data/efforts.json`。它会发送真实请求。

## 说明

WorkBuddy 是腾讯的产品。本插件由 ModelGo 维护，与腾讯没有隶属或背书关系。

## 许可证

MIT
