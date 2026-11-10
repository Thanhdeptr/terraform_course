locals {
  api_routes = [
    "GET /profile",
    "PUT /profile",
    "GET /exercises",
    "POST /exercises",
    "PUT /exercises/{id}",
    "DELETE /exercises/{id}",
    "GET /nutrition",
    "POST /nutrition/estimate",
    "POST /nutrition/{date}",
    "PUT /nutrition/{date}/{id}",
    "DELETE /nutrition/{date}",
    "DELETE /nutrition/{date}/{id}",
    "GET /pins",
    "POST /pins",
    "DELETE /pins/{id}",
    "GET /workouts",
    "GET /workouts/{date}",
    "PUT /workouts/{date}",
    "DELETE /workouts/{date}"
  ]
}

resource "aws_apigatewayv2_api" "commitfit" {
  name          = "commitfit-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = ["https://devopsminilab.site", "http://localhost:3000"]
    allow_methods = ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    allow_headers = ["content-type", "authorization", "x-api-key"]
    max_age       = 300
  }
}

resource "aws_apigatewayv2_integration" "commitfit" {
  api_id                 = aws_apigatewayv2_api.commitfit.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.commitfit.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "commitfit" {
  for_each = toset(local.api_routes)

  api_id    = aws_apigatewayv2_api.commitfit.id
  route_key = each.value
  target    = "integrations/${aws_apigatewayv2_integration.commitfit.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_apigatewayv2_stage" "commitfit_default" {
  api_id      = aws_apigatewayv2_api.commitfit.id
  name        = "$default"
  auto_deploy = true
}

resource "aws_s3_object" "api_config" {
  bucket = aws_s3_bucket.static_site.id
  key    = "config.js"
  content = <<-EOF
    window.COMMITFIT_API_BASE = "${aws_apigatewayv2_api.commitfit.api_endpoint}";
    window.COMMITFIT_COGNITO = {
      region: "${var.aws_region}",
      userPoolId: "${aws_cognito_user_pool.commitfit.id}",
      clientId: "${aws_cognito_user_pool_client.commitfit_web.id}"
    };
  EOF
  content_type = "application/javascript"
  etag = md5(join("", [
    aws_apigatewayv2_api.commitfit.api_endpoint,
    var.aws_region,
    aws_cognito_user_pool.commitfit.id,
    aws_cognito_user_pool_client.commitfit_web.id
  ]))
  cache_control = "max-age=60"
}

resource "aws_apigatewayv2_authorizer" "cognito" {
  api_id           = aws_apigatewayv2_api.commitfit.id
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  name             = "cognito-jwt-authorizer"

  jwt_configuration {
    audience = [aws_cognito_user_pool_client.commitfit_web.id]
    issuer   = "https://${aws_cognito_user_pool.commitfit.endpoint}"
  }
}