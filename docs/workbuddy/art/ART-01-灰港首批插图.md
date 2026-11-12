# ART-01 灰港首批场景与事件图

## 范围与来源

基线 `feat/iselan-v1` 的 `95ba727`，独立分支 `art/grayport-p0`。画面、规格和验收依据 [插图计划](../../story/10-插图计划.md) 第 1、2、4、5 节。本批九张均为 🟡 已生成、待人工审阅。

采用聊天内置 OpenAI ImageGen，使用统一前缀与灰港铅灰、铜红配色，人工对照已确认的 `GH-01.jpg`。首轮文字生图没有上传参考图，返修以对应候选为参考，`GH-E3` 额外参考 `GH-06` 保持地窖一致。

生成原图为 1672×941 PNG，按近似 16:9 的原始比例做极微裁边，等比缩放后导出 1280×720 JPG。九张交付版合计 2,536,696 字节，位于 `public/art/story/`。母版保留在本机 `C:/Users/tinte/.codex/generated_images/01a1ce16-951a-7933-838b-2a3f90de94d3/`。

晚宴采用宾客到场前的空桌构图。拍卖行移除拍卖师，观众面部置于阴影，避免先于人物肖像定稿确定角色长相。

## 每张文件的来源与授权

下表文件均由内置 ImageGen 生成。每行适用 OpenAI 输出权益约定，在适用法律允许的范围内，OpenAI 向用户或客户转让其对输出拥有的权益（如有），具体适用协议以账号为准。核对日期为 2026-11-12。[个人服务条款](https://openai.com/policies/terms-of-use/)、[企业服务协议](https://openai.com/policies/services-agreement/)

| 文件 | 生成原图文件名 | 授权说明 |
|---|---|---|
| `GH-02.jpg` | `exec-45507034-d554-4fb5-88e0-a932ce104fac.png` | OpenAI 生成输出，适用上文输出条款 |
| `GH-03.jpg` | `exec-befb8342-2f4d-40b1-b574-11d04c4382c5.png` | OpenAI 生成输出，适用上文输出条款 |
| `GH-04.jpg` | `exec-1f98677a-f9e4-4b07-98d1-a26dd3f43ee4.png` | OpenAI 生成输出，适用上文输出条款 |
| `GH-05.jpg` | `exec-5c5be984-5af5-4baf-b0cc-5c537b5ac84e.png` | OpenAI 生成输出，适用上文输出条款 |
| `GH-06.jpg` | `exec-579a5940-03e2-44d1-914a-d0dc5cb7d5c6.png` | OpenAI 生成输出，适用上文输出条款 |
| `GH-07.jpg` | `exec-eb2f051b-982c-41f7-a740-2fd2b5f76891.png` | OpenAI 生成输出，适用上文输出条款 |
| `GH-E1.jpg` | `exec-4d95f788-91d1-40be-b756-695e6258dae8.png` | OpenAI 生成输出，适用上文输出条款 |
| `GH-E2.jpg` | `exec-e95bbf2e-7e2e-4adc-8ffa-c40705fb1232.png` | OpenAI 生成输出，适用上文输出条款 |
| `GH-E3.jpg` | `exec-96843499-1919-4f9e-a521-6786b3866a5e.png` | OpenAI 生成输出，适用上文输出条款 |

## 检查与返修

- 每张已查看原图，核对灰港色调、画面描述、无可读文字与标志、无血腥与线索答案。议会的壁画人物保留为历史画面，其他人物为匿名背景。
- 议会首图座椅偏多，第一轮返修为 13 把，再返修后目视数出左 7、中央 1、右 7，共 15 把；地面罗盘图案已去除。
- 拍卖行首图露出户外码头且有清晰拍卖师，已改成封闭仓库地窖并移除拍卖师。
- 断管事件首图误画在户外，已参考 `GH-06` 恢复相同地下拱顶、井沿纹饰与铜管。
- 桌面阅读器为浅横幅裁切，账本铜扣与晚宴银叶曾被裁掉，已将两处道具移到画面中央高度并重验。裁切仍由现有阅读器控制。
- 九张 JPG 均已解码核验格式、1280×720 尺寸。九张在真实阅读组件的 375×667 与 1280×800 浏览器尺寸下逐张替换图片源，加载、无正文重叠、无横向溢出共 18 组检查通过。GH-04 另经真实单人入口走通开局、翻页、前往低潮街、图片加载。
- 这是阅读器渲染核验，其他八张的全部剧情触发与手机真机尚未检查。九张保留 🟡，ART-01 整卡仍进行中。
- `npm ci`、lint（0 错误、2 个既有警告）、build、严格文本检查通过。构建有既有体积提示，7 个非严格地区文本仍报告迁移问题。
- `npm test -- --testTimeout=30000` 为 367 通过、1 失败、4 数据库测试跳过。失败在 `achievements.test.ts:40`，SVG 原始文本 CRLF 与生成常量 LF 不一致。51 个 SVG 在仅归一换行后均与 Git HEAD 一致。本批未改该测试、图标或游戏代码。
- 内置工具共有 20 次调用，15 次成功（9 张首图、6 张返修）、5 次网络错误。原始失败均为 `network error: error sending request`。后续内置重试已补齐九张，未使用 API fallback。工具未返回底层模型版本、provider token 或费用，实际消耗未计量。

## 后续

- `P-ROSA`、`P-CEDRIC`、`P-AGATHA` 有根工作区既有候选，待复核来源与授权后入库。`P-FELIX`、`P-TIM` 待制作。
- 法比安当前台词配图为「无」，档案只写人类商会会计与性格。建议后续新增 `P-FABIAN`（P2），先补外貌约束再生成。
- `GH-01B`、`GH-01C`、六张预制角色肖像、`GEN-03`、结局系列仍待制作。结局系列包括 `ED-01B`、`ED-06B` 两个变体，缺图清单同步在看板。

## 生成提示词

### GH-02

Original dark fantasy storybook painting, painterly brushwork, rich environmental storytelling, low-saturation cool palette with small warm accents of lamplight or copper, strong chiaroscuro, cinematic composition, Western European early-Renaissance inspired world, no text, no letters, no logos, no watermark.
Grayport council hall, wide eye-level establishing view. A semicircle of exactly fifteen empty council chairs in dark carved wood beneath an immense weathered domed fresco of refugees stepping ashore from boats in a storm. The fresco is figurative, without inscription. Cool rain light grazes wet stone and modest copper fixtures. No people in the hall. Single edge-to-edge 16:9 game illustration for 1280×720. Grayport: lead-gray stone and muted copper-red accents, tactile dark painted realism. Keep key subjects clear at mobile thumbnail scale. No UI, glyphs, emblems, gore or clue solutions.

最终定向返修提示词

Original dark fantasy storybook painting, painterly brushwork, rich environmental storytelling, low-saturation cool palette with small warm accents of lamplight or copper, strong chiaroscuro, cinematic composition, Western European early-Renaissance inspired world, no text, no letters, no logos, no watermark.
Edit this council hall image with one precise change. There are currently THIRTEEN visible chairs: six on the left, one central chair, six on the right. ADD EXACTLY TWO more chairs, one at the far left end and one at the far right end, so the final image contains FIFTEEN visible, separated chair backs in total. Narrow the existing chairs slightly and extend the arc if necessary to fit all fifteen in frame. Keep the exact same refugee mural, empty hall, plain gray flagstone floor, architecture, palette, and lighting. No text or symbols.

### GH-03

Original dark fantasy storybook painting, painterly brushwork, rich environmental storytelling, low-saturation cool palette with small warm accents of lamplight or copper, strong chiaroscuro, cinematic composition, Western European early-Renaissance inspired world, no text, no letters, no logos, no watermark.
Spotless Copper Tower guild hall. A vast unlettered wall-mounted relief map of the continent is densely dotted with small unmarked copper pins without highlighted groups, routes, borders or legend. Polished slate floor, precise early Renaissance joinery, isolated copper-red light. Empty hall. Single edge-to-edge 16:9 game illustration for 1280×720. Grayport: lead-gray stone and muted copper-red accents, tactile dark painted realism. Keep key subjects clear at mobile thumbnail scale. No UI, glyphs, emblems, gore or clue solutions.

### GH-04

Original dark fantasy storybook painting, painterly brushwork, rich environmental storytelling, low-saturation cool palette with small warm accents of lamplight or copper, strong chiaroscuro, cinematic composition, Western European early-Renaissance inspired world, no text, no letters, no logos, no watermark.
Low Tide Street, a narrow rain-dark Grayport lane, with the incoming tide spilling over several door thresholds. A few anonymous sick residents sit wrapped in coarse blankets on doorsteps, seen from the side with faces in shadow and visible red cords around their wrists. Floodwater catches copper-red lantern light. Single edge-to-edge 16:9 game illustration for 1280×720. Grayport: lead-gray stone and muted copper-red accents, tactile dark painted realism. Keep key subjects clear at mobile thumbnail scale. No UI, glyphs, emblems, gore or clue solutions.

### GH-05

Original dark fantasy storybook painting, painterly brushwork, rich environmental storytelling, low-saturation cool palette with small warm accents of lamplight or copper, strong chiaroscuro, cinematic composition, Western European early-Renaissance inspired world, no text, no letters, no logos, no watermark.
Clandestine underground auction hall under Grayport. Curved ranks of benches with indistinct silhouettes, candles frame one glass bell jar on the auction pedestal. A faint luminous echo, like two displaced wisps of the same lamplight, hovers inside. Soot-stained vaults and aged copper highlights. Single edge-to-edge 16:9 game illustration for 1280×720. Grayport: lead-gray stone and muted copper-red accents, tactile dark painted realism. Keep key subjects clear at mobile thumbnail scale. No UI, glyphs, emblems, gore or clue solutions.

最终定向返修提示词

Original dark fantasy storybook painting, painterly brushwork, rich environmental storytelling, low-saturation cool palette with small warm accents of lamplight or copper, strong chiaroscuro, cinematic composition, Western European early-Renaissance inspired world, no text, no letters, no logos, no watermark.
Clandestine underground auction hall under Grayport. Curved ranks of benches with indistinct silhouettes, candles frame one glass bell jar on the auction pedestal. A faint luminous echo, like two displaced wisps of the same lamplight, hovers inside. Soot-stained vaults and aged copper highlights. Single edge-to-edge 16:9 game illustration for 1280×720. Grayport: lead-gray stone and muted copper-red accents, tactile dark painted realism. Keep key subjects clear at mobile thumbnail scale. No UI, glyphs, emblems, gore or clue solutions.
Edit the reference image. Keep the same glass bell jar with two faint echo wisps, candles, podium and seated audience, painterly brushwork and slate-gray/copper-red palette. Replace the entire outdoor opening on the left with ENCLOSED cellar masonry and vaulted ceiling, no visible outdoor sky or ships. Remove the clearly visible auctioneer on the right entirely, leaving the lectern empty. Keep all audience members anonymous in deep shadow. This is a clandestine underground room below a spice warehouse. No recognizable NPC faces or heraldic marks.

### GH-06

Original dark fantasy storybook painting, painterly brushwork, rich environmental storytelling, low-saturation cool palette with small warm accents of lamplight or copper, strong chiaroscuro, cinematic composition, Western European early-Renaissance inspired world, no text, no letters, no logos, no watermark.
The Tide Well at the bottom of a deep cellar. The round gray stone well has a rim carved with weathered non-symbolic imperial interlace. Fresh bright copper pipes feed into the side. An empty plain wooden chair fitted with leather straps stands nearby. Wide view, lantern glints, damp stone and dark water. No people. Single edge-to-edge 16:9 game illustration for 1280×720. Grayport: lead-gray stone and muted copper-red accents, tactile dark painted realism. Keep key subjects clear at mobile thumbnail scale. No UI, glyphs, emblems, gore or clue solutions.

### GH-07

Original dark fantasy storybook painting, painterly brushwork, rich environmental storytelling, low-saturation cool palette with small warm accents of lamplight or copper, strong chiaroscuro, cinematic composition, Western European early-Renaissance inspired world, no text, no letters, no logos, no watermark.
Copper Tower formal banquet hall before guests arrive. Long table with exactly twelve complete place settings and plain unmarked linen. A single silver leaf is clearly visible on a plate at an empty seat. Empty chairs, slate stone, copper candleholders and restrained copper-red light. No people or place cards. Single edge-to-edge 16:9 game illustration for 1280×720. Grayport: lead-gray stone and muted copper-red accents, tactile dark painted realism. Keep key subjects clear at mobile thumbnail scale. No UI, glyphs, emblems, gore or clue solutions.

最终定向返修提示词

Original dark fantasy storybook painting, painterly brushwork, rich environmental storytelling, low-saturation cool palette with small warm accents of lamplight or copper, strong chiaroscuro, cinematic composition, Western European early-Renaissance inspired world, no text, no letters, no logos, no watermark.
Copper Tower formal banquet hall before guests arrive. Long table with exactly twelve complete place settings and plain unmarked linen. A single silver leaf is clearly visible on a plate at an empty seat. Empty chairs, slate stone, copper candleholders and restrained copper-red light. No people or place cards. Single edge-to-edge 16:9 game illustration for 1280×720. Grayport: lead-gray stone and muted copper-red accents, tactile dark painted realism. Keep key subjects clear at mobile thumbnail scale. No UI, glyphs, emblems, gore or clue solutions.
Edit the reference image. Preserve the empty banquet hall, twelve place settings, silverware, table geometry, palette and brushwork. Move the ONE silver leaf from the foreground plate to a plate halfway down the right side of the table, located at approximately 72% image width and 52% image height. Show it clearly on that plate. The foreground plate becomes empty. Do not add more leaves, place settings, chairs, people, text or symbols. This protects the leaf in a shallow central horizontal crop.

### GH-E1

Original dark fantasy storybook painting, painterly brushwork, rich environmental storytelling, low-saturation cool palette with small warm accents of lamplight or copper, strong chiaroscuro, cinematic composition, Western European early-Renaissance inspired world, no text, no letters, no logos, no watermark.
Close-up of an open old memory ledger on damp dark wood. A single loose red cord with a copper buckle lies beside the book. Aged blank pages with only faint plain ruled lines, no writing, glyphs or names. Both the open book and cord clearly framed in the central area. Single edge-to-edge 16:9 game illustration for 1280×720. Grayport: lead-gray stone and muted copper-red accents, tactile dark painted realism. Keep key subjects clear at mobile thumbnail scale. No UI, glyphs, emblems, gore or clue solutions.

最终定向返修提示词

Original dark fantasy storybook painting, painterly brushwork, rich environmental storytelling, low-saturation cool palette with small warm accents of lamplight or copper, strong chiaroscuro, cinematic composition, Western European early-Renaissance inspired world, no text, no letters, no logos, no watermark.
Close-up of an open old memory ledger on damp dark wood. A single loose red cord with a copper buckle lies beside the book. Aged blank pages with only faint plain ruled lines, no writing, glyphs or names. Both the open book and cord clearly framed in the central area. Single edge-to-edge 16:9 game illustration for 1280×720. Grayport: lead-gray stone and muted copper-red accents, tactile dark painted realism. Keep key subjects clear at mobile thumbnail scale. No UI, glyphs, emblems, gore or clue solutions.
Edit the reference image. Keep the book, aged blank pages, dark dock setting, palette and brushwork unchanged. Move ONLY the copper buckle and the connected red cord to the upper-right part of the tabletop, with the buckle centered at approximately 82% image width and 47% image height. Ensure the copper buckle is clearly visible within the middle horizontal third of the image. Remove it from its old bottom-right position. No writing or symbols.

### GH-E2

Original dark fantasy storybook painting, painterly brushwork, rich environmental storytelling, low-saturation cool palette with small warm accents of lamplight or copper, strong chiaroscuro, cinematic composition, Western European early-Renaissance inspired world, no text, no letters, no logos, no watermark.
Close view straight down into the Tide Well, aged gray stone and copper glints at the edges. Concentric ripples briefly suggest the pale face of an elderly woman as a fleeting reflection made from water, recognizable eyes and cheeks partly dissolved by moving rings. No body or distinctive identity cues. Single edge-to-edge 16:9 game illustration for 1280×720. Grayport: lead-gray stone and muted copper-red accents, tactile dark painted realism. Keep key subjects clear at mobile thumbnail scale. No UI, glyphs, emblems, gore or clue solutions.

### GH-E3

Original dark fantasy storybook painting, painterly brushwork, rich environmental storytelling, low-saturation cool palette with small warm accents of lamplight or copper, strong chiaroscuro, cinematic composition, Western European early-Renaissance inspired world, no text, no letters, no logos, no watermark.
At the Tide Well, a low close view of a freshly split copper pipe next to the ancient wet gray circular stone rim. Churning water visibly sinks, exposing a wet band of stone. Copper glints on the two ruptured edges, lamplight reflected in the agitated water. No person, reflection of a face, or explosion. Single edge-to-edge 16:9 game illustration for 1280×720. Grayport: lead-gray stone and muted copper-red accents, tactile dark painted realism. Keep key subjects clear at mobile thumbnail scale. No UI, glyphs, emblems, gore or clue solutions.

最终定向返修提示词

Original dark fantasy storybook painting, painterly brushwork, rich environmental storytelling, low-saturation cool palette with small warm accents of lamplight or copper, strong chiaroscuro, cinematic composition, Western European early-Renaissance inspired world, no text, no letters, no logos, no watermark.
Edit Image 1 (the ruptured copper pipe over sinking well water). Replace the ENTIRE outdoor harbor background with the underground Tide Well cellar interior in Image 2. Image 2 is the continuity reference for the location: enclosed dark gray stone cellar vaults, damp masonry, worn non-symbolic imperial interlace around the well rim, copper pipes and dim copper lanternlight. Keep Image 1's two ruptured copper pipe ends prominently in the foreground and churning sinking well water in the center. No windows, sky, ships, outdoor city, streets or people. Match the same muted lead-gray and copper-red palette and dark painted brushwork. 16:9 edge-to-edge game illustration for 1280×720.
