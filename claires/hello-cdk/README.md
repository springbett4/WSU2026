# Website Monitoring Lambda (AWS CDK)

This project uses AWS CDK to deploy a Lambda function that checks a website and records how it's performing.

## What it does

The Lambda function pings https://www.westernsydney.edu.au/, it times how long it takes to get a response, and logs the HTTP status code that comes back. It then pushes both numbers to CloudWatch as custom metrics, so you can track them over time.

## Services used

- AWS Lambda – runs the monitoring code
- CloudWatch – stores and displays the metrics
- IAM – gives the Lambda permission to send metrics
- AWS CDK – defines all of this as code

## How to deploy

First, you need to install dependencies, then deploy the following;

npm install
cdk bootstrap
cdk deploy

Once it has deployed, the terminal will then print a URL you can use to test