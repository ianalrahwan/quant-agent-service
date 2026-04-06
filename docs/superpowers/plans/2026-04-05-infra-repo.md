# Infrastructure Repository Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the `quant-infra` repo with layered Terraform managing AWS infrastructure (VPC, ECS, RDS, Redis, ALB), GitHub OIDC CI/CD, branch protection as code, and Vercel env wiring — all from a blank AWS account.

**Architecture:** 6 Terraform root modules applied in dependency order (bootstrap → network → data → compute → cicd → vercel), each with isolated state in S3. GitHub Actions for plan-on-PR, apply-on-merge, and deploy-on-backend-merge. OIDC authentication with least-privilege IAM roles.

**Tech Stack:** Terraform 1.7+, AWS (ECS Fargate, RDS, ElastiCache, ALB, VPC, IAM, Secrets Manager, ECR), GitHub Actions, GitHub Terraform provider, Vercel Terraform provider

**New repo location:** `~/Documents/Projects/quant-infra`

---

## File Structure

```
quant-infra/
├── terraform/
│   ├── bootstrap/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   ├── outputs.tf
│   │   └── backend.tf
│   ├── network/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   ├── outputs.tf
│   │   └── backend.tf
│   ├── data/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   ├── outputs.tf
│   │   └── backend.tf
│   ├── compute/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   ├── outputs.tf
│   │   └── backend.tf
│   ├── cicd/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   ├── outputs.tf
│   │   └── backend.tf
│   └── vercel/
│       ├── main.tf
│       ├── variables.tf
│       └── backend.tf
├── .github/
│   └── workflows/
│       ├── terraform-plan.yml
│       ├── terraform-apply.yml
│       └── deploy-backend.yml
├── scripts/
│   └── bootstrap.sh
├── .gitignore
├── CLAUDE.md
└── README.md
```

---

### Task 1: Repository Initialization

**Files:**
- Create: `.gitignore`
- Create: `CLAUDE.md`
- Create: `README.md`

- [ ] **Step 1: Create the repo and initialize git**

```bash
mkdir -p ~/Documents/Projects/quant-infra
cd ~/Documents/Projects/quant-infra
git init -b main
```

- [ ] **Step 2: Create .gitignore**

`.gitignore`:
```gitignore
# Terraform
.terraform/
*.tfstate
*.tfstate.backup
*.tfplan
.terraform.lock.hcl
crash.log
override.tf
override.tf.json
*_override.tf
*_override.tf.json

# Secrets
*.tfvars
!*.tfvars.example

# OS
.DS_Store
```

- [ ] **Step 3: Create CLAUDE.md**

`CLAUDE.md`:
```markdown
# Quant Infra

## Project

Terraform infrastructure for the quant agent platform. Manages AWS (ECS, RDS, Redis, VPC), CI/CD (GitHub OIDC), and cross-platform wiring (Vercel env vars).

## Layer Order

bootstrap → network → data → compute → cicd → vercel

## Commands

- `cd terraform/<layer> && terraform init` — initialize a layer
- `cd terraform/<layer> && terraform plan` — preview changes
- `cd terraform/<layer> && terraform apply` — apply changes
- `bash scripts/bootstrap.sh` — one-time state backend setup

## Workflow

- All changes via PR to main
- `terraform-plan.yml` runs on PR, posts plan as comment
- `terraform-apply.yml` runs on merge to main, applies in order
- Never apply manually in production — always through CI
```

- [ ] **Step 4: Create README.md**

`README.md`:
```markdown
# quant-infra

Infrastructure as code for the quant agent platform.

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│   Vercel     │────▶│  AWS ECS Fargate  │────▶│  RDS + Redis │
│  (frontend)  │ SSE │   (backend API)   │     │  (pgvector)  │
└─────────────┘     └──────────────────┘     └─────────────┘
```

## Layers

| Layer | Purpose | State Key |
|-------|---------|-----------|
| bootstrap | S3 + DynamoDB for Terraform state | local → migrated |
| network | VPC, subnets, security groups | network/terraform.tfstate |
| data | RDS PostgreSQL, ElastiCache Redis | data/terraform.tfstate |
| compute | ECR, ECS, ALB | compute/terraform.tfstate |
| cicd | GitHub OIDC, IAM roles, branch protection | cicd/terraform.tfstate |
| vercel | Frontend env var wiring | vercel/terraform.tfstate |

## Getting Started

