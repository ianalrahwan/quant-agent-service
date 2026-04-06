# Infrastructure Repository — Design Spec

**Date:** 2026-04-05
**Status:** Draft

---

## 1. Overview

A dedicated `quant-infra` repository that manages all AWS infrastructure, CI/CD pipelines, and GitHub branch protection via Terraform. Deploys the `quant-agent-backend` to ECS Fargate and wires the Vercel frontend to the backend via environment variable.

Designed as a portfolio piece showcasing: Terraform layered architecture, self-managed state backend (S3 + DynamoDB bootstrap), GitHub OIDC authentication (no long-lived keys), least-privilege IAM roles, policy-as-code branch protection, and automated deploy pipelines.

### Architecture Decisions

- **Separate repo** (`quant-infra`) — infrastructure is its own concern, not embedded in application repos
- **Layered Terraform** — 6 root modules with isolated state, applied in dependency order
- **S3 + DynamoDB state backend** bootstrapped by Terraform itself
- **GitHub OIDC → AWS** — no static credentials, short-lived tokens only
- **Branch protection as code** — all 3 repos protected via Terraform GitHub provider
- **Personal GitHub account** (`ianalrahwan`) — all repos under personal account

---

## 2. Repo Structure

```
quant-infra/
├── terraform/
│   ├── bootstrap/           # S3 state bucket + DynamoDB lock table
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   ├── outputs.tf
│   │   └── backend.tf      # Initially commented out, uncommented after first apply
│   ├── network/             # VPC, subnets, IGW, NAT, security groups
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   ├── outputs.tf
│   │   └── backend.tf
│   ├── data/                # RDS PostgreSQL + pgvector, ElastiCache Redis, Secrets Manager
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   ├── outputs.tf
│   │   └── backend.tf
│   ├── compute/             # ECR, ECS Fargate, ALB, task definitions, services
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   ├── outputs.tf
│   │   └── backend.tf
│   ├── cicd/                # GitHub OIDC, IAM roles, branch protection
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   ├── outputs.tf
│   │   └── backend.tf
│   └── vercel/              # Vercel env var wiring
│       ├── main.tf
│       ├── variables.tf
│       └── backend.tf
├── .github/
│   └── workflows/
│       ├── terraform-plan.yml    # PR: plan all layers, comment diff
│       ├── terraform-apply.yml   # Merge to main: apply in order
│       └── deploy-backend.yml    # Build + push Docker, update ECS
├── scripts/
│   └── bootstrap.sh             # One-time bootstrap automation
├── .gitignore
├── CLAUDE.md
└── README.md
```

**Layer dependency order:**
```
bootstrap → network → data → compute → cicd → vercel
```

Cross-layer references via `terraform_remote_state` data sources, all pointing at the same S3 backend with different state keys.

---

## 3. Bootstrap Layer

Solves the chicken-and-egg problem: Terraform needs a state backend, but the backend is itself infrastructure.

**Resources:**
- S3 bucket (`quant-infra-tfstate-{account_id}`) — versioning enabled, AES256 encryption, public access blocked
- DynamoDB table (`quant-infra-tflock`) — partition key `LockID`, used for state locking
- Bucket policy restricting access to the owning AWS account

**Bootstrap flow (automated by `scripts/bootstrap.sh`):**
1. `cd terraform/bootstrap && terraform init` (local state)
2. `terraform apply` (creates S3 + DynamoDB)
3. Uncomment the `backend "s3"` block in `backend.tf`
4. `terraform init -migrate-state` (migrates local → S3)
5. Delete local `terraform.tfstate`

**All subsequent layers** use:
```hcl
terraform {
  backend "s3" {
    bucket         = "quant-infra-tfstate-ACCOUNT_ID"
    key            = "<layer>/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "quant-infra-tflock"
    encrypt        = true
  }
}
```

---

## 4. Network Layer

**Resources:**
- VPC: `10.0.0.0/16`
- 2 public subnets: `10.0.1.0/24`, `10.0.2.0/24` (across 2 AZs, for ALB)
- 2 private subnets: `10.0.10.0/24`, `10.0.11.0/24` (across 2 AZs, for ECS/RDS/Redis)
- Internet Gateway (attached to VPC, route from public subnets)
- NAT Gateway (1, single AZ — cost-conscious; private subnets route outbound through it)
- Route tables: public → IGW, private → NAT

