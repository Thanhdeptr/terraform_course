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

resource "aws_vpc" "example" {
    cidr_block = "10.0.0.0/16"
}

resoucre "aws_s3_bucket" "name" {
    bucket = "my-bucket"
}