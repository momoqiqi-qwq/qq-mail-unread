# QQ 邮箱多账号未读提醒 v3.1

> 本地 IMAP 轮询 + Chrome 扩展，多账号 QQ 邮箱未读监控，验证码快速复制，不经过第三方服务器。

<p align="center">
  <img src="picture/extension-popup.jpg" alt="Chrome 扩展弹窗界面" width="380">
  <img src="picture/backend-admin.jpg" alt="后端管理后台界面" width="380">
</p>

## 项目架构

| 模块 | 路径 | 说明 |
|------|------|------|
| 本地后端 | `backend/` | Node.js 服务，通过 QQ 邮箱 IMAP 查询未读邮件，提供管理 GUI |
| Chrome 扩展 | `chrome-extension/` | Manifest V3，从本地后端读取状态，显示徽章、弹窗、通知 |

**安全保证**：后端只监听 `127.0.0.1`，不对公网开放。QQ 邮箱授权码只保存在本机，不上传第三方。授权码是 **IMAP/SMTP 服务授权码**，不是 QQ 登录密码。

## 截图预览

### Chrome 扩展弹窗

![扩展弹窗](picture/extension-popup.jpg)

*多账号未读列表、验证码快速复制、标为已读、本地忽略、搜索筛选、11 套主题*

### 后端管理后台

![后台管理](picture/backend-admin.jpg)

*账号管理、轮询状态概览、一键清理旧验证码、备份恢复、工具箱、11 套主题*

### 扩展图标

![扩展图标](picture/extension-icon.jpg)

*工具栏图标显示未读计数徽章*

## 快速开始

```bash
cd backend
npm install
npm start
```

打开后端管理 GUI：`http://127.0.0.1:8765/admin/`

在「账号管理」中新增 QQ 邮箱账号，每个账号需填写：

| 字段 | 说明 |
|------|------|
| ID | 英文/数字/下划线/短横线，如 `work` |
| 邮箱 | 如 `123456@qq.com` |
| 授权码 | QQ 邮箱 IMAP/SMTP 服务授权码（非 QQ 密码） |
| 备注名 | 扩展中显示的名称 |
| 正文读取 | 跟随全局 / 读取正文 / 只读标题 |

新增或编辑账号时可先点击「测试」验证授权码是否正确，测试成功后再保存。

## 安装 Chrome 扩展

1. 打开 `chrome://extensions/`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择 `chrome-extension` 文件夹

> Chrome 不支持直接加载 zip 文件，需先解压。

## 邮件操作

弹窗中每封邮件提供两个常用操作：

| 按钮 | 效果 |
|------|------|
| **标为已读** | 通过 IMAP 将 QQ 邮箱服务器上的邮件标记为已读，未读数同步减少 |
| **本地忽略** | 仅在本工具中隐藏该邮件，不改变服务器状态 |

> 建议：用完验证码后点「标为已读」；不想动服务器状态但不想继续显示时，用「本地忽略」。

## 界面自定义

点击扩展弹窗顶部的「设置」可调整：

- **字体大小**：小 / 标准 / 大 / 特大
- **弹窗宽度**：360 ~ 760px（6 档）
- **弹窗高度**：520 ~ 820px（4 档）
- **主题**：11 套主题可选

<p align="center">
  <strong>默认蓝</strong> · <strong>Claude 浅色</strong> · <strong>Claude 深色</strong> · <strong>午夜蓝</strong> · <strong>石墨黑</strong> · <strong>玻璃蓝</strong> · <strong>纸张奶油</strong> · <strong>紫晶</strong> · <strong>Win11</strong> · <strong>日落橙</strong> · <strong>薄荷浅色</strong>
</p>

设置保存在 Chrome 本地存储，不会上传。

## 账号导入 / 导出

后端 GUI 的「账号管理」页提供：

- **导出账号**：下载包含账号和授权码的 JSON 文件
- **导入账号**：选择之前导出的 JSON，导入后替换当前账号并重载轮询

> ⚠️ 导出文件包含 QQ 邮箱授权码，请勿分享、上传到网盘或代码仓库。

## 一键清理旧验证码

后端 GUI 的「本地忽略」页可一键清理超过指定时长的旧验证码邮件：

`1 小时` · `3 小时` · `6 小时` · `12 小时` · `24 小时` · `3 天` · `7 天` · `30 天`

系统根据发件人、主题、正文判断是否属于验证码/激活码/登录码类邮件。此操作仅影响本工具显示，不会修改服务器邮件状态。

## Windows 托盘运行

### 开发模式

```bash
cd backend
npm install
npm run tray
```

运行后系统托盘显示图标，右键菜单可打开后端设置、查看状态、打开 QQ 邮箱、重启后端或退出。

### 构建托盘 EXE

```bash
cd backend
build-windows-tray.bat
```

生成：`backend/dist/QQ邮箱提醒托盘版-2.8.0.exe`

### 无托盘 EXE

```bash
cd backend
build-windows-exe.bat
```

生成：`backend/dist/QQ邮箱提醒后端.exe`

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/status` | 扩展读取未读状态 |
| GET | `/health` | 后端健康检查 |
| GET/POST | `/backend-config` | 读取/保存后端设置 |
| GET/POST | `/accounts` | 账号管理 |
| POST | `/test-account` | 测试账号 IMAP 授权码 |
| GET | `/accounts/export` | 导出账号配置 |
| POST | `/accounts/import` | 导入账号配置 |
| POST | `/mark-mail-read` | 将指定邮件标为已读 |
| POST | `/clean-old-code-mails` | 一键清理旧验证码邮件 |
| POST | `/ignore-mail` | 本地忽略邮件 |
| POST | `/clear-ignored-mails` | 清空忽略记录 |
| GET | `/logs` | 读取运行日志 |
| DELETE | `/logs` | 清空日志 |
| POST | `/refresh` | 立即轮询一次 |

## 更新日志

### v3.1

- 修复 Popup 首次打开时长时间显示「等待同步」、列表空白的问题
- 刷新按钮新增兜底逻辑：Service Worker 消息失败时直接请求本地后端
- 后端离线、超时、脚本异常时显示明确错误信息
- 首屏优先显示缓存或加载提示，后端配置同步改为后台异步
- 「复制可见验证码」换行修复为稳定 `\n` 分隔

### v2.9

- 后端 GUI 支持 11 套主题和字体/密度调节
- 新增「工具箱」页面
- 「一键修复并轮询」：恢复全局轮询、重置停止账号、立即轮询
- 完整后端备份/恢复（含账号和忽略记录）

### v2.8

- 验证码识别准确率提升：优先匹配 `verification code is: XXXXXX` 强上下文
- 默认最大字体、最大界面
- 支持界面内「标为已读」
- 扩展内暂停/恢复后台轮询
- Popup 搜索、账号视图、时间范围筛选
- QQ 邮箱官方窗口复用

---

<p align="center">
  <sub>MIT License · 隐私优先 · 数据不上传第三方</sub>
</p>
