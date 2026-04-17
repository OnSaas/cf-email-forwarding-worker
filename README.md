## Cf email forwarding worker

用于将 Worker 接收的邮件转发到第三方 APP

参考文档：https://wr.do/docs/developer/cloudflare-email-worker

### Deploy email worker to cloudflare

```bash
git clone https://github.com/oiov/cf-email-forwarding-worker.git
cd cf-email-forwarding-worker
pnpm install

wrangler login
wrangler deploy
```

### Environment variables

在 `wrangler.jsonc` 中配置你的环境变量：

- APP_API_URL: 第三方 APP 的 API hook 地址
- ENABLE_ATTACHMENTS: 是否启用保存附件到R2。默认 `1` 表示启用，`0` 表示不启用

通过 Cloudflare Secret 配置（不写入代码）：

- SEND_API_KEY: 发件接口的鉴权密钥

```bash
npx wrangler secret put SEND_API_KEY
```

### Send Email API

Worker 提供 `POST /send` 接口用于发送邮件，需通过 Bearer Token 鉴权。

**请求方式：**

```
POST https://<your-worker-url>/send
```

**请求头：**

| Header | 值 |
|---|---|
| Content-Type | application/json |
| Authorization | Bearer \<SEND_API_KEY\> |

**请求体：**

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| from.address | string | 是 | 发件人地址（必须是已开启 Email Routing 的域名） |
| from.name | string | 否 | 发件人显示名 |
| to.address | string | 是 | 收件人地址 |
| to.name | string | 否 | 收件人显示名 |
| subject | string | 是 | 邮件主题 |
| text | string | 否 | 纯文本正文 |
| html | string | 否 | HTML 正文 |

**调用示例：**

```bash
curl -X POST https://<your-worker-url>/send \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "from": { "name": "Sender", "address": "noreply@yourdomain.com" },
    "to": { "address": "recipient@example.com" },
    "subject": "Test Email",
    "text": "Hello from Cloudflare Worker!",
    "html": "<h1>Hello</h1><p>from Cloudflare Worker!</p>"
  }'
```

**响应：**

```json
// 成功
{ "success": true }

// 失败
{ "error": "error message" }
```