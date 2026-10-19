variable "environment" {
  type        = string
  description = "The environment type"
  default     = "staging"
}

variable "aws_region" {
  type        = string
  description = "AWS region for resources"
  default     = "ap-southeast-1"
}

variable "enable_versioning" {
  type        = bool
  description = "Enable versioning for S3 buckets"
  default     = true
}