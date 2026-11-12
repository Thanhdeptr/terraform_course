
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

variable "gemini_api_key" {
  description = "Google AI Studio API key for meal macro estimates (leave empty to disable estimate)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "gemini_model" {
  description = "Gemini model id for nutrition estimate (override if AI Studio shows a different free Lite id)"
  type        = string
  default     = "gemini-2.0-flash-lite"
}
