import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as cw_actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cr from 'aws-cdk-lib/custom-resources';


export class HelloCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const myFunction = new lambda.Function(this, "HelloWorldFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "monitor.handler",
      code: lambda.Code.fromAsset('lib/lambda'),
      timeout: cdk.Duration.seconds(10),
    });

    myFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cloudwatch:PutMetricData'],
      resources: ['*'],
    }));

    new events.Rule(this, "CrawlerSchedule", {
      schedule: events.Schedule.rate(cdk.Duration.minutes(30)),
      targets: [new targets.LambdaFunction(myFunction)],
    });

    const dashboard = new cloudwatch.Dashboard(this, "WebsiteMonitoringDashboard", {
      dashboardName: "WebsiteMonitoring",
    });

    const alarmTopic = new sns.Topic(this, 'WebsiteMonitoringAlarmTopic', {
      displayName: 'Website Monitoring Alarm Topic',
    });

    alarmTopic.addSubscription(new subscriptions.EmailSubscription('clairegspringbett@gmail.com'));

    const alarmLogTable = new dynamodb.Table(this, 'AlarmLogTable', {
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    const alarmLoggerFunction = new lambda.Function(this, 'AlarmLoggerFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'alarmLogger.handler',
      code: lambda.Code.fromAsset('lib/lambda'),
      timeout: cdk.Duration.seconds(10),
    });

    alarmLogTable.grantWriteData(alarmLoggerFunction);
    alarmLoggerFunction.addEnvironment('ALARM_LOG_TABLE', alarmLogTable.tableName);

    alarmTopic.addSubscription(new subscriptions.LambdaSubscription(alarmLoggerFunction));


    const targetsTable = new dynamodb.Table(this, 'TargetsTable', {
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    targetsTable.grantReadData(myFunction);
    myFunction.addEnvironment('TARGETS_TABLE', targetsTable.tableName);

    const sites: string[] = require('./lambda/sites.json');
    new cr.AwsCustomResource(this, 'SeedTargetsTable', {
      onCreate: {
        service: 'DynamoDB',
        action: 'batchWriteItem',
        parameters: {
          RequestItems: {
            [targetsTable.tableName]: sites.map((url) => ({
              PutRequest: {
                Item: {
                  id: { S: url.replace(/[^a-zA-Z0-9]/g, '') },
                  url: { S: url },
                },
              },
            })),
          },
        },
        physicalResourceId: cr.PhysicalResourceId.of('SeedTargetsTable'),
      },
      policy: cr.AwsCustomResourcePolicy.fromSdkCalls({ resources: [targetsTable.tableArn] }),
    });

    const crudFunction = new lambda.Function(this, 'CrudFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'crud.handler',
      code: lambda.Code.fromAsset('lib/lambda'),
      timeout: cdk.Duration.seconds(10),
      environment: { TARGETS_TABLE: targetsTable.tableName },
    });
    targetsTable.grantReadWriteData(crudFunction);

    const api = new apigateway.RestApi(this, 'SitesApi', {
      restApiName: 'Website Monitor Target API',
      description: 'CRUD API for the list of websites the crawler monitors',
      deployOptions: {
        stageName: 'v1',
        throttlingRateLimit: 10,   // security: limits requests per second
        throttlingBurstLimit: 20,
      },
    });

    const crudIntegration = new apigateway.LambdaIntegration(crudFunction);

    const sitesResource = api.root.addResource('sites');
    sitesResource.addMethod('GET', crudIntegration);   
    sitesResource.addMethod('POST', crudIntegration);  

    const siteResource = sitesResource.addResource('{id}');
    siteResource.addMethod('GET', crudIntegration);     
    siteResource.addMethod('PUT', crudIntegration);    
    siteResource.addMethod('DELETE', crudIntegration);  
    new cdk.CfnOutput(this, 'SitesApiUrl', { value: `${api.url}sites` });
    new cdk.CfnOutput(this, 'TargetsTableName', { value: targetsTable.tableName });

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'All sites - Availability',
        width: 24,
        left: [
          new cloudwatch.MathExpression({
            expression: "SEARCH('{WebsiteMonitoring,Target} MetricName=\"Availability\"', 'Average', 1800)",
            usingMetrics: {},
            label: '',
          }),
        ],
      }),
    );


    for (const url of sites) {
      dashboard.addWidgets(
        new cloudwatch.GraphWidget({
          title: `${url} - Availability`,
          left: [
            new cloudwatch.Metric({
              namespace: 'WebsiteMonitoring',
              metricName: 'Availability',
              dimensionsMap: { Target: url },
            }),
          ],
        }),

    new cloudwatch.GraphWidget({
      title: `${url} - Response Time`,
      left: [
        new cloudwatch.Metric({
          namespace: 'WebsiteMonitoring',
          metricName: 'ResponseTime',
          dimensionsMap: { Target: url },
        }),
      ],
    }),
  );

    const safeId = url.replace(/[^a-zA-Z0-9]/g, '');

    const availabilityAlarm = new cloudwatch.Alarm(this, `AvailabilityAlarm-${safeId}`, {
      metric: new cloudwatch.Metric({
        namespace: 'WebsiteMonitoring',
        metricName: 'Availability',
        dimensionsMap: { Target: url },
        statistic: 'Average', 
        period: cdk.Duration.minutes(30),
      }),
      threshold: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      evaluationPeriods: 1,
      alarmDescription: `Availability dropped for ${url}`,
    });

    availabilityAlarm.addAlarmAction(new cw_actions.SnsAction(alarmTopic));

    const latencyAlarm = new cloudwatch.Alarm(this, `LatencyAlarm-${safeId}`, {
      metric: new cloudwatch.Metric({
        namespace: 'WebsiteMonitoring',
        metricName: 'ResponseTime',
        dimensionsMap: { Target: url },
        statistic: 'Average',
        period: cdk.Duration.minutes(30),
      }),
      threshold: 2000, 
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 1,
      alarmDescription: `Latency too high for ${url}`,
      });

    latencyAlarm.addAlarmAction(new cw_actions.SnsAction(alarmTopic));

    }

    const myFunctionUrl = myFunction.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
    });

    new cdk.CfnOutput(this, "myFunctionUrlOutput", {
      value: myFunctionUrl.url,
    });
  }
}