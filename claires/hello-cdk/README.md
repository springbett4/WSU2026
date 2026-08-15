# Website Monitoring Crawler (AWS CDK)

A Lambda function that checks a list of websites every 30 minutes and logs their availability and response time to CloudWatch. Includes a dashboard and alarms.

## What it does

The Lambda function pings https://www.westernsydney.edu.au/, it times how long it takes to get a response, and logs the HTTP status code that comes back. It then pushes both numbers to CloudWatch as custom metrics, so you can track them over time.

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