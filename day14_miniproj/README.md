# CommitFit — Day 14 Mini Project

Ứng dụng theo dõi **calo / protein** và **workout** theo ngày, deploy serverless trên AWS, domain `https://devopsminilab.site`.

| Lớp | Thư mục | Vai trò |
|-----|---------|---------|
| IaC | `*.tf` | Provision toàn bộ hạ tầng AWS |
| Frontend | `www/` | SPA Nutrition + Workout |
| Backend | `lambda/` | HTTP API (Node.js 20) |
| Widget | `Scriptable/` | Widget iPhone (Scriptable) |

```
Browser / Scriptable
        │  JWT (Cognito)
        ▼
API Gateway HTTP API  ──►  Lambda commitfit-api  ──►  DynamoDB
        │                         │
        │                         └── Gemini (ước lượng macros)
        ▼
CloudFront + S3 (static site) ◄── Route 53 + ACM
```

---

## 1. IaC — dịch vụ AWS (Terraform)

State remote: S3 backend (`backend.tf`). Region chính: `ap-southeast-1` (ACM cho CloudFront bắt buộc `us-east-1`).

### 1.1 Static hosting & DNS

| Resource | File | Mô tả |
|----------|------|--------|
| **S3** `devopsminilab-site-storage` | `main.tf` | Lưu static site; **không public**; chỉ CloudFront đọc qua OAC |
| **CloudFront** | `main.tf` | CDN HTTPS, alias `devopsminilab.site`, `PriceClass_100` |
| **CloudFront Function** | `main.tf` + `www/cf-rewrite-index.js` | Rewrite `/workout` → `/workout/index.html` |
| **ACM** | `main.tf` | Cert `devopsminilab.site` + `*.devopsminilab.site` |
| **Route 53** | `main.tf` | Hosted zone + A alias → CloudFront |

### 1.2 Auth

| Resource | File | Mô tả |
|----------|------|--------|
| **Cognito User Pool** | `cognito.tf` | Đăng ký/đăng nhập bằng email, xác thực mã |
| **Cognito App Client** | `cognito.tf` | SPA client (`generate_secret = false`), SRP + password + refresh |

### 1.3 API & data

| Resource | File | Mô tả |
|----------|------|--------|
| **API Gateway HTTP API** | `apigateway.tf` | `commitfit-api`, CORS web + localhost |
| **JWT Authorizer** | `apigateway.tf` | Mọi route yêu cầu `Authorization: Bearer <IdToken>` |
| **Lambda** `commitfit-api` | `lambda.tf` | Node.js 20, zip từ `lambda/`, timeout 25s |
| **DynamoDB** `devopsminilab-commitfit` | `dynamodb.tf` | Single-table, PAY_PER_REQUEST |
| **IAM** | `lambda.tf` | Logs + DynamoDB Get/Put/Update/Delete/Query |
| **S3 object `config.js`** | `apigateway.tf` | Inject `COMMITFIT_API_BASE` + Cognito config vào frontend |

### 1.4 DynamoDB single-table

```
PK = USER#<cognitoSub>
SK =
  PROFILE              → mục tiêu calo/protein, workout prefs
  EX#<exerciseId>      → catalog bài tập
  N#<yyyy-mm-dd>#<id>  → bữa ăn
  PIN#<id>             → meal template đã pin
  W#<yyyy-mm-dd>       → workout ngày (flags + sets[])
```

### 1.5 Biến & deploy

```bash
# Biến nhạy cảm (Gemini)
export TF_VAR_gemini_api_key="..."
# optional: TF_VAR_gemini_model="gemini-2.0-flash-lite"

cd day14_miniproj
terraform init
terraform plan
terraform apply
```

Outputs hữu ích: `website_url`, `api_endpoint`, `cognito_*`, `route53_nameservers` (trỏ NS sang registrar).

---

## 2. Workflow phần mềm — `www/`

Frontend tĩnh (HTML/CSS/JS), phục vụ qua CloudFront.

### 2.1 Cấu trúc

| File | Nhiệm vụ |
|------|----------|
| `index.html` + `script.js` + `style.css` | Trang **Nutrition**: heatmap năm, log bữa ăn, AI estimate, pins |
| `workout/` | Trang **Workout**: catalog bài, sets theo ngày, flags (deload / stress / sleep) |
| `auth.js` | UI Sign in / Sign up / Confirm email / Sign out |
| `api.js` | Cognito + gọi API Gateway (Bearer JWT, refresh token) |
| `demo.js` | Demo/local helpers |
| `cf-rewrite-index.js` | Nguồn CloudFront Function (không upload lên S3 site) |
| `config.js` | **Sinh bởi Terraform** — không commit tay |

### 2.2 Luồng người dùng (web)

