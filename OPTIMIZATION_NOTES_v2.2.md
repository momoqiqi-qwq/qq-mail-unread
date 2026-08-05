# v2.2 优化记录

## 已完成

1. 验证码识别准确率
   - 新增强上下文识别和候选码排序。
   - 修复英文验证码邮件中 `This code expires in 10 minutes` 被误识别为 `EXPIRESIN10MINUTE` 的问题。
   - 对时间、年份、自然语言短语、隐私/条款链接等常见误判做过滤。

2. 默认最大字体、最大界面
   - 默认字体改为 `xlarge`。
   - 默认弹窗尺寸改为 `760 x 820`。
   - 默认舒适排布、正文高度为“更多”。
   - 对已安装旧版的浏览器本地设置增加一次性迁移，升级后也会应用上述默认体验。

3. 界面标为已读
   - Popup 邮件项新增 `标为已读` 按钮。
   - 后端新增 `POST /mark-mail-read` 接口。
   - 通过 QQ 邮箱 IMAP 给指定 UID 添加 `\\Seen` 标记，是真正的服务器已读。
   - 操作成功后同步更新本地状态和未读数。

4. 体验与稳定性
   - 验证码区域文案改为 `验证码：xxxx`。
   - 复制按钮改为 `复制验证码`。
   - 保留 `本地忽略`，并和 `标为已读` 做清晰区分。
   - 修复 popup 刷新函数重复 finally 的语法问题。
   - 修复前端 `clearIgnoredMails` 请求参数错误。

## 验证

- 已运行 `backend/npm run check`。
- 已运行 Chrome 扩展所有 JS 文件的 `node --check`。
- 已用示例邮件验证：`Your verification code is: 572863. This code expires in 10 minutes.` 现在识别结果为 `572863`。
