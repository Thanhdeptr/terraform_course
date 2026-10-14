terraform {
    required_providers {
        aws = {
            source = "hashicorp/aws"
            version = "~> 6.0"
        }
    }
}
provider "aws" {
    region = "ap-south-1"
}

resource "aws_s3_bucket" "first_bucket" {
    bucket = "day03-bucket-14102026"
    tags ={
        Name = "day03-bucket-14102026"
        Environment = "dev"
    }
}