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