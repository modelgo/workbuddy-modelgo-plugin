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

A settings page opens in your browser. Two steps there:

1. **Paste your key** and click "Verify and save". Create a key in the [modelgo.ai](https://modelgo.ai) console; it starts with `mgk_`.
2. **Tick models** and click "Save to WorkBuddy". The 8 recommended models are ticked already; you can search for others.

Back in WorkBuddy, switch models under the input box. ModelGo models are shown as `ModelGo · model-name`. If they are not there, quit WorkBuddy completely from the tray or menu bar and open it again.

The settings page runs only on your computer, and the key never passes through the conversation. To change the key or the models later, say "open ModelGo settings".

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
node plugins/modelgo/scripts/cli.mjs ui                # open the settings page
node plugins/modelgo/scripts/cli.mjs status --verify   # check the setup
node plugins/modelgo/scripts/cli.mjs set-key           # type the key in a terminal
node plugins/modelgo/scripts/cli.mjs models            # list available models
node plugins/modelgo/scripts/cli.mjs add --recommended # add the recommended set
node plugins/modelgo/scripts/cli.mjs add <id> ...      # add named models
node plugins/modelgo/scripts/cli.mjs sync              # refresh the models already added
node plugins/modelgo/scripts/cli.mjs remove --all      # remove them all
```

Needs Node 20 or newer. Without one installed, WorkBuddy's own works: `~/.workbuddy/binaries/node/versions/current/bin/node`.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| No ModelGo models in the model picker | Quit WorkBuddy completely from the tray or menu bar and open it again; closing the window is not enough |
| The settings page says it has expired | The page closes itself after 15 minutes without use. Say "open ModelGo settings" to open it again |
| 401, or the key is reported as not valid | The key is mistyped or has been deleted. Save a new key on the settings page; models already added are updated with it |
| 404, or the model is not found | The key may no longer use that model. Tell WorkBuddy "sync my ModelGo models" |
| 402, or the quota is used up | Check balance and limits in the [modelgo.ai](https://modelgo.ai) console |
| WorkBuddy cannot read the local model configuration | `models.json` is no longer valid JSON. Restore the most recent `models.json.bak-…` backup next to it |

## Development

```sh
npm test    # unit tests, no network
```

`scripts/probe-efforts.mjs` is a maintainer tool: it checks, model by model, which reasoning levels ModelGo accepts and updates `plugins/modelgo/data/efforts.json`. It sends real requests.

## Notice

WorkBuddy is a Tencent product. This plugin is maintained by ModelGo and is not affiliated with or endorsed by Tencent.

## License

MIT
