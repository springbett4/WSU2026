# Website Monitoring Crawler (AWS CDK)

A Lambda function that checks a list of websites every 30 minutes and logs their availability and response time to CloudWatch. Includes a dashboard and alarms.

## What it does

The Lambda reads URLs from `lib/lambda/sites.json`. For each one it:
- Times how long the request takes (latency)
- Checks the status code
- Marks it available (1) or down (0) based on the status code

These get sent to CloudWatch as custom metrics (`WebsiteMonitoring` namespace), tagged by site.

An EventBridge rule triggers the Lambda automatically every 30 minutes.

## Services used

- **Lambda** – runs the crawler (`lib/lambda/monitor.js`)
- **EventBridge** – triggers it every 30 min
- **CloudWatch** – stores metrics, dashboard, alarms
- **IAM** – lets Lambda publish metrics
- **CDK** – defines everything as code (`lib/hello-cdk-stack.ts`)

## Sites monitored

Edit `lib/lambda/sites.json` to add/remove sites.

## Alarms

Two per site:
- Availability drops below 1
- Latency goes above 2000ms

## Deploy

npm install
cdk bootstrap
cdk deploy

## Checking it works

- Manually test: Lambda console → Test tab
- Or wait ~30 min and check CloudWatch for a new data point
- Metrics: CloudWatch → Metrics → WebsiteMonitoring
- Dashboard: CloudWatch → Dashboards → WebsiteMonitoring
- Alarms: CloudWatch → Alarms (10 total)

## Teardown

cdk destroy

Only removes AWS resources, doesn't touch anything in this repo.