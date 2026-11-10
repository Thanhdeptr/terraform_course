resource "aws_cognito_user_pool" "commitfit" {
  name = "commitfit-user-pool"

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_numbers   = true
    require_symbols   = false
    require_uppercase = false
  }

  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
    email_subject        = "Mã xác thực tài khoản CommitFit"
    email_message        = "Mã xác thực của bạn là: {####}"
  }
}

resource "aws_cognito_user_pool_client" "commitfit_web" {
  name         = "commitfit-web-client"
  user_pool_id = aws_cognito_user_pool.commitfit.id

  # SPA Web bắt buộc = false để không lộ mật mã ứng dụng
  generate_secret = false

  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH"
  ]

  prevent_user_existence_errors = "ENABLED"
  read_attributes               = ["email", "name"]
  write_attributes              = ["email", "name"]
}