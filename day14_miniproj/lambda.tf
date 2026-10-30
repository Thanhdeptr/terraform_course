data "archive_file" "commitfit_lambda" {
  type        = "zip"
  output_path = "${path.module}/build/commitfit-lambda.zip"

  source {
    content  = file("${path.module}/lambda/index.js")
    filename = "index.js"
  }
}

resource "aws_iam_role" "commitfit_lambda" {
  name = "commitfit-api-lambda"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "commitfit_lambda_logs" {
  role       = aws_iam_role.commitfit_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "commitfit_lambda_ddb" {
  name = "commitfit-api-dynamodb"
  role = aws_iam_role.commitfit_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query"
        ]
        Resource = aws_dynamodb_table.commitfit.arn
      }
    ]
  })
}

resource "aws_lambda_function" "commitfit" {
  function_name    = "commitfit-api"
  filename         = data.archive_file.commitfit_lambda.output_path
  source_code_hash = data.archive_file.commitfit_lambda.output_base64sha256
  role             = aws_iam_role.commitfit_lambda.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  timeout          = 10
  memory_size      = 256

  environment {
    variables = {
      TABLE_NAME = aws_dynamodb_table.commitfit.name
    }
  }
}

resource "aws_lambda_permission" "commitfit_apigw" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.commitfit.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.commitfit.execution_arn}/*/*"
}
