Drop extracted item icon files into this directory.

Import command:
- `pnpm import:item-icons -- --source /path/to/extracted/assets`
- `pnpm import:item-icons -- --source /dir/a --source /dir/b --dry-run`
- `pnpm import:item-icons -- --wechat-cache --dry-run`

Recommended reference source:
- `/Users/smdk000/Downloads/未命名文件夹 7/qq-farm-automation-bot-main-1/core/src/gameConfig/seed_images_named`
- this source currently has a richer extracted material pool than the local workspace `seed_images_named` directory and is a good fallback when the current repo is missing item icon assets
- it is especially useful for named extracted files such as `90006_dog_food_5.png`, `1004_钻石_icon_diamond.png`, and similar item-oriented resources
- quick local comparison on 2026-03-30: current workspace has about `45` files in `item_icons` and `189` files in `seed_images_named`, while `qq-farm-automation-bot-main-1` has about `230` files in `seed_images_named`
- practical guidance: when the current repo cannot resolve an icon by exact item ID or by normalized `icon_res`, check this older extracted pool first before drawing a new placeholder manually

Trace note for missing bag icon `100014`:
- current runtime bag rendering does not pad or reformat item IDs; the UI shows `item.id` directly, and backend bag normalization also keeps the numeric ID as-is
- current local `ItemInfo.json` does not define `100014`, so this case is not only "missing image" but "missing item definition/config"
- current fallback behavior is expected: unknown bag IDs become `物品${id}` and use generated SVG placeholders from `data/asset-cache/item-icons`
- verified against live runtime on 2026-03-30: the online account is `1010` (not legacy local file account `1`), and `/api/bag` for account `1010` currently returns a real bag entry `{ id: 100014, count: 503, uid: 930 }`
- the same live bag payload confirms `100014` is coming from upstream bag data directly, not from front-end formatting, offline cache replay, or local SVG generation
- current live mall catalog for account `1010` does not contain `100014`, so this ID is not explained by the known mall/shop goods snapshots
- a strong nearby clue exists in `web/public/nc_local_version/levels.html`: land config defines `10014` as `九宫良田 Lv4`, which suggests the observed `100014` may be a real remote six-digit ID, or a land-related ID that leaked into bag data after upstream normalization/padding
- do not blindly add a fake item icon for `100014` until its real upstream meaning is confirmed from live bag payloads or server logs
- if this ID appears again while the account is online, check worker logs for `unknown_bag_item_detected`; the bag service now logs the raw unknown item ID, count, uid, fallback name, and fallback image once per process

Useful flags:
- `--force` overwrite existing files in this directory
- `--dest /tmp/item_icons` import into another directory first
- `--report /tmp/item-icon-report.json` write the match report to a custom path
- `--wechat-cache` scan the default macOS WeChat mini program cache directory

Default behavior:
- real import writes a report to `core/src/gameConfig/item_icons/import-report.json`
- dry run only prints summary unless `--report` is provided

Mini program cache support:
- if a source directory contains `.wxapkg`, the importer will scan image entries inside the package directly
- this works well with macOS WeChat cache: `~/Library/Containers/com.tencent.xinWeChat/Data/.wxapplet/packages`
- for cached mini programs, you do not need to unpack `.wxapkg` manually

Supported naming:
- `<itemId>.png`
- `<itemId>.webp`
- `<normalized-icon-res>.png`
- `<normalized-icon-res>.webp`

Normalization rule for `icon_res` / `asset_name`:
- remove trailing `/spriteFrame`
- replace non-alphanumeric chars with `_`
- lowercase

Examples:
- `gui/texture/icon/icon_feterlize1/spriteFrame` -> `gui_texture_icon_icon_feterlize1.png`
- `gui/texture/icon/dogFood1/spriteFrame` -> `gui_texture_icon_dogfood1.webp`

Resolution priority:
1. seed/fruit images from `seed_images_named`
2. exact item ID match in this directory
3. normalized `icon_res` / `asset_name` match in this directory
4. generated cached SVG in `data/asset-cache/item-icons`
