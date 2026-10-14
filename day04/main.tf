terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  backend "s3" {
    bucket       = "tech-tutorials-with-push-terraform-state" # Tên bucket đã tạo trước
    key          = "dev/terraform.tfstate"                    # Đường dẫn phân tách theo thư mục môi trường
    region       = "ap-south-1"
    encrypt      = true                                       # Bật mã hóa file state trên S3
    use_lockfile = true                                       # Bật cơ chế khóa state file
  }
}