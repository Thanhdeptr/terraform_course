data "aws_vpc" "vpc_name" {
  filter {
    name   = "tag:Name"
    values = ["default"] # Khớp với tag Name của VPC trên AWS Console
  }
}

data "aws_subnet" "shared" {
  filter {
    name   = "tag:Name"
    values = ["subnetA"]
  }

  # Thuộc tính tùy chọn giúp tăng tính chính xác: đảm bảo Subnet thuộc đúng VPC trên
  vpc_id = data.aws_vpc.vpc_name.id
}

data "aws_ami" "linux2" {
  owners      = ["amazon"] # Chỉ lấy ảnh chính chủ từ Amazon
  most_recent = true       # Tự động chọn bản build có thời gian phát hành gần nhất

  filter {
    name   = "name"
    values = ["amzn2-ami-hvm-*-x86_64-gp2"] # Dùng regex (*) để quét bản phát hành mới nhất
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}