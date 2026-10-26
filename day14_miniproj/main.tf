#---------------------------------- s3 bucket ----------------------------------
resource "aws_s3_bucket" "static_site" {
  bucket = "devopsminilab-site-storage"
}

# Chặn hoàn toàn truy cập Public từ Internet
resource "aws_s3_bucket_public_access_block" "block" {
  bucket = aws_s3_bucket.static_site.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

#thêm file vào bucket
resource "aws_s3_object" "site_files" {
  for_each = fileset("${path.module}/www", "**")

  bucket = aws_s3_bucket.static_site.id
  key    = each.value
  source = "${path.module}/www/${each.value}"
  etag   = filemd5("${path.module}/www/${each.value}")

  content_type = endswith(each.value, ".html") ? "text/html" : (
    endswith(each.value, ".css") ? "text/css" : (
      endswith(each.value, ".js") ? "application/javascript" : "application/octet-stream"
    )
  )
}


#hosted zone cho doamin ouput
resource "aws_route53_zone" "primary" {
  name = "devopsminilab.site"
}

#---------------------------------- ssl certificate ----------------------------------


# tạo yêu cầu cấp chứng chỉ SSL từ AWS ACM
resource "aws_acm_certificate" "site_cert" {
  provider          = aws.us_east_1  # CloudFront bắt buộc SSL phải nằm ở us-east-1
  domain_name       = "devopsminilab.site"
  validation_method = "DNS"

  subject_alternative_names = ["*.devopsminilab.site"]

  lifecycle {
    create_before_destroy = true
  }
}

# Tạo bản ghi CNAME trên Route 53 để chứng minh bạn sở hữu tên miền
resource "aws_route53_record" "cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.site_cert.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = aws_route53_zone.primary.zone_id
}

# Đợi Route 53 và ACM xác thực thành công chứng chỉ
resource "aws_acm_certificate_validation" "cert_wait" {
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.site_cert.arn
  validation_record_fqdns = [for record in aws_route53_record.cert_validation : record.fqdn]
}

#----------------------------------OAC & cloudfront distribution ----------------------------------
resource "aws_cloudfront_origin_access_control" "oac" {
  name                              = "oac-devopsminilab-site"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "s3_distribution" {
  enabled             = true
  default_root_object = "index.html"
  price_class         = "PriceClass_100"
  aliases             = ["devopsminilab.site"] # Gắn domain riêng vào CloudFront

  origin {
    domain_name              = aws_s3_bucket.static_site.bucket_regional_domain_name
    origin_id                = "S3-devopsminilab-site"
    origin_access_control_id = aws_cloudfront_origin_access_control.oac.id
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-devopsminilab-site"
    viewer_protocol_policy = "redirect-to-https" # Tự động chuyển HTTP thành HTTPS

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 3600
    max_ttl     = 86400
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  # Sử dụng chứng chỉ ACM đã được xác thực ở bước trên
  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.cert_wait.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}

#----------------------------------S3 BUCKET POLICY(FOR OAC) ----------------------------------

resource "aws_s3_bucket_policy" "allow_cloudfront" {
  bucket = aws_s3_bucket.static_site.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowCloudFrontReadOnly"
        Effect    = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.static_site.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.s3_distribution.arn
          }
        }
      }
    ]
  })
}

#----------------------------------route 53 record ----------------------------------

resource "aws_route53_record" "apex_domain" {
  zone_id = aws_route53_zone.primary.zone_id
  name    = "devopsminilab.site"
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.s3_distribution.domain_name
    zone_id                = aws_cloudfront_distribution.s3_distribution.hosted_zone_id
    evaluate_target_health = false
  }
}