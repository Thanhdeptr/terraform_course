resource "aws_security_group" "web_sg" {
  name        = "web-dynamic-sg"
  description = "Security group using dynamic blocks"

 # dynamic blocks are used to create a dynamic number of ingress rules
  dynamic "ingress" {
    for_each = var.ingress_rules
    content {
      from_port   = ingress.value.from_port
      to_port     = ingress.value.to_port
      protocol    = ingress.value.protocol
      cidr_blocks = ingress.value.cidr_blocks
    }
  }
}


resource "aws_instance" "example" {
  ami           = "ami-0c55b159cbfafe1f0"

  # condition expression instead of hardcoding
  instance_type = var.environment == "dev" ? "t2.micro" : "t3.micro"

  tags = {
    Environment = var.environment
  }
}

#splat expression is used to create a list of resources
resource "aws_instance" "example" {
  count = 2
  ami           = "ami-0c55b159cbfafe1f0"
  instance_type = "t2.micro"
  tags = {
    Environment = var.environment
  }
}