1. Configure AWS CLI: `aws configure`
2. Run bootstrap: `bash scripts/bootstrap.sh`
3. Apply layers in order: `cd terraform/<layer> && terraform init && terraform apply`
```

- [ ] **Step 5: Commit**

```bash
cd ~/Documents/Projects/quant-infra
git add .
git commit -m "chore: initialize quant-infra repo"
```

---

### Task 2: Bootstrap Layer

**Files:**
- Create: `terraform/bootstrap/main.tf`
- Create: `terraform/bootstrap/variables.tf`
- Create: `terraform/bootstrap/outputs.tf`
- Create: `terraform/bootstrap/backend.tf`
- Create: `scripts/bootstrap.sh`

- [ ] **Step 1: Create variables.tf**

`terraform/bootstrap/variables.tf`:
```hcl
variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project name used in resource naming"
  type        = string
  default     = "quant-infra"
}
```

- [ ] **Step 2: Create main.tf**

`terraform/bootstrap/main.tf`:
```hcl
terraform {
  required_version = ">= 1.7"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

data "aws_caller_identity" "current" {}

locals {
  account_id  = data.aws_caller_identity.current.account_id
  bucket_name = "${var.project_name}-tfstate-${local.account_id}"
}

# S3 bucket for Terraform state
resource "aws_s3_bucket" "tfstate" {
  bucket = local.bucket_name

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# DynamoDB table for state locking
resource "aws_dynamodb_table" "tflock" {
  name         = "${var.project_name}-tflock"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }
}
```

- [ ] **Step 3: Create outputs.tf**

`terraform/bootstrap/outputs.tf`:
```hcl
output "state_bucket_name" {
  description = "S3 bucket name for Terraform state"
  value       = aws_s3_bucket.tfstate.id
}

output "state_bucket_arn" {
  description = "S3 bucket ARN for Terraform state"
  value       = aws_s3_bucket.tfstate.arn
}

output "lock_table_name" {
  description = "DynamoDB table name for state locking"
  value       = aws_dynamodb_table.tflock.name
}

output "aws_account_id" {
  description = "AWS account ID"
  value       = local.account_id
}
```

- [ ] **Step 4: Create backend.tf (initially commented out)**

`terraform/bootstrap/backend.tf`:
```hcl
# Uncomment after first apply, then run: terraform init -migrate-state
#
# terraform {
#   backend "s3" {
#     bucket         = "quant-infra-tfstate-ACCOUNT_ID"
#     key            = "bootstrap/terraform.tfstate"
#     region         = "us-east-1"
#     dynamodb_table = "quant-infra-tflock"
#     encrypt        = true
#   }
# }
```

- [ ] **Step 5: Create bootstrap script**

`scripts/bootstrap.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOOTSTRAP_DIR="${SCRIPT_DIR}/../terraform/bootstrap"

echo "=== Quant Infra Bootstrap ==="
echo ""

# Step 1: Initialize with local state
echo "Step 1: Initializing Terraform (local state)..."
cd "${BOOTSTRAP_DIR}"
terraform init

# Step 2: Apply to create S3 + DynamoDB
echo ""
echo "Step 2: Creating state backend resources..."
terraform apply

# Step 3: Get the bucket name from outputs
BUCKET=$(terraform output -raw state_bucket_name)
ACCOUNT_ID=$(terraform output -raw aws_account_id)
echo ""
echo "State bucket: ${BUCKET}"
echo "Account ID: ${ACCOUNT_ID}"

# Step 4: Uncomment and configure backend
echo ""
echo "Step 3: Configuring S3 backend..."
cat > backend.tf << EOF
terraform {
  backend "s3" {
    bucket         = "${BUCKET}"
    key            = "bootstrap/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "quant-infra-tflock"
    encrypt        = true
  }
}
EOF

# Step 5: Migrate state
echo ""
echo "Step 4: Migrating state to S3..."
terraform init -migrate-state -force-copy

# Step 6: Clean up local state
echo ""
echo "Step 5: Cleaning up local state files..."
rm -f terraform.tfstate terraform.tfstate.backup

echo ""
echo "=== Bootstrap complete! ==="
echo "State bucket: ${BUCKET}"
echo "Lock table: quant-infra-tflock"
echo ""
echo "Use this in other layers' backend.tf:"
echo "  bucket         = \"${BUCKET}\""
echo "  dynamodb_table = \"quant-infra-tflock\""
```

- [ ] **Step 6: Make bootstrap script executable and validate**

```bash
cd ~/Documents/Projects/quant-infra
chmod +x scripts/bootstrap.sh
cd terraform/bootstrap
terraform init
terraform validate
```

Expected: `Success! The configuration is valid.`

- [ ] **Step 7: Commit**

```bash
cd ~/Documents/Projects/quant-infra
git add terraform/bootstrap/ scripts/bootstrap.sh
git commit -m "feat: add bootstrap layer (S3 state + DynamoDB lock)"
```

---

### Task 3: Network Layer

**Files:**
- Create: `terraform/network/main.tf`
- Create: `terraform/network/variables.tf`
- Create: `terraform/network/outputs.tf`
- Create: `terraform/network/backend.tf`

- [ ] **Step 1: Create backend.tf**

`terraform/network/backend.tf`:
```hcl
terraform {
  backend "s3" {
    bucket         = "PLACEHOLDER_BUCKET"
    key            = "network/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "quant-infra-tflock"
    encrypt        = true
  }
}
```

Note: `PLACEHOLDER_BUCKET` will be replaced with the actual bucket name after bootstrap runs. For now it validates structurally.

- [ ] **Step 2: Create variables.tf**

`terraform/network/variables.tf`:
```hcl
variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project name for resource naming"
  type        = string
  default     = "quant-agent"
}

variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
}
```

- [ ] **Step 3: Create main.tf**

`terraform/network/main.tf`:
```hcl
terraform {
  required_version = ">= 1.7"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  azs = slice(data.aws_availability_zones.available.names, 0, 2)
}

# ──────────────────────────────────────────────
# VPC
# ──────────────────────────────────────────────

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = { Name = "${var.project_name}-vpc" }
}

# ──────────────────────────────────────────────
# Subnets
# ──────────────────────────────────────────────

resource "aws_subnet" "public" {
  count                   = 2
  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, count.index + 1)
  availability_zone       = local.azs[count.index]
  map_public_ip_on_launch = true

  tags = { Name = "${var.project_name}-public-${local.azs[count.index]}" }
}

