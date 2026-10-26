output "website_url" {
  description = "The URL of the static website"
  value       = "https://${local.domain_name}" #https://${aws_cloudfront_distribution.s3_distribution.domain_name} nếu ko có domain
}

output "cloudfront_distribution_id" {
  description = "The ID of the CloudFront distribution"
  value       = aws_cloudfront_distribution.s3_distribution.id
}


output "route53_nameservers" {
  description = "4 địa chỉ NameServer cần copy sang GoDaddy"
  value       = aws_route53_zone.primary.name_servers
}