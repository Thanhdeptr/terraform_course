terraform {
  backend "s3" {
    bucket = "my-terraform-state-bucket-piyushsachdeva"
    key    = "lessons/day14/terraform.tfstate"
    region = var.aws_region
  }
}