resource "aws_subnet" "private" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index + 10)
  availability_zone = local.azs[count.index]

  tags = { Name = "${var.project_name}-private-${local.azs[count.index]}" }
}

# ──────────────────────────────────────────────
# Internet Gateway + NAT Gateway
# ──────────────────────────────────────────────

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = { Name = "${var.project_name}-igw" }
}

resource "aws_eip" "nat" {
  domain = "vpc"

  tags = { Name = "${var.project_name}-nat-eip" }
}

resource "aws_nat_gateway" "main" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public[0].id

  tags = { Name = "${var.project_name}-nat" }

  depends_on = [aws_internet_gateway.main]
}

# ──────────────────────────────────────────────
# Route Tables
# ──────────────────────────────────────────────

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = { Name = "${var.project_name}-public-rt" }
}

resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main.id
  }

  tags = { Name = "${var.project_name}-private-rt" }
}

resource "aws_route_table_association" "private" {
  count          = 2
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

# ──────────────────────────────────────────────
# Security Groups
# ──────────────────────────────────────────────

resource "aws_security_group" "alb" {
  name_prefix = "${var.project_name}-alb-"
  vpc_id      = aws_vpc.main.id
  description = "ALB security group"

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project_name}-alb-sg" }
}

resource "aws_security_group" "ecs" {
  name_prefix = "${var.project_name}-ecs-"
  vpc_id      = aws_vpc.main.id
  description = "ECS tasks security group"

  ingress {
    from_port       = 8000
    to_port         = 8000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project_name}-ecs-sg" }
}

resource "aws_security_group" "rds" {
  name_prefix = "${var.project_name}-rds-"
  vpc_id      = aws_vpc.main.id
  description = "RDS security group"

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  tags = { Name = "${var.project_name}-rds-sg" }
}

resource "aws_security_group" "redis" {
  name_prefix = "${var.project_name}-redis-"
  vpc_id      = aws_vpc.main.id
  description = "Redis security group"

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  tags = { Name = "${var.project_name}-redis-sg" }
}
```

- [ ] **Step 4: Create outputs.tf**

`terraform/network/outputs.tf`:
```hcl
output "vpc_id" {
  value = aws_vpc.main.id
}

output "public_subnet_ids" {
  value = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  value = aws_subnet.private[*].id
}

output "alb_security_group_id" {
  value = aws_security_group.alb.id
}

output "ecs_security_group_id" {
  value = aws_security_group.ecs.id
}

output "rds_security_group_id" {
  value = aws_security_group.rds.id
}

output "redis_security_group_id" {
  value = aws_security_group.redis.id
}
```

- [ ] **Step 5: Validate**

```bash
cd ~/Documents/Projects/quant-infra/terraform/network
terraform init -backend=false
terraform validate
```

Expected: `Success! The configuration is valid.`

- [ ] **Step 6: Commit**

```bash
cd ~/Documents/Projects/quant-infra
git add terraform/network/
git commit -m "feat: add network layer (VPC, subnets, security groups)"
```

---

### Task 4: Data Layer

**Files:**
- Create: `terraform/data/main.tf`
- Create: `terraform/data/variables.tf`
- Create: `terraform/data/outputs.tf`
- Create: `terraform/data/backend.tf`

- [ ] **Step 1: Create backend.tf**

`terraform/data/backend.tf`:
```hcl
terraform {
  backend "s3" {
    bucket         = "PLACEHOLDER_BUCKET"
    key            = "data/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "quant-infra-tflock"
    encrypt        = true
  }
}
```

- [ ] **Step 2: Create variables.tf**

`terraform/data/variables.tf`:
```hcl
variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project name for resource naming"
  type        = string
  default     = "quant-agent"
}

variable "state_bucket" {
  description = "S3 bucket for Terraform remote state"
  type        = string
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t4g.micro"
}

