# ModelGo for WorkBuddy

English | [中文](README.zh.md)

Adds [ModelGo](https://modelgo.ai) models to the [WorkBuddy](https://www.workbuddy.ai) model list.

## Install

In a WorkBuddy conversation:

```text
/plugin marketplace add modelgo/workbuddy-modelgo-plugin
/plugin install modelgo@modelgo
```

## Get started

Open a new conversation and tell WorkBuddy:

> Set up ModelGo for me

It walks you through three steps:

1. **Save your key.** WorkBuddy gives you the path of a small setup tool; you double-click it and paste your key in the window that opens. Create a key in the [modelgo.ai](https://modelgo.ai) console; it starts with `mgk_`. **Do not paste the key into the conversation.**
2. **Pick models.** Say which models you want, or ask for a suggestion.
3. **Restart WorkBuddy.** Quit it completely from the tray or menu bar, open it again, and switch to a ModelGo model under the input box.

After that you can say things like:

- Which models does ModelGo have?
- Add claude-sonnet-5.
- I changed my ModelGo key, sync it.
- Remove all ModelGo models.

## What it does

- **It only edits the model list.** WorkBuddy keeps custom models in `~/.workbuddy/models.json`. The plugin adds, updates and removes only the entries it wrote, leaves every other model as it is, and backs the file up before each write.
- **Models come from ModelGo.** The list is read with your key, so you see the chat models that key may use; context window and image support also come from ModelGo.
- **Reasoning levels are verified.** Each model offers only the levels ModelGo actually accepts for it.
- **It spends nothing for you.** Setup only reads the model list; it never calls a model.

Embedding, image, video and audio models are not listed: this version covers chat models only.

## Where the key is kept

WorkBuddy's design keeps a custom model's key in the local `models.json`, so the key is stored in plain text on this computer:

- `~/.workbuddy/modelgo/settings.json` (readable by you only)
- the ModelGo entries in `~/.workbuddy/models.json`, and the backups made before each write

The key is only ever sent to `api.modelgo.ai`; that address is fixed in the plugin and cannot be changed by configuration. Do not share those files.

## Without a conversation

```sh
node plugins/modelgo/scripts/cli.mjs status --verify   # check the setup
node plugins/modelgo/scripts/cli.mjs set-key           # type the key in a terminal
node plugins/modelgo/scripts/cli.mjs models            # list available models
node plugins/modelgo/scripts/cli.mjs add <id> ...      # add models
node plugins/modelgo/scripts/cli.mjs sync              # refresh the models already added
node plugins/modelgo/scripts/cli.mjs remove --all      # remove them all
```

Needs Node 20 or newer. Without one installed, WorkBuddy's own works: `~/.workbuddy/binaries/node/versions/current/bin/node`.

## Development

```sh
npm test    # unit tests, no network
```

`scripts/probe-efforts.mjs` is a maintainer tool: it checks, model by model, which reasoning levels ModelGo accepts and updates `plugins/modelgo/data/efforts.json`. It sends real requests.

## Notice

WorkBuddy is a Tencent product. This plugin is maintained by ModelGo and is not affiliated with or endorsed by Tencent.

## License

MIT
