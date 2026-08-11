# Thai DLT Theory Practice

一个完全离线运行的中泰双语泰国驾照理论练习题库，数据整理自 [SafeDrive DLT](https://safedrivedlt.com/) 当前公开练习课程。

> 本项目仅供个人学习与技术研究，不代表、隶属于或获得泰国陆路运输厅及 SafeDrive DLT 官方认可。

## 直接使用

下载或克隆仓库后，双击根目录的 `start-local.cmd`。它会启动只监听本机的题库服务并自动打开浏览器，无需登录或联网。

直接双击 `index.html` 仍可答题，但浏览器不能把反馈写入项目文件，因此反馈功能会提示改用启动脚本。

建议使用 Windows 上的最新版 Firefox、Chrome 或 Edge。不要只从 ZIP 压缩包内部打开 `index.html`；请先完整解压，否则浏览器可能找不到同目录的题库和图片。

## 功能

- 顺序、随机及按分类练习
- 错题练习和收藏题目
- 50 题 / 60 分钟模拟考试
- 答题进度、正确率、分数及错题回顾
- 中文、泰文、题号和选项搜索
- 中文 / 泰文 / 中泰双语切换
- 显示泰文原文
- 题目图片和选项图片点击放大
- 主键盘或小键盘 `1/2/3/4` 快速选择 `A/B/C/D`
- A/B/C/D 的位置固定，每轮将四个选项内容随机分配给字母，同一轮内保持稳定
- 模拟考试数字键作答后直接下一题；练习模式答对自动下一题、答错停留讲解
- 使用 `localStorage` 保存本机学习记录
- 题目侧边反馈箱：自动记录稳定 ID、中泰题文、选项及图片引用
- 反馈直接保存到本机 `feedback/issues.json`，供 Codex 后续集中修正

## 题库状态

- 原始数据库：329 道稳定 ID 题目
- 本地练习：328 道（排除1道跨版本重复题）
- 本地练习中 SafeDrive 可验证答案：328 道
- 本地练习中含图片题目：145 道
- 本地图片文件：173 个
- 明确依赖图片但没有可显示图片的选项：0 个

SafeDrive 没有公开随机题池总量，因此“329”表示当前已经取得并生成稳定 ID 的原始记录数，不宣称是网站后台题池的绝对总数。`SDLT-000160` 与 `SDLT-000026` 是同一组交通手势图的跨版本重复题，原始记录继续保留，练习时排除前者。

原始库中3道题的随机轮次图片无法完整重新取得，项目使用 SafeDrive 站内题干和正确答案一致的完整题组或同编号重绘图补足；其中重复的 `SDLT-000160` 已不进入练习，当前网页显示2道替代图题。全部映射记录在 `source/image_overrides.json`，没有生成或猜测图片。

## 项目结构

```text
.
├─ index.html                 # 离线网页入口
├─ app.js                     # 答题与本地存储逻辑
├─ styles.css                 # 桌面界面样式
├─ start-local.cmd            # Windows 本地启动入口
├─ assets/images/             # 本地题目与选项图片
├─ feedback/                  # 本机反馈记录（issues.json 不上传）
├─ data/
│  ├─ questions.js            # file:// 页面直接加载的数据
│  └─ questions_bilingual.json
├─ source/
│  ├─ questions_th.json       # SafeDrive 泰文原库及答案证据
│  ├─ questions_translated_zh.json
│  ├─ excluded_questions.json # 练习时排除的重复题
│  └─ image_overrides.json    # 缺图补足来源和映射
├─ scripts/
│  ├─ build-data.mjs          # 按稳定 ID 重新合并数据
│  ├─ local-server.mjs        # 本地页面与反馈写入服务
│  └─ validate.mjs            # 完整性检查
└─ docs/DATA_PROVENANCE.md    # 数据来源与限制
```

## 开发与验证

项目没有第三方运行依赖，需要 Node.js 18 或更高版本：

```bash
npm run build
npm test
```

启动本地题库与反馈服务：

```bash
npm run serve
```

## 提交翻译更正

中文翻译仍可能存在不准确之处。请参阅 [CONTRIBUTING.md](CONTRIBUTING.md)，按稳定 ID 提交修改；不要改动泰文原题、SafeDrive 正确答案或图片映射。

## 权利说明

本项目原创程序代码按 `LICENSE` 中的 MIT 条款开放。SafeDrive DLT 的题目、答案数据、图片和名称不包含在该代码许可中，其权利归各自权利人所有。详情见 [NOTICE.md](NOTICE.md)。