variable "redis_node_type" {
  description = "ElastiCache node type"
  type        = string
  default     = "cache.t4g.micro"
}
```

- [ ] **Step 3: Create main.tf**

`terraform/data/main.tf`:
```hcl
terraform {
  required_version = ">= 1.7"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# ──────────────────────────────────────────────
# Remote State: Network Layer
# ──────────────────────────────────────────────

data "terraform_remote_state" "network" {
  backend = "s3"

  config = {
    bucket = var.state_bucket
    key    = "network/terraform.tfstate"
    region = var.aws_region
  }
}

locals {
  vpc_id              = data.terraform_remote_state.network.outputs.vpc_id
  private_subnet_ids  = data.terraform_remote_state.network.outputs.private_subnet_ids
  rds_sg_id           = data.terraform_remote_state.network.outputs.rds_security_group_id
  redis_sg_id         = data.terraform_remote_state.network.outputs.redis_security_group_id
}

# ──────────────────────────────────────────────
# RDS PostgreSQL + pgvector
# ──────────────────────────────────────────────

resource "aws_db_subnet_group" "main" {
  name       = "${var.project_name}-db-subnet"
  subnet_ids = local.private_subnet_ids

  tags = { Name = "${var.project_name}-db-subnet" }
}

resource "aws_db_parameter_group" "pgvector" {
  name   = "${var.project_name}-pg16-pgvector"
  family = "postgres16"

  parameter {
    name         = "shared_preload_libraries"
    value        = "vector"
    apply_method = "pending-reboot"
  }
}

resource "random_password" "db_password" {
  length  = 32
  special = false
}

resource "aws_secretsmanager_secret" "rds_credentials" {
  name = "${var.project_name}/rds-credentials"
}

resource "aws_secretsmanager_secret_version" "rds_credentials" {
  secret_id = aws_secretsmanager_secret.rds_credentials.id
  secret_string = jsonencode({
    username = "quantagent"
    password = random_password.db_password.result
  })
}

resource "aws_db_instance" "main" {
  identifier     = "${var.project_name}-db"
  engine         = "postgres"
  engine_version = "16"
  instance_class = var.db_instance_class

  allocated_storage = 20
  storage_type      = "gp3"

  db_name  = "quant_agent"
  username = "quantagent"
  password = random_password.db_password.result

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [local.rds_sg_id]
  parameter_group_name   = aws_db_parameter_group.pgvector.name

  backup_retention_period = 7
  skip_final_snapshot     = true
  multi_az                = false
  publicly_accessible     = false

  tags = { Name = "${var.project_name}-db" }
}

# ──────────────────────────────────────────────
# ElastiCache Redis
# ──────────────────────────────────────────────

resource "aws_elasticache_subnet_group" "main" {
  name       = "${var.project_name}-redis-subnet"
  subnet_ids = local.private_subnet_ids
}

resource "aws_elasticache_cluster" "main" {
  cluster_id           = "${var.project_name}-redis"
  engine               = "redis"
  engine_version       = "7.1"
  node_type            = var.redis_node_type
  num_cache_nodes      = 1
  parameter_group_name = "default.redis7"
  subnet_group_name    = aws_elasticache_subnet_group.main.name
  security_group_ids   = [local.redis_sg_id]

  tags = { Name = "${var.project_name}-redis" }
}

# ──────────────────────────────────────────────
# Secrets Manager: API Keys (placeholders)
# ──────────────────────────────────────────────

resource "aws_secretsmanager_secret" "anthropic_api_key" {
  name = "${var.project_name}/anthropic-api-key"
}

resource "aws_secretsmanager_secret_version" "anthropic_api_key" {
  secret_id     = aws_secretsmanager_secret.anthropic_api_key.id
  secret_string = "REPLACE_ME"
}

resource "aws_secretsmanager_secret" "voyage_api_key" {
  name = "${var.project_name}/voyage-api-key"
}

resource "aws_secretsmanager_secret_version" "voyage_api_key" {
  secret_id     = aws_secretsmanager_secret.voyage_api_key.id
  secret_string = "REPLACE_ME"
}
```

- [ ] **Step 4: Create outputs.tf**

`terraform/data/outputs.tf`:
```hcl
output "rds_endpoint" {
  value = aws_db_instance.main.endpoint
}

output "rds_address" {
  value = aws_db_instance.main.address
}

output "rds_port" {
  value = aws_db_instance.main.port
}

output "rds_db_name" {
  value = aws_db_instance.main.db_name
}

output "redis_endpoint" {
  value = aws_elasticache_cluster.main.cache_nodes[0].address
}

output "redis_port" {
  value = aws_elasticache_cluster.main.cache_nodes[0].port
}

output "rds_credentials_secret_arn" {
  value = aws_secretsmanager_secret.rds_credentials.arn
}

output "anthropic_api_key_secret_arn" {
  value = aws_secretsmanager_secret.anthropic_api_key.arn
}

output "voyage_api_key_secret_arn" {
  value = aws_secretsmanager_secret.voyage_api_key.arn
}
```

- [ ] **Step 5: Validate**

```bash
cd ~/Documents/Projects/quant-infra/terraform/data
terraform init -backend=false
terraform validate
```

Expected: `Success! The configuration is valid.`

- [ ] **Step 6: Commit**

```bash
cd ~/Documents/Projects/quant-infra
git add terraform/data/
git commit -m "feat: add data layer (RDS pgvector, ElastiCache Redis, Secrets Manager)"
```

---

### Task 5: Compute Layer

**Files:**
- Create: `terraform/compute/main.tf`
- Create: `terraform/compute/variables.tf`
- Create: `terraform/compute/outputs.tf`
- Create: `terraform/compute/backend.tf`

- [ ] **Step 1: Create backend.tf**

`terraform/compute/backend.tf`:
```hcl
terraform {
  backend "s3" {
    bucket         = "PLACEHOLDER_BUCKET"
    key            = "compute/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "quant-infra-tflock"
    encrypt        = true
  }
}
```

- [ ] **Step 2: Create variables.tf**

`terraform/compute/variables.tf`:
```hcl
variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project name for resource naming"
  type        = string
  default     = "quant-agent"
}

variable "state_bucket" {
  description = "S3 bucket for Terraform remote state"
  type        = string
}

variable "api_cpu" {
  description = "CPU units for API task (1024 = 1 vCPU)"
  type        = number
  default     = 512
}

variable "api_memory" {
  description = "Memory in MiB for API task"
  type        = number
  default     = 1024
}

variable "api_desired_count" {
  description = "Number of API tasks"
  type        = number
  default     = 2
}

