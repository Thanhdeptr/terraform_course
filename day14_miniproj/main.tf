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