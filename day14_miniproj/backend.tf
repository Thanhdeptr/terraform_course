terraform {
  backend "s3" {
    bucket = "tech-tutorials-with-push-terraform-state"
    key    = "lessons/day14/terraform.tfstate"
    region = "ap-southeast-1"
  }
}