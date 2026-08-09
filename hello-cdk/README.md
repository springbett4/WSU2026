# Website Monitoring Lambda (AWS CDK)

This project uses AWS CDK to deploy a Lambda function that checks a website and records how it's performing.

## What it does

The Lambda function fetches https://www.westernsydney.edu.au/, measures how long it takes to respond, and records the HTTP status code it gets back. Both values are sent to CloudWatch as custom metrics so they can be tracked over time.

## Services used

- AWS Lambda – runs the monitoring code
- CloudWatch – stores and displays the metrics
- IAM – gives the Lambda permission to send metrics
- AWS CDK – defines all of this as code

## How to deploy

Install dependencies, then deploy:

npm install
cdk bootstrap
cdk deploy

Once deployed, the terminal will print a URL you can use to test