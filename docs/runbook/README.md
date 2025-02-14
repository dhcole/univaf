# Runbook: Deployment & Operations Guide

Documents in this folder are a general guide to manipulating and maintaining the [getmyvax.org](https://getmyvax.org) deployment of this software. Since this project is open-source, some things are described in general terms, and you may need to look elsewhere or ask other project members on Slack for details like server addresses, resource names, credentials, etc.

- [General Overview](#general-overview)
    - [AWS](#aws)
    - [Other Services](#other-services)
- [Deployment](#deployment)
    - [Building](#building)
    - [Deploying New Images](#deploying-new-images)
- [Bastion Server](#bastion-server)


## General Overview

### AWS

Most of the infrastructure and services that support this project are in Amazon Web Services (AWS), and the vast majority of our AWS resources are in the `us-west-2` region. We try to maintain as much configuration as reasonably possible in *Terraform* configuration files in the [`terraform`](../../terraform) directory (we use *Terraform Cloud* to actually apply those configurations to AWS; see "other services").

Major components:

- Most code runs in ECS as Docker containers.
- CloudFront is used as a caching proxy in front of the API server.
- The database is managed in RDS.
- Historical log data is saved and made publicly accessible in S3.

As much of the infrastructure as possible is managed in Terraform, but a few bits are set up manually:

- Domain name in Route53.
- SSL certificate in ACM.
- Bastion server and its associated security group in EC2.


### Other Services

We also rely on a handful of other services for critical operations tasks:

- [Terraform Cloud][terraform-cloud] manages checking and applying our Terraform configurations.
- Errors are tracked in [Sentry][sentry].


## Deployment

### Building

Because most of our code runs as Docker containers in ECS tasks, deploying new code requires first building and uploading Docker images to AWS ECR. We have GitHub Actions configured to automatically build images on every push in the [`ci` workflow][workflow-ci] (see the [logs in the "actions" tab][workflow-ci-runs]).

Images are tagged with the hash of the git commit they were built from, e.g. `appointment-server:bd2834bdc6dc09f5e925a407f883e838130ae5bc` is the API server image built from commit `bd2834bdc6dc09f5e925a407f883e838130ae5bc`. Images built from the `main` branch are *also* tagged with `latest`.


### Deploying New Images

**The loaders** always run the `latest` image, so once a commit has landed on the `main` branch and been built, the next loader run will use it.

**The API server** is configured to use a specific commit hash, so you must update and manually apply the Terraform configuration in order to deploy. This helps ensure that Terraform configurations stay in sync with the image being deployed.

After merging a PR into the `main` branch, you can deploy via the following steps:

1. Wait for the `ci` workflow to finish so that the new image is actually available to be deployed.
2. Update the Terraform configurations by running `scripts/deploy_infra.sh` from the root directory of the repo. This will alter the Terraform configuration and create a new commit.
3. `git push` the new commit to GitHub.
4. In Terraform Cloud, click "see details" on the latest run, and review the plan it shows to ensure it makes sense.
5. In Terraform Cloud, click the confirm button to apply the plan.

**The Demo UI** just runs as a GitHub pages site, and is automatically updated via the [`ui-deploy` workflow][workflow-ui-deploy] every time a commit lands on the `main` branch. You can view it at https://usdigitalresponse.github.io/univaf/.

### Terraforming Locally

In order to run terraform locally, you have to auth terraform to terraform cloud. This requires a cloud invite; reach out to the project owners to get an invite. Once you clone down the repository locally, navigate to the `terraform/` directory in your preferred shell. Run `terraform login`, which will create an API access token for you. You'll be prompted to paste it in to your shell in order to access it. Initialize to the backend using `terraform init`. At this point, you will be able to run terraform commands as expected: `terraform plan`, `terraform apply`, `terraform state list`...

### Terraforming changes that require manual state intervention

Follow this process when making any changes in terraform that may affect another person's work.

1. Provide advance notice that this work would affect live TF/infra state outside just the code, and therefore bleed into any other things going on in parallel.
2. Break out the parts that can be done advance of the above stuff and that can follow the normal path for doing things in code.
3. Plan for when to do the work, giving an explicit time window for the changes so others on the team can be aware and avoid doing things that collide with it.
4. Inform team members so they know you’ll be needing immediate review on some PRs.
5. Give clear notification when you are starting and ending that work, so the rest of the team can act appropriately.


## Bastion Server

Most of our services in AWS are in VPCs without public access, so if you need to log directly into a server, the database, or something else, you’ll need to do it through the [bastion server][bastion-server]. You can SSH into the bastion from a computer on the public internet, and from there run any commands that need access to our internal services, like using `psql` to log directly into the database.

In general, you should try to find a way to do most tasks that doesn't require manual intervention through the bastion, but it’s there when you absolutely need it or when there’s an emergency.

Please see another maintainer or the AWS console for the bastion’s IP address, SSH keys, etc.

Usually, you’ll log in via SSH:

```sh
$ ssh -i ~/.ssh/<your-keyfile> <user>@<bastion-ip-address>
```

And then run any commands you'd like from inside the SSH session.


[terraform-cloud]: https://app.terraform.io/
[sentry]: https://sentry.io/
[bastion-server]: https://en.wikipedia.org/wiki/Bastion_host
[workflow-ci]: ../../.github/workflows/ci.yml
[workflow-ci-runs]: https://github.com/usdigitalresponse/univaf/actions/workflows/ci.yml
[workflow-ui-deploy]: ../../.github/workflows/ui-deploy.yml