variable "worker_schedule" {
  description = "EventBridge schedule expression for worker"
  type        = string
  default     = "rate(30 minutes)"
}
```

- [ ] **Step 3: Create main.tf**

`terraform/compute/main.tf`:
```hcl
terraform {
  required_version = ">= 1.7"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

data "aws_caller_identity" "current" {}

# ──────────────────────────────────────────────
# Remote State
# ──────────────────────────────────────────────

data "terraform_remote_state" "network" {
  backend = "s3"
  config = {
    bucket = var.state_bucket
    key    = "network/terraform.tfstate"
    region = var.aws_region
  }
}

data "terraform_remote_state" "data" {
  backend = "s3"
  config = {
    bucket = var.state_bucket
    key    = "data/terraform.tfstate"
    region = var.aws_region
  }
}

locals {
  account_id         = data.aws_caller_identity.current.account_id
  vpc_id             = data.terraform_remote_state.network.outputs.vpc_id
  public_subnet_ids  = data.terraform_remote_state.network.outputs.public_subnet_ids
  private_subnet_ids = data.terraform_remote_state.network.outputs.private_subnet_ids
  alb_sg_id          = data.terraform_remote_state.network.outputs.alb_security_group_id
  ecs_sg_id          = data.terraform_remote_state.network.outputs.ecs_security_group_id
  rds_endpoint       = data.terraform_remote_state.data.outputs.rds_endpoint
  rds_db_name        = data.terraform_remote_state.data.outputs.rds_db_name
  redis_endpoint     = data.terraform_remote_state.data.outputs.redis_endpoint
  redis_port         = data.terraform_remote_state.data.outputs.redis_port
  rds_secret_arn     = data.terraform_remote_state.data.outputs.rds_credentials_secret_arn
  anthropic_arn      = data.terraform_remote_state.data.outputs.anthropic_api_key_secret_arn
  voyage_arn         = data.terraform_remote_state.data.outputs.voyage_api_key_secret_arn
}

# ──────────────────────────────────────────────
# ECR
# ──────────────────────────────────────────────

resource "aws_ecr_repository" "backend" {
  name                 = "${var.project_name}-backend"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "backend" {
  repository = aws_ecr_repository.backend.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Expire untagged images after 7 days"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 7
        }
        action = { type = "expire" }
      },
      {
        rulePriority = 2
        description  = "Keep last 10 tagged images"
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = ["v", "sha-"]
          countType     = "imageCountMoreThan"
          countNumber   = 10
        }
        action = { type = "expire" }
      }
    ]
  })
}

# ──────────────────────────────────────────────
# CloudWatch Log Groups
# ──────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/${var.project_name}-api"
  retention_in_days = 30
}

resource "aws_cloudwatch_log_group" "worker" {
  name              = "/ecs/${var.project_name}-worker"
  retention_in_days = 30
}

# ──────────────────────────────────────────────
# ECS Cluster
# ──────────────────────────────────────────────

resource "aws_ecs_cluster" "main" {
  name = "${var.project_name}-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

# ──────────────────────────────────────────────
# IAM: ECS Task Execution Role
# ──────────────────────────────────────────────

resource "aws_iam_role" "ecs_execution" {
  name = "${var.project_name}-ecs-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_execution_base" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "ecs_execution_secrets" {
  name = "secrets-access"
  role = aws_iam_role.ecs_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = [local.rds_secret_arn, local.anthropic_arn, local.voyage_arn]
    }]
  })
}

# ──────────────────────────────────────────────
# IAM: ECS Task Role (for application code)
# ──────────────────────────────────────────────

resource "aws_iam_role" "ecs_task" {
  name = "${var.project_name}-ecs-task"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

# ──────────────────────────────────────────────
# ECS Task Definition: API
# ──────────────────────────────────────────────

resource "aws_ecs_task_definition" "api" {
  family                   = "${var.project_name}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.api_cpu
  memory                   = var.api_memory
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name  = "api"
    image = "${aws_ecr_repository.backend.repository_url}:latest"
    portMappings = [{ containerPort = 8000, protocol = "tcp" }]

    environment = [
      {
        name  = "DATABASE_URL"
        value = "postgresql+asyncpg://quantagent:PLACEHOLDER@${local.rds_endpoint}/${local.rds_db_name}"
      },
      {
        name  = "REDIS_URL"
        value = "redis://${local.redis_endpoint}:${local.redis_port}/0"
      },
    ]

    secrets = [
      {
        name      = "ANTHROPIC_API_KEY"
        valueFrom = local.anthropic_arn
      },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.api.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "api"
      }
    }
  }])
}

# ──────────────────────────────────────────────
# ALB
# ──────────────────────────────────────────────

resource "aws_lb" "main" {
  name               = "${var.project_name}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [local.alb_sg_id]
  subnets            = local.public_subnet_ids

  idle_timeout = 120

  tags = { Name = "${var.project_name}-alb" }
}

