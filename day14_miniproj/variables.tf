
variable "aws_region" {
  type        = string
  description = "AWS region for resources"
  default     = "ap-southeast-1"
}

variable "environment" {
  type    = string
  default = "dev"
}

variable "bucket_prefix" {
  description = "Prefix for the S3 bucket name."
  type        = string
  default     = "my-static-website-"
}
