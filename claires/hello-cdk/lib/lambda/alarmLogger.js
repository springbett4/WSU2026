const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { PutCommand, DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");
const { randomUUID } = require("crypto");

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

exports.handler = async (event) => {
  // SNS delivers one alarm notification per record
  for (const record of event.Records) {
    const message = JSON.parse(record.Sns.Message);

    const item = {
      id: randomUUID(),                          // partition key (matches AlarmLogTable schema)
      alarmName: message.AlarmName,
      newState: message.NewStateValue,            // e.g. "ALARM" or "OK"
      reason: message.NewStateReason,
      metricName: message.Trigger?.MetricName,
      target: message.Trigger?.Dimensions?.[0]?.value,
      stateChangeTime: message.StateChangeTime,
    };

    await docClient.send(
      new PutCommand({
        TableName: process.env.ALARM_LOG_TABLE,
        Item: item,
      })
    );

    console.log("Logged alarm to DynamoDB:", item);
  }

  return { statusCode: 200 };
};