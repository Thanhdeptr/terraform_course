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