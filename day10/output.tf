output "all_instance_ids" {
  description = "Danh sách toàn bộ ID của các EC2 instance đã tạo"
  value       = aws_instance.example[*].id
}

output "all_private_ips" {
  description = "Danh sách toàn bộ IP nội bộ của các EC2"
  value       = aws_instance.example[*].private_ip
}
#all_instance_ids is a list of all the instance IDs
#all_private_ips is a list of all the private IPs