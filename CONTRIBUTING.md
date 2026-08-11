# 贡献与翻译更正

欢迎提交中文翻译修正、界面问题和数据一致性问题。

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