1. Mở `https://devopsminilab.site` → load `config.js` (API + Cognito).
2. **Sign up** → Cognito gửi mã email → **Confirm** → **Sign in**.
3. Token lưu `localStorage`; mọi request API gắn `Authorization: Bearer <IdToken>`.
4. **Nutrition**
   - Heatmap mức calo theo ngày trong năm.
   - Thêm / sửa / xóa bữa ăn theo ngày.
   - **Estimate**: mô tả món → `POST /nutrition/estimate` (Gemini) → điền form macros.
   - **Pin**: lưu template bữa ăn thường ăn → tái dùng nhanh.
5. **Workout** (`/workout`)
   - Catalog bài tập (default + custom).
   - Ghi sets theo ngày; flags deload / highStress / poorSleep.
6. Profile: mục tiêu calo / protein (header) sync qua `GET/PUT /profile`.

### 2.3 Dev local

CORS cho phép `http://localhost:3000`. Serve `www/` và đảm bảo có `config.js` (copy từ output Terraform hoặc serve sau `apply`).

---

## 3. Lambda — xử lý gì?

Entry: `lambda/index.js` → `handler` → `dispatch`.  
Runtime: Node.js 20 (AWS SDK v3 có sẵn); dependency bundling: `@google/genai`.

User id lấy từ JWT claim `sub` → `PK = USER#<sub>`.

### 3.1 API routes

| Method | Path | Xử lý |
|--------|------|--------|
| GET/PUT | `/profile` | Đọc/ghi mục tiêu (calo, protein, hardSetTarget, plateIncrement) |
| GET/POST | `/exercises` | List / thêm bài; lần đầu empty → materialize catalog mặc định |
| PUT/DELETE | `/exercises/{id}` | Sửa / xóa bài |
| GET | `/nutrition?from=&to=` | List bữa ăn theo khoảng ngày |
| POST | `/nutrition/{date}` | Thêm bữa ăn |
| PUT/DELETE | `/nutrition/{date}/{id}` | Sửa / xóa 1 bữa |
| DELETE | `/nutrition/{date}` | Xóa cả ngày |
| POST | `/nutrition/estimate` | Gemini ước lượng macros từ mô tả (schema `leanMealSchema.js`) |
| GET/POST | `/pins` | List / tạo meal pin |
| DELETE | `/pins/{id}` | Bỏ pin |
| GET | `/workouts?from=&to=` | List workout theo khoảng |
| GET/PUT/DELETE | `/workouts/{date}` | Chi tiết / ghi / xóa workout ngày |

### 3.2 Estimate (Gemini)

- Input: `description` (max 800 ký tự).
- Prompt: phân loại bữa, tên món, quy tắc nấu/gia vị, macros = tổng items.
- Env: `GEMINI_API_KEY`, `GEMINI_MODEL` (mặc định `gemini-2.0-flash-lite`).
- Không có key → estimate tắt / lỗi tùy triển khai trong code.

---

## 4. Scriptable — widget iPhone

File: `Scriptable/CommitFit.js`.

App [Scriptable](https://scriptable.app) trên iOS chạy script JS ngoài Safari — dùng làm **home-screen widget** gọi cùng Cognito + API như web.

### 4.1 Setup

1. Copy nội dung `CommitFit.js` vào app Scriptable.
2. Chỉnh `CONFIG` nếu cần (`apiBase`, `clientId`, `region`, `siteUrl` — khớp output Terraform).
3. Chạy script **một lần** → **Sign in** (cùng tài khoản web).
4. Token lưu **Keychain** (không phải localStorage).
5. Thêm widget Scriptable trên Home Screen → chọn script này.

### 4.2 Hành vi

| Chế độ | Việc làm |
|--------|----------|
| **Widget** (`runsInWidget`) | Refresh token nếu cần → `GET /profile` + `GET /nutrition` hôm nay → vẽ bar Calories / Protein vs goal |
| **App (tap script)** | Menu: Sign in / Preview today / Sign out |
| Tap widget | Mở `siteUrl` (web CommitFit) |

Widget **chỉ đọc** tiến độ dinh dưỡng trong ngày; ghi meal/workout vẫn trên web.

---

## 5. Cấu trúc thư mục

```
day14_miniproj/
├── *.tf                 # IaC
├── www/                 # Frontend static
│   ├── index.html
│   ├── script.js, api.js, auth.js, style.css
│   ├── workout/
│   └── cf-rewrite-index.js
├── lambda/              # API source (zip → Lambda)
│   ├── index.js
│   ├── leanMealSchema.js
│   └── package.json
├── Scriptable/
│   └── CommitFit.js     # iPhone widget
└── build/               # zip Lambda (sinh khi plan/apply)
```

---

## 6. Ghi chú vận hành

- Đổi code `www/` → `terraform apply` (S3 objects theo `etag`) + có thể cần invalidate CloudFront.
- Đổi `lambda/` → apply lại (zip + `source_code_hash`).
- Sau apply, cập nhật `CONFIG` trong Scriptable nếu `api_endpoint` / `clientId` đổi.
- Không commit `.env`, `GEMINI_API_KEY`, hay token người dùng.