resource "aws_lb_target_group" "api" {
  name        = "${var.project_name}-api-tg"
  port        = 8000
  protocol    = "HTTP"
  vpc_id      = local.vpc_id
  target_type = "ip"

  health_check {
    path                = "/health"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
    matcher             = "200"
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

# ──────────────────────────────────────────────
# ECS Service: API
# ──────────────────────────────────────────────

resource "aws_ecs_service" "api" {
  name            = "${var.project_name}-api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = var.api_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets         = local.private_subnet_ids
    security_groups = [local.ecs_sg_id]
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 8000
  }

  depends_on = [aws_lb_listener.http]
}
```

- [ ] **Step 4: Create outputs.tf**

`terraform/compute/outputs.tf`:
```hcl
output "alb_dns_name" {
  value = aws_lb.main.dns_name
}

output "alb_arn" {
  value = aws_lb.main.arn
}

output "ecr_repository_url" {
  value = aws_ecr_repository.backend.repository_url
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "ecs_api_service_name" {
  value = aws_ecs_service.api.name
}
```

- [ ] **Step 5: Validate**

```bash
cd ~/Documents/Projects/quant-infra/terraform/compute
terraform init -backend=false
terraform validate
```

Expected: `Success! The configuration is valid.`

- [ ] **Step 6: Commit**

```bash
cd ~/Documents/Projects/quant-infra
git add terraform/compute/
git commit -m "feat: add compute layer (ECR, ECS Fargate, ALB)"
```

---

### Task 6: CI/CD Layer

**Files:**
- Create: `terraform/cicd/main.tf`
- Create: `terraform/cicd/variables.tf`
- Create: `terraform/cicd/outputs.tf`
- Create: `terraform/cicd/backend.tf`

- [ ] **Step 1: Create backend.tf**

`terraform/cicd/backend.tf`:
```hcl
terraform {
  backend "s3" {
    bucket         = "PLACEHOLDER_BUCKET"
    key            = "cicd/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "quant-infra-tflock"
    encrypt        = true
  }
}
```

- [ ] **Step 2: Create variables.tf**

`terraform/cicd/variables.tf`:
```hcl
variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project name for resource naming"
  type        = string
  default     = "quant-agent"
}

variable "state_bucket" {
  description = "S3 bucket for Terraform remote state"
  type        = string
}

variable "github_owner" {
  description = "GitHub username"
  type        = string
  default     = "ianalrahwan"
}

variable "github_token" {
  description = "GitHub personal access token for branch protection management"
  type        = string
  sensitive   = true
}

variable "repos" {
  description = "List of repo names to protect"
  type        = list(string)
  default     = ["quant-agent-service", "quant-agent-backend", "quant-infra"]
}
```

- [ ] **Step 3: Create main.tf**

`terraform/cicd/main.tf`:
```hcl
terraform {
  required_version = ">= 1.7"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    github = {
      source  = "integrations/github"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

provider "github" {
  owner = var.github_owner
  token = var.github_token
}

data "aws_caller_identity" "current" {}

data "terraform_remote_state" "compute" {
  backend = "s3"
  config = {
    bucket = var.state_bucket
    key    = "compute/terraform.tfstate"
    region = var.aws_region
  }
}

locals {
  account_id = data.aws_caller_identity.current.account_id
  ecr_url    = data.terraform_remote_state.compute.outputs.ecr_repository_url
}

# ──────────────────────────────────────────────
# GitHub OIDC Provider
# ──────────────────────────────────────────────

resource "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"

  client_id_list = ["sts.amazonaws.com"]

  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

# ──────────────────────────────────────────────
# IAM Role: Terraform Plan (read-only)
# ──────────────────────────────────────────────

resource "aws_iam_role" "terraform_plan" {
  name = "${var.project_name}-github-tf-plan"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = { Federated = aws_iam_openid_connect_provider.github.arn }
      Action = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        }
        StringLike = {
          "token.actions.githubusercontent.com:sub" = "repo:${var.github_owner}/quant-infra:pull_request"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "terraform_plan_readonly" {
  role       = aws_iam_role.terraform_plan.name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}

resource "aws_iam_role_policy" "terraform_plan_state" {
  name = "state-access"
  role = aws_iam_role.terraform_plan.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:ListBucket"]
        Resource = ["arn:aws:s3:::${var.state_bucket}", "arn:aws:s3:::${var.state_bucket}/*"]
      },
      {
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:DeleteItem"]
        Resource = "arn:aws:dynamodb:${var.aws_region}:${local.account_id}:table/quant-infra-tflock"
      }
    ]
  })
}

# ──────────────────────────────────────────────
# IAM Role: Terraform Apply (full access)
# ──────────────────────────────────────────────

resource "aws_iam_role" "terraform_apply" {
  name = "${var.project_name}-github-tf-apply"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = { Federated = aws_iam_openid_connect_provider.github.arn }
      Action = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          "token.actions.githubusercontent.com:sub" = "repo:${var.github_owner}/quant-infra:ref:refs/heads/main"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "terraform_apply_admin" {
  role       = aws_iam_role.terraform_apply.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}

# ──────────────────────────────────────────────
# IAM Role: Deploy Backend (ECR push + ECS update)
# ──────────────────────────────────────────────

resource "aws_iam_role" "deploy_backend" {
  name = "${var.project_name}-github-deploy"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = { Federated = aws_iam_openid_connect_provider.github.arn }
      Action = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          "token.actions.githubusercontent.com:sub" = "repo:${var.github_owner}/quant-agent-backend:ref:refs/heads/main"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "deploy_backend" {
  name = "deploy-permissions"
  role = aws_iam_role.deploy_backend.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken",
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "ecr:PutImage",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload",
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "ecs:UpdateService",
          "ecs:DescribeServices",
          "ecs:DescribeTaskDefinition",
          "ecs:RegisterTaskDefinition",
        ]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = "iam:PassRole"
        Resource = "*"
        Condition = {
          StringEquals = {
            "iam:PassedToService" = "ecs-tasks.amazonaws.com"
          }
        }
      }
    ]
  })
}

# ──────────────────────────────────────────────
# Branch Protection (all 3 repos)
# ──────────────────────────────────────────────

