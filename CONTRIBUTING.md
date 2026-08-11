# 贡献与翻译更正

欢迎提交中文翻译修正、界面问题和数据一致性问题。

## 本地反馈工作流

使用 `start-local.cmd` 打开题库。做题时通过右侧“反馈”按钮记录问题，网页会把稳定 ID、问题说明以及当时的题目快照直接写入 `feedback/issues.json`。

该文件已被 Git 忽略，不会提交到公开仓库。需要集中修正时，可以让 Codex 读取所有状态为 `open` 的反馈；修正并验证后再将对应记录标记为 `resolved`。

## 翻译修正格式

请始终提供稳定 ID，例如 `SDLT-000153`，并说明：

1. 需要修改的字段：分类、题干、A/B/C/D 选项或解释；
2. 当前中文；
3. 建议中文；
4. 修改理由或对应泰文含义。

翻译修改应写入 `source/questions_translated_zh.json`，然后执行：

```bash
npm run build
npm test
```

## 不应修改的内容

- 稳定 ID；
- `source/questions_th.json` 中的泰文原题；
- SafeDrive 提供的 `correct_answer`；
- 没有来源证据的图片或答案。

如果发现 SafeDrive 原始数据本身存在问题，请单独提出，不要直接凭交通常识覆盖原始记录。
