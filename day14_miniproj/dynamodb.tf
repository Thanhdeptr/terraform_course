#---------------------------------- DynamoDB: CommitFit single table ----------------------------------
# PK = USER#<userId>
# SK:
#   PROFILE
#   EX#<exerciseId>
#   N#<yyyy-mm-dd>#<ulid>     meal
#   W#<yyyy-mm-dd>            workout day (flags + sets[])

resource "aws_dynamodb_table" "commitfit" {
  name         = "devopsminilab-commitfit"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }
}