resource "github_branch_protection" "main" {
  for_each = toset(var.repos)

  repository_id = each.value
  pattern       = "main"

  required_pull_request_reviews {
    required_approving_review_count = 1
    dismiss_stale_reviews           = true
  }

  require_signed_commits  = true
  enforce_admins          = true
  allows_force_pushes     = false
  allows_deletions        = false
  require_linear_history  = true

  required_status_checks {
    strict = true
  }
}
```

- [ ] **Step 4: Create outputs.tf**

`terraform/cicd/outputs.tf`:
```hcl
output "oidc_provider_arn" {
  value = aws_iam_openid_connect_provider.github.arn
}

output "terraform_plan_role_arn" {
  value = aws_iam_role.terraform_plan.arn
}

output "terraform_apply_role_arn" {
  value = aws_iam_role.terraform_apply.arn
}

output "deploy_backend_role_arn" {
  value = aws_iam_role.deploy_backend.arn
}
```

- [ ] **Step 5: Validate**

```bash
cd ~/Documents/Projects/quant-infra/terraform/cicd
terraform init -backend=false
terraform validate
```

Expected: `Success! The configuration is valid.`

- [ ] **Step 6: Commit**

```bash
cd ~/Documents/Projects/quant-infra
git add terraform/cicd/
git commit -m "feat: add cicd layer (GitHub OIDC, IAM roles, branch protection)"
```

---

### Task 7: Vercel Layer

**Files:**
- Create: `terraform/vercel/main.tf`
- Create: `terraform/vercel/variables.tf`
- Create: `terraform/vercel/backend.tf`

- [ ] **Step 1: Create backend.tf**

`terraform/vercel/backend.tf`:
```hcl
terraform {
  backend "s3" {
    bucket         = "PLACEHOLDER_BUCKET"
    key            = "vercel/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "quant-infra-tflock"
    encrypt        = true
  }
}
```

- [ ] **Step 2: Create variables.tf**

`terraform/vercel/variables.tf`:
```hcl
variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "state_bucket" {
  description = "S3 bucket for Terraform remote state"
  type        = string
}

variable "vercel_api_token" {
  description = "Vercel API token"
  type        = string
  sensitive   = true
}

variable "vercel_project_id" {
  description = "Vercel project ID for quant-agent-service"
  type        = string
}
```

- [ ] **Step 3: Create main.tf**

`terraform/vercel/main.tf`:
```hcl
terraform {
  required_version = ">= 1.7"

  required_providers {
    vercel = {
      source  = "vercel/vercel"
      version = "~> 2.0"
    }
  }
}

provider "vercel" {
  api_token = var.vercel_api_token
}

data "terraform_remote_state" "compute" {
  backend = "s3"
  config = {
    bucket = var.state_bucket
    key    = "compute/terraform.tfstate"
    region = var.aws_region
  }
}

locals {
  backend_url = "http://${data.terraform_remote_state.compute.outputs.alb_dns_name}"
}

resource "vercel_project_environment_variable" "backend_url" {
  project_id = var.vercel_project_id
  key        = "NEXT_PUBLIC_AGENT_BACKEND_URL"
  value      = local.backend_url
  target     = ["production"]
}
```

- [ ] **Step 4: Validate**

```bash
cd ~/Documents/Projects/quant-infra/terraform/vercel
terraform init -backend=false
terraform validate
```

Expected: `Success! The configuration is valid.`

- [ ] **Step 5: Commit**

```bash
cd ~/Documents/Projects/quant-infra
git add terraform/vercel/
git commit -m "feat: add vercel layer (frontend env var wiring)"
```

---

### Task 8: GitHub Actions Workflows

**Files:**
- Create: `.github/workflows/terraform-plan.yml`
- Create: `.github/workflows/terraform-apply.yml`
- Create: `.github/workflows/deploy-backend.yml`

- [ ] **Step 1: Create terraform-plan.yml**

`.github/workflows/terraform-plan.yml`:
```yaml
name: Terraform Plan

on:
  pull_request:
    branches: [main]

permissions:
  id-token: write
  contents: read
  pull-requests: write

env:
  AWS_REGION: us-east-1
  TF_VERSION: "1.7.0"

jobs:
  plan:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        layer: [network, data, compute, cicd, vercel]
      fail-fast: false

    steps:
      - uses: actions/checkout@v4

      - uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: ${{ env.TF_VERSION }}

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.TF_PLAN_ROLE_ARN }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Terraform Init
        working-directory: terraform/${{ matrix.layer }}
        run: terraform init

      - name: Terraform Plan
        id: plan
        working-directory: terraform/${{ matrix.layer }}
        run: terraform plan -no-color -out=plan.tfplan
        continue-on-error: true

      - name: Comment PR with plan
        uses: actions/github-script@v7
        with:
          script: |
            const output = `#### Layer: \`${{ matrix.layer }}\` ${{ steps.plan.outcome == 'success' && '✅' || '❌' }}

            <details><summary>Plan Output</summary>

            \`\`\`
            ${{ steps.plan.outputs.stdout }}
            \`\`\`

            </details>`;

            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: output
            });

      - name: Fail if plan failed
        if: steps.plan.outcome == 'failure'
        run: exit 1
```

- [ ] **Step 2: Create terraform-apply.yml**

`.github/workflows/terraform-apply.yml`:
```yaml
name: Terraform Apply

on:
  push:
    branches: [main]
    paths:
      - "terraform/**"

