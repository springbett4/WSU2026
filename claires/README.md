# Website Monitoring Crawler (AWS CDK)

A serverless website monitor built with AWS CDK. A Lambda function checks a list of websites every 30 minutes and records their availability and response time in CloudWatch. It includes a dashboard, alarms, email alerts and an alarm log. The list of websites is stored in DynamoDB and managed through a public CRUD API (API Gateway).

## What it does

The Lambda reads the list of URLs from the **TargetsTable** in DynamoDB (managed through the CRUD API). If the table can't be read, it falls back to `lib/lambda/sites.json`. For each URL, it:
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

- **Lambda:** runs the crawler (`lib/lambda/monitor.js`), the alarm logger (`lib/lambda/alarmLogger.js`) and the CRUD API (`lib/lambda/crud.js`)
- **EventBridge:** triggers the crawler every 30 minutes
- **CloudWatch:** stores the metrics, and runs the dashboard and alarms
- **SNS:** sends email notifications when an alarm fires
- **DynamoDB:** stores the target list (TargetsTable) and logs every alarm change (AlarmLogTable)
- **API Gateway:** public REST API for managing the target list
- **IAM:** gives each Lambda only the permissions it needs
- **CDK:** defines everything as code (`lib/hello-cdk-stack.ts`)

## Sites monitored

Add, update or remove sites through the CRUD API (see below and [API.md](API.md)). `lib/lambda/sites.json` holds the starting list, which fills the table on first deploy. Per-site alarms and dashboard graphs are created from `sites.json`, and the "All sites - Availability" dashboard widget shows every site, including ones added through the API.

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
- **Target list:** call `GET` on the `SitesApiUrl`, or DynamoDB → Tables → TargetsTable → Explore items

## Applied project: Target List CRUD API

The list of websites to monitor is now stored in **DynamoDB** and managed through a public **REST API** built with **API Gateway**. The crawler reads the list from DynamoDB every time it runs.

**How it fits together**

```
User ──> API Gateway (/sites) ──> CRUD Lambda ──> DynamoDB (TargetsTable)
                                                        │
EventBridge (every 30 min) ──> Monitor Lambda ──reads───┘
```

**Endpoints**

- `POST /sites`: add a site
- `GET /sites`: list all sites
- `GET /sites/{id}`: view one site
- `PUT /sites/{id}`: update a site
- `DELETE /sites/{id}`: remove a site

The API URL is printed after `cdk deploy` as `SitesApiUrl`.

**Quick example**

```bash
API=<SitesApiUrl from cdk deploy>
curl -X POST $API -H "Content-Type: application/json" -d '{"url":"https://www.example.com"}'
curl $API
```

Full API documentation, with every request and response, is in **[API.md](API.md)**.

**New AWS resources**

- **TargetsTable (DynamoDB):** stores the target list, and is filled from `sites.json` on first deploy
- **CrudFunction (Lambda):** `lib/lambda/crud.js`, the create/read/update/delete logic
- **SitesApi (API Gateway):** public REST API, stage `v1`, throttled to 10 requests per second

## Testing

The project has **27 automated tests** across three levels, written in **TypeScript** with **Jest**.

- **Unit tests (12):** check that each AWS resource is set up correctly. No AWS needed.
- **Functional tests (10):** check that the Lambda code does its job, using mocks. No AWS needed.
- **Integration tests (5):** check that the real, deployed AWS services work together.

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

- `test/hello-cdk.test.ts`: 10 unit tests (web health)
- `test/crud-stack.test.ts`: 2 unit tests (CRUD API)
- `test/monitor.test.ts`: 6 functional tests (monitor Lambda)
- `test/alarmLogger.test.ts`: 2 functional tests (alarm logger Lambda)
- `test/crud.test.ts`: 2 functional tests (CRUD Lambda)
- `test/webhealth.integ.ts`: 4 integration tests (web health)
- `test/crud.integ.ts`: 1 integration test (CRUD API)

### Unit tests (12)

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

**CRUD API**

11. CRUD Lambda exists and is given the target table name
12. API Gateway has GET, POST, PUT and DELETE methods

### Functional tests (10)

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

**CRUD Lambda**

9. Adding a valid site returns 201 and saves it to DynamoDB
10. Adding an invalid URL returns 400 and saves nothing

### Integration tests (5)

These run against the **deployed stack**. Resource names are looked up from CloudFormation, so nothing is hard-coded, and test rows are deleted afterwards.

1. **Deployed Lambda runs:** invokes the real monitor Lambda, checks there is one result per site in the target list, and checks it finishes in under 10 seconds
2. **Lambda → CloudWatch:** Availability metrics exist for every site
3. **SNS → Logger → DynamoDB:** a test message published to SNS is written to the alarm log table, and the write time is recorded
4. **Alarm → SNS → Logger → DynamoDB:** a real alarm is forced into the ALARM state, and the alert travels all the way into the alarm log
5. **Full CRUD cycle (API Gateway → Lambda → DynamoDB):** creates, reads, updates and deletes a site through the real API, checks DynamoDB after each step, and records the time of each API call plus a direct DynamoDB read and write

### How testing covers quality characteristics

- **Security:** each Lambda gets only the IAM permissions it needs; the API rejects invalid URLs and is throttled. *(Unit 3, Functional 10)*
- **Performance:** the latency alarm is set at 2000 ms, sites are checked in parallel, and API and DynamoDB timings are recorded. *(Unit 7, Functional 3, Integration 1 and 5)*
- **Reliability:** a 10 second timeout, unreachable sites are still recorded as down, every alarm is logged, and the crawler falls back to `sites.json` if the table can't be read. *(Unit 2, Functional 2, Integration 3–5)*
- **Usability:** one dashboard covers all sites, alerts arrive by email, and sites can be managed through a simple API. *(Unit 5, Unit 8, Unit 12, Integration 4–5)*

## Teardown

```bash
cdk destroy
```

This only removes the AWS resources. It doesn't touch anything in this repo.