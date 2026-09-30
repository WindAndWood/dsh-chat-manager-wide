> **Fork 说明。** 本包 `dsh-chat-manager-wide` 是 [dsh-chat-manager](https://www.npmjs.com/package/dsh-chat-manager) 1.3.4(WSL043,MIT)的修改版:
> 从 1.5.0 起改为官方插槽插件,提供归档对话正文阅读与安全永久删除。上游的 MIT 许可证与署名完整保留在
> [LICENSE](LICENSE) 与 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md);
> 相对上游的变更清单见 [CHANGELOG.md](CHANGELOG.md),发布流程见 [PUBLISH.md](PUBLISH.md)。
> 同一个 profile 里**不要**同时安装本包与原版 `dsh-chat-manager`,两者会注册同一批 `/plugins/dsh-session-delete/*` 路由。

> [!NOTE]
> 1.5.0 起不再替换官方工作区客户端:插件只往官方预留的插槽里加东西 —— 设置里的 **已归档会话** 分节、
> 会话「…」菜单里的 **查看归档正文** 与 **删除会话**,以及一个确认对话框。归档 / 取消归档、视图筛选、
> 归档内容搜索仍由官方功能提供,插件不接管。
>
> 这是一个持续维护、可独立卸载的 DSH 插件。它补充归档正文阅读与安全永久删除；不喜欢这套会话管理方式时，可以直接卸载，现有会话不会因此被删除。

<div align="center">

# DSH Chat Manager · 聊天与会话管理器

**在 DeepSeek Harness 原生侧边栏中搜索、恢复和安全清理会话。**

