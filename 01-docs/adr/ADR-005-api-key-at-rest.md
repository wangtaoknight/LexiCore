# ADR-005：API Key 以 AES-256-GCM 加密入库，接口只返回掩码

- 状态：Accepted
- 日期：2026-11

## 背景

用户需要在界面里填写第三方大模型 API Key。明文存 SQLite 会在备份文件、误提交、导出数据时泄露；而把 Key 放前端或环境变量又会让设置页失去意义。

## 决策

- 明文 Key 只存在于进程内存与数据库的密文中：`settings.api_key_enc = base64(iv | tag | ciphertext)`，算法 **AES-256-GCM**（`server/utils/crypto.ts`）。
- 加密密钥来源：环境变量 `APP_SECRET`；未配置时自动生成 `data/secret.key`（已 gitignore）。
- `GET /api/settings` 只返回末四位掩码（`maskSecret()`），前端永远拿不到明文。
- 所有 AI 请求都由后端发起；`ai_tasks` 只记录请求体（不含 `Authorization` 头）。
- 服务默认只监听 `127.0.0.1`，无登录体系。

## 备选方案

| 方案 | 放弃原因 |
| --- | --- |
| 明文存库 | 备份/导出/误提交即泄露 |
| 只放 `.env` | 用户无法在界面切换服务商与模型 |
| 系统凭据管理器（Keytar 等） | 增加平台相关原生依赖，收益有限 |

## 后果

- **正面**：备份文件、导出数据、数据库本身都不含明文 Key。
- **负面**：`data/secret.key` 或 `APP_SECRET` 丢失后旧密文不可解，需要重新填写 Key；恢复数据库到其他机器时需一并迁移密钥。
- **约束**：一旦开放远程访问，必须在此之上补身份认证（见 `DECISIONS.md` 待决策项）。
