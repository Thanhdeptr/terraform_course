output "website_url" {
  description = "The URL of the static website"
  value       = "https://${aws_cloudfront_distribution.s3_distribution.domain_name}"
}

output "cloudfront_distribution_id" {
  description = "The ID of the CloudFront distribution"
  value       = aws_cloudfront_distribution.s3_distribution.id
}

output "s3_bucket_name" {
  description = "The name of the S3 bucket"
  value       = aws_s3_bucket.website.bucket
}

output "route53_nameservers" {
  description = "4 địa chỉ NameServer cần copy sang GoDaddy"
  value       = aws_route53_zone.primary.name_servers
}