# 探索日志: {应用名称}

**URL**: {url}
**应用类型**: {类型}
**开始时间**: {YYYY-MM-DD HH:MM}

---

## 已探索页面

### Page 01: {label}
- URL: {url}
- Template: {normalized_pattern} | NEW
- Type: {Landing|List|Detail|Form|Flow|Auth|Search|Dashboard|Settings|Error}
- Screenshot: page-01-{label}.png
- Findings: {一句话关键发现}
- Queued: {/path1}, {/path2}

<!-- 每探索完一页，在此追加一条记录。格式保持一致。 -->

---

## 模板注册表

| 模板 | 首次 URL | 页面编号 |
|------|----------|----------|
| / | / | 01 |

<!-- 每发现新模板追加一行。已见模板不重复添加。 -->

---

## 探索队列

<!-- 新 URL 追加到列表末尾。标记完成时只需替换 [PENDING] → [DONE] 或 [SKIP]。 -->

- [PENDING] {/path} (P10, from Page 01 导航)
- [PENDING] {/path} (P8, from Page 01 导航)

**统计**: 已访问 {N} / 已跳过 {N} / 队列剩余 {N}
