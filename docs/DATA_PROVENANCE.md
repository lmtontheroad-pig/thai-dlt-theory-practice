# 数据来源与处理说明

## 来源

题目来自 SafeDrive DLT 公开的驾照理论练习课程。课程当前包含 1 个随机模拟入口和 11 个分类入口。

泰文题干和选项从服务端渲染的页面 DOM 提取，没有使用 OCR。图片来自页面引用的 `/wp-content/uploads/` 原始资源，没有把网页截图当题图。

## 正确答案

练习页面的 `#tutor-quiz-context` 节点包含十六进制编码的正确 answer ID 数组。解码后与各选项 input 的 answer ID 匹配，得到 SafeDrive 提供的正确选项。

项目没有依据交通常识自行填写正确答案。原始证据保存在 `source/questions_th.json` 的 `answer_source` 和 `source_occurrences` 中。

## 稳定 ID 与去重

题目使用 `SDLT-000001` 格式的稳定 ID。fingerprint 主要根据规范化泰文题干、与顺序无关的泰文选项及图片内容哈希生成，避免把随机排序后的同一道题重复计数。

当前确认329道唯一题，但SafeDrive没有公布后台随机题池总量，因此不能声称百分之百覆盖。

## 图片完整性和替代

本地数据共有146道含图题。初次提取后发现3道题共有9个图片型选项没有可显示图片：

- `SDLT-000041`：原随机轮次的4张图片无法再次正常取得；使用 `SDLT-000216` 的完整SafeDrive同题图组。两题题干相同，SafeDrive确认答案均为A。
- `SDLT-000109`：SafeDrive DOM本身未给D选项图片；D选项使用 `SDLT-000216` 对应图片。两题题干相同，SafeDrive确认答案均为A。
- `SDLT-000160`：2022版图片地址无法再次取得；使用 `SDLT-000026` 的2025重绘版同编号32至35图片，并按原图片编号映射。两题的正确图均为编号32。

这些处理记录在 `source/image_overrides.json`，网页以“采用SafeDrive同题图组”提示，不把替代图冒充原始随机轮次文件。

## 中文翻译

中文翻译保存在 `source/questions_translated_zh.json`，只通过稳定ID与泰文原库合并。翻译文件不决定正确答案。任何翻译更正都不应修改原始泰文和SafeDrive答案。
