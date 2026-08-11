# Thai DLT Theory Practice

一个完全离线运行的中泰双语泰国驾照理论练习题库，数据整理自 [SafeDrive DLT](https://safedrivedlt.com/) 当前公开练习课程。

> 本项目仅供个人学习与技术研究，不代表、隶属于或获得泰国陆路运输厅及 SafeDrive DLT 官方认可。

## 直接使用

下载或克隆仓库后，双击根目录的 `index.html` 即可。无需安装依赖、无需登录、无需联网。

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
- 使用 `localStorage` 保存本机学习记录

## 题库状态

- 已确认收录：329 道唯一题目
- SafeDrive 可验证答案：329 道
- 含图片题目：146 道
- 本地图片文件：173 个
- 明确依赖图片但没有可显示图片的选项：0 个

SafeDrive 没有公开随机题池总量，因此“329”表示当前已经取得并去重确认的数量，不宣称是网站后台题池的绝对总数。

3 道题的原随机轮次图片无法完整重新取得。为保证题目可作答，项目使用 SafeDrive 站内题干和正确答案一致的完整题组或同编号重绘图补足，并在页面及 `source/image_overrides.json` 中明确记录，没有生成或猜测图片。

## 项目结构

```text
.
├─ index.html                 # 离线网页入口
├─ app.js                     # 答题与本地存储逻辑
├─ styles.css                 # 桌面界面样式
├─ assets/images/             # 本地题目与选项图片
├─ data/
│  ├─ questions.js            # file:// 页面直接加载的数据
│  └─ questions_bilingual.json
├─ source/
│  ├─ questions_th.json       # SafeDrive 泰文原库及答案证据
│  ├─ questions_translated_zh.json
│  └─ image_overrides.json    # 缺图补足来源和映射
├─ scripts/
│  ├─ build-data.mjs          # 按稳定 ID 重新合并数据
│  └─ validate.mjs            # 完整性检查
└─ docs/DATA_PROVENANCE.md    # 数据来源与限制
```

## 开发与验证

项目没有第三方运行依赖，需要 Node.js 18 或更高版本：

```bash
npm run build
npm test
```

也可以用任意静态文件服务器预览：

```bash
npm run serve
```

## 提交翻译更正

中文翻译仍可能存在不准确之处。请参阅 [CONTRIBUTING.md](CONTRIBUTING.md)，按稳定 ID 提交修改；不要改动泰文原题、SafeDrive 正确答案或图片映射。

## 权利说明

本项目原创程序代码按 `LICENSE` 中的 MIT 条款开放。SafeDrive DLT 的题目、答案数据、图片和名称不包含在该代码许可中，其权利归各自权利人所有。详情见 [NOTICE.md](NOTICE.md)。
