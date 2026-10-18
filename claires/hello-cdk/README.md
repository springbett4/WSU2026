# Website Monitoring Crawler (AWS CDK)

A serverless website monitor built with AWS CDK. A Lambda function checks a list of websites every 30 minutes and records their availability and response time in CloudWatch. It includes a dashboard, alarms, email alerts and an alarm log.

## What it does

The Lambda reads URLs from `lib/lambda/sites.json`. For each one, it:
- Times how long the request takes (latency)
- Checks the status code
- Marks the site as available (1) or down (0), based on the status code

These are sent to CloudWatch as custom metrics (in the `WebsiteMonitoring` namespace), tagged by site.

An EventBridge rule triggers the Lambda automatically every 30 minutes.

## How it fits together

```
EventBridge (every 30 min)
   └─> Monitor Lambda ──> websites
          └─> CloudWatch metrics ──> Dashboard
                    └─> Alarms ──> SNS ──> Email
                                     └─> Alarm Logger Lambda ──> DynamoDB (AlarmLogTable)
```

## Services used

- **Lambda:** runs the crawler (`lib/lambda/monitor.js`) and the alarm logger (`lib/lambda/alarmLogger.js`)
- **EventBridge:** triggers the crawler every 30 minutes
- **CloudWatch:** stores the metrics, and runs the dashboard and alarms
- **SNS:** sends email notifications when an alarm fires
- **DynamoDB:** logs every alarm change
- **IAM:** gives each Lambda only the permissions it needs
- **CDK:** defines everything as code (`lib/hello-cdk-stack.ts`)

## Project structure

```
hello-cdk/
├── bin/hello-cdk.ts            # CDK app entry point
├── lib/
│   ├── hello-cdk-stack.ts      # All AWS resources (infrastructure as code)
│   └── lambda/
│       ├── monitor.js          # Crawler Lambda
│       ├── alarmLogger.js      # Alarm logger Lambda
│       └── sites.json          # List of websites to monitor
└── test/
    ├── hello-cdk.test.ts       # Unit tests
    ├── monitor.test.ts         # Functional tests (crawler)
    ├── alarmLogger.test.ts     # Functional tests (alarm logger)
    └── webhealth.integ.ts      # Integration tests
```

## Sites monitored

Edit `lib/lambda/sites.json` to add or remove sites, then redeploy. Alarms are created automatically for each site.

## Alarms

There are two alarms per site:
- **Availability:** fires when availability drops below 1
- **Latency:** fires when the response time goes above 2000 ms

## Alarm notifications

When an alarm fires:
- An email is sent via SNS to the subscribed address
- The alarm details are logged as a row in DynamoDB (alarm name, state, reason, metric, site and time)

To send alerts to a new email address, update the email subscription address in `lib/hello-cdk-stack.ts` and redeploy. AWS then sends a confirmation email, and the new address must click **Confirm subscription** before it receives alerts.

## Deploy

```bash
npm install
cdk bootstrap
cdk deploy
```

## Checking it works

- **Manual test:** Lambda console → Test tab
- **Or** wait about 30 minutes and check CloudWatch for a new data point
- **Metrics:** CloudWatch → Metrics → WebsiteMonitoring
- **Dashboard:** CloudWatch → Dashboards → WebsiteMonitoring
- **Alarms:** CloudWatch → Alarms (2 per site)
- **Alarm notifications:** check the inbox for an SNS email when an alarm fires
- **Alarm log:** DynamoDB → Tables → AlarmLogTable → Explore items

## Testing

The project has **22 automated tests** across three levels, written in **TypeScript** with **Jest**.

- **Unit tests (10):** check that each AWS resource is set up correctly. No AWS needed.
- **Functional tests (8):** check that the Lambda code does its job, using mocks. No AWS needed.
- **Integration tests (4):** check that the real, deployed AWS services work together.

### How to run

```bash
# Unit + functional tests (fast, free, no AWS needed)
npm test

# Integration tests (stack must be deployed first)
cdk deploy
npm run test:integ
```

> Integration tests send real alarm emails to the SNS subscriber. This is expected and confirms the alert flow works.

### Test files

- `test/hello-cdk.test.ts`: 10 unit tests
- `test/monitor.test.ts`: 6 functional tests (monitor Lambda)
- `test/alarmLogger.test.ts`: 2 functional tests (alarm logger Lambda)
- `test/webhealth.integ.ts`: 4 integration tests

### Unit tests (10)

These use **CDK assertions** to check the CloudFormation template that CDK generates, without deploying anything.

1. Monitor Lambda exists with the right handler
2. Monitor Lambda timeout is 10 seconds
3. Monitor Lambda is allowed to send metrics to CloudWatch (least privilege)
4. Crawler is scheduled to run every 30 minutes
5. CloudWatch dashboard exists
6. There are 2 alarms per site (the count is read from `sites.json`)
7. Latency alarm triggers above 2000 ms
8. SNS topic exists with an email subscription
9. Alarm log table uses `id` as its key and pay-per-request billing
10. Alarm logger Lambda is given the table name

### Functional tests (8)

These run the **real Lambda code**, with **Jest mocks** replacing the internet, CloudWatch and DynamoDB. The results are the same every time, and nothing is sent to AWS.

**Monitor Lambda**
1. A working site gets availability 1
2. A broken (500) or unreachable site gets availability 0
3. Latency is measured as a number
4. The status code is returned
5. Every site in `sites.json` gets checked
6. Three metrics are sent to CloudWatch per site

**Alarm logger Lambda**

7. Reads an SNS alarm message and saves the right fields
8. Handles more than one alarm message at once

### Integration tests (4)

These run against the **deployed stack**. Resource names are looked up from CloudFormation, so nothing is hard-coded, and test rows are deleted afterwards.

1. **Deployed Lambda runs:** invokes the real monitor Lambda, checks there is one result per site, and checks it finishes in under 10 seconds
2. **Lambda → CloudWatch:** Availability metrics exist for every site
3. **SNS → Logger → DynamoDB:** a test message published to SNS is written to the alarm log table, and the write time is recorded
4. **Alarm → SNS → Logger → DynamoDB:** a real alarm is forced into the ALARM state, and the alert travels all the way into the alarm log

### How testing covers quality characteristics

- **Security:** each Lambda gets only the IAM permissions it needs. *(Unit 3)*
- **Performance:** the latency alarm is set at 2000 ms, and sites are checked in parallel. *(Unit 7, Functional 3, Integration 1)*
- **Reliability:** a 10 second timeout, unreachable sites are still recorded as down, and every alarm is logged. *(Unit 2, Functional 2, Integration 3–4)*
- **Usability:** one dashboard covers all sites, and alerts arrive by email. *(Unit 5, Unit 8, Integration 4)*

### References

- [AWS CDK – Testing constructs](https://docs.aws.amazon.com/cdk/v2/guide/testing.html)
- [CDK assertions module](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.assertions-readme.html)
- [Jest – Mock functions](https://jestjs.io/docs/mock-functions)
- [CloudWatch SetAlarmState API](https://docs.aws.amazon.com/AmazonCloudWatch/latest/APIReference/API_SetAlarmState.html)

## Teardown

```bash
cdk destroy
```

This only removes the AWS resources. It doesn't touch anything in this repo.