# DEPRECATED: Images should now all be in univaf-server (see below).
resource "aws_ecr_repository" "server" {
  name                 = "appointment-server"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = false
  }
}

# DEPRECATED: Images should now all be in univaf-db-seed (see below).
resource "aws_ecr_repository" "seed" {
  name                 = "appointment-db-seed"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = false
  }
}

# DEPRECATED: Images should now all be in univaf-loader (see below).
resource "aws_ecr_repository" "loader" {
  name                 = "appointment-loader"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = false
  }
}

resource "aws_ecr_repository" "server_repository" {
  name                 = "univaf-server"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = false
  }
}

resource "aws_ecr_repository" "seed_repository" {
  name                 = "univaf-db-seed"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = false
  }
}

resource "aws_ecr_repository" "loader_repository" {
  name                 = "univaf-loader"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = false
  }
}