permissions:
  id-token: write
  contents: read

env:
  AWS_REGION: us-east-1
  TF_VERSION: "1.7.0"

jobs:
  apply:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: ${{ env.TF_VERSION }}

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.TF_APPLY_ROLE_ARN }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Apply Network
        working-directory: terraform/network
        run: |
          terraform init
          terraform apply -auto-approve

      - name: Apply Data
        working-directory: terraform/data
        run: |
          terraform init
          terraform apply -auto-approve

      - name: Apply Compute
        working-directory: terraform/compute
        run: |
          terraform init
          terraform apply -auto-approve

      - name: Apply CICD
        working-directory: terraform/cicd
        run: |
          terraform init
          terraform apply -auto-approve

      - name: Apply Vercel
        working-directory: terraform/vercel
        run: |
          terraform init
          terraform apply -auto-approve
```

- [ ] **Step 3: Create deploy-backend.yml**

`.github/workflows/deploy-backend.yml`:
```yaml
name: Deploy Backend

on:
  workflow_dispatch:
    inputs:
      ref:
        description: "Git ref to deploy"
        required: false
        default: "main"

permissions:
  id-token: write
  contents: read

env:
  AWS_REGION: us-east-1

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout backend repo
        uses: actions/checkout@v4
        with:
          repository: ianalrahwan/quant-agent-backend
          ref: ${{ github.event.inputs.ref || 'main' }}

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.DEPLOY_ROLE_ARN }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Login to ECR
        id: ecr
        uses: aws-actions/amazon-ecr-login@v2

      - name: Build and push Docker image
        env:
          ECR_REGISTRY: ${{ steps.ecr.outputs.registry }}
          ECR_REPOSITORY: quant-agent-backend
          IMAGE_TAG: sha-${{ github.sha }}
        run: |
          docker build -t $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG .
          docker tag $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG $ECR_REGISTRY/$ECR_REPOSITORY:latest
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:latest

      - name: Update ECS service
        run: |
          aws ecs update-service \
            --cluster quant-agent-cluster \
            --service quant-agent-api \
            --force-new-deployment

      - name: Wait for service stability
        run: |
          aws ecs wait services-stable \
            --cluster quant-agent-cluster \
            --services quant-agent-api
```

- [ ] **Step 4: Commit**

```bash
cd ~/Documents/Projects/quant-infra
mkdir -p .github/workflows
git add .github/workflows/
git commit -m "feat: add GitHub Actions workflows (plan, apply, deploy)"
```

---

### Task 9: Backend Deploy Workflow

**Files:**
- Create: `.github/workflows/deploy.yml` in `~/Documents/Projects/quant-agent-backend`

This workflow lives in the backend repo and runs on merge to main.

- [ ] **Step 1: Create deploy.yml in backend repo**

`~/Documents/Projects/quant-agent-backend/.github/workflows/deploy.yml`:
```yaml
name: Deploy

on:
  push:
    branches: [main]

permissions:
  id-token: write
  contents: read

env:
  AWS_REGION: us-east-1
  ECR_REPOSITORY: quant-agent-backend
  ECS_CLUSTER: quant-agent-cluster
  ECS_SERVICE: quant-agent-api

jobs:
  test:
    uses: ./.github/workflows/ci.yml

  deploy:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'

    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.DEPLOY_ROLE_ARN }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Login to ECR
        id: ecr
        uses: aws-actions/amazon-ecr-login@v2

      - name: Build and push Docker image
        env:
          ECR_REGISTRY: ${{ steps.ecr.outputs.registry }}
          IMAGE_TAG: sha-${{ github.sha }}
        run: |
          docker build -t $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG .
          docker tag $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG $ECR_REGISTRY/$ECR_REPOSITORY:latest
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:latest

      - name: Update ECS service
        run: |
          aws ecs update-service \
            --cluster $ECS_CLUSTER \
            --service $ECS_SERVICE \
            --force-new-deployment

      - name: Wait for service stability
        run: |
          aws ecs wait services-stable \
            --cluster $ECS_CLUSTER \
            --services $ECS_SERVICE
```

- [ ] **Step 2: Update backend CI workflow to be reusable**

The existing `ci.yml` in the backend repo needs `workflow_call` added to its triggers so the deploy workflow can reference it:

Add to the `on:` block in `~/Documents/Projects/quant-agent-backend/.github/workflows/ci.yml`:
```yaml
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  workflow_call:
```

- [ ] **Step 3: Commit in backend repo**

```bash
cd ~/Documents/Projects/quant-agent-backend
git add .github/workflows/deploy.yml .github/workflows/ci.yml
git commit -m "feat: add deploy workflow (ECR push + ECS update via OIDC)"
```

---

### Task 10: Verification

- [ ] **Step 1: Validate all Terraform layers**

```bash
cd ~/Documents/Projects/quant-infra
for layer in bootstrap network data compute cicd vercel; do
  echo "=== Validating ${layer} ==="
  cd terraform/${layer}
  terraform init -backend=false 2>/dev/null
  terraform validate
  cd ../..
done
```

Expected: All layers show `Success! The configuration is valid.`

- [ ] **Step 2: Verify git log for infra repo**

```bash
cd ~/Documents/Projects/quant-infra
git log --oneline
```

- [ ] **Step 3: Verify backend repo deploy workflow**

```bash
cd ~/Documents/Projects/quant-agent-backend
git log --oneline | head -5
```