npm 包：[`dsh-chat-manager-wide`](https://www.npmjs.com/package/dsh-chat-manager-wide)(fork 自 [dsh-chat-manager](https://www.npmjs.com/package/dsh-chat-manager),后者原名 `dsh-native-session-manager`)。

归档管理 · 聊天记录搜索 · 一键恢复 · 安全永久删除

[![npm](https://img.shields.io/npm/v/dsh-chat-manager-wide?style=flat-square)](https://www.npmjs.com/package/dsh-chat-manager-wide)
[![npm 总下载量](https://img.shields.io/npm/dt/dsh-chat-manager-wide?style=flat-square&label=%E6%80%BB%E4%B8%8B%E8%BD%BD%E9%87%8F)](https://www.npmjs.com/package/dsh-chat-manager-wide)
[![DSH](https://img.shields.io/badge/DSH-compatible-2f81f7?style=flat-square)](#兼容性)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)

[English](README.en.md) · [安装](#安装) · [使用](#使用) · [安全边界](#安全边界)

</div>

| 归档可找回 | 聊天可搜索 | 删除更稳妥 |
| --- | --- | --- |
| 在设置里打开「已归档会话」，阅读正文、恢复或清理 | 按会话名、工作区或用户与助手的聊天内容搜索归档 | 原生菜单保留二次确认；运行中的任务先安全停止，再删除本机会话记录 |

**归档正文界面长什么样。** 它按 `min(1120px, 100%)` 铺开（官方 `Modal` 默认只有 `min(380px, 100%)`），
内部是「左列表 + 右正文」的主从布局 —— 左栏是搜索框加归档会话列表，每行都可点选并保留「恢复 / 永久删除」；
选中一行后，右栏直接显示该会话完整的用户 / 助手对话，带角色标签、时间、条数、内部滚动和「复制对话」。
同一份界面有两个入口：设置里的 **已归档会话** 分节，以及已归档会话行「…」菜单里的 **查看归档正文**。

> [!NOTE]
> 本分支尚未建立公开的源码仓库,因此这里不放界面截图;界面以上面这段文字为准。

## 安装

### DSH 标准命令

```sh
dsh plugin --profile web add dsh-chat-manager-wide@1.5.0
```

安装完成后，保存工作并按 DSH 的正常方式重启一次，使新的 bundle 配置生效。

### 交给 Agent

请使用本包自带的固定版本 [AGENTS.md](AGENTS.md),其中写明了安装、更新、验收、卸载和安全边界。
包内的 `AGENTS.md` 与发布到 npm 的那一份逐字节一致,不要用任何线上文档替代它。

## 使用

### 管理归档

1. 打开 **设置 → 已归档会话**（或已归档会话行「…」菜单里的 **查看归档正文**），进入 **归档会话** 界面。
2. 直接浏览全部归档，或按会话名、工作区和用户/助手聊天内容搜索。
3. 点击 **恢复** 让会话回到原来的工作区位置；需要彻底清理时，可从同一列表进入永久删除确认。

归档和恢复只改变 DSH 的隐藏状态，不删除聊天记录。搜索范围仅限已归档会话中的当前用户与助手消息，
不会把其他会话或插件数据混入结果。

### 永久删除

1. 打开侧边栏中目标会话右侧的原生操作菜单。
2. 选择红色的 **删除会话**。
3. 在确认弹窗中核对会话名称并再次确认 **永久删除**；也可以随时点击 **取消**。

**删除确认弹窗。** 弹窗会写出目标会话的名称,并给出红色的「永久删除」与「取消」;永久删除无法撤销,
点击「取消」不会发送任何删除请求。

插件生效后，删除逻辑复用 DSH 的生命周期和会话存储能力。正在运行的任务会先停止并等待
收敛，然后删除目标会话；成功后只更新会话列表，不重载整个 DSH 页面。

## 安全边界

> [!WARNING]
> 永久删除无法撤销。点下确认前，请核对会话名称；需要保留的内容请先另行备份。

本插件的责任范围是：在 DSH 默认逐会话 JSONL 存储和宿主生命周期边界内，验证并移除用户明确
确认的目标会话独占目录。DSH 当前没有公开会话删除 API；二次确认是强制步骤，取消不会发送删除请求。

以下内容不在本插件的删除范围内，也不保证被清理：

- 其他会话、其他插件数据、外部附件、缓存、索引、日志、备份和云端/同步副本；
- 非 JSONL 存储或宿主没有安全停止能力的会话；这类情况会拒绝强删并报告未完成；
- 操作系统、文件系统、宿主更新或第三方同步服务造成的额外副本。

如果系统拒绝清理，插件会报告无法确认删除成功，不会把部分完成误报为成功。删除前请确认
自己有权处理目标数据，并遵守适用的数据留存、审计和隐私要求。本项目是非官方社区插件，
与 DeepSeek 无隶属或背书关系；按 [MIT 许可证](LICENSE)提供，不附带担保。

## 兼容性

<!-- dsh-compatibility -->
需要 DeepSeek Harness `0.2.0-rc.2`(插件在 `peerDependencies` 里按上游运行时版本精确声明)。
<!-- /dsh-compatibility -->

归档浏览、恢复和内容搜索使用 DSH 的工作区注册表与会话查询能力；永久删除适用于 DSH 默认的逐会话
JSONL 存储。插件**不**替换官方工作区客户端,只往官方插槽里追加自己的入口;卸载后这些入口消失,官方功能不受影响。

## 更新与卸载

更新时继续用 DSH 标准命令安装目标 npm 版本。当前版本的命令是:

```sh
dsh plugin --profile web add dsh-chat-manager-wide@1.5.0
```

卸载只移除这个插件的 bundle 层，不删除任何会话：

```sh
dsh plugin --profile web remove dsh-chat-manager-wide
```

DSH-Portable 同样使用标准的 `dsh plugin` 命令。完成安装、更新或卸载后，按 DSH 的正常方式重启，
使配置重新组合。

## 支持与许可证

本分支还没有公开的源码仓库，因此暂时没有 issue 表单。请先在
[npm 包页面](https://www.npmjs.com/package/dsh-chat-manager-wide)确认版本，再通过该页面列出的
维护者联系方式反馈可复现问题；安全问题请按 [SECURITY.md](SECURITY.md) 私下报告。

MIT。上游 `dsh-chat-manager` 的许可说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)；
1.4.x 曾分发官方工作区客户端的修改版,1.5.0 的分发物里已不含任何上游代码。