**Security Groups:**

| Name | Inbound | Outbound | Purpose |
|------|---------|----------|---------|
| `alb-sg` | 80/443 from `0.0.0.0/0` | 8000 to `ecs-sg` | ALB |
| `ecs-sg` | 8000 from `alb-sg` | All (API calls, DB, Redis) | ECS tasks |
| `rds-sg` | 5432 from `ecs-sg` | None | PostgreSQL |
| `redis-sg` | 6379 from `ecs-sg` | None | Redis |

**Why 2 AZs:** Minimum for HA. RDS and ECS spread across both. 3 AZs adds cost with no portfolio benefit.

---

## 5. Data Layer

**RDS PostgreSQL:**
- Engine: PostgreSQL 16
- Instance: `db.t4g.micro` (free tier eligible)
- Storage: 20GB gp3
- pgvector extension enabled via parameter group (`shared_preload_libraries = 'vector'`)
- Private subnets, `rds-sg` security group
- DB subnet group spanning both private subnets
- Automated backups: 7-day retention
- No Multi-AZ (cost)
- Master credentials: auto-generated by Terraform, stored in Secrets Manager

**ElastiCache Redis:**
- Engine: Redis 7
- Node type: `cache.t4g.micro`
- 1 node, no replication (cost)
- Private subnets, `redis-sg` security group
- Subnet group spanning both private subnets

**Secrets Manager:**
- `quant-agent/rds-credentials` — RDS master username + password (auto-generated)
- `quant-agent/anthropic-api-key` — placeholder, manually filled after apply
- `quant-agent/voyage-api-key` — placeholder, manually filled after apply

**Outputs:** RDS endpoint, Redis endpoint, security group IDs, Secrets Manager ARNs.

---

## 6. Compute Layer

**ECR:**
- Repository: `quant-agent-backend`
- Lifecycle policy: keep last 10 tagged images, expire untagged after 7 days
- Image scanning on push enabled

**ECS Cluster:**
- Fargate capacity provider
- CloudWatch Container Insights enabled

**API Service:**
- Task definition: 0.5 vCPU, 1GB RAM
- Container: image from ECR, port 8000
- Environment from Secrets Manager via `secrets` block: `DATABASE_URL`, `REDIS_URL`, `ANTHROPIC_API_KEY`
- Service: desired count 2, spread across 2 AZs
- Health check: `GET /health` on port 8000
- CloudWatch log group: `/ecs/quant-agent-api`

**Worker Service (scheduled):**
- Separate task definition: 0.5 vCPU, 1GB RAM, same image
- EventBridge rule: triggers on schedule (configurable, default every 30 min)
- Command override for discovery graph entry point
- Not always-on — runs and exits

**ALB:**
- Application Load Balancer in public subnets, `alb-sg`
- HTTP listener (port 80) initially; HTTPS (443) with ACM cert when domain is configured
- Target group: port 8000, health check `/health` every 30s
- Idle timeout: 120s (SSE streams need long connections)
- Stickiness disabled (SSE connections are per-request)

**Outputs:** ALB DNS name, ECR repository URL, ECS cluster name, API service name.

---

## 7. CI/CD Layer

### GitHub OIDC Provider

IAM OIDC identity provider trusting `token.actions.githubusercontent.com`. Enables GitHub Actions to assume AWS roles without static credentials.

### IAM Roles (Least Privilege)

| Role | Trusted By | Can Do |
|------|-----------|--------|
| `github-terraform-plan` | OIDC, PRs to `quant-infra` | Read S3 state, read DynamoDB, all `Describe`/`List` actions. Plan only, cannot apply. |
| `github-terraform-apply` | OIDC, `main` branch of `quant-infra` only | Full infra management (VPC, ECS, RDS, IAM, etc.) |
| `github-deploy-backend` | OIDC, `main` branch of `quant-agent-backend` only | ECR `GetAuthorizationToken` + `BatchCheckLayerAvailability` + `PutImage`, ECS `UpdateService` + `DescribeServices`. Deploy only, cannot modify infra. |

