
import * as cdk from 'aws-cdk-lib/core';
import { Template, Match } from 'aws-cdk-lib/assertions';
import * as HelloCdk from '../lib/hello-cdk-stack';

const sites = require('../lib/lambda/sites.json');

let template: Template;

beforeAll(() => {
  const app = new cdk.App();
  const stack = new HelloCdk.HelloCdkStack(app, 'MyTestStack');
  template = Template.fromStack(stack);
});

describe('Unit Tests - Web health stack', () => {
  test('1. Monitor Lambda exists with the right handler', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Handler: 'monitor.handler',
    });
  });

  test('2. Monitor Lambda timeout is 10 seconds', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
        Handler: 'monitor.handler',
        Timeout: 10,
    });
  });

  test('3. Monitor Lambda is allowed to send metrics to Cloudwatch', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'cloudwatch:PutMetricData'}),
        ]),
      },
    });
  });

  test('4. Crawler is scheduled to run every 30 minutes', () => {
    template.hasResourceProperties('AWS::Events::Rule', {
      ScheduleExpression: 'rate(30 minutes)',
    });
  });

  test('5. Cloudwatch dashboard exists', () => {
    template.resourceCountIs('AWS::CloudWatch::Dashboard', 1);
  });

  test('6. There are 2 alarms per site', () => {
    template.resourceCountIs('AWS::CloudWatch::Alarm', sites.length * 2);
  });

  test('7. Latency alarm triggers above 2000 ms', () => {
    template.hasResourceProperties('AWS::CloudWatch::Alarm', { Threshold: 2000, ComparisonOperator: 'GreaterThanThreshold', 
    });
  });

  test('8. SNS topic exists with an email subscription', () => {
    template.resourceCountIs('AWS::SNS::Topic', 1);
    template.hasResourceProperties('AWS::SNS::Subscription', {
      Protocol: 'email',
    });
  });

  test('9. Alarm log table uses id as key and pay-per-request billing', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', { KeySchema: [{AttributeName: 'id', KeyType: 'HASH'}],
    BillingMode: 'PAY_PER_REQUEST',
    });
  });

  test('10. Alarm logger Lambda is given the table name', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Handler: 'alarmLogger.handler',
      Environment: {
        Variables: { ALARM_LOG_TABLE: Match.anyValue() },
      },
    });
  });

});
