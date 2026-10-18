
import { CloudFormationClient, ListStackResourcesCommand } from '@aws-sdk/client-cloudformation';
import { LambdaClient, InvokeCommand, GetFunctionConfigurationCommand } from '@aws-sdk/client-lambda';
import { CloudWatchClient, ListMetricsCommand, DescribeAlarmsCommand, SetAlarmStateCommand, GetMetricStatisticsCommand } from '@aws-sdk/client-cloudwatch';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';

const sites: string[] = require('../lib/lambda/sites.json');

const STACK_NAME = process.env.STACK_NAME || 'HelloCdkStack';

jest.setTimeout(120000);

const cfn = new CloudFormationClient({});
const lambda = new LambdaClient({});
const cloudwatch = new CloudWatchClient({});
const sns = new SNSClient({});
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

let monitorFunctionName: string;
let topicArn: string;
let tableName: string;
let alarmNames: string[];

async function stackResources(type: string): Promise<string[]> {
  const ids: string[] = [];
  let NextToken: string | undefined;
  do {
    const page = await cfn.send(new ListStackResourcesCommand({ StackName: STACK_NAME, NextToken }));
    for (const r of page.StackResourceSummaries ?? []) {
      if (r.ResourceType === type && r.PhysicalResourceId) ids.push(r.PhysicalResourceId);
    }
    NextToken = page.NextToken;
  } while (NextToken);
  return ids;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForLogRow(alarmName: string, reason: string): Promise<any> {
  for (let attempt = 0; attempt < 30; attempt++) {
    const result = await dynamo.send(new ScanCommand({
      TableName: tableName,
      FilterExpression: '#n = :n AND #r = :r',
      ExpressionAttributeNames: { '#n': 'alarmName', '#r': 'reason' },
      ExpressionAttributeValues: { ':n': alarmName, ':r': reason },
    }));
    if (result.Items && result.Items.length > 0) return result.Items[0];
    await sleep(3000);
  }
  return undefined;
}

async function deleteLogRow(id: string) {
  await dynamo.send(new DeleteCommand({ TableName: tableName, Key: { id } }));
}

beforeAll(async () => {
  for (const name of await stackResources('AWS::Lambda::Function')) {
    const config = await lambda.send(new GetFunctionConfigurationCommand({ FunctionName: name }));
    if (config.Handler === 'monitor.handler') monitorFunctionName = name;
  }
  [topicArn] = await stackResources('AWS::SNS::Topic');
  [tableName] = await stackResources('AWS::DynamoDB::Table');
  alarmNames = await stackResources('AWS::CloudWatch::Alarm');

  if (!monitorFunctionName || !topicArn || !tableName || alarmNames.length === 0) {
    throw new Error(`Could not find deployed resources in stack "${STACK_NAME}". Run cdk deploy first.`);
  }
});

describe('Integration tests - Web health stack (real AWS)', () => {

  test('1. Deployed monitor Lambda runs and checks every site', async () => {
    const start = Date.now();
    const response = await lambda.send(new InvokeCommand({ FunctionName: monitorFunctionName }));
    const duration = Date.now() - start;

    expect(response.FunctionError).toBeUndefined();          
    const payload = JSON.parse(Buffer.from(response.Payload!).toString());
    expect(payload.statusCode).toBe(200);
    expect(JSON.parse(payload.body)).toHaveLength(sites.length); 

    console.log(`Monitor Lambda run time: ${duration} ms`);
    expect(duration).toBeLessThan(10000);                    
  });

  test('2. Lambda metrics arrive in CloudWatch for every site', async () => {
    const missing: string[] = [];

    await Promise.all(sites.map(async (site) => {
      for (let attempt = 0; attempt < 30; attempt++) {
        const stats = await cloudwatch.send(new GetMetricStatisticsCommand({
          Namespace: 'WebsiteMonitoring',
          MetricName: 'Availability',
          Dimensions: [{ Name: 'Target', Value: site }],
          StartTime: new Date(Date.now() - 60 * 60 * 1000), // last hour
          EndTime: new Date(),
          Period: 60,
          Statistics: ['SampleCount'],
        }));
        if (stats.Datapoints && stats.Datapoints.length > 0) return; // found it
        await sleep(3000);
      }
      missing.push(site);
    }));

    if (missing.length) console.log('No metrics found for:', missing);
    expect(missing).toEqual([]);
  }, 180000);

  test('3. SNS message is logged to DynamoDB by the logger Lambda', async () => {
    const alarmName = `IntegrationTest-${Date.now()}`;
    const reason = 'Integration test message';

    const start = Date.now();
    await sns.send(new PublishCommand({
      TopicArn: topicArn,
      Message: JSON.stringify({
        AlarmName: alarmName,
        NewStateValue: 'ALARM',
        NewStateReason: reason,
        StateChangeTime: new Date().toISOString(),
        Trigger: { MetricName: 'Availability', Dimensions: [{ name: 'Target', value: 'https://integration.test' }] },
      }),
    }));

    const row = await waitForLogRow(alarmName, reason);
    console.log(`SNS -> DynamoDB write time: ${Date.now() - start} ms`);

    expect(row).toBeDefined();
    expect(row.newState).toBe('ALARM');
    expect(row.target).toBe('https://integration.test');

    await deleteLogRow(row.id); 
  });

  test('4. A real alarm flows through SNS to the alarm log', async () => {
    const alarms = await cloudwatch.send(new DescribeAlarmsCommand({ AlarmNames: alarmNames.slice(0, 100) }));
    const alarm = alarms.MetricAlarms![0];

    expect(alarm.AlarmActions).toContain(topicArn);

    const reason = `Integration test ${Date.now()}`;

    await cloudwatch.send(new SetAlarmStateCommand({ AlarmName: alarm.AlarmName!, StateValue: 'OK', StateReason: 'Integration test reset' }));
    await sleep(2000);
    await cloudwatch.send(new SetAlarmStateCommand({ AlarmName: alarm.AlarmName!, StateValue: 'ALARM', StateReason: reason }));

    const row = await waitForLogRow(alarm.AlarmName!, reason);

    expect(row).toBeDefined();
    expect(row.newState).toBe('ALARM');

    await deleteLogRow(row.id);
  });

});