IAM trust policies use `sub` claim conditions to restrict which repo + branch can assume each role.

### Branch Protection (Terraform GitHub Provider)

Applied to all 3 repos:

| Setting | Value |
|---------|-------|
| Protected branch | `main` |
| Require PR | Yes |
| Required approvals | 1 (you) |
| Required status checks | CI must pass |
| Dismiss stale approvals | Yes |
| Force pushes | Blocked |
| Deletions | Blocked |
| Linear history | Squash merge only |
| Signed commits | Required |

Configured via `github_branch_protection_v3` resource with the GitHub Terraform provider.

---

## 8. Vercel Layer

Minimal cross-platform wiring.

**Resources:**
- `vercel_project_environment_variable` on `quant-agent-service`
- Sets `NEXT_PUBLIC_AGENT_BACKEND_URL` to `http://{ALB DNS name}` (read from compute layer remote state)
- Target: production environment

**Authentication:**
- Vercel API token stored as Terraform variable (sensitive)
- Vercel project ID and team ID (if applicable) as variables

**Does not manage:** Vercel project creation, domains, build config.

---

## 9. GitHub Actions Workflows

### `terraform-plan.yml` (on PR)

```
trigger: pull_request to main on quant-infra
steps:
  1. Checkout
  2. Setup Terraform
  3. Assume github-terraform-plan role via OIDC
  4. For each layer (network, data, compute, cicd, vercel):
     - terraform init
     - terraform plan -out=plan.tfplan
     - Post plan summary as PR comment
  5. Fail if any plan has errors
```

### `terraform-apply.yml` (on merge to main)

```
trigger: push to main on quant-infra
steps:
  1. Checkout
  2. Setup Terraform
  3. Assume github-terraform-apply role via OIDC
  4. Apply layers in dependency order:
     network → data → compute → cicd → vercel
  5. Each layer: init → plan → apply -auto-approve
  6. Fail fast if any layer fails (don't continue to next)
```

### `deploy-backend.yml` (on backend merge)

```
trigger: workflow_dispatch OR repository_dispatch from quant-agent-backend
steps:
  1. Checkout quant-agent-backend
  2. Assume github-deploy-backend role via OIDC
  3. Login to ECR
  4. Build Docker image, tag with git SHA + latest
  5. Push to ECR
  6. Update ECS API service to force new deployment
  7. aws ecs wait services-stable (waits for rolling deploy)
```

Additionally, a **`deploy.yml` workflow in the `quant-agent-backend` repo** that runs on merge to main. It directly assumes the `github-deploy-backend` OIDC role and handles the deploy (ECR push + ECS update). No cross-repo dispatch needed — the backend repo is self-sufficient for deploys, constrained by its IAM role to deploy-only permissions.

---

## 10. Cost Estimate

| Resource | Monthly |
|----------|---------|
| ECS Fargate (API: 2 tasks × 0.5 vCPU/1GB) | ~$30 |
| ECS Fargate (Worker: scheduled, ~$2/month) | ~$2 |
| RDS (db.t4g.micro, 20GB) | ~$15 |
| ElastiCache (cache.t4g.micro) | ~$12 |
| ALB | ~$18 |
| NAT Gateway | ~$33 |
| S3 (state) + DynamoDB (locks) | ~$1 |
| Secrets Manager (3 secrets) | ~$1 |
| **Total** | **~$112/mo** |

NAT Gateway is the biggest hidden cost. If cost is a concern, we can switch to VPC endpoints for ECR/S3/Secrets Manager and eliminate the NAT — but that's more complex.

---

## 11. Security Posture

- **No static AWS credentials** anywhere — GitHub OIDC with role assumption only
- **Least-privilege IAM** — plan can't apply, deploy can't modify infra, each role scoped to specific repo + branch
- **Branch protection as code** — auditable, version-controlled, consistent across all 3 repos
- **Secrets in Secrets Manager** — never in environment variables, Terraform state, or code
- **Private subnets** for all data and compute — only ALB is internet-facing
- **Security groups** — minimal ingress rules, ECS can only be reached via ALB
- **S3 state encryption** — AES256 at rest, versioned for rollback
- **Signed commits required** — verified identity on all merges to main
